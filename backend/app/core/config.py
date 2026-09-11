from pydantic_settings import BaseSettings, SettingsConfigDict


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
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    # Valid-format placeholder so a bare `docker compose up` works out of the
    # box; ANY real (non-local-dev) deployment MUST override this via .env
    # with its own generated key (see .env.example) -- this default is not
    # a secret since it ships in source control.
    credentials_encryption_key: str = "csY5nV5XmVUOyW5snCB-F2_r1GfLpJ7LsgkaijhxmlE="
    deployment_region: str = "local-dev-not-region-compliant"

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


settings = Settings()
