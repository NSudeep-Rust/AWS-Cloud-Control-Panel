from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.database.models import Alert
from app.api.response_formatter import format_response

router = APIRouter(
    prefix="/api/alerts",
    tags=["Alerts"]
)

@router.get("/")
def get_alerts(db: Session = Depends(get_db)):

    alerts = db.query(Alert).order_by(Alert.created_at.desc()).all()

    data = []
    for a in alerts:
        data.append({
            "id": a.id,
            "finding_id": a.finding_id,
            "message": a.message,
            "severity": a.severity,
            "created_at": a.created_at
        })

    return format_response(
        module="alerts",
        mode="READ",
        data={
            "total": len(data),
            "alerts": data
        }
    )