from collections.abc import Generator
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_workspace_db


@dataclass
class CurrentUser:
    user_id: UUID
    workspace_id: UUID
    email: str


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get("traceline_session")
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return CurrentUser(
        user_id=UUID(payload["sub"]),
        workspace_id=UUID(payload["workspace_id"]),
        email=payload.get("email", ""),
    )


def get_db(current_user: CurrentUser = Depends(get_current_user)) -> Generator[Session, None, None]:
    """Every non-auth route depends on this. It is what actually enforces
    tenant isolation end to end: the session is opened for exactly the
    caller's workspace_id, and Postgres RLS (migration 0001) rejects
    anything else even if a query forgets its own WHERE clause."""
    yield from get_workspace_db(current_user.workspace_id)
