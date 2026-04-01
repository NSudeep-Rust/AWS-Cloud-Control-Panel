from fastapi import APIRouter, BackgroundTasks
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

router = APIRouter(
    prefix="/api/execute",
    tags=["Execute"]
)

TOKEN_EXPIRY_SECONDS = 300


# =========================================================
# 🔥 LOAD FINDINGS FROM DB (FIX)
# =========================================================
def load_findings_from_db(db: Session, scan_id: str):
    rows = db.query(Finding).filter(Finding.scan_id == scan_id).all()

    findings = []
    for row in rows:
        data = row.__dict__.copy()
        data.pop("_sa_instance_state", None)
        findings.append(data)

    return findings


# =========================================================
# 🔥 BACKGROUND EXECUTION
# =========================================================
def process_execution(request: ExecuteRequest, db: Session):
    db = SessionLocal()   # 🔥 CRITICAL FIX

    try:
        print("\n🔥 BACKGROUND TASK STARTED")
        print("Scan ID:", request.scan_id)
        print("Finding IDs:", request.finding_ids)

        # ✅ FIX: LOAD FROM DB
        findings = load_findings_from_db(db, request.scan_id)
        print("Loaded findings:", len(findings))

        if not findings:
            print("❌ No findings found in DB")
            return

        selected_findings = [
            f for f in findings if f.get("id") in request.finding_ids
        ]
        # 🔥 DEDUPLICATION FIX (ADD HERE)
        unique = {}
        for f in selected_findings:
            unique[f["id"]] = f

        selected_findings = list(unique.values())

        print("Selected findings:", selected_findings)

        if not selected_findings:
            print("❌ No matching findings")
            return

        # ✅ Get account from DB using scan_id
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

        # =====================================================
        # 🔐 APPROVAL VALIDATION
        # =====================================================
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

        # =====================================================
        # 🚀 EXECUTION LOOP
        # =====================================================
        for finding in selected_findings:
            execution_id = str(uuid.uuid4())

            print("\n➡️ Executing:", finding.get("id"))

            remediation = planner.plan(finding)
            finding["remediation"] = remediation

            if force_execute:
                result = executor.execute({
                    **finding,
                    "force_execute": True
                })
            else:
                result = executor.execute(finding)

            print("Result:", result)

            resource_name = (
                finding.get("user_name") or
                finding.get("bucket_name") or
                finding.get("resource_id")
            )

            approval_token_value = None

            # ================= APPROVAL =================
            if result.get("status") in ["BLOCKED_BY_POLICY", "REQUIRE_APPROVAL"] and not force_execute:

                approval_token_value = str(uuid.uuid4())

                APPROVAL_STORAGE[approval_token_value] = {
                    "timestamp": time.time(),
                    "scan_id": request.scan_id,
                    "finding_ids": request.finding_ids
                }

            # ================= SAVE EXECUTION =================
            print("DEBUG METADATA:", result.get("metadata"))
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
# 🔥 MAIN API
# =========================================================
@router.post("/")
def execute_fix(request: ExecuteRequest, background_tasks: BackgroundTasks,db: Session = Depends(get_db)):

    # ✅ Validate scan exists in DB
    findings = load_findings_from_db(db, request.scan_id)

    if not findings:
        return format_response(
            module="execute",
            mode=request.mode,
            errors=["Invalid scan_id"]
        )

    background_tasks.add_task(process_execution, request, db)

    return format_response(
        module="execute",
        mode=request.mode,
        data={
            "message": "Execution started in background"
        }
    )