"""Proves the region-detection edge cases added alongside opt-in IP
geolocation: a private/internal IP is never sent to the external
geolocation service (regardless of the opt-in setting), and the workspace
must explicitly opt in before any external lookup happens at all.
"""
from app.models.ip_region_map import IpRegionMap
from app.services import region as region_module
from app.services.region import resolve_region


def test_private_ip_never_calls_external_service(admin_db, make_workspace, monkeypatch):
    ws = make_workspace()
    ws.enable_ip_geolocation = True
    admin_db.commit()

    called = False

    def _fail_if_called(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("must not call the external geolocation service for a private IP")

    monkeypatch.setattr(region_module.httpx, "get", _fail_if_called)

    region, confidence, source = resolve_region(admin_db, ws, "10.0.0.5", ip_map=[])

    assert called is False
    assert region is None
    assert confidence == "low"
    assert "not sent to an external geolocation service" in source


def test_geolocation_disabled_by_default_does_not_call_external_service(admin_db, make_workspace, monkeypatch):
    ws = make_workspace()  # enable_ip_geolocation defaults to False
    admin_db.commit()

    called = False

    def _fail_if_called(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(region_module.httpx, "get", _fail_if_called)

    region, confidence, source = resolve_region(admin_db, ws, "8.8.8.8", ip_map=[])

    assert called is False
    assert confidence == "low"
    assert source == "no matching entry in workspace CIDR map"


def test_cidr_map_takes_priority_over_geolocation(admin_db, make_workspace, monkeypatch):
    ws = make_workspace()
    ws.enable_ip_geolocation = True
    admin_db.commit()

    monkeypatch.setattr(
        region_module.httpx,
        "get",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("CIDR match should short-circuit before any HTTP call")),
    )

    ip_map = [IpRegionMap(workspace_id=ws.id, cidr="8.8.8.0/24", region="uae")]
    region, confidence, source = resolve_region(admin_db, ws, "8.8.8.8", ip_map)

    assert region == "uae"
    assert confidence == "high"
    assert "workspace CIDR map" in source
