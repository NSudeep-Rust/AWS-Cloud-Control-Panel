from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database.db import get_db
from app.database.models import Scan, Finding, Execution
from app.api.response_formatter import format_response
from app.core.policy_engine import PolicyEngine

router = APIRouter(
    prefix="/api/analytics",
    tags=["Analytics"]
)


def _latest_scan_findings(account_id: Optional[int], db: Session):
    """Return findings from the most recent scan for this account (or global)."""
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    latest_scan = q.order_by(Scan.created_at.desc()).first()
    if not latest_scan:
        return None, None
    findings = db.query(Finding).filter(Finding.scan_id == latest_scan.id).all()
    return latest_scan, findings


def _all_scans(account_id: Optional[int], db: Session):
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    return q.order_by(Scan.created_at.asc()).all()


@router.get("/risk-score")
def calculate_risk_score(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Risk score based on the LATEST scan for this account.
    If no account_id given, uses latest scan globally.
    """
    latest_scan, findings = _latest_scan_findings(account_id, db)

    if not latest_scan or not findings:
        return format_response(
            module="risk_score",
            mode="READ",
            data={
                "message":              "No scan history for this account",
                "risk_score":           0,
                "risk_level":           "LOW",
                "active_high_findings": 0,
            }
        )

    # Count high/critical findings that haven't been remediated
    active_high = 0
    total_high  = 0
    remediated  = 0
    skipped     = 0

    # Get all executed remediations for this scan
    executed_finding_ids = set(
        row.finding_id for row in
        db.query(Execution.finding_id)
        .filter(Execution.scan_id == latest_scan.id, Execution.status == "EXECUTED")
        .all()
    )

    for f in findings:
        if f.severity in ("HIGH", "CRITICAL"):
            total_high += 1
            if f.id in executed_finding_ids:
                remediated += 1
            else:
                active_high += 1

    risk_score = min(100, active_high * 10)
    level = (
        "LOW"      if risk_score <= 20 else
        "MEDIUM"   if risk_score <= 50 else
        "HIGH"     if risk_score <= 80 else
        "CRITICAL"
    )

    return format_response(
        module="risk_score",
        mode="READ",
        data={
            "latest_scan_id":       latest_scan.id,
            "latest_scan_at":       latest_scan.created_at.isoformat() if latest_scan.created_at else None,
            "total_high_findings":  total_high,
            "active_high_findings": active_high,
            "remediated_findings":  remediated,
            "risk_score":           risk_score,
            "risk_level":           level,
        }
    )


@router.get("/risk-trend")
def calculate_risk_trend(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Risk trend across all scans for this account."""
    scans = _all_scans(account_id, db)

    if not scans:
        return format_response(
            module="risk_trend",
            mode="READ",
            data={"message": "No scan history for this account", "trend": []}
        )

    trend = []
    for scan in scans:
        findings  = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        executed_ids = set(
            row.finding_id for row in
            db.query(Execution.finding_id)
            .filter(Execution.scan_id == scan.id, Execution.status == "EXECUTED")
            .all()
        )

        active_high = sum(
            1 for f in findings
            if f.severity in ("HIGH", "CRITICAL") and f.id not in executed_ids
        )
        total_high = sum(1 for f in findings if f.severity in ("HIGH", "CRITICAL"))
        risk_score = min(100, active_high * 10)
        level = (
            "LOW"      if risk_score <= 20 else
            "MEDIUM"   if risk_score <= 50 else
            "HIGH"     if risk_score <= 80 else
            "CRITICAL"
        )
        trend.append({
            "scan_id":              scan.id,
            "timestamp":            scan.created_at.isoformat() if scan.created_at else None,
            "total_high_findings":  total_high,
            "active_high_findings": active_high,
            "risk_score":           risk_score,
            "risk_level":           level,
        })

    return format_response(
        module="risk_trend",
        mode="READ",
        data={"total_events": len(trend), "trend": trend}
    )


@router.get("/audit-report")
def generate_audit_report(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    scans = _all_scans(account_id, db)
    if not scans:
        return format_response(module="audit_report", mode="READ",
                               data={"message": "No scan history for this account"})

    total_high = total_remediated = total_skipped = 0
    latest_scan = scans[-1]
    latest_findings = db.query(Finding).filter(Finding.scan_id == latest_scan.id).all()

    latest_executed_ids = set(
        row.finding_id for row in
        db.query(Execution.finding_id)
        .filter(Execution.scan_id == latest_scan.id, Execution.status == "EXECUTED")
        .all()
    )

    for scan in scans:
        findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        executed_ids = set(
            row.finding_id for row in
            db.query(Execution.finding_id)
            .filter(Execution.scan_id == scan.id, Execution.status == "EXECUTED")
            .all()
        )
        for f in findings:
            if f.severity in ("HIGH", "CRITICAL"):
                total_high += 1
                if f.id in executed_ids:
                    total_remediated += 1
                else:
                    total_skipped += 1

    active_high  = sum(1 for f in latest_findings if f.severity in ("HIGH", "CRITICAL") and f.id not in latest_executed_ids)
    risk_score   = min(100, active_high * 10)
    risk_level   = "LOW" if risk_score <= 20 else "MEDIUM" if risk_score <= 50 else "HIGH" if risk_score <= 80 else "CRITICAL"
    compliance   = "GOOD" if risk_score <= 20 else "MODERATE" if risk_score <= 50 else "POOR" if risk_score <= 80 else "NON-COMPLIANT"

    return format_response(
        module="audit_report",
        mode="READ",
        data={
            "total_scan_events":             len(scans),
            "total_high_findings_detected":  total_high,
            "total_remediated_findings":     total_remediated,
            "total_skipped_findings":        total_skipped,
            "current_active_high_findings":  active_high,
            "current_risk_score":            risk_score,
            "current_risk_level":            risk_level,
            "compliance_rating":             compliance,
        }
    )


@router.get("/policy-violations")
def evaluate_policies(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    _, findings = _latest_scan_findings(account_id, db)
    if not findings:
        return format_response(module="policy_evaluation", mode="READ",
                               data={"message": "No scan history for this account"})

    findings_dicts = [
        {"type": f.type, "severity": f.severity, "resource_id": f.resource_id, "region": f.region}
        for f in findings
    ]
    engine     = PolicyEngine()
    violations = engine.evaluate(findings_dicts)
    status     = "COMPLIANT" if not violations else "NON_COMPLIANT"

    return format_response(
        module="policy_evaluation",
        mode="READ",
        data={
            "total_findings_evaluated": len(findings_dicts),
            "total_violations":         len(violations),
            "compliance_status":        status,
            "violations":               violations,
        }
    )


@router.post("/enforce-policies")
def enforce_policies(account_id: int, db: Session = Depends(get_db)):
    # Kept same as original — requires account_id
    from app.core.aws_session import AWSSession
    from app.modules.remediation.executor import RemediationExecutor
    from app.modules.protection_history.history import ProtectionHistory
    from app.database.models import Account

    _, findings = _latest_scan_findings(account_id, db)
    if not findings:
        return format_response(module="policy_enforcement", mode="AUTO",
                               data={"message": "No scan history for this account"})

    findings_dicts = [
        {"type": f.type, "severity": f.severity, "resource_id": f.resource_id, "region": f.region}
        for f in findings
    ]
    engine     = PolicyEngine()
    violations = engine.evaluate(findings_dicts)
    if not violations:
        return format_response(module="policy_enforcement", mode="AUTO",
                               data={"message": "No policy violations", "actions_executed": 0})

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return format_response(module="policy_enforcement", mode="AUTO",
                               data={"message": "Invalid account_id"})

    aws_session = AWSSession(profile_name=account.profile_name, region_name=account.region)
    aws_session.initialize()
    executor = RemediationExecutor(aws_session=aws_session,
                                   history=ProtectionHistory(), execution_mode="DRY_RUN")

    violated_ids = {v["resource_id"] for v in violations}
    results = []
    for finding in findings_dicts:
        if finding.get("resource_id") in violated_ids:
            result = executor.execute(finding)
            results.append({"resource_id": finding["resource_id"], "execution_result": result})

    return format_response(module="policy_enforcement", mode="AUTO",
                           data={"total_violations": len(violations), "enforcement_actions": results})
