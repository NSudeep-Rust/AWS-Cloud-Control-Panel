from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.crypto import build_aws_session
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
        execution_row = db.query(Execution).filter(
            Execution.execution_id == request.execution_id
        ).first()

        if not execution_row:
            return format_response(
                module="rollback", mode="LIVE",
                errors=["Invalid execution_id"]
            )

        if execution_row.status == "ROLLED_BACK":
            return format_response(
                module="rollback", mode="LIVE",
                errors=["This execution has already been rolled back"]
            )

        finding_row = db.query(Finding).filter(
            Finding.id == execution_row.finding_id
        ).first()

        if not finding_row:
            return format_response(
                module="rollback", mode="LIVE",
                errors=["Finding not found"]
            )

        account = db.query(Account).filter(
            Account.id == finding_row.account_id
        ).first()

        if not account:
            return format_response(
                module="rollback", mode="LIVE",
                errors=["Account not found"]
            )

        print("🔥 USING AWS PROFILE (ROLLBACK):", account.profile_name)

        aws_session = build_aws_session(account)

        rollback_engine = RollbackEngine(aws_session)
        result = rollback_engine.rollback(request.execution_id)

        status = result.get("status")
        if status == "ROLLBACK_SUCCESS":
            execution_row.status = "ROLLED_BACK"
            db.commit()
            print(f"✅ Execution {request.execution_id} marked as ROLLED_BACK in DB")
        elif status == "NOT_RECOVERABLE":
            execution_row.status = "NOT_RECOVERABLE"
            db.commit()
            print(f"⛔ Execution {request.execution_id} marked as NOT_RECOVERABLE in DB")

        result["finding_id"]   = execution_row.finding_id
        result["execution_id"] = request.execution_id
        result["scan_id"]      = execution_row.scan_id

        return format_response(
            module="rollback", mode="LIVE",
            data=result
        )

    except Exception as e:
        logger.error(f"Rollback failed: {str(e)}")
        return format_response(
            module="rollback", mode="LIVE",
            errors=[str(e)]
        )