from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.access_event import AccessEvent
from app.models.classification import ClassificationTag
from app.models.pipeline import Pipeline, PipelineTableEdge
from app.models.table_asset import TableAsset
from app.schemas.lineage import (
    LineageAccessEdge,
    LineageActorNode,
    LineageGraphOut,
    LineagePipelineEdge,
    LineagePipelineNode,
    LineageTableNode,
)

router = APIRouter(tags=["lineage"])


@router.get("/lineage/graph", response_model=LineageGraphOut)
def get_lineage_graph(data_source_id: UUID | None = Query(default=None), db: Session = Depends(get_db)) -> LineageGraphOut:
    """Combines two different kinds of 'connection' into one graph:
    pipeline -> table edges (declared lineage, from PipelineTableEdge --
    nothing discovers these automatically in the MVP, spec section 2) and
    actor -> table edges (observed access, derived live from access_event).
    They're deliberately different colors/shapes on the frontend since one
    is a declared fact and the other is an inference from logs.
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

    access_rows = list(
        db.execute(
            select(AccessEvent.actor_identifier, AccessEvent.actor_type, AccessEvent.table_id)
            .where(AccessEvent.table_id.in_(table_ids))
            .distinct()
        )
    ) if table_ids else []

    actors_by_identifier: dict[str, str] = {}
    access_edges: list[LineageAccessEdge] = []
    for actor_identifier, actor_type, table_id in access_rows:
        actors_by_identifier[actor_identifier] = actor_type
        access_edges.append(LineageAccessEdge(actor_identifier=actor_identifier, table_id=table_id))

    return LineageGraphOut(
        pipelines=[LineagePipelineNode(id=p.id, name=p.name) for p in pipelines],
        tables=[
            LineageTableNode(id=t.id, schema_name=t.schema_name, table_name=t.table_name, tags=tags_by_table.get(t.id, []))
            for t in tables
        ],
        actors=[LineageActorNode(identifier=k, actor_type=v) for k, v in actors_by_identifier.items()],
        pipeline_edges=[
            LineagePipelineEdge(pipeline_id=e.pipeline_id, table_id=e.table_id, direction=e.direction)
            for e in pipeline_edges
        ],
        access_edges=access_edges,
    )
