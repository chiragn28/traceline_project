from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    access_events,
    access_reviews,
    auth,
    data_sources,
    lineage,
    region_rules,
    reports,
    tables,
    users,
    workspace,
)
from app.core.config import settings

app = FastAPI(title="Traceline API")

app.add_middleware(
    CORSMiddleware,
    # Configurable via CORS_ALLOWED_ORIGINS (comma-separated) so a deployed
    # frontend -- e.g. on Vercel -- isn't hardcoded to localhost.
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(data_sources.router)
app.include_router(tables.router)
app.include_router(region_rules.router)
app.include_router(access_events.router)
app.include_router(reports.router)
app.include_router(access_reviews.router)
app.include_router(users.router)
app.include_router(lineage.router)
app.include_router(workspace.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
