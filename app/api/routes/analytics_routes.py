from fastapi import APIRouter
from app.api.response_formatter import format_response
from app.core.policy_engine import PolicyEngine
from app.modules.protection_history.history import ProtectionHistory
from app.modules.remediation.executor import RemediationExecutor
from app.core.aws_session import AWSSession
from uuid import uuid4
from app.modules.threat_monitor.threat_monitor import ThreatMonitor
from fastapi import APIRouter
router = APIRouter(
    prefix="/api/analytics",
    tags=["Analytics"]
)

SCAN_STORAGE = {}
@router.post("/threat-monitor")
def threat_monitor():
    aws_session = AWSSession(profile_name="default")
    aws_session.initialize()

    monitor = ThreatMonitor(aws_session)

    result = monitor.start()

    # -----------------------------------
    # 🔥 FLATTEN FINDINGS
    # -----------------------------------
    all_findings = []

    for key in result:
        if isinstance(result[key], list):
            all_findings.extend(result[key])

    # -----------------------------------
    # 🔥 PRIORITY SORT
    # -----------------------------------
    PRIORITY = {
        "S3_PUBLIC_ACL": 1,
        "PUBLIC_SECURITY_GROUP": 1,
        "IAM_ADMIN_USER": 1,
        "IAM_INLINE_ADMIN_POLICY": 1,
        "IAM_WILDCARD_POLICY": 1,

        "S3_BLOCK_PUBLIC_ACCESS_DISABLED": 2,
        "S3_VERSIONING_DISABLED": 3
    }

    all_findings = sorted(
        all_findings,
        key=lambda f: PRIORITY.get(f.get("type"), 100)
    )

    # -----------------------------------
    # 🔥 EXECUTION LOOP
    # -----------------------------------
    executor = RemediationExecutor(
        aws_session=aws_session,
        history=ProtectionHistory(),
        execution_mode="DRY_RUN"
    )

    for finding in all_findings:

        # Skip policy blocked
        if finding.get("execution", {}).get("status") == "BLOCKED_BY_POLICY":
            continue

        exec_result = executor.execute(finding)
        finding["execution"] = exec_result

    # -----------------------------------
    # STORE UPDATED RESULT
    # -----------------------------------
    scan_id = str(uuid4())
    SCAN_STORAGE[scan_id] = result

    return {
        "status": "success",
        "scan_id": scan_id,
        "data": result
    }

router = APIRouter(
    prefix="/api/analytics",
    tags=["Analytics"]
)

history_service = ProtectionHistory()


@router.get("/risk-score")
def calculate_risk_score():

    data = history_service.read_history()

    if not data:
        return format_response(
            module="risk_score",
            mode="READ",
            data={
                "message": "No scan history available",
                "risk_score": 0,
                "risk_level": "LOW"
            }
        )

    latest_event = data[-1]

    total_high = 0
    active_high = 0
    remediated = 0
    skipped = 0

    for detail in latest_event.get("details", []):
        if detail.get("severity") == "HIGH":
            total_high += 1

            execution = detail.get("execution", {})
            status = execution.get("status")

            if status == "EXECUTED":
                remediated += 1
            elif status == "SKIPPED":
                skipped += 1
                active_high += 1
            else:
                active_high += 1

    risk_score = min(100, active_high * 10)

    if risk_score <= 20:
        level = "LOW"
    elif risk_score <= 50:
        level = "MEDIUM"
    elif risk_score <= 80:
        level = "HIGH"
    else:
        level = "CRITICAL"

    return format_response(
        module="risk_score",
        mode="READ",
        data={
            "latest_event_timestamp": latest_event.get("timestamp"),
            "total_high_findings": total_high,
            "active_high_findings": active_high,
            "remediated_findings": remediated,
            "skipped_findings": skipped,
            "risk_score": risk_score,
            "risk_level": level
        }
    )


@router.get("/risk-trend")
def calculate_risk_trend():

    data = history_service.read_history()

    if not data:
        return format_response(
            module="risk_trend",
            mode="READ",
            data={"message": "No scan history available"}
        )

    trend = []

    for event in data:

        total_high = 0
        active_high = 0

        for detail in event.get("details", []):
            if detail.get("severity") == "HIGH":
                total_high += 1

                execution = detail.get("execution", {})
                status = execution.get("status")

                if status != "EXECUTED":
                    active_high += 1

        risk_score = min(100, active_high * 10)

        if risk_score <= 20:
            level = "LOW"
        elif risk_score <= 50:
            level = "MEDIUM"
        elif risk_score <= 80:
            level = "HIGH"
        else:
            level = "CRITICAL"

        trend.append({
            "timestamp": event.get("timestamp"),
            "total_high_findings": total_high,
            "active_high_findings": active_high,
            "risk_score": risk_score,
            "risk_level": level
        })

    return format_response(
        module="risk_trend",
        mode="READ",
        data={
            "total_events": len(trend),
            "trend": trend
        }
    )

@router.get("/audit-report")
def generate_audit_report():

    data = history_service.read_history()

    if not data:
        return format_response(
            module="audit_report",
            mode="READ",
            data={"message": "No scan history available"}
        )

    total_events = len(data)
    total_high = 0
    total_remediated = 0
    total_skipped = 0

    for event in data:
        for detail in event.get("details", []):
            if detail.get("severity") == "HIGH":
                total_high += 1
                execution = detail.get("execution", {})
                status = execution.get("status")

                if status == "EXECUTED":
                    total_remediated += 1
                elif status == "SKIPPED":
                    total_skipped += 1

    # Use latest snapshot for posture
    latest_event = data[-1]
    active_high = 0

    for detail in latest_event.get("details", []):
        if detail.get("severity") == "HIGH":
            execution = detail.get("execution", {})
            if execution.get("status") != "EXECUTED":
                active_high += 1

    risk_score = min(100, active_high * 10)

    if risk_score <= 20:
        risk_level = "LOW"
        compliance_rating = "GOOD"
    elif risk_score <= 50:
        risk_level = "MEDIUM"
        compliance_rating = "MODERATE"
    elif risk_score <= 80:
        risk_level = "HIGH"
        compliance_rating = "POOR"
    else:
        risk_level = "CRITICAL"
        compliance_rating = "NON-COMPLIANT"

    return format_response(
        module="audit_report",
        mode="READ",
        data={
            "report_generated_at": latest_event.get("timestamp"),
            "total_scan_events": total_events,
            "total_high_findings_detected": total_high,
            "total_remediated_findings": total_remediated,
            "total_skipped_findings": total_skipped,
            "current_active_high_findings": active_high,
            "current_risk_score": risk_score,
            "current_risk_level": risk_level,
            "compliance_rating": compliance_rating
        }
    )

@router.get("/policy-violations")
def evaluate_policies():

    data = history_service.read_history()

    if not data:
        return format_response(
            module="policy_evaluation",
            mode="READ",
            data={"message": "No scan history available"}
        )

    latest_event = data[-1]
    findings = latest_event.get("details", [])

    engine = PolicyEngine()
    violations = engine.evaluate(findings)

    compliance_status = "COMPLIANT" if not violations else "NON_COMPLIANT"

    return format_response(
        module="policy_evaluation",
        mode="READ",
        data={
            "total_findings_evaluated": len(findings),
            "total_violations": len(violations),
            "compliance_status": compliance_status,
            "violations": violations
        }
    )

@router.post("/enforce-policies")
def enforce_policies():

    data = history_service.read_history()

    if not data:
        return format_response(
            module="policy_enforcement",
            mode="AUTO",
            data={"message": "No scan history available"}
        )

    latest_event = data[-1]
    findings = latest_event.get("details", [])

    engine = PolicyEngine()
    violations = engine.evaluate(findings)

    if not violations:
        return format_response(
            module="policy_enforcement",
            mode="AUTO",
            data={
                "message": "No policy violations detected",
                "actions_executed": 0
            }
        )

    # Initialize AWS session
    aws_session = AWSSession(profile_name="default")
    aws_session.initialize()

    executor = RemediationExecutor(
        aws_session=aws_session,
        history=history_service,
        execution_mode="DRY_RUN"
    )

    enforcement_results = []

    # Only enforce findings that actually violated policy
    violated_resource_ids = {v["resource_id"] for v in violations}

    for finding in findings:

        if finding.get("resource_id") in violated_resource_ids:
            result = executor.execute(finding)
            enforcement_results.append({
                "resource_id": finding.get("resource_id"),
                "region": finding.get("region"),
                "action": finding.get("remediation", {}).get("action"),
                "execution_result": result
            })

    return format_response(
        module="policy_enforcement",
        mode="AUTO",
        data={
            "total_violations": len(violations),
            "enforcement_actions": enforcement_results
        }
    )