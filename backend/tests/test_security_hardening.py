"""Regression tests for the findings of the security/robustness audit.

Each test here corresponds to a specific defect that was present and is
now fixed; the comment on each says what used to happen, so a future
change that reintroduces the behaviour fails with an explanation rather
than just a red assertion.
"""
import pytest
from pydantic import ValidationError

from app.core.config import (
    DEV_CREDENTIALS_ENCRYPTION_KEY,
    DEV_JWT_SECRET,
    InsecureConfigurationError,
    Settings,
    _assert_production_secrets,
)
from app.schemas.region_rule import IpRegionMapCreate, RegionRuleCreate
from app.schemas.user import UserCreate
from app.services.connectors.postgres_csvlog import PostgresCsvlogConnector


# --- configuration: refuse to run a deployment on public secrets ----------


def _settings(**overrides) -> Settings:
    base = dict(
        traceline_env="production",
        jwt_secret="a-real-generated-secret-value-for-tests",
        credentials_encryption_key="another-real-looking-key",
        cookie_samesite="lax",
        cookie_secure=False,
    )
    base.update(overrides)
    return Settings(**base)


def test_production_rejects_default_jwt_secret():
    """Shipping the in-repo JWT secret would let anyone mint a session for
    any workspace. Previously this booted happily."""
    with pytest.raises(InsecureConfigurationError, match="JWT_SECRET"):
        _assert_production_secrets(_settings(jwt_secret=DEV_JWT_SECRET))


def test_production_rejects_default_encryption_key():
    """The default Fernet key is in source control, so every stored data
    source credential would be decryptable by anyone with the repo."""
    with pytest.raises(InsecureConfigurationError, match="CREDENTIALS_ENCRYPTION_KEY"):
        _assert_production_secrets(_settings(credentials_encryption_key=DEV_CREDENTIALS_ENCRYPTION_KEY))


def test_production_rejects_samesite_none_without_secure():
    """SameSite=None without Secure is silently dropped by browsers, so
    login would appear to succeed and then every request would 401."""
    with pytest.raises(InsecureConfigurationError, match="COOKIE_SECURE"):
        _assert_production_secrets(_settings(cookie_samesite="none", cookie_secure=False))


def test_local_env_still_allows_dev_defaults():
    """`docker compose up` with no configuration must keep working."""
    _assert_production_secrets(
        _settings(
            traceline_env="local",
            jwt_secret=DEV_JWT_SECRET,
            credentials_encryption_key=DEV_CREDENTIALS_ENCRYPTION_KEY,
        )
    )


def test_valid_production_config_passes():
    _assert_production_secrets(_settings(cookie_samesite="none", cookie_secure=True))


# --- input validation that used to fail silently or 500 ------------------


def test_invalid_cidr_is_rejected_at_input():
    """An unparseable CIDR was accepted and then skipped at match time, so
    the region rule silently never matched anything -- the worst failure
    mode for a control that decides which access is in-region."""
    with pytest.raises(ValidationError):
        IpRegionMapCreate(cidr="172.16.0.0/33", region="uae")
    with pytest.raises(ValidationError):
        IpRegionMapCreate(cidr="not-an-address", region="uae")


def test_valid_cidr_is_normalised():
    assert IpRegionMapCreate(cidr="  10.0.0.0/8 ", region=" uae ").cidr == "10.0.0.0/8"


def test_region_rule_requires_at_least_one_approved_region():
    """An empty approved list means every access violates -- almost always
    a misconfiguration rather than an intent."""
    with pytest.raises(ValidationError):
        RegionRuleCreate(classification_tag="pii", approved_regions=[])
    with pytest.raises(ValidationError):
        RegionRuleCreate(classification_tag="pii", approved_regions=["   "])


def test_overlong_password_rejected_not_500():
    """bcrypt only reads the first 72 bytes and passlib raises rather than
    truncating, so this used to surface as a 500 on user creation."""
    with pytest.raises(ValidationError):
        UserCreate(email="a@example.com", password="x" * 100)


def test_short_password_rejected():
    with pytest.raises(ValidationError):
        UserCreate(email="a@example.com", password="short")


def test_password_length_limit_counts_bytes_not_characters():
    """Multi-byte characters hit bcrypt's 72-*byte* limit well before 72
    characters."""
    with pytest.raises(ValidationError):
        UserCreate(email="a@example.com", password="é" * 40)  # 80 bytes


# --- connector robustness ------------------------------------------------


def test_log_time_parsing_accepts_utc_with_and_without_microseconds():
    parse = PostgresCsvlogConnector._parse_log_time
    assert parse("2026-09-09 10:15:23.123 UTC") is not None
    assert parse("2026-09-09 10:15:23 UTC") is not None


def test_non_utc_log_time_is_skipped_not_raised():
    """log_timezone is customer-configurable. A non-UTC source used to
    raise ValueError on the first row and kill ingestion for that data
    source entirely -- silently, from Traceline's point of view."""
    parse = PostgresCsvlogConnector._parse_log_time
    assert parse("2026-09-09 10:15:23.123 +04") is None
    assert parse("2026-09-09 14:15:23.123 GST") is None
    assert parse("") is None
    assert parse("garbage") is None


def test_oversized_record_does_not_stall_ingestion(tmp_path):
    """A single csvlog record larger than the per-poll byte cap could never
    be completed, so the offset never advanced and ingestion for that
    source wedged permanently. It must skip forward instead."""
    log_file = tmp_path / "postgresql-2026-09-09_000000.log.csv"
    # One unterminated quoted field, larger than the cap we pass in.
    log_file.write_text('"' + ("x" * 5000), encoding="utf-8")

    connector = PostgresCsvlogConnector(
        host="unused", port=5432, dbname="unused", username="unused", password="unused",
        log_directory=str(tmp_path),
    )
    events, new_offset = connector._parse_file_from(str(log_file), 0, max_bytes=1000)

    assert events == []
    assert new_offset > 0, "offset must advance past an unparseable oversized record"
