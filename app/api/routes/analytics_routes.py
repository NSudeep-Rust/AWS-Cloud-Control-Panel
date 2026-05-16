from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from collections import defaultdict
from app.database.db import get_db
from app.database.models import Scan, Finding, Execution, Rollback
from app.api.response_formatter import format_response
from app.core.policy_engine import PolicyEngine, POLICIES

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

    active_critical = 0
    active_high     = 0
    total_high      = 0
    remediated      = 0

    executed_finding_ids = set(
        row.finding_id for row in
        db.query(Execution.finding_id)
        .filter(Execution.scan_id == latest_scan.id, Execution.status == "EXECUTED")
        .all()
    )

    for f in findings:
        if f.severity == "CRITICAL":
            total_high += 1
            if f.id in executed_finding_ids:
                remediated += 1
            else:
                active_critical += 1
        elif f.severity == "HIGH":
            total_high += 1
            if f.id in executed_finding_ids:
                remediated += 1
            else:
                active_high += 1

    active_medium = sum(1 for f in findings if f.severity == "MEDIUM" and f.id not in executed_finding_ids)
    active_low    = sum(1 for f in findings if f.severity == "LOW"    and f.id not in executed_finding_ids)

    crit_pts  = min(55, active_critical * 1.2)
    high_pts  = min(25, active_high     * 0.5)
    med_pts   = min(15, active_medium   * 0.3)
    low_pts   = min( 5, active_low      * 0.1)
    remed_credit = min(20, remediated * 2)

    risk_score = max(0, round(crit_pts + high_pts + med_pts + low_pts - remed_credit))

    level = (
        "CRITICAL" if active_critical > 40 or risk_score > 85 else
        "HIGH"     if active_critical > 20 or active_high > 40 or risk_score > 60 else
        "MEDIUM"   if active_critical >  5 or active_high > 15 or risk_score > 30 else
        "LOW"
    )

    return format_response(
        module="risk_score",
        mode="READ",
        data={
            "latest_scan_id":       latest_scan.id,
            "latest_scan_at":       latest_scan.created_at.isoformat() if latest_scan.created_at else None,
            "total_high_findings":  total_high,
            "active_high_findings": active_critical + active_high,
            "active_critical":      active_critical,
            "active_high":          active_high,
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

        crit_c  = sum(1 for f in findings if f.severity == "CRITICAL" and f.id not in executed_ids)
        high_c  = sum(1 for f in findings if f.severity == "HIGH"     and f.id not in executed_ids)
        med_c   = sum(1 for f in findings if f.severity == "MEDIUM"   and f.id not in executed_ids)
        low_c   = sum(1 for f in findings if f.severity == "LOW"      and f.id not in executed_ids)
        remed_c = sum(1 for f in findings if f.severity in ("CRITICAL","HIGH") and f.id in executed_ids)

        total_high = sum(1 for f in findings if f.severity in ("CRITICAL", "HIGH"))
        risk_score = max(0, round(
            min(55, crit_c * 1.2) +
            min(25, high_c * 0.5) +
            min(15, med_c  * 0.3) +
            min( 5, low_c  * 0.1) -
            min(20, remed_c * 2)
        ))
        level = (
            "CRITICAL" if crit_c > 40 or risk_score > 85 else
            "HIGH"     if crit_c > 20 or high_c > 40 or risk_score > 60 else
            "MEDIUM"   if crit_c >  5 or high_c > 15 or risk_score > 30 else
            "LOW"
        )
        trend.append({
            "scan_id":              scan.id,
            "timestamp":            scan.created_at.isoformat() if scan.created_at else None,
            "total_high_findings":  total_high,
            "active_high_findings": crit_c + high_c,
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

    active_critical = sum(1 for f in latest_findings if f.severity == "CRITICAL" and f.id not in latest_executed_ids)
    active_high_only = sum(1 for f in latest_findings if f.severity == "HIGH"     and f.id not in latest_executed_ids)
    active_medium   = sum(1 for f in latest_findings if f.severity == "MEDIUM"   and f.id not in latest_executed_ids)
    active_low      = sum(1 for f in latest_findings if f.severity == "LOW"      and f.id not in latest_executed_ids)
    remediated_latest = sum(1 for f in latest_findings if f.severity in ("CRITICAL","HIGH") and f.id in latest_executed_ids)

    risk_score = max(0, round(
        min(55, active_critical  * 1.2) +
        min(25, active_high_only * 0.5) +
        min(15, active_medium    * 0.3) +
        min( 5, active_low       * 0.1) -
        min(20, remediated_latest * 2)
    ))
    risk_level  = (
        "CRITICAL" if active_critical > 40 or risk_score > 85 else
        "HIGH"     if active_critical > 20 or active_high_only > 40 or risk_score > 60 else
        "MEDIUM"   if active_critical >  5 or active_high_only > 15 or risk_score > 30 else
        "LOW"
    )
    compliance = (
        "GOOD"          if risk_score <= 30 else
        "MODERATE"      if risk_score <= 60 else
        "POOR"          if risk_score <= 85 else
        "NON-COMPLIANT"
    )

    return format_response(
        module="audit_report",
        mode="READ",
        data={
            "total_scan_events":             len(scans),
            "total_high_findings_detected":  total_high,
            "total_remediated_findings":     total_remediated,
            "total_skipped_findings":        total_skipped,
            "current_active_high_findings":  active_critical + active_high_only,
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
    summary    = engine.summary(findings_dicts)
    status     = "COMPLIANT" if not violations else "NON_COMPLIANT"

    grouped: dict = {}
    for v in violations:
        pid = v["policy_id"]
        if pid not in grouped:
            grouped[pid] = {
                "policy_id":          pid,
                "policy_name":        v["policy_name"],
                "policy_severity":    v["policy_severity"],
                "framework":          v["framework"],
                "description":        v["description"],
                "remediation":        v["remediation"],
                "affected_resources": [],
            }
        grouped[pid]["affected_resources"].append({
            "resource_id":      v["resource_id"],
            "region":           v["region"],
            "finding_type":     v["finding_type"],
            "finding_severity": v["finding_severity"],
        })

    return format_response(
        module="policy_evaluation",
        mode="READ",
        data={
            "total_findings_evaluated": len(findings_dicts),
            "total_violations":         len(violations),
            "policies_available":       summary["total_policies"],
            "policies_violated":        summary["policies_violated"],
            "compliance_status":        status,
            "summary_by_severity":      summary["by_severity"],
            "violations":               violations,
            "violations_by_policy":     list(grouped.values()),
        }
    )


@router.post("/enforce-policies")
def enforce_policies(account_id: int, db: Session = Depends(get_db)):
    from app.core.crypto import build_aws_session
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

    aws_session = build_aws_session(account)
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


@router.get("/breakdown")
def get_breakdown(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns severity distribution, region heatmap, finding type distribution,
    per-scan totals, and remediation stats across ALL scans for this account.
    """
    scans = _all_scans(account_id, db)
    if not scans:
        return format_response(module="breakdown", mode="READ",
                               data={"message": "No scan history for this account"})

    sev_counts   = defaultdict(int)   # CRITICAL/HIGH/MEDIUM/LOW
    region_counts = defaultdict(int)  # us-east-1 → count
    type_counts  = defaultdict(int)   # finding type → count
    scan_totals  = []                 # [{scan_id, ts, total, critical, high, medium, low}]
    total_exec   = 0
    total_roll   = 0

    for scan in scans:
        findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        sc = defaultdict(int)
        for f in findings:
            sev  = (f.severity or "UNKNOWN").upper()
            sev_counts[sev]   += 1
            sc[sev]           += 1
            region_counts[(f.region or "global").lower()] += 1
            type_counts[(f.type or "unknown").lower()]    += 1

        execs = db.query(Execution).filter(Execution.scan_id == scan.id).all()
        total_exec += len(execs)

        scan_totals.append({
            "scan_id":   scan.id[:8],
            "timestamp": scan.created_at.isoformat() if scan.created_at else None,
            "total":     len(findings),
            "critical":  sc.get("CRITICAL", 0),
            "high":      sc.get("HIGH", 0),
            "medium":    sc.get("MEDIUM", 0),
            "low":       sc.get("LOW", 0),
            "remediations": len(execs),
        })

    total_roll = db.query(Rollback).count()

    top_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)[:8]
    top_regions = sorted(region_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return format_response(
        module="breakdown",
        mode="READ",
        data={
            "severity_distribution": {
                "CRITICAL": sev_counts.get("CRITICAL", 0),
                "HIGH":     sev_counts.get("HIGH", 0),
                "MEDIUM":   sev_counts.get("MEDIUM", 0),
                "LOW":      sev_counts.get("LOW", 0),
            },
            "top_regions":    [{"region": r, "count": c} for r, c in top_regions],
            "top_types":      [{"type": t,   "count": c} for t, c in top_types],
            "scan_totals":    scan_totals,
            "total_remediations": total_exec,
            "total_rollbacks":    total_roll,
            "total_scans":        len(scans),
        }
    )



@router.get("/compliance-score")
def get_compliance_score(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns per-framework compliance scorecards.
    For each framework (CIS, PCI, NIST) we:
      1. Collect all policies that reference that framework
      2. Run the PolicyEngine to find which policies have violations
      3. Mark each rule PASS (no violations) or FAIL (>=1 resource violates it)
      4. Score = passing_rules / total_rules × 100
    """
    _, findings = _latest_scan_findings(account_id, db)

    if not findings:
        return format_response(
            module="compliance_score", mode="READ",
            data={"message": "No scan history — run a scan first"}
        )

    findings_dicts = [
        {"type": f.type, "severity": f.severity, "resource_id": f.resource_id, "region": f.region}
        for f in findings
    ]

    engine     = PolicyEngine()
    violations = engine.evaluate(findings_dicts)

    violated_ids = {v["policy_id"] for v in violations}

    violation_count: dict = {}
    for v in violations:
        violation_count[v["policy_id"]] = violation_count.get(v["policy_id"], 0) + 1

    FRAMEWORKS = [
        {"key": "cis",  "label": "CIS AWS Benchmark",     "match": "CIS",  "icon": "🛡️"},
        {"key": "pci",  "label": "PCI DSS",               "match": "PCI",  "icon": "💳"},
        {"key": "nist", "label": "NIST CSF",              "match": "NIST", "icon": "🏛️"},
    ]

    scorecards = []
    for fw in FRAMEWORKS:
        fw_policies = [p for p in POLICIES if fw["match"] in p.get("framework", "")]
        if not fw_policies:
            continue

        rules = []
        for p in fw_policies:
            status         = "FAIL" if p["id"] in violated_ids else "PASS"
            affected_count = violation_count.get(p["id"], 0)
            rules.append({
                "policy_id":       p["id"],
                "rule_name":       p["name"],
                "severity":        p["severity"],
                "framework_ref":   p.get("framework", ""),
                "description":     p["description"],
                "remediation":     p.get("remediation", ""),
                "status":          status,
                "affected_count":  affected_count,
            })

        passing    = sum(1 for r in rules if r["status"] == "PASS")
        failing    = sum(1 for r in rules if r["status"] == "FAIL")
        score_pct  = round((passing / len(rules)) * 100) if rules else 0

        scorecards.append({
            "key":        fw["key"],
            "label":      fw["label"],
            "icon":       fw["icon"],
            "total":      len(rules),
            "passing":    passing,
            "failing":    failing,
            "score_pct":  score_pct,
            "rules":      rules,
        })

    overall_pct = round(sum(s["score_pct"] for s in scorecards) / len(scorecards)) if scorecards else 0

    return format_response(
        module="compliance_score", mode="READ",
        data={
            "overall_pct":     overall_pct,
            "total_findings":  len(findings_dicts),
            "scorecards":      scorecards,
        }
    )



