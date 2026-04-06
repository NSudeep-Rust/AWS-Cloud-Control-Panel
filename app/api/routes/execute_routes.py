from fastapi import APIRouter, BackgroundTasks, Query
from app.api.schemas import ExecuteRequest
from app.api.response_formatter import format_response
from app.core.aws_session import AWSSession
from app.modules.remediation.executor import RemediationExecutor
from app.modules.remediation.planner import RemediationPlanner
from app.modules.protection_history.history import ProtectionHistory
from app.core.approval_storage import APPROVAL_STORAGE
from app.database.db import get_db
from sqlalchemy.orm import Session
from fastapi import Depends
from app.database.models import Finding, Execution, Account
from app.database.db import SessionLocal
import uuid
import time
import json

router = APIRouter(prefix="/api/execute", tags=["Execute"])

TOKEN_EXPIRY_SECONDS = 300

# Finding types that require manual intervention (cannot be auto-executed)
MANUAL_TYPES = {'IAM_USER_WITHOUT_MFA'}


# =========================================================
# 🔥 LOAD FINDINGS FROM DB
# =========================================================
def load_findings_from_db(db: Session, scan_id: str):
    rows = db.query(Finding).filter(Finding.scan_id == scan_id).all()
    findings = []
    for row in rows:
        findings.append({
            "id": row.id,
            "type": row.type,
            "severity": row.severity,
            "resource_id": row.resource_id,
            "region": row.region,
            "access_key_id": row.access_key_id,
            "policy_name": row.policy_name,
            "bucket_name": row.bucket_name,
        })
    return findings


# =========================================================
# 🔥 BACKGROUND EXECUTION (LIVE mode only)
# =========================================================
def process_execution(request: ExecuteRequest, db: Session):
    db = SessionLocal()
    try:
        print("\n🔥 BACKGROUND TASK STARTED")
        print("Scan ID:", request.scan_id)
        print("Finding IDs:", request.finding_ids)

        findings = load_findings_from_db(db, request.scan_id)
        print("Loaded findings:", len(findings))

        if not findings:
            print("❌ No findings found in DB")
            return

        selected_findings = [f for f in findings if f.get("id") in request.finding_ids]
        unique = {}
        for f in selected_findings:
            unique[f["id"]] = f
        selected_findings = list(unique.values())

        print("Selected findings:", selected_findings)

        if not selected_findings:
            print("❌ No matching findings")
            return

        scan_account = db.query(Finding).filter(Finding.scan_id == request.scan_id).first()
        if not scan_account:
            print("❌ No account found for scan")
            return

        account = db.query(Account).filter(Account.id == scan_account.account_id).first()
        if not account:
            print("❌ Account not found in DB")
            return

        print("USING AWS PROFILE (EXECUTE):", account.profile_name)

        aws_session = AWSSession(
            profile_name=account.profile_name,
            role_arn=account.role_arn,
            access_key=getattr(account, "access_key", None),
            secret_key=getattr(account, "secret_key", None),
            region_name=account.region
        )
        aws_session.initialize()

        history = ProtectionHistory()
        executor = RemediationExecutor(
            aws_session=aws_session,
            history=history,
            execution_mode=request.mode
        )
        planner = RemediationPlanner()

        force_execute = False

        # ── Approval validation ──
        if request.approval_token and request.confirm:
            approved_data = APPROVAL_STORAGE.get(request.approval_token)
            if not approved_data:
                print("❌ Invalid approval token")
                return
            if time.time() - approved_data["timestamp"] > TOKEN_EXPIRY_SECONDS:
                APPROVAL_STORAGE.pop(request.approval_token, None)
                print("❌ Token expired")
                return
            if approved_data["scan_id"] != request.scan_id:
                print("❌ Scan mismatch")
                return
            if set(approved_data["finding_ids"]) != set(request.finding_ids):
                print("❌ Finding mismatch")
                return
            force_execute = True

        # ── Execution loop ──
        for finding in selected_findings:
            execution_id = str(uuid.uuid4())
            print("\n➡️ Executing:", finding.get("id"))

            remediation = planner.plan(finding)
            finding["remediation"] = remediation

            if force_execute:
                result = executor.execute({**finding, "force_execute": True})
            else:
                result = executor.execute(finding)

            print("Result:", result)

            resource_name = (
                finding.get("user_name") or
                finding.get("bucket_name") or
                finding.get("resource_id")
            )

            approval_token_value = None
            if result.get("status") in ["BLOCKED_BY_POLICY", "REQUIRE_APPROVAL"] and not force_execute:
                approval_token_value = str(uuid.uuid4())
                APPROVAL_STORAGE[approval_token_value] = {
                    "timestamp": time.time(),
                    "scan_id": request.scan_id,
                    "finding_ids": request.finding_ids
                }

            execution = Execution(
                execution_id=result.get("execution_id", execution_id),
                scan_id=request.scan_id,
                finding_id=finding.get("id"),
                action=result.get("action"),
                status=result.get("status"),
                reason=result.get("reason"),
                approval_token=approval_token_value,
                resource_name=resource_name,
                meta=result.get("metadata") or {}
            )
            db.add(execution)
            db.commit()

        if force_execute:
            APPROVAL_STORAGE.pop(request.approval_token, None)

    except Exception as e:
        print("❌ BACKGROUND ERROR:", str(e))


# =========================================================
# POST /api/execute/  — DRY_RUN sync, LIVE async
# =========================================================
@router.post("/")
def execute_fix(request: ExecuteRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):

    findings = load_findings_from_db(db, request.scan_id)
    if not findings:
        return format_response(module="execute", mode=request.mode, errors=["Invalid scan_id"])

    if request.mode == "DRY_RUN":
        # ── Synchronous: return plan immediately, no AWS calls ──
        selected = [f for f in findings if f.get("id") in request.finding_ids]
        if not selected:
            return format_response(module="execute", mode="DRY_RUN", errors=["No matching findings"])

        planner = RemediationPlanner()
        plans = []
        for f in selected:
            remediation = planner.plan(f)
            plans.append({
                "finding_id": f["id"],
                "type": f["type"],
                "severity": f["severity"],
                "resource_id": f["resource_id"],
                "region": f.get("region", ""),
                "action": remediation.get("action"),
                "reason": remediation.get("reason"),
                "recommended_fix": remediation.get("recommended_fix"),
                "remediation_type": "MANUAL" if f["type"] in MANUAL_TYPES else "AUTO",
            })
        return format_response(module="execute", mode="DRY_RUN", data={"plans": plans})

    else:
        # ── Async live execution ──
        background_tasks.add_task(process_execution, request, db)
        return format_response(
            module="execute", mode=request.mode,
            data={"message": "Execution started in background"}
        )


# =========================================================
# GET /api/execute/findings?scan_id=
# =========================================================
@router.get("/findings")
def get_executable_findings(scan_id: str = Query(...), db: Session = Depends(get_db)):
    findings_raw = load_findings_from_db(db, scan_id)
    planner = RemediationPlanner()
    result = []
    for f in findings_raw:
        remediation = planner.plan(f)
        action = remediation.get("action", "NO_ACTION")
        is_manual = f["type"] in MANUAL_TYPES or action == "NO_ACTION"
        f["remediation_type"] = "MANUAL" if is_manual else "AUTO"
        f["recommended_fix"] = remediation.get("recommended_fix", "")
        f["remediation_action"] = action
        f["remediation_reason"] = remediation.get("reason", "")
        result.append(f)
    return format_response(module="execute", mode="INFO", data={"findings": result, "total": len(result)})


# =========================================================
# GET /api/execute/executions?scan_id=
# =========================================================
@router.get("/executions")
def list_executions(scan_id: str = Query(None), db: Session = Depends(get_db)):
    query = db.query(Execution)
    if scan_id:
        query = query.filter(Execution.scan_id == scan_id)
    rows = query.order_by(Execution.created_at.desc()).all()

    result = []
    for row in rows:
        find_row = db.query(Finding).filter(
            Finding.id == row.finding_id,
            Finding.scan_id == row.scan_id
        ).first()
        result.append({
            "id": row.id,
            "execution_id": row.execution_id,
            "scan_id": row.scan_id,
            "finding_id": row.finding_id,
            "action": row.action,
            "status": row.status,
            "reason": row.reason,
            "approval_token": row.approval_token,
            "resource_name": row.resource_name,
            "meta": row.meta or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "finding_type": find_row.type if find_row else None,
            "finding_severity": find_row.severity if find_row else None,
        })
    return format_response(module="execute", mode="INFO", data={"executions": result})