"""Ingestion orchestration: poll a data source's connector, persist new
access_events idempotently, advance the checkpoint only after that batch is
durably committed, and surface anything that looks like a coverage gap
instead of silently ignoring it. See spec section 5 ("Ingestion & data
integrity") -- every edge case named there is handled at the point noted
in a comment below.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.access_event import AccessEvent
from app.models.data_source import DataSource
from app.models.ingestion import CoverageGap, IngestionCheckpoint
from app.models.ip_region_map import IpRegionMap
from app.models.table_asset import TableAsset
from app.models.workspace import Workspace
from app.services.connectors.base import PollResult
from app.services.region import resolve_region
from app.services.tables import build_connector


@dataclass
class IngestionRunSummary:
    events_ingested: int
    coverage_gap_created: bool


def _open_gap(db: Session, workspace_id: UUID, data_source_id: UUID, reason: str) -> CoverageGap | None:
    existing_open = db.scalar(
        select(CoverageGap).where(
            CoverageGap.data_source_id == data_source_id,
            CoverageGap.reason == reason,
            CoverageGap.gap_end.is_(None),
        )
    )
    if existing_open:
        return None
    gap = CoverageGap(
        workspace_id=workspace_id,
        data_source_id=data_source_id,
        gap_start=datetime.now(timezone.utc),
        reason=reason,
    )
    db.add(gap)
    return gap


def _close_gap(db: Session, data_source_id: UUID, reason: str) -> None:
    open_gap = db.scalar(
        select(CoverageGap).where(
            CoverageGap.data_source_id == data_source_id,
            CoverageGap.reason == reason,
            CoverageGap.gap_end.is_(None),
        )
    )
    if open_gap:
        open_gap.gap_end = datetime.now(timezone.utc)


def run_ingestion_for_source(db: Session, workspace_id: UUID, data_source: DataSource) -> IngestionRunSummary:
    connector = build_connector(data_source)

    checkpoint = db.get(IngestionCheckpoint, data_source.id)

    # Worker-downtime detection: if we haven't successfully polled in far
    # longer than the configured interval, the gap is in our own coverage,
    # not the source's -- surface it rather than quietly resuming as if
    # nothing happened.
    if checkpoint is not None:
        stale_after = 3 * settings.ingestion_poll_interval_seconds
        elapsed = (datetime.now(timezone.utc) - checkpoint.updated_at).total_seconds()
        if elapsed > stale_after:
            _open_gap(db, workspace_id, data_source.id, "worker_downtime")
        else:
            _close_gap(db, data_source.id, "worker_downtime")

    # Admin/superuser bypass blind spot (spec 5): if the source's own
    # logging configuration has drifted, some access is now invisible to
    # us. Surfaced as a coverage gap, not implied-away.
    coverage = connector.check_logging_coverage()
    if not coverage.ok:
        _open_gap(db, workspace_id, data_source.id, "logging_disabled")
    else:
        _close_gap(db, data_source.id, "logging_disabled")

    poll_result: PollResult = connector.poll_events(
        checkpoint.log_file if checkpoint else None,
        checkpoint.byte_offset if checkpoint else 0,
    )

    if poll_result.coverage_gap_reason:
        # Source log retention exceeded our poll interval -- the
        # checkpointed file rotated away before we read it. We cannot
        # recover the missing window; record it honestly and resume from
        # the oldest data now available.
        gap = _open_gap(db, workspace_id, data_source.id, poll_result.coverage_gap_reason)
        if gap:
            gap.gap_start = poll_result.coverage_gap_start or gap.gap_start
        _upsert_checkpoint(db, workspace_id, data_source.id, poll_result.new_log_file, poll_result.new_byte_offset)
        db.commit()
        return IngestionRunSummary(events_ingested=0, coverage_gap_created=True)

    tables_by_key = {
        (t.schema_name, t.table_name): t
        for t in db.scalars(
            select(TableAsset).where(TableAsset.data_source_id == data_source.id, TableAsset.dropped_at.is_(None))
        )
    }
    ip_map = list(db.scalars(select(IpRegionMap).where(IpRegionMap.workspace_id == workspace_id)))
    workspace = db.get(Workspace, workspace_id)

    inserted = 0
    for event in poll_result.events:
        # Never audit Traceline's own read-only monitoring connection --
        # that credential's queries are metadata lookups, not customer
        # access, and would otherwise pollute the log / trip region rules
        # against Traceline's own infrastructure.
        if event.actor_identifier == data_source.username:
            continue

        table = tables_by_key.get((event.schema_name, event.table_name)) if event.table_name else None
        region, confidence, region_source = resolve_region(db, workspace, event.source_ip, ip_map)

        stmt = (
            pg_insert(AccessEvent)
            .values(
                workspace_id=workspace_id,
                data_source_id=data_source.id,
                source_log_id=event.source_log_id,
                table_id=table.id if table else None,
                schema_name_snapshot=event.schema_name,
                table_name_snapshot=event.table_name,
                actor_identifier=event.actor_identifier,
                actor_type=event.actor_type,
                query_type=event.query_type,
                source_ip=event.source_ip,
                source_region=region,
                region_confidence=confidence,
                region_source=region_source,
                occurred_at=event.occurred_at,
            )
            # Idempotent ingestion: a replayed or duplicate log line is a
            # silent no-op keyed on (data_source_id, source_log_id), not on
            # timestamp -- safe even if events arrive out of order.
            .on_conflict_do_nothing(constraint="uq_access_event_source_log_id")
            # rowcount is unreliable for ON CONFLICT DO NOTHING with the
            # psycopg3 driver (observed -1 even on a successful insert) --
            # RETURNING is the robust way to tell "inserted" from "skipped".
            .returning(AccessEvent.id)
        )
        if db.execute(stmt).first() is not None:
            inserted += 1

    _upsert_checkpoint(db, workspace_id, data_source.id, poll_result.new_log_file, poll_result.new_byte_offset)
    db.commit()
    return IngestionRunSummary(events_ingested=inserted, coverage_gap_created=False)


def _upsert_checkpoint(db: Session, workspace_id: UUID, data_source_id: UUID, log_file: str, byte_offset: int) -> None:
    checkpoint = db.get(IngestionCheckpoint, data_source_id)
    if checkpoint is None:
        db.add(
            IngestionCheckpoint(
                data_source_id=data_source_id,
                workspace_id=workspace_id,
                log_file=log_file,
                byte_offset=byte_offset,
            )
        )
    else:
        checkpoint.log_file = log_file
        checkpoint.byte_offset = byte_offset
