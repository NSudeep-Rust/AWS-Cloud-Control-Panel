from fastapi import APIRouter
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.remediation.rollback import RollbackEngine
from app.api.schemas import RollbackRequest   # ✅ FIX

router = APIRouter(
    prefix="/api/rollback",
    tags=["Rollback"]
)

@router.post("/")
def rollback(request: RollbackRequest):   # ✅ FIX

    try:
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

        rollback_engine = RollbackEngine(aws_session)

        result = rollback_engine.rollback(request.execution_id)

        return format_response(
            module="rollback",
            mode="LIVE",
            data=result
        )

    except Exception as e:
        logger.error(f"Rollback failed: {str(e)}")

        return format_response(
            module="rollback",
            mode="LIVE",
            errors=[str(e)]
        )