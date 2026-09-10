"""Best-effort region resolution. No live cloud-metadata lookups in the MVP
(spec 5) -- a match against the workspace's own manually-configured
IP/CIDR map is the only signal, and every result carries a confidence and
source label so the UI never presents a guess as a guarantee."""
import ipaddress

from app.models.ip_region_map import IpRegionMap


def resolve_region(source_ip: str | None, ip_map: list[IpRegionMap]) -> tuple[str | None, str, str | None]:
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

    return None, "low", "no matching entry in workspace CIDR map"
