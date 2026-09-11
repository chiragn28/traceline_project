"""Best-effort region resolution, in two tiers:

1. The workspace's own manually-configured IP/CIDR map -- always checked
   first, "high" confidence, since the workspace told us this themselves.
2. An opt-in live IP geolocation lookup (ip-api.com, no API key) for
   anything the CIDR map doesn't cover -- "medium" confidence, since a
   third-party geolocation database is inherently approximate.

Tier 2 is off by default (Workspace.enable_ip_geolocation) and NEVER
called for a private/internal address -- sending an RFC1918 address to an
external service is meaningless (it doesn't resolve to anything) and, for
a security product, sending any access IP to a third party at all should
be the customer's explicit choice, not a silent default. Every result
still carries a confidence and source label; nothing here is ever
presented as a guarantee.
"""
import ipaddress
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ip_geolocation_cache import IpGeolocationCache
from app.models.ip_region_map import IpRegionMap
from app.models.workspace import Workspace

GEOLOCATION_CACHE_TTL = timedelta(days=30)
GEOLOCATION_TIMEOUT_SECONDS = 3.0


def resolve_region(
    db: Session,
    workspace: Workspace,
    source_ip: str | None,
    ip_map: list[IpRegionMap],
) -> tuple[str | None, str, str | None]:
    """Returns (region, confidence, source)."""
    if not source_ip:
        return None, "unknown", None

    try:
        addr = ipaddress.ip_address(source_ip)
    except ValueError:
        return None, "unknown", "unparseable source IP"

    for entry in ip_map:
        try:
            network = ipaddress.ip_network(entry.cidr, strict=False)
        except ValueError:
            continue
        if addr in network:
            return entry.region, "high", f"workspace CIDR map ({entry.cidr})"

    if not workspace.enable_ip_geolocation:
        return None, "low", "no matching entry in workspace CIDR map"

    if addr.is_private:
        return None, "low", "private/internal IP -- not sent to an external geolocation service"

    cached = db.scalar(
        select(IpGeolocationCache).where(
            IpGeolocationCache.workspace_id == workspace.id,
            IpGeolocationCache.ip_address == source_ip,
        )
    )
    if cached and (datetime.now(timezone.utc) - cached.looked_up_at) < GEOLOCATION_CACHE_TTL:
        if cached.region:
            return cached.region, "medium", f"IP geolocation, cached ({cached.source})"
        return None, "low", f"IP geolocation found no result, cached ({cached.source})"

    region, source_label = _lookup_geolocation(source_ip)

    if cached:
        cached.region = region
        cached.source = source_label
        cached.looked_up_at = datetime.now(timezone.utc)
    else:
        db.add(
            IpGeolocationCache(
                workspace_id=workspace.id,
                ip_address=source_ip,
                region=region,
                country_code=None,
                source=source_label,
            )
        )

    if region:
        return region, "medium", f"IP geolocation ({source_label})"
    return None, "low", f"IP geolocation found no result ({source_label})"


def _lookup_geolocation(ip: str) -> tuple[str | None, str]:
    """A workspace's approved-region values are free-text (whatever they
    used in their region_rule), so we return the geolocation provider's
    country code lowercased -- it will only ever match a region_rule if
    the workspace used the same code, which is a real limitation of a
    free, keyless provider worth being upfront about rather than
    pretending this maps perfectly onto arbitrary region names.
    """
    try:
        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,countryCode"},
            timeout=GEOLOCATION_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return None, "ip-api.com (lookup failed)"

    if data.get("status") != "success" or not data.get("countryCode"):
        return None, "ip-api.com (no result)"

    return data["countryCode"].lower(), "ip-api.com"
