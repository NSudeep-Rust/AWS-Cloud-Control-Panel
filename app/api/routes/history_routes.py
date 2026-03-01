from fastapi import APIRouter
from app.api.response_formatter import format_response
from app.modules.protection_history.history import ProtectionHistory

router = APIRouter(
    prefix="/api/history",
    tags=["History"]
)

history_service = ProtectionHistory()


@router.get("/")
def get_all_history():
    data = history_service.read_history()

    return format_response(
        module="history",
        mode="READ",
        data=data
    )


@router.get("/summary")
def get_history_summary():
    data = history_service.read_history()

    total_events = len(data)
    total_findings = 0
    total_executed = 0
    total_skipped = 0
    total_failed = 0
    total_high = 0

    for event in data:
        total_findings += event.get("count", 0)

        for detail in event.get("details", []):
            if detail.get("severity") == "HIGH":
                total_high += 1

            execution = detail.get("execution", {})
            status = execution.get("status")

            if status == "EXECUTED":
                total_executed += 1
            elif status == "SKIPPED":
                total_skipped += 1
            elif status not in ["EXECUTED", "SKIPPED", None]:
                total_failed += 1

    return format_response(
        module="history_summary",
        mode="READ",
        data={
            "total_events": total_events,
            "total_findings": total_findings,
            "total_high_severity": total_high,
            "total_executed": total_executed,
            "total_skipped": total_skipped,
            "total_failed": total_failed
        }
    )


@router.get("/resource/{resource_id}")
def get_by_resource(resource_id: str):
    data = history_service.read_history()

    filtered = []

    for event in data:
        for detail in event.get("details", []):
            if detail.get("resource_id") == resource_id:
                filtered.append(detail)

    return format_response(
        module="history_by_resource",
        mode="READ",
        data=filtered
    )