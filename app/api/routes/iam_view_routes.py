"""
IAM View API Routes — /api/iam-view
Exposes the independent IAM Identity Risk Scanner.
"""
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
import traceback

from app.database.db       import get_db
from app.database.models   import Account
from app.core.aws_session  import AWSSession
from app.api.response_formatter import format_response
from app.modules.iam_view.iam_scanner import scan_iam_identities

router = APIRouter(prefix="/api/iam-view", tags=["IAM View"])


@router.get("/scan")
async def iam_view_scan(
    account_id: int = Query(..., description="DB account id"),
    db: Session = Depends(get_db),
):
    """
    Trigger an independent IAM identity scan.
    Returns all IAM users & roles with risk scores.
    Does NOT depend on the main scanner pipeline.
    """
    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            return format_response("iam-view", "scan", errors=["Account not found"])

        # Build AWS session — MUST call initialize() to create the boto3.Session
        aws = AWSSession(
            access_key=account.access_key,
            secret_key=account.secret_key,
            region_name=account.region or "us-east-1",
        )
        aws.initialize()

        result = scan_iam_identities(aws)
        return format_response("iam-view", "scan", data=result)

    except Exception as exc:
        traceback.print_exc()
        return format_response("iam-view", "scan", errors=[str(exc)])
