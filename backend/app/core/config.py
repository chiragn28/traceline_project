from pydantic_settings import BaseSettings, SettingsConfigDict

# These ship in source control, so they are public knowledge. Anyone who
# knows them can forge a session token for any workspace, or decrypt every
# stored data-source credential. They exist only so `docker compose up`
# works with no setup; see _assert_production_secrets below for the guard
# that stops them reaching anything real.
DEV_JWT_SECRET = "dev-only-change-me"
DEV_CREDENTIALS_ENCRYPTION_KEY = "csY5nV5XmVUOyW5snCB-F2_r1GfLpJ7LsgkaijhxmlE="


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Admin/migration connection: owns the schema, used only by Alembic and
    # the seed script. Never used to serve a request.
    database_url: str = "postgresql+psycopg://traceline_admin:traceline_admin@localhost:55432/traceline"

    # Runtime connection: a non-owner, non-superuser role. Row-Level
    # Security policies (see migration 0001) apply in full to this role,
    # which is what makes RLS an actual defense-in-depth backstop rather
    # than a no-op against the table owner.
    app_database_url: str = "postgresql+psycopg://traceline_app:traceline_app@localhost:55432/traceline"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    # Valid-format placeholder so a bare `docker compose up` works out of the
    # box; ANY real (non-local-dev) deployment MUST override this via .env
    # with its own generated key (see .env.example) -- this default is not
    # a secret since it ships in source control.
    credentials_encryption_key: str = DEV_CREDENTIALS_ENCRYPTION_KEY
    deployment_region: str = "local-dev-not-region-compliant"

    # Set TRACELINE_ENV=production (or anything other than "local") on a
    # deployed instance. It gates the startup secret check below: the point
    # is that shipping with the in-repo dev defaults has to be an explicit,
    # local-only choice, never something you can do by forgetting to set an
    # environment variable.
    traceline_env: str = "local"

    # How often the ingestion worker polls each data source, in seconds.
    ingestion_poll_interval_seconds: int = 15

    # Comma-separated in the environment (CORS_ALLOWED_ORIGINS=https://a,https://b).
    # Defaults cover local dev; a deployed frontend (e.g. Vercel) must be
    # added explicitly, never wildcarded, since credentials are allowed.
    #
    # Kept as a raw str field, not list[str]: pydantic-settings tries to
    # JSON-decode any complex-typed field's env value *before* a "before"
    # validator ever runs, so a real (non-JSON) comma-separated env value
    # like "https://a,https://b" crashed on startup -- only worked locally
    # because the Python-list default was never overridden by an env var.
    # Parse via the cors_allowed_origins_list property instead.
    cors_allowed_origins: str = "http://localhost:3000,http://localhost:3001"

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    # Local dev: frontend and backend are both http://localhost, so a plain
    # Lax, non-Secure cookie works. A deployed split (frontend on Vercel,
    # backend on Railway) puts them on different origins entirely, and a
    # cross-site fetch will not send/accept a Lax cookie no matter what
    # `credentials: "include"` says on the frontend -- it needs
    # SameSite=None, which browsers additionally require Secure (HTTPS) for.
    # Set COOKIE_SECURE=true and COOKIE_SAMESITE=none in that deployment.
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    @property
    def is_local_env(self) -> bool:
        return self.traceline_env.strip().lower() in {"local", "dev", "development", "test"}


class InsecureConfigurationError(RuntimeError):
    """Raised at import time when a deployed instance is configured with
    secrets that are public knowledge. Deliberately fatal: a compliance
    product that silently runs on a forgeable session secret is worse than
    one that refuses to start, because nothing downstream would ever
    reveal the problem."""


def _assert_production_secrets(s: Settings) -> None:
    if s.is_local_env:
        return

    problems = []
    if s.jwt_secret == DEV_JWT_SECRET:
        problems.append("JWT_SECRET is the in-repo development default -- anyone could forge a session for any workspace")
    if s.credentials_encryption_key == DEV_CREDENTIALS_ENCRYPTION_KEY:
        problems.append(
            "CREDENTIALS_ENCRYPTION_KEY is the in-repo development default -- "
            "every stored data-source credential is decryptable by anyone with the source"
        )
    if s.cookie_samesite.strip().lower() == "none" and not s.cookie_secure:
        problems.append("COOKIE_SAMESITE=none requires COOKIE_SECURE=true; browsers reject the cookie otherwise")

    if problems:
        raise InsecureConfigurationError(
            "Refusing to start with an insecure configuration (TRACELINE_ENV="
            f"{s.traceline_env!r}):\n  - " + "\n  - ".join(problems) + "\n"
            "Generate real values:\n"
            '  JWT_SECRET:                python -c "import secrets; print(secrets.token_urlsafe(48))"\n'
            '  CREDENTIALS_ENCRYPTION_KEY: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )


settings = Settings()
_assert_production_secrets(settings)
