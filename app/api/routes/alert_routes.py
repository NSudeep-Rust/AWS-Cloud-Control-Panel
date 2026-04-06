from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
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
        # ── FIX: join Alert → Finding → Scan → filter by account_id ──
        # Alert.finding_id → Finding.id (but Finding has composite PK: scan_id+id)
        # We join through scans to get account ownership

        # Get all scan_ids for this account
        account_scan_ids = db.query(Scan.id).filter(Scan.account_id == account_id).subquery()

        # Get all finding_ids from those scans
        account_finding_ids = (
            db.query(Finding.id)
            .filter(Finding.scan_id.in_(account_scan_ids))
            .subquery()
        )

        # Filter alerts to only those linked to this account's findings
        alerts_query = (
            db.query(Alert)
            .filter(Alert.finding_id.in_(account_finding_ids))
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
