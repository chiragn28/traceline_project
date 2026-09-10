from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db
from app.models.classification import ClassificationTag
from app.models.table_asset import TableAsset
from app.schemas.table_asset import ClassificationTagCreate, ClassificationTagOut, TableAssetOut

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("", response_model=list[TableAssetOut])
def list_tables(
    data_source_id: UUID | None = Query(default=None),
    include_dropped: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[TableAssetOut]:
    stmt = select(TableAsset)
    if data_source_id:
        stmt = stmt.where(TableAsset.data_source_id == data_source_id)
    if not include_dropped:
        stmt = stmt.where(TableAsset.dropped_at.is_(None))

    tables = list(db.scalars(stmt))
    tags = list(
        db.scalars(
            select(ClassificationTag).where(
                ClassificationTag.table_id.in_([t.id for t in tables]) if tables else False,
                ClassificationTag.superseded_at.is_(None),
            )
        )
    ) if tables else []

    tags_by_table: dict[UUID, list[ClassificationTag]] = {}
    for tag in tags:
        tags_by_table.setdefault(tag.table_id, []).append(tag)

    out = []
    for t in tables:
        item = TableAssetOut.model_validate(t)
        item.current_tags = [ClassificationTagOut.model_validate(tag) for tag in tags_by_table.get(t.id, [])]
        out.append(item)
    return out


@router.post("/{table_id}/classifications", response_model=ClassificationTagOut, status_code=status.HTTP_201_CREATED)
def add_classification(
    table_id: UUID,
    body: ClassificationTagCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ClassificationTag:
    table = db.get(TableAsset, table_id)
    if not table:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Table not found")

    # Append-only history: superseding a tag never overwrites it, so a
    # report covering a past date is honest about what was tagged *then*
    # (spec 5).
    now = datetime.now(timezone.utc)
    existing_active = db.scalar(
        select(ClassificationTag).where(
            ClassificationTag.table_id == table_id,
            ClassificationTag.column_name == body.column_name,
            ClassificationTag.superseded_at.is_(None),
        )
    )
    if existing_active:
        existing_active.superseded_at = now

    new_tag = ClassificationTag(
        workspace_id=current_user.workspace_id,
        table_id=table_id,
        column_name=body.column_name,
        tag=body.tag,
        created_by_user_id=current_user.user_id,
    )
    db.add(new_tag)
    db.commit()
    db.refresh(new_tag)
    return new_tag
