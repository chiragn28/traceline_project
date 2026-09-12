from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, get_db, require_role
from app.models.report import Report
from app.schemas.report import ReportCreate, ReportOut
from app.services.reports import generate_report_csv, verify_report_integrity

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportOut])
def list_reports(db: Session = Depends(get_db)) -> list[Report]:
    return list(db.scalars(select(Report).order_by(Report.generated_at.desc())))


@router.post(
    "", response_model=ReportOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin", "reviewer"))]
)
def create_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Report:
    if body.range_end < body.range_start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "range_end must not be earlier than range_start")

    content, content_sha256 = generate_report_csv(db, current_user.workspace_id, body.range_start, body.range_end)
    report = Report(
        workspace_id=current_user.workspace_id,
        generated_by_user_id=current_user.user_id,
        range_start=body.range_start,
        range_end=body.range_end,
        content_sha256=content_sha256,
        content=content,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/{report_id}/download")
def download_report(report_id: UUID, db: Session = Depends(get_db)) -> Response:
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    if report.content is None:
        # Generated before report bytes moved into the database (migration
        # 0004), when they lived on a container-local disk that a redeploy
        # could wipe. The row survived, the evidence didn't. Say so plainly
        # -- 410 Gone, not a 500 that reads like a transient glitch -- so
        # the operator knows to regenerate rather than retry.
        raise HTTPException(
            status.HTTP_410_GONE,
            "This report predates durable storage and its contents are no longer available. Generate a new report.",
        )

    if not verify_report_integrity(report.content, report.content_sha256):
        # Tamper-evident by design: refuse to serve a report whose stored
        # hash no longer matches its contents, rather than silently handing
        # out a possibly-altered "audit" document.
        raise HTTPException(status.HTTP_409_CONFLICT, "Report integrity check failed -- contents may have been altered")

    return Response(
        content=report.content.encode("utf-8"),
        media_type="text/csv",
        headers={
            # Filename is a server-generated UUID, so it cannot carry a
            # quote or newline that would break out of the header.
            "Content-Disposition": f'attachment; filename="traceline_report_{report_id}.csv"',
            "X-Content-SHA256": report.content_sha256,
        },
    )
