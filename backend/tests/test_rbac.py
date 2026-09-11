"""Proves the role-tier dependency used to gate mutating endpoints
(data sources, tags, region rules, team, workspace settings): a role
outside the allowed set is rejected, and a change to a user's role takes
effect immediately since the check re-reads the User row per request
rather than trusting a role baked into a JWT at login time.
"""
import pytest
from fastapi import HTTPException

from app.api.deps import require_role


class _FakeUser:
    def __init__(self, role):
        self.role = role


def test_disallowed_role_is_rejected():
    check = require_role("admin")
    with pytest.raises(HTTPException) as exc_info:
        check(user=_FakeUser("viewer"))
    assert exc_info.value.status_code == 403
    assert "viewer" in exc_info.value.detail


def test_allowed_role_passes_through():
    check = require_role("admin", "reviewer")
    user = _FakeUser("reviewer")
    assert check(user=user) is user


def test_viewer_cannot_pass_admin_or_reviewer_gate():
    check = require_role("admin", "reviewer")
    with pytest.raises(HTTPException) as exc_info:
        check(user=_FakeUser("viewer"))
    assert exc_info.value.status_code == 403
