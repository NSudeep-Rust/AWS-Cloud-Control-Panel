from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database.db import get_db
from app.database.models import Alert, Scan, Finding
from app.api.response_formatter import format_response
from typing import Optional

router = APIRouter(
    prefix="/api/alerts",
    tags=["Alerts"]
)

@router.get("/")
def get_alerts(
    account_id: Optional[int] = Query(None, description="Filter alerts by account DB id"),
    db: Session = Depends(get_db)
):
    """
    Returns alerts.
    If account_id is provided, only returns alerts whose finding_id belongs
    to a scan that was run for that account.
    If no account_id is provided, returns all alerts (global view).
    """

    if account_id is not None:
        account_scan_ids = db.query(Scan.id).filter(Scan.account_id == account_id).subquery()
        account_finding_ids = (
            db.query(Finding.id)
            .filter(Finding.scan_id.in_(account_scan_ids))
            .subquery()
        )
        # All DB finding IDs - used to identify standalone (live-monitor) alerts
        all_db_finding_ids = db.query(Finding.id).subquery()

        alerts_query = (
            db.query(Alert)
            .filter(
                or_(
                    Alert.finding_id.in_(account_finding_ids),       # scan-linked alerts
                    Alert.finding_id.notin_(all_db_finding_ids),     # standalone live-monitor alerts
                )
            )
            .order_by(Alert.created_at.desc())
        )
    else:
        alerts_query = db.query(Alert).order_by(Alert.created_at.desc())

    alerts = alerts_query.all()

    data = []
    for a in alerts:
        data.append({
            "id":         a.id,
            "finding_id": a.finding_id,
            "message":    a.message,
            "severity":   a.severity,
            "created_at": a.created_at,
        })

    return format_response(
        module="alerts",
        mode="READ",
        data={
            "total":  len(data),
            "alerts": data,
        }
    )


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Soft-acknowledge an alert - removes it from the active list."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        return format_response(module="alerts", mode="WRITE", errors=["Alert not found"])

    db.delete(alert)
    db.commit()

    return format_response(
        module="alerts",
        mode="WRITE",
        data={"acknowledged": True, "alert_id": alert_id}
    )

