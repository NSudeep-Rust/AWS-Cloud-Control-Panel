from fastapi import APIRouter, BackgroundTasks
from app.api.schemas import ExecuteRequest
from app.api.response_formatter import format_response
from app.core.aws_session import AWSSession
from app.modules.remediation.executor import RemediationExecutor
from app.modules.remediation.planner import RemediationPlanner
from app.modules.protection_history.history import ProtectionHistory
from app.core.approval_storage import APPROVAL_STORAGE
from app.database.db import get_connection

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
def load_findings_from_db(scan_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT data FROM findings WHERE scan_id = ?
    """, (scan_id,))

    rows = cursor.fetchall()
    conn.close()

    findings = []
    for row in rows:
        findings.append(json.loads(row["data"]))

    return findings


# =========================================================
# 🔥 BACKGROUND EXECUTION
# =========================================================
def process_execution(request: ExecuteRequest):

    try:
        print("\n🔥 BACKGROUND TASK STARTED")
        print("Scan ID:", request.scan_id)
        print("Finding IDs:", request.finding_ids)

        # ✅ FIX: LOAD FROM DB
        findings = load_findings_from_db(request.scan_id)
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

        aws_session = AWSSession(profile_name="default")
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

            conn = get_connection()
            cursor = conn.cursor()

            resource_name = (
                finding.get("user_name") or
                finding.get("bucket_name") or
                finding.get("resource_id")
            )

            # ================= APPROVAL =================
            if result.get("status") in ["BLOCKED_BY_POLICY", "REQUIRE_APPROVAL"] and not force_execute:

                approval_token = str(uuid.uuid4())

                APPROVAL_STORAGE[approval_token] = {
                    "timestamp": time.time(),
                    "scan_id": request.scan_id,
                    "finding_ids": request.finding_ids
                }

                cursor.execute("""
                INSERT INTO executions (
                    execution_id,
                    scan_id,
                    finding_id,
                    action,
                    status,
                    reason,
                    approval_token,
                    resource_name,
                    metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    execution_id,
                    request.scan_id,
                    finding.get("id"),
                    result.get("action"),
                    result.get("status"),
                    result.get("reason"),
                    approval_token,
                    resource_name,
                    json.dumps(result)   # 🔥 IMPORTANT
                ))

                conn.commit()
                conn.close()
                continue

            # ================= NORMAL =================
           

            cursor.execute("""
                INSERT INTO executions (
                    execution_id, scan_id, finding_id,
                    action, status, reason,
                    approval_token, resource_name, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                execution_id,
                request.scan_id,
                finding.get("id"),
                result.get("action"),
                result.get("status"),
                result.get("reason"),
                None,
                resource_name,
                json.dumps(result)
            ))

            conn.commit()
            conn.close()

        if force_execute:
            APPROVAL_STORAGE.pop(request.approval_token, None)

    except Exception as e:
        print("❌ BACKGROUND ERROR:", str(e))


# =========================================================
# 🔥 MAIN API
# =========================================================
@router.post("/")
def execute_fix(request: ExecuteRequest, background_tasks: BackgroundTasks):

    # ✅ Validate scan exists in DB
    findings = load_findings_from_db(request.scan_id)

    if not findings:
        return format_response(
            module="execute",
            mode=request.mode,
            errors=["Invalid scan_id"]
        )

    background_tasks.add_task(process_execution, request)

    return format_response(
        module="execute",
        mode=request.mode,
        data={
            "message": "Execution started in background"
        }
    )