"""
drift_routes.py — Scan Drift Detection

Compares the two most recent scans for an account and identifies:
  - NEW findings    (in latest scan, not in previous)
  - RESOLVED findings (in previous scan, not in latest)
  - PERSISTENT findings (in both scans)

A finding is matched by (type + resource_id) — same resource having the
same issue across scans = persistent. New resource or new issue type = new.

Endpoint:
  GET /api/drift/?account_id=X
  GET /api/drift/history?account_id=X&limit=10   → per-scan drift timeline
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database.db import get_db
from app.database.models import Scan, Finding
from app.api.response_formatter import format_response

router = APIRouter(prefix="/api/drift", tags=["Drift Detection"])


def _load_scan_findings(scan, db: Session) -> dict:
    """Return a dict keyed by (type, resource_id) → Finding row."""
    findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
    return {(f.type, f.resource_id): f for f in findings}


def _fmt(f: Finding) -> dict:
    return {
        "type":        f.type,
        "severity":    f.severity,
        "resource_id": f.resource_id,
        "region":      f.region,
        "status":      f.status,
    }


@router.get("/")
def get_drift(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Compare the two most recent scans and return drift data."""
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    scans = q.order_by(Scan.created_at.desc()).limit(2).all()

    if len(scans) < 2:
        return format_response(
            module="drift", mode="READ",
            data={
                "message":    "Need at least 2 scans to compute drift.",
                "has_drift":  False,
                "new":        [],
                "resolved":   [],
                "persistent": [],
            }
        )

    latest, previous = scans[0], scans[1]
    latest_map   = _load_scan_findings(latest,   db)
    previous_map = _load_scan_findings(previous, db)

    new_keys        = set(latest_map)   - set(previous_map)
    resolved_keys   = set(previous_map) - set(latest_map)
    persistent_keys = set(latest_map)   & set(previous_map)

    SEV_W = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

    def sev_sort(items):
        return sorted(items, key=lambda x: SEV_W.get(x["severity"], 0), reverse=True)

    new_findings        = sev_sort([_fmt(latest_map[k])   for k in new_keys])
    resolved_findings   = sev_sort([_fmt(previous_map[k]) for k in resolved_keys])
    persistent_findings = sev_sort([_fmt(latest_map[k])   for k in persistent_keys])

    new_by_sev = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for f in new_findings:
        new_by_sev[f["severity"]] = new_by_sev.get(f["severity"], 0) + 1

    resolved_by_sev = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for f in resolved_findings:
        resolved_by_sev[f["severity"]] = resolved_by_sev.get(f["severity"], 0) + 1

    return format_response(
        module="drift", mode="READ",
        data={
            "has_drift":          len(new_findings) > 0 or len(resolved_findings) > 0,
            "latest_scan_id":     latest.id,
            "latest_scan_at":     latest.created_at.isoformat() if latest.created_at else None,
            "previous_scan_id":   previous.id,
            "previous_scan_at":   previous.created_at.isoformat() if previous.created_at else None,
            "summary": {
                "new":        len(new_findings),
                "resolved":   len(resolved_findings),
                "persistent": len(persistent_findings),
                "total_latest":   len(latest_map),
                "total_previous": len(previous_map),
                "net_change":     len(latest_map) - len(previous_map),
            },
            "new_by_severity":      new_by_sev,
            "resolved_by_severity": resolved_by_sev,
            "new":        new_findings,
            "resolved":   resolved_findings,
            "persistent": persistent_findings,
        }
    )


@router.get("/history")
def get_drift_history(
    account_id: Optional[int] = Query(None),
    limit: int = Query(10, ge=2, le=50),
    db: Session = Depends(get_db)
):
    """
    Returns a per-scan drift timeline: for each consecutive scan pair,
    how many findings were new vs resolved vs persistent.
    Useful for the 'Drift Trend' chart in Analytics.
    """
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    scans = q.order_by(Scan.created_at.asc()).limit(limit).all()

    if len(scans) < 2:
        return format_response(
            module="drift_history", mode="READ",
            data={"message": "Need at least 2 scans.", "timeline": []}
        )

    timeline = []
    for i in range(1, len(scans)):
        prev = scans[i - 1]
        curr = scans[i]
        prev_map = _load_scan_findings(prev, db)
        curr_map = _load_scan_findings(curr, db)
        new_c  = len(set(curr_map) - set(prev_map))
        res_c  = len(set(prev_map) - set(curr_map))
        per_c  = len(set(curr_map) & set(prev_map))
        timeline.append({
            "scan_id":       curr.id,
            "scan_at":       curr.created_at.isoformat() if curr.created_at else None,
            "prev_scan_id":  prev.id,
            "new":           new_c,
            "resolved":      res_c,
            "persistent":    per_c,
            "total":         len(curr_map),
            "net_change":    len(curr_map) - len(prev_map),
        })

    return format_response(
        module="drift_history", mode="READ",
        data={"total_scans": len(scans), "timeline": timeline}
    )
