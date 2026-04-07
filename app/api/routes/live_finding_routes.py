"""
live_finding_routes.py

Serves the Alerts Dashboard panel (/api/live-findings/).
Completely separate from alert_routes.py (which powers toast/popup notifications).

These findings are written by MonitorService on each scan cycle and represent
the CURRENT set of CRITICAL/HIGH issues the live threat monitor can see.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.database.models import LiveMonitorFinding
from app.api.response_formatter import format_response

router = APIRouter(prefix="/api/live-findings", tags=["LiveFindings"])


# ── GET all active findings for an account ────────────────────────────────────
@router.get("/")
def get_live_findings(account_db_id: int = None, db: Session = Depends(get_db)):
    """Return all non-dismissed live monitor findings, optionally filtered by account."""
    q = db.query(LiveMonitorFinding).filter(LiveMonitorFinding.dismissed == 0)
    if account_db_id is not None:
        q = q.filter(LiveMonitorFinding.account_db_id == account_db_id)

    rows = q.order_by(
        # CRITICAL first, then by detection time descending
        LiveMonitorFinding.severity.desc(),
        LiveMonitorFinding.detected_at.desc()
    ).all()

    findings = [
        {
            "id":                 r.id,
            "finding_id":         r.finding_id,
            "finding_type":       r.finding_type,
            "severity":           r.severity,
            "resource_id":        r.resource_id or "—",
            "region":             r.region or "global",
            "remediation_action": r.remediation_action or "",
            "remediation_reason": r.remediation_reason or "",
            "detected_at":        r.detected_at.isoformat() if r.detected_at else None,
        }
        for r in rows
    ]

    return format_response(
        module="live_findings",
        mode="READ",
        data={
            "total":    len(findings),
            "critical": sum(1 for f in findings if f["severity"] == "CRITICAL"),
            "high":     sum(1 for f in findings if f["severity"] == "HIGH"),
            "findings": findings,
        }
    )


# ── Dismiss (soft-delete) a single finding ────────────────────────────────────
@router.delete("/{finding_id}")
def dismiss_live_finding(finding_id: int, db: Session = Depends(get_db)):
    """Mark a live monitor finding as dismissed (won't appear in the panel)."""
    row = db.query(LiveMonitorFinding).filter(LiveMonitorFinding.id == finding_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Finding not found")
    row.dismissed = 1
    db.commit()
    return format_response(module="live_findings", mode="DELETE", data={"dismissed": finding_id})


# ── Clear all findings for an account (on monitor stop) ──────────────────────
@router.delete("/clear/all")
def clear_live_findings(account_db_id: int = None, db: Session = Depends(get_db)):
    """Remove all non-dismissed findings for an account."""
    q = db.query(LiveMonitorFinding).filter(LiveMonitorFinding.dismissed == 0)
    if account_db_id is not None:
        q = q.filter(LiveMonitorFinding.account_db_id == account_db_id)
    deleted = q.delete()
    db.commit()
    return format_response(module="live_findings", mode="DELETE", data={"cleared": deleted})
