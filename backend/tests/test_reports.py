"""Proves the report tamper-evidence and timezone requirements from spec
section 5: the stored hash must match the exported file's actual bytes, and
the export must be labeled/converted to Gulf Standard Time even though
everything is stored internally as UTC."""
import hashlib
from datetime import datetime, timedelta, timezone

from app.models.access_event import AccessEvent
from app.services.reports import generate_report_csv, verify_report_integrity


def test_report_hash_matches_file_contents(admin_db, make_workspace, make_data_source, tmp_path, monkeypatch):
    import app.services.reports as reports_module

    monkeypatch.setattr(reports_module, "REPORTS_DIR", str(tmp_path))

    ws = make_workspace()
    ds = make_data_source(ws)
    occurred_at = datetime(2026, 9, 9, 6, 0, 0, tzinfo=timezone.utc)  # 10:00 GST
    admin_db.add(
        AccessEvent(
            workspace_id=ws.id,
            data_source_id=ds.id,
            source_log_id="f.csv:1",
            actor_identifier="amina",
            actor_type="human",
            query_type="read",
            occurred_at=occurred_at,
        )
    )
    admin_db.commit()

    file_path, content_sha256 = generate_report_csv(
        admin_db, ws.id, occurred_at - timedelta(hours=1), occurred_at + timedelta(hours=1)
    )

    with open(file_path, "rb") as f:
        actual_hash = hashlib.sha256(f.read()).hexdigest()
    assert actual_hash == content_sha256
    assert verify_report_integrity(file_path, content_sha256)

    with open(file_path) as f:
        content = f.read()
    assert "10:00:00 GST" in content  # 06:00 UTC -> 10:00 GST (UTC+4)


def test_tampered_report_fails_integrity_check(admin_db, make_workspace, make_data_source, tmp_path, monkeypatch):
    import app.services.reports as reports_module

    monkeypatch.setattr(reports_module, "REPORTS_DIR", str(tmp_path))

    ws = make_workspace()
    make_data_source(ws)
    admin_db.commit()

    now = datetime.now(timezone.utc)
    file_path, content_sha256 = generate_report_csv(admin_db, ws.id, now - timedelta(days=1), now)

    with open(file_path, "a") as f:
        f.write("extra,tampered,row\n")

    assert not verify_report_integrity(file_path, content_sha256)
