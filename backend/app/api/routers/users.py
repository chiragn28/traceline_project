from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db, require_role
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User)))


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> User:
    # No self-serve signup (spec section 2) -- this only ever adds a
    # teammate to the caller's own workspace, which is what "let the
    # customer configure who's allowed to be a reviewer" requires: a
    # single admin account can't designate a second reviewer that doesn't
    # exist yet. New teammates default to the least-privileged role
    # (viewer, can't review) -- an admin opts them into more, not the
    # other way around.
    user = User(
        workspace_id=current_user.workspace_id,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        can_review=body.can_review,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Email is globally unique (uq_user_email) because login resolves a
        # workspace from an email before any tenant context exists. Without
        # this branch the constraint violation surfaced as a 500; the
        # message stays deliberately non-committal about *which* workspace
        # holds the address, since that would let any admin probe for
        # accounts in workspaces they can't see.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That email address is already registered")
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut, dependencies=[Depends(require_role("admin"))])
def update_user(user_id: UUID, body: UserUpdate, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Don't let a workspace demote its way out of having any admin. There is
    # no self-serve signup and no support console to recover from it, so the
    # workspace would be permanently stuck: unable to connect a data source,
    # tag a table, or promote anyone back. The session is RLS-scoped, so
    # this count only ever sees the caller's own workspace.
    if user.role == "admin" and body.role != "admin":
        remaining_admins = db.scalar(
            select(func.count()).select_from(User).where(User.role == "admin", User.id != user.id)
        )
        if not remaining_admins:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This is the only admin in the workspace. Promote another user to admin before changing this one.",
            )

    user.role = body.role
    user.can_review = body.can_review
    db.commit()
    db.refresh(user)
    return user
