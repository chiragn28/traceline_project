from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_db_user
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.db.session import get_admin_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "traceline_session"


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_admin_db)) -> LoginResponse:
    # Deliberate exception: this is the one lookup that must run before a
    # workspace_id is known, so it cannot go through an RLS-scoped session
    # (see app.db.session). It performs no writes and returns only the
    # single matching user's identity.
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(user.id, user.workspace_id, user.email)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        max_age=60 * 60 * 8,
    )
    return LoginResponse(
        user_id=str(user.id), workspace_id=str(user.workspace_id), email=user.email, role=user.role, can_review=user.can_review
    )


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=LoginResponse)
def me(user: User = Depends(get_current_db_user)) -> LoginResponse:
    return LoginResponse(
        user_id=str(user.id), workspace_id=str(user.workspace_id), email=user.email, role=user.role, can_review=user.can_review
    )
