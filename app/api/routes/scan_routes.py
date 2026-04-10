from fastapi import APIRouter, Depends
from app.api.schemas import ScanRequest
from app.config import security_config
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.core.aws_session import AWSSession
from app.modules.scanner.scanner import run_full_scan
from app.core.email_service import EmailService
from app.database.db import SessionLocal, get_db
from app.database.models import Scan, Finding, Account
from app.modules.reporter.html_reporter import HTMLReporter
from sqlalchemy.orm import Session
import uuid
import threading
import os
import datetime as _dt

def _log(msg):
    """Write to backend.log so scan activity is visible in diagnostics."""
    try:
        _d = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'CloudSecurityPanel', 'logs')
        with open(os.path.join(_d, 'backend.log'), 'a', encoding='utf-8') as f:
            ts = _dt.datetime.now().strftime('%H:%M:%S')
            f.write(f'[{ts}] [SCAN] {msg}\n')
    except Exception:
        pass


router = APIRouter(
    prefix="/api/scan",
    tags=["Scanner"]
)


@router.get("/test-aws")
def test_aws_connection(account_id: int, db: Session = Depends(get_db)):
    """Quick AWS connectivity test - calls STS only, no full scan."""
    _log(f'TEST-AWS: account_id={account_id}')
    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            _log(f'TEST-AWS: account {account_id} not found in DB')
            return {"ok": False, "error": f"Account {account_id} not in DB"}
        aws_session = AWSSession(
            profile_name=account.profile_name,
            role_arn=getattr(account, "role_arn", None),
            access_key=getattr(account, "access_key", None),
            secret_key=getattr(account, "secret_key", None),
            region_name=account.region
        )
        aws_session.initialize()
        sts = aws_session.session.client("sts")
        identity = sts.get_caller_identity()
        _log(f'TEST-AWS OK: {identity["Account"]}')
        return {"ok": True, "aws_account_id": identity["Account"], "arn": identity["Arn"]}
    except Exception as e:
        import traceback
        _log(f'TEST-AWS ERROR: {e}')
        _log(traceback.format_exc())
        return {"ok": False, "error": str(e)}


@router.post("/")
def run_scan(request: ScanRequest, db: Session = Depends(get_db)):
    _log(f'REQUEST RECEIVED: account_id={request.account_id} mode={request.mode}')

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
        account = db.query(Account).filter(
            Account.id == request.account_id
        ).first()

        if not account:
            return format_response(
                module="scanner",
                mode=effective_mode,
                errors=["Invalid account_id"]
            )
        aws_session = AWSSession(
            profile_name=account.profile_name,
            role_arn=account.role_arn,
            access_key=getattr(account, "access_key", None),
            secret_key=getattr(account, "secret_key", None),
            region_name=account.region
        )
        aws_session.initialize()
        _log(f'session initialized for account_id={request.account_id} profile={account.profile_name}')
        findings = run_full_scan(aws_session, source="API")
        _log(f'scan complete - {len(findings)} findings')

        scan_id = str(uuid.uuid4())

        scan = Scan(
            id=scan_id,
            account_id=account.id
        )

        db.add(scan)
        db.commit()

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

        def _notify(acct_id, acct_name, scan_findings, sid):
            """Runs in a daemon thread - won't block the HTTP response."""
            try:
                bg_db = SessionLocal()
                cfg   = EmailService.get_config(acct_id, bg_db)

                sev_map = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
                for f in scan_findings:
                    k = f.get("severity", "LOW")
                    sev_map[k] = sev_map.get(k, 0) + 1
                crit  = sev_map["CRITICAL"]
                high  = sev_map["HIGH"]
                score = min(100, crit * 15 + high * 8 + sev_map["MEDIUM"] * 3 + sev_map["LOW"])
                level = ("CRITICAL" if crit > 5 else
                         "HIGH"     if crit > 0 or high > 10 else
                         "MEDIUM"   if high > 0 else "LOW")
                stats = {
                    "total_findings": len(scan_findings),
                    "critical": crit, "high": high,
                    "medium": sev_map["MEDIUM"], "low": sev_map["LOW"],
                    "risk_score": score, "risk_level": level,
                }

                report_url = HTMLReporter.generate(sid, scan_findings, stats, acct_name)

                if cfg and cfg.enabled:
                    EmailService.send_scan_summary(stats, acct_name, cfg,
                                                   report_url=report_url)

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

        print("\n" + "="*55)
        print("[API] SCAN STARTED")
        print("="*55)

        print(f"[Profile] {account.profile_name}")

        print(f"[TOTAL] FINDINGS: {len(findings)}")
        print(f"[SAMPLE] {findings[:2]}")

        print("="*55)
        print("[API] SCAN COMPLETED")
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
        import traceback
        _log(f'SCAN ERROR: {str(e)}')
        _log(f'TRACEBACK: {traceback.format_exc()}')
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


@router.get("/report/{scan_id}")
def view_scan_report(scan_id: str):
    """Serve the saved HTML report for a scan directly in the browser.
    Used by the in-app 'View Report' button - no localhost dependency."""
    from fastapi.responses import HTMLResponse, JSONResponse
    path = HTMLReporter.get_path(scan_id)
    if path is None:
        return JSONResponse(
            status_code=404,
            content={"error": f"Report for scan '{scan_id}' not found. "
                               "It may not have been generated yet."}
        )
    return HTMLResponse(content=path.read_text(encoding="utf-8"), status_code=200)

