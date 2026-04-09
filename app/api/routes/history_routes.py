from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database.db import get_db
from app.database.models import Scan, Finding, Execution
from app.api.response_formatter import format_response

router = APIRouter(
    prefix="/api/history",
    tags=["History"]
)


def _get_scans_for_account(account_id: Optional[int], db: Session):
    """Return scans queryset — filtered by account if given, all otherwise."""
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    return q.order_by(Scan.created_at.desc()).all()


@router.get("/")
def get_all_history(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    scans = _get_scans_for_account(account_id, db)
    data = []
    for scan in scans:
        findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        data.append({
            "scan_id":    scan.id,
            "account_id": scan.account_id,
            "timestamp":  scan.created_at.isoformat() if scan.created_at else None,
            "count":      len(findings),
            "source":     scan.source or "MANUAL",
            "details": [
                {
                    "type":        f.type,
                    "severity":    f.severity,
                    "resource_id": f.resource_id,
                    "region":      f.region,
                    "status":      f.status,
                }
                for f in findings
            ]
        })

    return format_response(module="history", mode="READ", data=data)


@router.get("/summary")
def get_history_summary(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns aggregate stats for an account (or all accounts if no account_id).
    This is what the Overview dashboard stat tiles use.
    """
    scans = _get_scans_for_account(account_id, db)

    total_events   = len(scans)
    total_findings = 0
    total_high     = 0
    total_executed = 0

    for scan in scans:
        findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        total_findings += len(findings)

        for f in findings:
            if f.severity == "HIGH" or f.severity == "CRITICAL":
                total_high += 1

        finding_ids = [f.id for f in findings]
        if finding_ids:
            executed = (
                db.query(Execution)
                .filter(
                    Execution.scan_id == scan.id,
                    Execution.status == "EXECUTED"
                )
                .count()
            )
            total_executed += executed

    return format_response(
        module="history_summary",
        mode="READ",
        data={
            "total_events":        total_events,
            "total_findings":      total_findings,
            "total_high_severity": total_high,
            "total_executed":      total_executed,
            "account_id":          account_id,     # echo back so frontend knows scope
        }
    )


@router.get("/resource/{resource_id}")
def get_by_resource(
    resource_id: str,
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(Finding).filter(Finding.resource_id == resource_id)
    if account_id is not None:
        scan_ids = db.query(Scan.id).filter(Scan.account_id == account_id).subquery()
        q = q.filter(Finding.scan_id.in_(scan_ids))

    findings = q.all()

    data = [
        {
            "scan_id":     f.scan_id,
            "type":        f.type,
            "severity":    f.severity,
            "resource_id": f.resource_id,
            "region":      f.region,
            "status":      f.status,
        }
        for f in findings
    ]

    return format_response(module="history_by_resource", mode="READ", data=data)
