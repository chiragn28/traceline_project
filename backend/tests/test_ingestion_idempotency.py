"""Proves the idempotent/resumable ingestion requirements from spec
section 5: duplicate or replayed log entries must not create duplicate
access_events, and a batch interrupted partway through must be resumable
without duplicating or dropping records.

Split into two layers, deliberately:
  1. The connector's file tailer (pure filesystem I/O, no DB) -- proves
     replaying the same bytes is a no-op and a partially-written trailing
     row is never consumed early.
  2. The DB-level dedupe (the unique constraint + ON CONFLICT DO NOTHING)
     -- proves the same source_log_id can never produce two rows, which is
     what actually protects against ingestion replay regardless of how the
     connector is implemented.
"""
import csv
import io

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.access_event import AccessEvent
from app.services.connectors.postgres_csvlog import PostgresCsvlogConnector


def _csvlog_row(message: str, user_name: str = "amina") -> str:
    fields = [
        "2026-09-09 10:15:23.123 UTC",  # log_time
        user_name,  # user_name
        "demo_customer",  # database_name
        "4242",  # process_id
        "172.16.5.10:55123",  # connection_from
        "abc123.1",  # session_id
        "1",  # session_line_num
        "SELECT",  # command_tag
        "2026-09-09 10:15:00 UTC",  # session_start_time
        "3/100",  # virtual_transaction_id
        "0",  # transaction_id
        "LOG",  # error_severity
        "00000",  # sql_state_code
        message,  # message
        "",  # detail
        "",  # hint
        "",  # internal_query
        "",  # internal_query_pos
        "",  # context
        "",  # query
        "",  # query_pos
        "",  # location
        "psql",  # application_name
        "client backend",  # backend_type
        "",  # leader_pid
        "",  # query_id
    ]
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerow(fields)
    return buf.getvalue()


def test_replaying_same_bytes_yields_no_new_events(tmp_path):
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    log_file = log_dir / "postgresql-2026-09-09_101500.log.csv"
    log_file.write_text(_csvlog_row("statement: SELECT * FROM customers"))

    connector = PostgresCsvlogConnector("h", 5432, "d", "u", "p", str(log_dir))

    first = connector.poll_events(None, 0)
    assert len(first.events) == 1
    assert first.events[0].table_name == "customers"

    # Re-poll from the checkpoint the first call returned -- nothing new
    # has been written, so this must yield zero events, not a duplicate.
    second = connector.poll_events(first.new_log_file, first.new_byte_offset)
    assert second.events == []
    assert second.new_byte_offset == first.new_byte_offset


def test_partial_trailing_write_is_not_consumed_until_complete(tmp_path):
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    log_file = log_dir / "postgresql-2026-09-09_101500.log.csv"

    complete_row = _csvlog_row("statement: SELECT * FROM customers")
    log_file.write_text(complete_row)

    connector = PostgresCsvlogConnector("h", 5432, "d", "u", "p", str(log_dir))
    first = connector.poll_events(None, 0)
    assert len(first.events) == 1

    # Simulate Postgres in the middle of writing the next line: only a
    # partial, unterminated row is on disk.
    with open(log_file, "a") as f:
        f.write('2026-09-09 10:16:00.000 UTC,"amina",partial-write-not-ye')

    mid_write = connector.poll_events(first.new_log_file, first.new_byte_offset)
    assert mid_write.events == []
    # Must not have advanced past the partial row -- otherwise those bytes
    # would be silently dropped once the rest of the line is written.
    assert mid_write.new_byte_offset == first.new_byte_offset

    # Now the write completes (Postgres flushes the full line). Truncate
    # the partial bytes back off and append the well-formed row in their
    # place, exactly as the file would look once the write finishes.
    with open(log_file, "r+b") as f:
        f.seek(first.new_byte_offset)
        f.truncate()
    with open(log_file, "a") as f:
        f.write(_csvlog_row("statement: SELECT * FROM transactions"))

    resumed = connector.poll_events(mid_write.new_log_file, mid_write.new_byte_offset)
    assert len(resumed.events) == 1
    assert resumed.events[0].table_name == "transactions"


def test_db_level_dedupe_by_source_log_id(admin_db, make_workspace, make_data_source):
    ws = make_workspace()
    ds = make_data_source(ws)
    admin_db.commit()

    def insert_event():
        stmt = (
            pg_insert(AccessEvent)
            .values(
                workspace_id=ws.id,
                data_source_id=ds.id,
                source_log_id="postgresql-2026-09-09.log.csv:120",
                actor_identifier="amina",
                actor_type="human",
                query_type="read",
                occurred_at="2026-09-09 10:15:23+00",
            )
            .on_conflict_do_nothing(constraint="uq_access_event_source_log_id")
            # rowcount is unreliable here with the psycopg3 driver (see
            # app.services.ingestion) -- RETURNING is the robust check.
            .returning(AccessEvent.id)
        )
        return admin_db.execute(stmt).first()

    first_row = insert_event()
    second_row = insert_event()  # simulates a replayed/duplicate log line
    admin_db.commit()

    assert first_row is not None  # first insert succeeds
    assert second_row is None  # no-op, not a duplicate row

    count = admin_db.execute(
        text('SELECT count(*) FROM "access_event" WHERE data_source_id = :id'),
        {"id": str(ds.id)},
    ).scalar()
    assert count == 1
