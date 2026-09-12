from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_db_user
from app.core.config import settings
from app.core.security import create_access_token, verify_password, verify_password_dummy
from app.db.session import get_admin_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "traceline_session"
COOKIE_PATH = "/"


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_admin_db)) -> LoginResponse:
    # Deliberate exception: this is the one lookup that must run before a
    # workspace_id is known, so it cannot go through an RLS-scoped session
    # (see app.db.session). It performs no writes and returns only the
    # single matching user's identity.
    user = db.scalar(select(User).where(User.email == body.email))

    if user is None:
        # Spend the same time as a real verification before failing, so the
        # response time doesn't disclose whether the email is registered.
        verify_password_dummy()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(user.id, user.workspace_id, user.email)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        path=COOKIE_PATH,
        # Derived from the token's own lifetime rather than hardcoded, so
        # the cookie can't outlive the JWT it carries (which would leave the
        # user "logged in" with a token the API rejects) or expire first.
        max_age=settings.jwt_expire_minutes * 60,
    )
    return LoginResponse(
        user_id=str(user.id), workspace_id=str(user.workspace_id), email=user.email, role=user.role, can_review=user.can_review
    )


@router.post("/logout")
def logout(response: Response) -> dict:
    # A cookie is only deleted if the clearing Set-Cookie carries the same
    # attributes it was set with. Omitting samesite/secure/path meant the
    # deployed cross-origin cookie (SameSite=None; Secure) was never
    # actually cleared by logout -- the browser kept sending a valid
    # session until it expired on its own.
    response.delete_cookie(
        COOKIE_NAME,
        path=COOKIE_PATH,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    return {"ok": True}


@router.get("/me", response_model=LoginResponse)
def me(user: User = Depends(get_current_db_user)) -> LoginResponse:
    return LoginResponse(
        user_id=str(user.id), workspace_id=str(user.workspace_id), email=user.email, role=user.role, can_review=user.can_review
    )
