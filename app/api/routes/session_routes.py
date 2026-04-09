from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.database.models import (
    Account, Scan, Finding, Execution, Rollback,
    Alert, FindingChange, LiveMonitorFinding
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

        n = db.query(LiveMonitorFinding).filter(LiveMonitorFinding.account_db_id == db_id).delete(synchronize_session=False)
        deleted["live_monitor_findings"] = n

        if scan_ids:
            finding_ids = [
                f.id for f in db.query(Finding.id)
                .filter(Finding.scan_id.in_(scan_ids))
                .all()
            ]
            if finding_ids:
                n = db.query(Alert).filter(Alert.finding_id.in_(finding_ids)).delete(synchronize_session=False)
                deleted["alerts"] = n
            else:
                deleted["alerts"] = 0
        else:
            deleted["alerts"] = 0

        if scan_ids:
            exec_ids = [
                str(e.id) for e in db.query(Execution.id)
                .filter(Execution.scan_id.in_(scan_ids))
                .all()
            ]

            if exec_ids:
                n = db.query(Rollback).filter(
                    Rollback.execution_id.in_(exec_ids)
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

        db.commit()
        print(f"🗑️  Wiped session for {account_id}: {deleted}")
        return {"status": "ok", "account_id": account_id, "deleted": deleted}

    except Exception as e:
        db.rollback()
        print(f"❌ Wipe failed for {account_id}: {e}")
        return {"status": "partial", "error": str(e), "message": "Some data may not have been deleted"}
