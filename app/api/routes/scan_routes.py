from fastapi import APIRouter
from app.api.schemas import ScanRequest
from app.config import security_config
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.scanner.scanner import Scanner
from sqlalchemy.orm import Session
from fastapi import Depends
from app.database.db import get_db
from app.database.models import Scan, Finding
from app.database.models import Account
import uuid


router = APIRouter(
    prefix="/api/scan",
    tags=["Scanner"]
)


@router.post("/")
def run_scan(request: ScanRequest, db: Session = Depends(get_db)):

    effective_mode = request.mode

    if not (
        security_config.LIVE_EXECUTION_ENABLED
        and security_config.LIVE_EXECUTION_APPROVED_BY_USER
    ):
        effective_mode = security_config.DEFAULT_EXECUTION_MODE

    logger.info(
        f"Module=Scanner | Account={request.account_id} | "
        f"RequestedMode={request.mode} | EffectiveMode={effective_mode}"
    )

    try:
        # ✅ Initialize AWS session
        account = db.query(Account).filter(Account.id == request.account_id).first()

        if not account:
            return format_response(
                module="scanner",
                mode=effective_mode,
                errors=["Invalid account_id"]
            )
        # ✅ AWS session (DYNAMIC)
        aws_session = AWSSession(
            profile_name=account.profile_name,
            role_arn=account.role_arn,
            region_name=account.region
        )
        aws_session.initialize()
        print("USING AWS PROFILE:", account.profile_name)

        # ✅ Scanner
        scanner = Scanner(aws_session)

        findings = scanner.scan()

        # ✅ Store scan
        scan_id = str(uuid.uuid4())

        scan = Scan(
            id=scan_id,
            account_id=account.id
        )

        db.add(scan)
        db.commit()

        # ✅ Store findings
        for f in findings:
            finding = Finding(
                id=f.get("id"),
                scan_id=scan_id,
                account_id=account.id, 
                type=f.get("type"),
                severity=f.get("severity"),
                resource_id=f.get("resource_id"),
                region=f.get("region"),
                status="OPEN",
                access_key_id=f.get("access_key_id"),
                policy_name=f.get("policy_name"),
                bucket_name=f.get("bucket_name"),
            )
            db.add(finding)

        db.commit()

        # ✅ Debug logs (VERY IMPORTANT)
        print("SCAN API HIT")
        print("Total findings:", len(findings))
        print("Findings structure:", findings[:2])

        return format_response(
            module="scanner",
            mode=effective_mode,
            data={
                "scan_id": scan_id,
                "total_findings": len(findings),
                "findings": findings
            }
        )

    except Exception as e:
        logger.error(f"Scanner execution failed: {str(e)}")

        return format_response(
            module="scanner",
            mode=effective_mode,
            errors=[str(e)]
        )

        