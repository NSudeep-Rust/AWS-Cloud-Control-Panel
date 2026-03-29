from fastapi import APIRouter
from app.api.schemas import ScanRequest
from app.config import security_config
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.scanner.scanner import Scanner


router = APIRouter(
    prefix="/api/scan",
    tags=["Scanner"]
)


@router.post("/")
def run_scan(request: ScanRequest):

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
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

        # ✅ Create scanner
        scanner = Scanner(aws_session)

        # 🔥 FIX: use FULL scan (NOT just firewall)
        findings = scanner.scan()

        # ✅ Debug logs (VERY IMPORTANT)
        print("SCAN API HIT")
        print("Total findings:", len(findings))
        print("Findings structure:", findings[:2])

        return format_response(
            module="scanner",
            mode=effective_mode,
            data={
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

        