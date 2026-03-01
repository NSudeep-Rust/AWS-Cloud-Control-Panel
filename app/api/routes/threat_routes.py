from fastapi import APIRouter
from app.api.schemas import ScanRequest
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.config import security_config
from app.core.aws_session import AWSSession
from app.modules.threat_monitor.threat_monitor import ThreatMonitor

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

        return format_response(
            module="threat_monitor",
            mode=effective_mode,
            data=results
        )

    except Exception as e:
        logger.error(f"Threat monitor execution failed: {str(e)}")

        return format_response(
            module="threat_monitor",
            mode=effective_mode,
            errors=[str(e)]
        )