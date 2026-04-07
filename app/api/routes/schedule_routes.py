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
    interval_hours: int   = 24   # 1 | 6 | 12 | 24
    enabled:        int   = 1    # 1=on  0=off


def _serialize(cfg: ScheduleConfig) -> dict:
    return {
        "id":             cfg.id,
        "account_db_id":  cfg.account_db_id,
        "enabled":        cfg.enabled,
        "interval_hours": cfg.interval_hours,
        "last_run_at":    cfg.last_run_at.isoformat()  if cfg.last_run_at  else None,
        "next_run_at":    cfg.next_run_at.isoformat()  if cfg.next_run_at  else None,
        "updated_at":     cfg.updated_at.isoformat()   if cfg.updated_at   else None,
    }


# ── GET current schedule ──────────────────────────────────────────────────────
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


# ── Create / update schedule ──────────────────────────────────────────────────
@router.post("/")
def upsert_schedule(body: ScheduleRequest, db: Session = Depends(get_db)):
    if body.interval_hours not in (1, 6, 12, 24):
        raise HTTPException(status_code=400, detail="interval_hours must be 1, 6, 12, or 24")

    account = db.query(Account).filter(Account.id == body.account_db_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == body.account_db_id)
        .first()
    )

    if cfg:
        # Update existing
        cfg.enabled        = body.enabled
        cfg.interval_hours = body.interval_hours
        cfg.updated_at     = datetime.utcnow()
        # Recalculate next_run_at if enabling or changing interval
        if body.enabled:
            cfg.next_run_at = datetime.utcnow() + timedelta(hours=body.interval_hours)
    else:
        # Create new
        cfg = ScheduleConfig(
            account_db_id  = body.account_db_id,
            enabled        = body.enabled,
            interval_hours = body.interval_hours,
            next_run_at    = datetime.utcnow() + timedelta(hours=body.interval_hours) if body.enabled else None,
        )
        db.add(cfg)

    db.commit()
    db.refresh(cfg)

    return format_response(
        module="schedule", mode="WRITE",
        data={"config": _serialize(cfg), "message": "Schedule saved"}
    )


# ── Run now ───────────────────────────────────────────────────────────────────
@router.post("/run-now")
def run_now(account_db_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_db_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    scheduler_service.run_now(account_db_id)

    # Update last_run_at for the config (if exists)
    cfg = (
        db.query(ScheduleConfig)
        .filter(ScheduleConfig.account_db_id == account_db_id)
        .first()
    )
    if cfg and cfg.enabled:
        cfg.next_run_at = datetime.utcnow() + timedelta(hours=cfg.interval_hours)
        cfg.updated_at  = datetime.utcnow()
        db.commit()

    return format_response(
        module="schedule", mode="WRITE",
        data={"message": "Scan triggered — check History in ~30 seconds"}
    )


# ── Disable schedule ──────────────────────────────────────────────────────────
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
