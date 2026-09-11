from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db, require_role
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceOut, WorkspaceSettingsUpdate

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("", response_model=WorkspaceOut)
def get_workspace(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)) -> Workspace:
    return db.get(Workspace, current_user.workspace_id)


@router.patch("/settings", response_model=WorkspaceOut, dependencies=[Depends(require_role("admin"))])
def update_workspace_settings(
    body: WorkspaceSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Workspace:
    workspace = db.get(Workspace, current_user.workspace_id)
    workspace.enable_ip_geolocation = body.enable_ip_geolocation
    db.commit()
    db.refresh(workspace)
    return workspace
