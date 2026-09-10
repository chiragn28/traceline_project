"""Standalone ingestion worker. A simple APScheduler polling loop, no
Celery/Redis, per the confirmed MVP decision -- one fewer moving part to
operate for what is, in this MVP, a single-source-per-workspace workload.

Enumerating data sources across workspaces is the one legitimate use of the
admin (schema-owning) connection outside of migrations: a system-level job
has to know what exists before it can act, but every actual read/write of
tenant data below still goes through a workspace-scoped, RLS-enforced
session (see app.db.session), exactly as an API request would.
"""
import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AdminSession, workspace_scoped_session
from app.models.data_source import DataSource
from app.services.ingestion import run_ingestion_for_source
from app.services.violations import evaluate_violations_for_source

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("traceline.worker")


def poll_all_sources() -> None:
    admin_db = AdminSession()
    try:
        data_sources = list(admin_db.scalars(select(DataSource)))
    finally:
        admin_db.close()

    for data_source in data_sources:
        # run_ingestion_for_source and evaluate_violations_for_source each
        # commit their own work -- this session just needs to carry the
        # right RLS workspace context and get closed afterwards.
        db = workspace_scoped_session(data_source.workspace_id)
        try:
            summary = run_ingestion_for_source(db, data_source.workspace_id, data_source)
            if summary.events_ingested:
                logger.info("data_source=%s ingested=%d events", data_source.id, summary.events_ingested)
            if summary.coverage_gap_created:
                logger.warning("data_source=%s coverage gap recorded", data_source.id)

            violation_count = evaluate_violations_for_source(db, data_source.workspace_id, data_source)
            if violation_count:
                logger.warning("data_source=%s new violations=%d", data_source.id, violation_count)
        except Exception:
            db.rollback()
            logger.exception("ingestion failed for data_source=%s", data_source.id)
        finally:
            db.close()


def main() -> None:
    logger.info("Traceline worker starting, poll interval=%ss", settings.ingestion_poll_interval_seconds)
    scheduler = BlockingScheduler()
    scheduler.add_job(poll_all_sources, "interval", seconds=settings.ingestion_poll_interval_seconds, next_run_time=None)
    poll_all_sources()  # run once immediately on startup rather than waiting a full interval
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
