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

    # A token can be validly signed and still not carry the claims this app
    # expects -- an older token format, or one minted by another service
    # that happens to share the secret. Missing/garbled claims are an
    # authentication failure, not an unhandled KeyError/ValueError that
    # surfaces as a 500 and leaks a stack trace.
    try:
        user_id = UUID(payload["sub"])
        workspace_id = UUID(payload["workspace_id"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    return CurrentUser(user_id=user_id, workspace_id=workspace_id, email=payload.get("email", ""))


def get_db(current_user: CurrentUser = Depends(get_current_user)) -> Generator[Session, None, None]:
    """Every non-auth route depends on this. It is what actually enforces
    tenant isolation end to end: the session is opened for exactly the
    caller's workspace_id, and Postgres RLS (migration 0001) rejects
    anything else even if a query forgets its own WHERE clause."""
    yield from get_workspace_db(current_user.workspace_id)


def get_current_db_user(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Loads the live User row for the caller. Deliberately a fresh query
    per request rather than trusting a role baked into the JWT at login
    time -- a role change (e.g. demoting an admin) should take effect on
    the very next request, not wait for the token to expire."""
    from app.models.user import User  # local import avoids a circular import at module load time

    user = db.get(User, current_user.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session user not found")

    # Defence in depth. The session is already RLS-scoped to the token's
    # workspace_id, so a user row from another workspace should be
    # invisible here rather than mismatched -- this asserts that invariant
    # instead of assuming it. If a user is ever moved between workspaces,
    # their existing tokens stop working immediately, which is the safe
    # direction to fail.
    if user.workspace_id != current_user.workspace_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session no longer valid for this workspace")
    return user


def require_role(*allowed_roles: str):
    """Role check, separate from `can_review` (see User model): 'can
    administer the workspace' and 'is an authorized reviewer' are
    different questions. Use on any endpoint that mutates configuration
    (data sources, tags, region rules, team, workspace settings) rather
    than just viewing data."""

    def _dependency(user=Depends(get_current_db_user)):
        if user.role not in allowed_roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires one of these roles: {', '.join(allowed_roles)} (you are '{user.role}')",
            )
        return user

    return _dependency
