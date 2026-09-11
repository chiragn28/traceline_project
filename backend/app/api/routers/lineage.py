from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.access_event import AccessEvent
from app.models.actor_ownership import ActorOwnership
from app.models.classification import ClassificationTag
from app.models.pipeline import Pipeline, PipelineTableEdge
from app.models.table_asset import TableAsset
from app.models.user import User
from app.schemas.lineage import (
    LineageAccessEdge,
    LineageActorNode,
    LineageGraphOut,
    LineagePipelineEdge,
    LineagePipelineNode,
    LineageTableNode,
)

router = APIRouter(tags=["lineage"])

LOOKBACK = timedelta(days=30)


@router.get("/lineage/graph", response_model=LineageGraphOut)
def get_lineage_graph(data_source_id: UUID | None = Query(default=None), db: Session = Depends(get_db)) -> LineageGraphOut:
    """Combines two different kinds of 'connection' into one graph:
    pipeline -> table edges (declared lineage, from PipelineTableEdge --
    nothing discovers these automatically in the MVP, spec section 2) and
    actor -> table edges (observed access, derived live from access_event,
    aggregated over a 30-day window). They're deliberately different
    colors/shapes on the frontend since one is a declared fact and the
    other is an inference from logs. Every node/edge carries enough detail
    (counts, last-seen, owner) for a hover tooltip, not just an identity,
    so the graph is legible without a separate "click through and ask"
    step.
    """
    table_stmt = select(TableAsset).where(TableAsset.dropped_at.is_(None))
    if data_source_id:
        table_stmt = table_stmt.where(TableAsset.data_source_id == data_source_id)
    tables = list(db.scalars(table_stmt))
    table_ids = [t.id for t in tables]

    tags_by_table: dict[UUID, list[str]] = {}
    if table_ids:
        tags = db.scalars(
            select(ClassificationTag).where(
                ClassificationTag.table_id.in_(table_ids), ClassificationTag.superseded_at.is_(None)
            )
        )
        for tag in tags:
            tags_by_table.setdefault(tag.table_id, []).append(tag.tag)

    pipelines = list(db.scalars(select(Pipeline)))
    pipeline_edges = list(
        db.scalars(select(PipelineTableEdge).where(PipelineTableEdge.table_id.in_(table_ids)))
    ) if table_ids else []

    pipeline_read_counts: dict[UUID, int] = {}
    pipeline_write_counts: dict[UUID, int] = {}
    for e in pipeline_edges:
        bucket = pipeline_read_counts if e.direction == "read" else pipeline_write_counts
        bucket[e.pipeline_id] = bucket.get(e.pipeline_id, 0) + 1

    window_start = datetime.now(timezone.utc) - LOOKBACK

    # One grouped query for the (actor, table) edges -- this is also the
    # source of every table-level and actor-level total below, summed
    # client-side from the same rows, so the totals and the edges can
    # never disagree with each other.
    edge_rows = list(
        db.execute(
            select(
                AccessEvent.actor_identifier,
                AccessEvent.actor_type,
                AccessEvent.table_id,
                func.count().label("cnt"),
                func.max(AccessEvent.occurred_at).label("last_at"),
            )
            .where(AccessEvent.table_id.in_(table_ids), AccessEvent.occurred_at >= window_start)
            .group_by(AccessEvent.actor_identifier, AccessEvent.actor_type, AccessEvent.table_id)
        )
    ) if table_ids else []

    owner_by_actor: dict[str, str] = {}
    if edge_rows:
        actor_identifiers = {row.actor_identifier for row in edge_rows}
        ownerships = db.scalars(
            select(ActorOwnership).where(ActorOwnership.actor_identifier.in_(actor_identifiers))
        )
        owner_ids = {o.actor_identifier: o.owner_user_id for o in ownerships}
        if owner_ids:
            users_by_id = {u.id: u for u in db.scalars(select(User).where(User.id.in_(owner_ids.values())))}
            owner_by_actor = {
                actor: users_by_id[uid].email for actor, uid in owner_ids.items() if uid in users_by_id
            }

    access_edges: list[LineageAccessEdge] = []
    table_totals: dict[UUID, dict] = {t.id: {"count": 0, "actors": set(), "last": None} for t in tables}
    actor_totals: dict[str, dict] = {}

    for row in edge_rows:
        access_edges.append(
            LineageAccessEdge(
                actor_identifier=row.actor_identifier,
                table_id=row.table_id,
                access_count_30d=row.cnt,
                last_accessed_at=row.last_at,
            )
        )

        t = table_totals[row.table_id]
        t["count"] += row.cnt
        t["actors"].add(row.actor_identifier)
        t["last"] = row.last_at if t["last"] is None or row.last_at > t["last"] else t["last"]

        a = actor_totals.setdefault(row.actor_identifier, {"type": row.actor_type, "count": 0, "last": None})
        a["count"] += row.cnt
        a["last"] = row.last_at if a["last"] is None or row.last_at > a["last"] else a["last"]

    return LineageGraphOut(
        pipelines=[
            LineagePipelineNode(
                id=p.id, name=p.name, reads_count=pipeline_read_counts.get(p.id, 0), writes_count=pipeline_write_counts.get(p.id, 0)
            )
            for p in pipelines
        ],
        tables=[
            LineageTableNode(
                id=t.id,
                schema_name=t.schema_name,
                table_name=t.table_name,
                tags=tags_by_table.get(t.id, []),
                access_count_30d=table_totals[t.id]["count"],
                distinct_actor_count=len(table_totals[t.id]["actors"]),
                last_accessed_at=table_totals[t.id]["last"],
            )
            for t in tables
        ],
        actors=[
            LineageActorNode(
                identifier=identifier,
                actor_type=data["type"],
                access_count_30d=data["count"],
                last_seen_at=data["last"],
                owner_email=owner_by_actor.get(identifier),
            )
            for identifier, data in actor_totals.items()
        ],
        pipeline_edges=[
            LineagePipelineEdge(pipeline_id=e.pipeline_id, table_id=e.table_id, direction=e.direction)
            for e in pipeline_edges
        ],
        access_edges=access_edges,
    )
