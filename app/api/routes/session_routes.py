from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.database.models import (
    Account, Scan, Finding, Execution, Rollback, FindingChange
)

router = APIRouter(prefix="/api/session", tags=["Session"])


@router.delete("/wipe")
def wipe_session(
    account_id: str = Query(..., description="AWS account ID (aws_account_id string)"),
    db: Session = Depends(get_db)
):
    """
    Hard-delete ALL security data for the given account.
    Deletion order respects FK constraints. Account row is KEPT so user can reconnect.
    """
    try:
        account = db.query(Account).filter(Account.aws_account_id == account_id).first()
        if not account:
            return {"status": "ok", "message": "Account not found — nothing to wipe"}

        db_id = account.id      # integer PK used by Scan FK
        deleted = {}

        scan_ids = [s.id for s in db.query(Scan.id).filter(Scan.account_id == db_id).all()]

        if scan_ids:
            n = db.query(FindingChange).filter(FindingChange.scan_id.in_(scan_ids)).delete(synchronize_session=False)
            deleted["finding_changes"] = n

        if scan_ids:
            # ── FIX: Rollback.execution_id stores Execution.execution_id (string UUID)
            # NOT Execution.id (integer PK) — so we must query the right field
            exec_uuid_ids = [
                e.execution_id for e in db.query(Execution.execution_id)
                .filter(Execution.scan_id.in_(scan_ids))
                .all()
                if e.execution_id
            ]

            if exec_uuid_ids:
                n = db.query(Rollback).filter(
                    Rollback.execution_id.in_(exec_uuid_ids)
                ).delete(synchronize_session=False)
                deleted["rollbacks"] = n
            else:
                deleted["rollbacks"] = 0

            n = db.query(Execution).filter(Execution.scan_id.in_(scan_ids)).delete(synchronize_session=False)
            deleted["executions"] = n

        if scan_ids:
            n = db.query(Finding).filter(Finding.scan_id.in_(scan_ids)).delete(synchronize_session=False)
            deleted["findings"] = n

        n = db.query(Scan).filter(Scan.account_id == db_id).delete(synchronize_session=False)
        deleted["scans"] = n

        # ── Also wipe IAM snapshot data for this account ─────────────────────────
        try:
            from app.database.models import IamUser
            n = db.query(IamUser).filter(IamUser.account_id == db_id).delete(synchronize_session=False)
            deleted["iam_users"] = n
        except Exception:
            deleted["iam_users"] = 0

        db.commit()
        print(f"🗑️  Wiped session for {account_id}: {deleted}")
        return {"status": "ok", "account_id": account_id, "deleted": deleted}

    except Exception as e:
        db.rollback()
        print(f"❌ Wipe failed for {account_id}: {e}")
        return {"status": "partial", "error": str(e), "message": "Some data may not have been deleted"}
