from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr

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


class UserUpdate(BaseModel):
    role: Role
    can_review: bool
