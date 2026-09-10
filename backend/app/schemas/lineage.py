from uuid import UUID

from pydantic import BaseModel


class LineagePipelineNode(BaseModel):
    id: UUID
    name: str


class LineageTableNode(BaseModel):
    id: UUID
    schema_name: str
    table_name: str
    tags: list[str]


class LineageActorNode(BaseModel):
    identifier: str
    actor_type: str


class LineagePipelineEdge(BaseModel):
    pipeline_id: UUID
    table_id: UUID
    direction: str


class LineageAccessEdge(BaseModel):
    actor_identifier: str
    table_id: UUID


class LineageGraphOut(BaseModel):
    pipelines: list[LineagePipelineNode]
    tables: list[LineageTableNode]
    actors: list[LineageActorNode]
    pipeline_edges: list[LineagePipelineEdge]
    access_edges: list[LineageAccessEdge]
