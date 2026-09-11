from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class LineagePipelineNode(BaseModel):
    id: UUID
    name: str
    # Table-level lineage only (spec) -- these counts describe how many
    # tables this pipeline touches, for the at-a-glance badge.
    reads_count: int = 0
    writes_count: int = 0


class LineageTableNode(BaseModel):
    id: UUID
    schema_name: str
    table_name: str
    tags: list[str]
    access_count_30d: int = 0
    distinct_actor_count: int = 0
    last_accessed_at: datetime | None = None


class LineageActorNode(BaseModel):
    identifier: str
    actor_type: str
    access_count_30d: int = 0
    last_seen_at: datetime | None = None
    owner_email: str | None = None


class LineagePipelineEdge(BaseModel):
    pipeline_id: UUID
    table_id: UUID
    direction: str


class LineageAccessEdge(BaseModel):
    actor_identifier: str
    table_id: UUID
    access_count_30d: int = 0
    last_accessed_at: datetime | None = None


class LineageGraphOut(BaseModel):
    pipelines: list[LineagePipelineNode]
    tables: list[LineageTableNode]
    actors: list[LineageActorNode]
    pipeline_edges: list[LineagePipelineEdge]
    access_edges: list[LineageAccessEdge]
