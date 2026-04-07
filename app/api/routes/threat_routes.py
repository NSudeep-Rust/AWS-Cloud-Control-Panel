from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.schemas import ThreatRequest
from app.api.response_formatter import format_response
from app.database.db import get_db
from app.database.models import Finding
from app.modules.remediation.planner import RemediationPlanner
from app.core.monitor_service import MonitorService
from app.modules.threat_monitor.threat_monitor import ThreatMonitor
from app.core.aws_session import AWSSession
from app.database.models import Account
from app.api.schemas import MonitorRequest
from app.api.websocket_manager import ws_manager
from app.core.fast_watcher import FastWatcher
from datetime import datetime

monitor_service  = None
fast_watcher_svc = None   # lightweight 8s watcher

router = APIRouter(
    prefix="/api/threats",
    tags=["Threat"]
)

@router.post("/")
def run_threat_monitor(request: ThreatRequest, db: Session = Depends(get_db)):

    try:
        findings = db.query(Finding).filter(Finding.scan_id == request.scan_id).all()

        if not findings:
            return format_response(
                module="threat",
                mode="ANALYSIS",
                errors=["No findings found for given scan_id"]
            )

        planner = RemediationPlanner()
        enriched = []

        for f in findings:
            remediation = planner.plan({
                "type": f.type,
                "severity": f.severity
            })


            if remediation.get("action") == "NO_ACTION":
                execution = {
                    "status": "INFO",
                    "action": "MANUAL_REVIEW_REQUIRED",
                    "message": "No automated fix available"
                }
            else:
                execution = {
                    "status": "PLANNED",
                    "action": remediation.get("action"),
                    "message": "Ready for execution"
                }

            enriched.append({
                "id": f.id,
                "type": f.type,
                "severity": f.severity,
                "resource_id": f.resource_id,
                "region": f.region,
                "status": f.status,
                "remediation": remediation,
                "execution": execution
            })


        return format_response(
            module="threat",
            mode="ANALYSIS",
            data={
                "scan_id": request.scan_id,
                "total_findings": len(enriched),
                "findings": enriched
            }
        )

    except Exception as e:
        return format_response(
            module="threat",
            mode="ANALYSIS",
            errors=[str(e)]
        )



@router.post("/monitor/start")
def start_monitor(request: MonitorRequest, db: Session = Depends(get_db)):
    global monitor_service, fast_watcher_svc

    # 1. Get account from DB
    account = db.query(Account).filter(
        Account.aws_account_id == request.account_id
    ).first()

    if not account:
        return {"error": "Account not found"}

    # 2. Create AWS session using DB values
    aws = AWSSession(
        profile_name=account.profile_name,
        access_key=account.access_key,
        secret_key=account.secret_key,
        region_name=account.region
    )
    aws.initialize()
    print("🔥 MONITOR USING ACCOUNT:", aws.get_account_id())

    # 3. Start full monitor (runs complete threat scanner every 15s)
    monitor = ThreatMonitor(aws_session=aws)
    monitor_service = MonitorService(
        monitor,
        interval=15,
        broadcast_fn=ws_manager.broadcast_sync,
        account_db_id=account.id          # ← pass DB id so live findings are saved
    )
    monitor_service.start()

    # 4. Start FastWatcher (lightweight 8s checks for critical changes)
    if fast_watcher_svc:
        fast_watcher_svc.stop()
    fast_watcher_svc = FastWatcher(
        aws_session=aws,
        broadcast_fn=ws_manager.broadcast_sync,
        db_fn=get_db
    )
    fast_watcher_svc.start()

    return {"message": "Monitoring started (full scan + fast watcher active)"}


@router.post("/monitor/stop")
def stop_monitor():
    global monitor_service

    if not monitor_service:
        return {"message": "Not running"}

    return {"message": monitor_service.stop()}


@router.get("/monitor/status")
def monitor_status():
    global monitor_service

    if not monitor_service:
        return format_response(
            module="monitor",
            mode="READ",
            data={"status": "not_started"}
        )

    return format_response(
        module="monitor",
        mode="READ",
        data=monitor_service.get_status()
    )