from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db, APP_MODE
from app.database.models import Account, IamUser
from app.api.schemas import AccountCreateRequest, IamUserCreateRequest
from app.core.crypto import encrypt
from app.core.auth import get_current_web_user

router = APIRouter(
    prefix="/api/accounts",
    tags=["Accounts"]
)



@router.post("/")
def create_account(
    request: AccountCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_web_user),
):
    # In web mode: scope to current user's accounts only
    q = db.query(Account).filter(Account.aws_account_id == request.aws_account_id)
    if APP_MODE == "web" and current_user:
        q = q.filter(Account.web_user_id == current_user.id)
    if q.first():
        return {"error": "Account already exists"}

    account = Account(
        aws_account_id=request.aws_account_id,
        profile_name=request.profile_name,
        region=request.region,
        access_key=encrypt(request.access_key),
        secret_key=encrypt(request.secret_key),
        web_user_id=current_user.id if (APP_MODE == "web" and current_user) else None,
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    return {
        "message": "Account added successfully",
        "account": {
            "id": account.id,
            "aws_account_id": account.aws_account_id,
            "profile_name": account.profile_name,
            "region": account.region,
            "account_type": "root",
        }
    }


@router.get("/")
def list_accounts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_web_user),
):
    # Web mode: only return accounts owned by the logged-in user
    q = db.query(Account)
    if APP_MODE == "web" and current_user:
        q = q.filter(Account.web_user_id == current_user.id)
    accounts = q.all()

    result = [
        {
            "id": acc.id,
            "aws_account_id": acc.aws_account_id,
            "profile_name": acc.profile_name,
            "region": acc.region,
            "account_type": "root",
        }
        for acc in accounts
    ]
    return {"total": len(result), "accounts": result}



@router.post("/iam-users/")
def create_iam_user(request: IamUserCreateRequest, db: Session = Depends(get_db)):
    parent = db.query(Account).filter(Account.id == request.account_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent account not found")

    existing = db.query(IamUser).filter(
        IamUser.account_id == request.account_id,
        IamUser.username == request.username
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="IAM user with this username already exists under this account")

    iam_user = IamUser(
        account_id=request.account_id,
        username=request.username,
        access_key=encrypt(request.access_key),   # encrypted in web mode, plain in desktop
        secret_key=encrypt(request.secret_key),
        region=request.region,
    )

    db.add(iam_user)
    db.commit()
    db.refresh(iam_user)

    return {
        "message": "IAM user added successfully",
        "iam_user": {
            "id": iam_user.id,
            "account_id": iam_user.account_id,
            "parent_aws_account_id": parent.aws_account_id,
            "username": iam_user.username,
            "region": iam_user.region,
            "account_type": "iam",
        }
    }


@router.get("/iam-users/")
def list_iam_users(db: Session = Depends(get_db)):
    iam_users = db.query(IamUser).join(Account).all()

    result = []
    for u in iam_users:
        result.append({
            "id": u.id,
            "account_id": u.account_id,
            "parent_aws_account_id": u.account.aws_account_id,
            "username": u.username,
            "region": u.region,
            "account_type": "iam",
        })

    return {
        "total": len(result),
        "iam_users": result
    }