"""
schedule_routes.py

REST API for reading and configuring the automated scan schedule.

GET  /api/schedule/?account_db_id=X   → current schedule config
POST /api/schedule/                    → create / update schedule
POST /api/schedule/run-now             → trigger a scan right now
DELETE /api/schedule/                  → disable (keep config, set enabled=0)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from app.database.db import get_db
from app.database.models import ScheduleConfig, Account
from app.api.response_formatter import format_response
from app.core.scheduler_service import scheduler_service

router = APIRouter(prefix="/api/schedule", tags=["Schedule"])


class ScheduleRequest(BaseModel):
    account_db_id:  int
    interval_hours: int   = 24   # -1=1min | -20=20min | 1 | 6 | 12 | 24
    enabled:        int   = 1    # 1=on  0=off


ALLOWED_INTERVALS = (-1, -20, 1, 6, 12, 24)

def get_interval_td(interval_hours: int) -> timedelta:
    """Convert stored interval value to a timedelta.
    Negative values = minutes (e.g. -1 → 1 min, -20 → 20 min).
    Positive values = hours  (e.g.  1 → 1 h,  24 → 24 h).
    """
    if interval_hours < 0:
        return timedelta(minutes=abs(interval_hours))
    return timedelta(hours=interval_hours)


def _serialize(cfg: ScheduleConfig) -> dict:
    def _iso(dt):
        return (dt.isoformat() + "Z") if dt else None   # "Z" = UTC marker for JS Date()
    return {
        "id":             cfg.id,
        "account_db_id":  cfg.account_db_id,
        "enabled":        cfg.enabled,
        "interval_hours": cfg.interval_hours,
        "last_run_at":    _iso(cfg.last_run_at),
        "next_run_at":    _iso(cfg.next_run_at),
        "updated_at":     _iso(cfg.updated_at),
    }


@router.get("/")
def get_schedule(account_db_id: int, db: Session = Depends(get_db)):
    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == account_db_id)
        .first()
    )
    if not cfg:
        return format_response(
            module="schedule", mode="READ",
            data={"config": None, "message": "No schedule configured"}
        )
    return format_response(module="schedule", mode="READ", data={"config": _serialize(cfg)})


@router.post("/")
def upsert_schedule(body: ScheduleRequest, db: Session = Depends(get_db)):
    if body.interval_hours not in ALLOWED_INTERVALS:
        raise HTTPException(status_code=400, detail=f"interval_hours must be one of {ALLOWED_INTERVALS}")

    account = db.query(Account).filter(Account.id == body.account_db_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == body.account_db_id)
        .first()
    )

    if cfg:
        cfg.enabled        = body.enabled
        cfg.interval_hours = body.interval_hours
        cfg.updated_at     = datetime.utcnow()
        if body.enabled:
            cfg.next_run_at = datetime.utcnow() + get_interval_td(body.interval_hours)
    else:
        cfg = ScheduleConfig(
            account_db_id  = body.account_db_id,
            enabled        = body.enabled,
            interval_hours = body.interval_hours,
            next_run_at    = datetime.utcnow() + get_interval_td(body.interval_hours) if body.enabled else None,
        )
        db.add(cfg)

    db.commit()
    db.refresh(cfg)

    return format_response(
        module="schedule", mode="WRITE",
        data={"config": _serialize(cfg), "message": "Schedule saved"}
    )


@router.post("/run-now")
def run_now(account_db_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_db_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    scheduler_service.run_now(account_db_id)

    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == account_db_id)
        .first()
    )
    if cfg and cfg.enabled:
        cfg.next_run_at = datetime.utcnow() + get_interval_td(cfg.interval_hours)
        cfg.updated_at  = datetime.utcnow()
        db.commit()

    return format_response(
        module="schedule", mode="WRITE",
        data={"message": "Scan triggered — check History in ~30 seconds"}
    )


@router.delete("/")
def disable_schedule(account_db_id: int, db: Session = Depends(get_db)):
    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == account_db_id)
        .first()
    )
    if not cfg:
        raise HTTPException(status_code=404, detail="No schedule found")
    cfg.enabled    = 0
    cfg.updated_at = datetime.utcnow()
    db.commit()
    return format_response(
        module="schedule", mode="DELETE",
        data={"message": "Schedule disabled"}
    )
