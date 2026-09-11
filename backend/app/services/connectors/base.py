"""Source connector interface.

Only a Postgres implementation exists in the MVP (see postgres_csvlog.py).
This interface exists so Snowflake/BigQuery/etc. connectors can be added
later without touching ingestion, the data model, or the API -- per spec
section 2 ("design the ingestion interface so more sources can be added
later, but only build Postgres now").
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ParsedAccessEvent:
    source_log_id: str  # stable id for dedupe: (log file, byte range), not a timestamp
    occurred_at: datetime
    actor_identifier: str
    actor_type: str  # human | service_account | unknown
    query_type: str  # read | write | ddl | unknown
    source_ip: str | None
    schema_name: str | None
    table_name: str | None


@dataclass
class ConnectionCheckResult:
    connected: bool
    read_only_verified: bool
    warning: str | None


@dataclass
class LoggingCoverageResult:
    ok: bool
    warning: str | None


@dataclass
class PollResult:
    events: list[ParsedAccessEvent]
    new_log_file: str
    new_byte_offset: int
    coverage_gap_reason: str | None = None
    coverage_gap_start: datetime | None = None


@dataclass
class TableGrant:
    grantee: str
    privilege: str  # SELECT | INSERT | UPDATE | DELETE | ...


class SourceConnector(ABC):
    @abstractmethod
    def test_connection(self) -> ConnectionCheckResult: ...

    @abstractmethod
    def discover_tables(self) -> list[tuple[str, str]]:
        """Returns (schema_name, table_name) pairs."""

    @abstractmethod
    def check_logging_coverage(self) -> LoggingCoverageResult: ...

    @abstractmethod
    def poll_events(self, checkpoint_log_file: str | None, checkpoint_byte_offset: int) -> PollResult: ...

    @abstractmethod
    def list_table_grants(self, schema_name: str, table_name: str) -> list[TableGrant]:
        """Live GRANT introspection for one table -- who actually has a
        privilege on it right now, independent of whether they've used it
        recently. This is what lets an access review catch a dormant but
        still-granted permission that observed-access-only would miss."""
