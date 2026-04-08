from fastapi import APIRouter
from app.api.schemas import ScanRequest
from app.config import security_config
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.scanner.scanner import Scanner
from sqlalchemy.orm import Session
from fastapi import Depends
from app.database.db import get_db
from app.database.models import Scan, Finding
from app.database.models import Account
from app.modules.scanner.scanner import run_full_scan
from app.core.email_service import EmailService
from app.database.db import SessionLocal
import uuid
import threading


router = APIRouter(
    prefix="/api/scan",
    tags=["Scanner"]
)


@router.post("/")
def run_scan(request: ScanRequest, db: Session = Depends(get_db)):

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
        account = db.query(Account).filter(
            Account.id == request.account_id
        ).first()

        if not account:
            return format_response(
                module="scanner",
                mode=effective_mode,
                errors=["Invalid account_id"]
            )
        # ✅ AWS session (DYNAMIC)
        aws_session = AWSSession(
            profile_name=account.profile_name,
            role_arn=account.role_arn,
            access_key=getattr(account, "access_key", None),
            secret_key=getattr(account, "secret_key", None),
            region_name=account.region
        )
        aws_session.initialize()
        print("USING AWS PROFILE:", account.profile_name)

        # ✅ Scanner
        scanner = Scanner(aws_session)

        findings = run_full_scan(aws_session, source="API")

        # ✅ Store scan
        scan_id = str(uuid.uuid4())

        scan = Scan(
            id=scan_id,
            account_id=account.id
        )

        db.add(scan)
        db.commit()

        # ✅ Store findings
        for f in findings:
            finding = Finding(
                id=f.get("id"),
                scan_id=scan_id,
                account_id=account.id, 
                type=f.get("type"),
                severity=f.get("severity"),
                resource_id=f.get("resource_id"),
                region=f.get("region"),
                status="OPEN",
                access_key_id=f.get("access_key_id"),
                policy_name=f.get("policy_name"),
                bucket_name=f.get("bucket_name"),
            )
            db.add(finding)

        db.commit()

        # ── 📧 Email notifications (fire-and-forget in background) ────────────
        def _notify(acct_id, acct_name, scan_findings, sid):
            """Runs in a daemon thread — won't block the HTTP response."""
            try:
                bg_db = SessionLocal()
                cfg   = EmailService.get_config(acct_id, bg_db)
                if cfg and cfg.enabled:
                    # Compute quick stats for scan-summary email
                    sev_map = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
                    for f in scan_findings:
                        sev_map[f.get("severity", "LOW")] = sev_map.get(f.get("severity", "LOW"), 0) + 1
                    crit  = sev_map["CRITICAL"]
                    high  = sev_map["HIGH"]
                    score = min(100, crit * 15 + high * 8 + sev_map["MEDIUM"] * 3 + sev_map["LOW"])
                    level = "CRITICAL" if crit > 5 else "HIGH" if crit > 0 or high > 10 else "MEDIUM" if high > 0 else "LOW"
                    stats = {
                        "total_findings": len(scan_findings),
                        "critical": crit, "high": high,
                        "medium": sev_map["MEDIUM"], "low": sev_map["LOW"],
                        "risk_score": score, "risk_level": level,
                    }
                    EmailService.send_scan_summary(stats, acct_name, cfg)

                    # Drift alert — compare to previous scan
                    from app.api.routes.drift_routes import get_drift
                    drift_resp = get_drift(account_id=acct_id, db=bg_db)
                    drift_data = getattr(drift_resp, "body", None)
                    if drift_data:
                        import json
                        d = json.loads(drift_data).get("data", {})
                        if d.get("has_drift"):
                            EmailService.send_drift_alert(d, acct_name, cfg)
                bg_db.close()
            except Exception as ex:
                print(f"[Email] Notification error: {ex}")

        acct_name = account.aws_account_id if account else "Your AWS Account"
        t = threading.Thread(target=_notify, args=(account.id, acct_name, findings, scan_id), daemon=True)
        t.start()

        # ✅ Debug logs (VERY IMPORTANT)
        print("\n" + "="*55)
        print("🌐 API SCAN STARTED")
        print("="*55)

        print(f"👤 Profile: {account.profile_name}")

        # results
        print(f"📊 API FINAL TOTAL: {len(findings)}")
        print(f"🔍 SAMPLE: {findings[:2]}")

        print("="*55)
        print("🌐 API SCAN COMPLETED")
        print("="*55 + "\n")

        return format_response(
            module="scanner",
            mode=effective_mode,
            data={
                "scan_id": scan_id,
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


@router.get("/history")
def get_scan_history(account_id: int, limit: int = 5, db: Session = Depends(get_db)):
    """Return the most recent scans for an account."""
    try:
        scans = (
            db.query(Scan)
            .filter(Scan.account_id == account_id)
            .order_by(Scan.started_at.desc())
            .limit(limit)
            .all()
        )
        return format_response(
            module="scanner",
            mode="READ",
            data={
                "scans": [
                    {
                        "scan_id": s.id,
                        "total_findings": db.query(Finding).filter(Finding.scan_id == s.id).count(),
                        "started_at": s.started_at.isoformat() if s.started_at else None,
                    }
                    for s in scans
                ]
            }
        )
    except Exception as e:
        return format_response(module="scanner", mode="READ", errors=[str(e)])
