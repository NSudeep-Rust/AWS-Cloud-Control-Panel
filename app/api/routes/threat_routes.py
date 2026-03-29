from fastapi import APIRouter
from app.api.schemas import ScanRequest
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.config import security_config
from app.core.aws_session import AWSSession
from app.modules.threat_monitor.threat_monitor import ThreatMonitor
from uuid import uuid4
from app.core.scan_storage import SCAN_STORAGE
from app.database.db import get_connection
import json

router = APIRouter(
    prefix="/api/threats",
    tags=["Threat Monitor"]
)


@router.post("/")
def run_threat_monitor(request: ScanRequest):

    effective_mode = request.mode

    if not (
        security_config.LIVE_EXECUTION_ENABLED
        and security_config.LIVE_EXECUTION_APPROVED_BY_USER
    ):
        effective_mode = security_config.DEFAULT_EXECUTION_MODE

    logger.info(
        f"Module=ThreatMonitor | Account={request.account_id} | "
        f"RequestedMode={request.mode} | EffectiveMode={effective_mode}"
    )

    try:
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

        monitor = ThreatMonitor(
            aws_session=aws_session,
            execution_mode=effective_mode,
            live_approved=security_config.LIVE_EXECUTION_APPROVED_BY_USER
        )

        results = monitor.start()

        # 🔥 STEP 1: Flatten findings
        all_findings = []

        all_findings.extend(results.get("public_security_groups", []))
        all_findings.extend(results.get("s3_findings", []))
        all_findings.extend(results.get("ec2_findings", []))
        all_findings.extend(results.get("logging_findings", []))
        all_findings.extend(results.get("encryption_findings", []))
        all_findings.extend(results.get("iam_findings", []))
        all_findings.extend(results.get("network_findings", []))

        # 🔥 STEP 2: Create scan_id
        scan_id = str(uuid4())

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO scans (scan_id) VALUES (?)",
            (scan_id,)
        )

        # 🔥 STEP 3: Store ONLY findings
        SCAN_STORAGE[scan_id] = all_findings
        for finding in all_findings:
            cursor.execute(
                """
                INSERT OR IGNORE INTO findings (id, scan_id, type, severity, resource_id, data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    finding.get("id"),
                    scan_id,
                    finding.get("type"),
                    finding.get("severity"),
                    finding.get("resource_id"),
                    json.dumps(finding)
                )
            )

        conn.commit()
        conn.close()



        # ✅ DEBUG
        print("Stored scan:", scan_id)
        print("Stored findings:", len(all_findings))
        print("SCAN STORAGE KEYS:", SCAN_STORAGE.keys())

        # 👇 FETCH TEST (STEP 2)
        for key in SCAN_STORAGE:
            print("FETCH TEST:", SCAN_STORAGE[key][:2])

        # 🔥 STEP 4: Return scan_id + data
        return {
            "status": "success",
            "scan_id": scan_id,
            "findings": all_findings
        }

    except Exception as e:
        logger.error(f"Threat monitor execution failed: {str(e)}")

        return {
            "status": "error",
            "error": str(e)
        }