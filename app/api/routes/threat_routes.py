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

monitor_service = None

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
def start_monitor():
    global monitor_service

    session = AWSSession(region_name="us-east-1")
    session.initialize()
    print("🔥 MONITOR USING ACCOUNT:", session.get_account_id())

    monitor = ThreatMonitor(aws_session=session)

    monitor_service = MonitorService(monitor, interval=60)

    return {"message": monitor_service.start()}


@router.post("/monitor/stop")
def stop_monitor():
    global monitor_service

    if not monitor_service:
        return {"message": "Not running"}

    return {"message": monitor_service.stop()}