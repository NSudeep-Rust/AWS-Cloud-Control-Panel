from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.remediation.rollback import RollbackEngine
from app.api.schemas import RollbackRequest

from app.database.db import get_db
from app.database.models import Execution, Finding, Account

router = APIRouter(
    prefix="/api/rollback",
    tags=["Rollback"]
)

@router.post("/")
def rollback(request: RollbackRequest, db: Session = Depends(get_db)):

    try:
        # ✅ GET EXECUTION
        execution_row = db.query(Execution).filter(
            Execution.execution_id == request.execution_id
        ).first()

        if not execution_row:
            return format_response(
                module="rollback",
                mode="LIVE",
                errors=["Invalid execution_id"]
            )

        # ✅ GET FINDING
        finding_row = db.query(Finding).filter(
            Finding.id == execution_row.finding_id
        ).first()

        if not finding_row:
            return format_response(
                module="rollback",
                mode="LIVE",
                errors=["Finding not found"]
            )

        # ✅ GET ACCOUNT
        account = db.query(Account).filter(
            Account.id == finding_row.account_id
        ).first()

        if not account:
            return format_response(
                module="rollback",
                mode="LIVE",
                errors=["Account not found"]
            )

        print("🔥 USING AWS PROFILE (ROLLBACK):", account.profile_name)

        # ✅ CRITICAL — SAME AS EXECUTOR
        aws_session = AWSSession(
            profile_name=account.profile_name,
            region_name=account.region
        )
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