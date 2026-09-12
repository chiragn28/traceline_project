from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator

from app.core.security import MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH

Role = Literal["admin", "reviewer", "viewer"]


class UserOut(BaseModel):
    id: UUID
    email: str
    role: str
    can_review: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: Role = "viewer"
    can_review: bool = False

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        # bcrypt only considers the first 72 bytes and passlib raises
        # rather than truncating, so an over-long password became a 500 on
        # user creation. Rejected explicitly instead, with the byte length
        # (not character count) that actually matters for multi-byte input.
        if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
        return value


class UserUpdate(BaseModel):
    role: Role
    can_review: bool
