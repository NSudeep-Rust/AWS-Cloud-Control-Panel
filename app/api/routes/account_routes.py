from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.database.models import Account
from app.api.schemas import AccountCreateRequest

router = APIRouter(
    prefix="/api/accounts",
    tags=["Accounts"]
)


# ✅ CREATE ACCOUNT
@router.post("/")
def create_account(request: AccountCreateRequest, db: Session = Depends(get_db)):

    # Check duplicate
    existing = db.query(Account).filter(
        Account.aws_account_id == request.aws_account_id
    ).first()

    if existing:
        return {"error": "Account already exists"}

    account = Account(
        aws_account_id=request.aws_account_id,
        profile_name=request.profile_name,
        role_arn=request.role_arn,
        region=request.region
    )

    # Optional fields (safe)
    if hasattr(Account, "access_key"):
        account.access_key = request.access_key

    if hasattr(Account, "secret_key"):
        account.secret_key = request.secret_key

    db.add(account)
    db.commit()
    db.refresh(account)

    return {
        "message": "Account added successfully",
        "account": {
            "aws_account_id": account.aws_account_id,
            "profile_name": account.profile_name,
            "region": account.region
        }
    }


# ✅ LIST ACCOUNTS
@router.get("/")
def list_accounts(db: Session = Depends(get_db)):

    accounts = db.query(Account).all()

    result = []
    for acc in accounts:
        result.append({
            "aws_account_id": acc.aws_account_id,
            "profile_name": acc.profile_name,
            "region": acc.region
        })

    return {
        "total": len(result),
        "accounts": result
    }