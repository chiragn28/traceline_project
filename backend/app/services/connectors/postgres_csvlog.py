"""Postgres connector: read-only over SQL for metadata (table discovery,
read-only privilege check, logging-coverage check), and a passive filesystem
tail of the instance's own csvlog files for access events. Never a proxy,
never in the query path.

MVP-level parsing, not a production log shipper: csvlog rows are parsed with
Python's csv module against Postgres 16's fixed 26-column csvlog schema:
https://www.postgresql.org/docs/16/runtime-config-logging.html#RUNTIME-CONFIG-LOGGING-CSVLOG
Multi-line statements whose embedded newlines fall exactly on a poll
boundary are a known limitation (documented in README) -- a production
connector would use a proper streaming RFC4180 parser or pgaudit instead.
"""
import csv
import glob
import io
import logging
import os
import re
from datetime import datetime, timezone

import psycopg
import sqlparse

from app.services.connectors.base import (
    ConnectionCheckResult,
    LoggingCoverageResult,
    ParsedAccessEvent,
    PollResult,
    SourceConnector,
    TableGrant,
)

logger = logging.getLogger("traceline.connector.postgres_csvlog")

CSVLOG_COLUMNS = 26
COL_LOG_TIME = 0
COL_USER_NAME = 1
COL_CONNECTION_FROM = 4
COL_MESSAGE = 13

# Ceiling on how many new log bytes a single poll pulls into memory.
# Without it, the first poll of a source with a large existing log
# directory (or any source that outran the poll interval) read every new
# byte of every file at once and built one Python list of every parsed
# event -- an easy way to OOM the worker on a small container and take
# ingestion down for every other workspace with it. Anything beyond the cap
# isn't lost: the checkpoint advances over what was read, and the next poll
# resumes exactly where this one stopped.
MAX_POLL_BYTES = 8 * 1024 * 1024

_STATEMENT_RE = re.compile(r"^\s*(?:statement|execute [^:]+):\s*(.*)$", re.IGNORECASE | re.DOTALL)

_READ_VERBS = {"select", "show", "copy", "explain"}
_WRITE_VERBS = {"insert", "update", "delete", "merge"}
_DDL_VERBS = {"create", "alter", "drop", "truncate"}


class PostgresCsvlogConnector(SourceConnector):
    def __init__(self, host: str, port: int, dbname: str, username: str, password: str, log_directory: str):
        self.host = host
        self.port = port
        self.dbname = dbname
        self.username = username
        self.password = password
        self.log_directory = log_directory

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(
            host=self.host, port=self.port, dbname=self.dbname, user=self.username, password=self.password,
            connect_timeout=5,
        )

    def test_connection(self) -> ConnectionCheckResult:
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    read_only_verified, warning = self._check_read_only(cur)
            return ConnectionCheckResult(connected=True, read_only_verified=read_only_verified, warning=warning)
        except psycopg.Error as exc:
            return ConnectionCheckResult(connected=False, read_only_verified=False, warning=str(exc))

    def _check_read_only(self, cur: psycopg.Cursor) -> tuple[bool, str | None]:
        # Validates the credential Traceline was handed is scoped
        # read-only, per spec 5 ("the app should validate and warn if given
        # broader-than-necessary permissions").
        cur.execute(
            "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        )
        rolsuper, rolcreatedb, rolcreaterole, rolbypassrls = cur.fetchone()
        if rolsuper or rolcreatedb or rolcreaterole or rolbypassrls:
            return False, "Credential has elevated role attributes (superuser/createdb/createrole/bypassrls)."

        cur.execute(
            """
            SELECT count(*) FROM information_schema.role_table_grants
            WHERE grantee = current_user AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
            """
        )
        (write_grant_count,) = cur.fetchone()
        if write_grant_count > 0:
            return False, "Credential has write privileges (INSERT/UPDATE/DELETE/TRUNCATE) on at least one table."

        return True, None

    def discover_tables(self) -> list[tuple[str, str]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_schema, table_name FROM information_schema.tables
                    WHERE table_type = 'BASE TABLE'
                      AND table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY table_schema, table_name
                    """
                )
                return [(row[0], row[1]) for row in cur.fetchall()]

    def list_table_grants(self, schema_name: str, table_name: str) -> list[TableGrant]:
        # information_schema.role_table_grants is SQL-standard but has a
        # real, easy-to-miss visibility restriction: it only shows a grant
        # if the CONNECTING role is the grantor or the grantee of that
        # specific row. A read-only credential granted SELECT by the
        # customer's admin cannot see grants the admin made to OTHER
        # roles that way -- it would silently report "no grants" for
        # everyone but itself. pg_class.relacl (exploded with the builtin
        # aclexplode()) is visible to any role that can see the table's
        # catalog entry at all, which is the actual customer-chosen
        # visibility this connector should respect. Excludes PUBLIC (has
        # no matching pg_roles row, so the join drops it) and the
        # connector's own credential, which would just be noise in a review.
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT r.rolname, a.privilege_type
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    JOIN LATERAL aclexplode(c.relacl) AS a ON true
                    JOIN pg_roles r ON r.oid = a.grantee
                    WHERE n.nspname = %s AND c.relname = %s AND r.rolname != %s
                    ORDER BY r.rolname, a.privilege_type
                    """,
                    (schema_name, table_name, self.username),
                )
                return [TableGrant(grantee=row[0], privilege=row[1]) for row in cur.fetchall()]

    def check_logging_coverage(self) -> LoggingCoverageResult:
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute("SHOW log_statement")
                    (log_statement,) = cur.fetchone()
                    cur.execute("SHOW logging_collector")
                    (logging_collector,) = cur.fetchone()
        except psycopg.Error as exc:
            return LoggingCoverageResult(ok=False, warning=f"Could not verify logging configuration: {exc}")

        if log_statement != "all" or logging_collector != "on":
            return LoggingCoverageResult(
                ok=False,
                warning=(
                    f"log_statement={log_statement!r}, logging_collector={logging_collector!r} -- "
                    "expected ('all', 'on'). Access visibility may be incomplete since this changed."
                ),
            )
        return LoggingCoverageResult(ok=True, warning=None)

    def _list_log_files(self) -> list[str]:
        # Filenames are timestamp-based (postgresql-YYYY-MM-DD_HHMMSS.log.csv)
        # so lexicographic order is chronological order.
        return sorted(glob.glob(os.path.join(self.log_directory, "*.csv")))

    def poll_events(self, checkpoint_log_file: str | None, checkpoint_byte_offset: int) -> PollResult:
        files = self._list_log_files()
        if not files:
            return PollResult(events=[], new_log_file=checkpoint_log_file or "", new_byte_offset=checkpoint_byte_offset)

        if checkpoint_log_file is None:
            # First-ever poll of this source: start from the oldest file
            # currently on disk rather than skipping straight to "now", so
            # existing history isn't silently missed.
            target_file = files[0]
            target_offset = 0
        elif checkpoint_log_file in files:
            target_file = checkpoint_log_file
            target_offset = checkpoint_byte_offset
        else:
            # The checkpointed file is gone -- rotated/deleted before we
            # read it (source log retention exceeded the poll interval).
            # Surface this as a coverage gap instead of silently resuming.
            target_file = files[0]
            target_offset = 0
            return PollResult(
                events=[],
                new_log_file=target_file,
                new_byte_offset=target_offset,
                coverage_gap_reason="source_retention_exceeded",
                coverage_gap_start=datetime.now(timezone.utc),
            )

        events: list[ParsedAccessEvent] = []
        current_file = target_file
        current_offset = target_offset
        budget = MAX_POLL_BYTES

        file_index = files.index(current_file)
        for f in files[file_index:]:
            if budget <= 0:
                # Out of budget for this poll. Stop cleanly with the
                # checkpoint at the last fully-parsed byte; the next poll
                # picks up from here. See MAX_POLL_BYTES.
                break
            start_offset = current_offset if f == current_file else 0
            new_events, consumed_to = self._parse_file_from(f, start_offset, budget)
            events.extend(new_events)
            budget -= max(consumed_to - start_offset, 0)
            current_file = f
            current_offset = consumed_to

        return PollResult(events=events, new_log_file=current_file, new_byte_offset=current_offset)

    def _parse_file_from(
        self, path: str, byte_offset: int, max_bytes: int = MAX_POLL_BYTES
    ) -> tuple[list[ParsedAccessEvent], int]:
        """Reads new bytes since `byte_offset` and parses complete CSV
        records out of them. A record is "complete" once its running quote
        count is even (no quoted field, which is how Postgres escapes
        embedded newlines in a logged statement, is left open) -- a simple,
        well-known streaming-CSV heuristic. Any trailing partial record
        (a write still in progress) is left unconsumed and re-read on the
        next poll, so the byte offset only ever advances past bytes that
        were fully parsed -- the basis of resumable, idempotent ingestion.
        """
        with open(path, "rb") as f:
            f.seek(byte_offset)
            new_bytes = f.read(max(max_bytes, 0))

        if not new_bytes:
            return [], byte_offset

        text = new_bytes.decode("utf-8", errors="replace")
        lines = text.splitlines(keepends=True)

        events: list[ParsedAccessEvent] = []
        consumed_byte_len = 0
        buffer = ""
        buffer_byte_len = 0

        for idx, line in enumerate(lines):
            buffer += line
            buffer_byte_len += len(line.encode("utf-8"))
            if buffer.count('"') % 2 != 0:
                continue  # inside a quoted field that spans multiple lines

            rows = list(csv.reader(io.StringIO(buffer)))
            is_last_chunk = idx == len(lines) - 1
            if len(rows) != 1 or len(rows[0]) != CSVLOG_COLUMNS:
                if is_last_chunk:
                    break  # partially-written row; retry from here next poll
                buffer, buffer_byte_len = "", 0  # malformed line; skip defensively
                continue

            consumed_byte_len += buffer_byte_len
            event = self._row_to_event(rows[0], path, consumed_byte_len)
            if event is not None:
                events.append(event)
            buffer, buffer_byte_len = "", 0

        if consumed_byte_len == 0 and len(new_bytes) >= max_bytes > 0:
            # Read a full budget's worth and still couldn't complete a
            # single record, which means one record is larger than the cap.
            # Without this, every subsequent poll would re-read the same
            # bytes and never advance -- ingestion for this source would
            # stall silently and forever. Skip the oversized record and
            # keep going; one dropped (and loudly logged) event is better
            # than a permanently wedged pipeline.
            logger.warning(
                "csvlog record at %s offset %d exceeds the %d-byte per-poll cap; skipping it to avoid stalling ingestion",
                path,
                byte_offset,
                max_bytes,
            )
            return events, byte_offset + len(new_bytes)

        return events, byte_offset + consumed_byte_len

    def _row_to_event(self, row: list[str], path: str, offset_marker: int) -> ParsedAccessEvent | None:
        message = row[COL_MESSAGE]
        match = _STATEMENT_RE.match(message)
        if not match:
            return None  # not a statement-execution row (e.g. a connection/auth log line)

        occurred_at = self._parse_log_time(row[COL_LOG_TIME])
        if occurred_at is None:
            # Unparseable or non-UTC timestamp -- see _parse_log_time. An
            # access event with a timestamp we can't stand behind has no
            # audit value, so it's dropped rather than recorded wrongly.
            logger.warning(
                "skipping csvlog row with unusable log_time %r "
                "(is this source's log_timezone set to something other than UTC?)",
                row[COL_LOG_TIME],
            )
            return None

        sql_text = match.group(1)
        query_type = self._classify_query_type(sql_text)
        schema_name, table_name = self._extract_table(sql_text)

        source_ip = (row[COL_CONNECTION_FROM] or "").rsplit(":", 1)[0] or None
        actor = row[COL_USER_NAME] or "unknown"

        return ParsedAccessEvent(
            source_log_id=f"{os.path.basename(path)}:{offset_marker}",
            occurred_at=occurred_at,
            actor_identifier=actor,
            actor_type=self._classify_actor_type(actor),
            query_type=query_type,
            source_ip=source_ip,
            schema_name=schema_name,
            table_name=table_name,
        )

    @staticmethod
    def _parse_log_time(raw: str) -> datetime | None:
        """Parse a csvlog log_time, returning None if it can't be trusted.

        Postgres formats this as "2026-09-09 10:15:23.123 UTC", but the
        trailing zone follows the source's own `log_timezone` setting,
        which the customer controls and is frequently *not* UTC. The
        previous implementation split on the literal " UTC" and then
        required microseconds, so a source logging in Asia/Dubai (or with
        whole-second timestamps) raised ValueError on the first row and
        took down ingestion for that entire data source -- one config
        difference on the customer's side, and Traceline silently stopped
        collecting anything.

        Rather than guess a zone we can't verify, non-UTC rows are skipped
        and reported: a wrong timestamp on an audit record is worse than a
        missing one, and the coverage gap is visible either way.
        """
        raw = (raw or "").strip()
        if not raw:
            return None

        parts = raw.rsplit(" ", 1)
        if len(parts) != 2:
            return None
        stamp, zone = parts
        if zone.upper() != "UTC":
            return None

        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(stamp, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    @staticmethod
    def _classify_query_type(sql_text: str) -> str:
        first_word = sql_text.strip().split(None, 1)[0].lower() if sql_text.strip() else ""
        if first_word in _READ_VERBS:
            return "read"
        if first_word in _WRITE_VERBS:
            return "write"
        if first_word in _DDL_VERBS:
            return "ddl"
        return "unknown"

    @staticmethod
    def _classify_actor_type(username: str) -> str:
        # MVP heuristic only -- no real identity provider integration.
        # Documented limitation: cannot distinguish a shared human login
        # from a service account beyond a naming convention.
        lowered = username.lower()
        if lowered.endswith(("_svc", "_service", "_app", "_job")) or lowered in {"demo_app"}:
            return "service_account"
        return "unknown"

    @staticmethod
    def _extract_table(sql_text: str) -> tuple[str | None, str | None]:
        # Best-effort only, per spec ("not full SQL parsing"). Looks at the
        # first identifier following FROM/JOIN/INTO/UPDATE/TABLE.
        try:
            parsed = sqlparse.parse(sql_text)
        except Exception:
            return None, None
        if not parsed:
            return None, None

        def is_name_like(tok) -> bool:
            return tok.ttype in (sqlparse.tokens.Name, None) or str(tok.ttype).startswith("Token.Literal")

        tokens = list(parsed[0].flatten())
        trigger_keywords = {"FROM", "JOIN", "INTO", "UPDATE", "TABLE"}
        # Postgres syntax that can sit between the trigger keyword and the
        # table name without being the name itself (e.g. "UPDATE ONLY t").
        skippable_keywords = {"ONLY"}

        for i, tok in enumerate(tokens):
            # UPDATE (and DELETE/INSERT) are Keyword.DML, a *subtype* of
            # Keyword -- `in` checks the whole subtype tree, `is` only
            # matches the exact type and silently misses UPDATE's table.
            if tok.ttype not in sqlparse.tokens.Keyword or tok.value.upper() not in trigger_keywords:
                continue

            j = i + 1
            while j < len(tokens) and (
                tokens[j].is_whitespace
                or (tokens[j].ttype in sqlparse.tokens.Keyword and tokens[j].value.upper() in skippable_keywords)
            ):
                j += 1
            if j >= len(tokens) or not is_name_like(tokens[j]):
                continue  # this occurrence didn't lead to a name; keep scanning

            first = tokens[j].value.strip('"')
            # A schema-qualified name ("public.customers", or quoted) is
            # THREE tokens to sqlparse (Name, '.', Name), never one --
            # missing this previously meant "public.customers" silently
            # resolved to table "public" in schema "public".
            if (
                j + 2 < len(tokens)
                and tokens[j + 1].ttype is sqlparse.tokens.Punctuation
                and tokens[j + 1].value == "."
                and is_name_like(tokens[j + 2])
            ):
                return first, tokens[j + 2].value.strip('"')
            return "public", first
        return None, None
