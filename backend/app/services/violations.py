"""Rule-based residency violation engine (no ML, per spec). Runs after each
ingestion batch: for every access_event not yet evaluated, find the
classification tag(s) active on the table it touched *as of the time the
access occurred* (never today's tag -- see ClassificationTag's append-only
history), and check the event's region against every region_rule for that
classification.
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_event import AccessEvent
from app.models.classification import ClassificationTag
from app.models.data_source import DataSource
from app.models.region_rule import RegionRule
from app.models.violation import Violation


def evaluate_violations_for_source(db: Session, workspace_id: UUID, data_source: DataSource) -> int:
    rules = list(db.scalars(select(RegionRule).where(RegionRule.workspace_id == workspace_id)))
    if not rules:
        return 0

    # Staging/test sources can be excluded per rule so they don't generate
    # noise that erodes trust in the tool (spec 5).
    applicable_rules = [r for r in rules if not r.applies_to_production_only or data_source.is_production]
    if not applicable_rules:
        return 0

    events = db.scalars(
        select(AccessEvent).where(
            AccessEvent.data_source_id == data_source.id,
            AccessEvent.table_id.is_not(None),
        )
    ).all()

    already_flagged = {
        v.access_event_id
        for v in db.scalars(
            select(Violation).where(
                Violation.workspace_id == workspace_id,
                Violation.access_event_id.in_([e.id for e in events]) if events else False,
            )
        )
    } if events else set()

    created = 0
    for event in events:
        if event.id in already_flagged:
            continue

        active_tags = _active_tags_at(db, event.table_id, event.occurred_at)
        if not active_tags:
            continue

        for rule in applicable_rules:
            if rule.classification_tag not in active_tags:
                continue
            if event.source_region and event.source_region in rule.approved_regions:
                continue
            # Unknown region is treated as a violation candidate too -- an
            # access we can't vouch for is not the same as a compliant one.
            reason = (
                f"Table tagged '{rule.classification_tag}' accessed from "
                f"region={event.source_region or 'unknown'} "
                f"(confidence={event.region_confidence}); approved regions: "
                f"{', '.join(rule.approved_regions)}"
            )
            db.add(
                Violation(
                    workspace_id=workspace_id,
                    access_event_id=event.id,
                    region_rule_id=rule.id,
                    table_id=event.table_id,
                    reason=reason,
                )
            )
            created += 1

    db.commit()
    return created


def _active_tags_at(db: Session, table_id: UUID, at_time) -> set[str]:
    tags = db.scalars(
        select(ClassificationTag).where(
            ClassificationTag.table_id == table_id,
            ClassificationTag.effective_from <= at_time,
        )
    ).all()
    return {
        t.tag
        for t in tags
        if t.superseded_at is None or t.superseded_at > at_time
    }
