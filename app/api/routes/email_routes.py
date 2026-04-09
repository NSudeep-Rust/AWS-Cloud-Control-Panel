"""
email_routes.py — Email Notification Configuration & Dispatch API

Endpoints:
  GET  /api/email/config          → get current config (password masked)
  POST /api/email/config          → save / update config
  POST /api/email/test            → send a test email right now (async, non-blocking)
  POST /api/email/send-alert      → manually trigger a critical-alert email
"""

import asyncio
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from app.database.db import get_db
from app.database.models import EmailConfig, Account, Scan, Finding
from app.api.response_formatter import format_response
from app.core.email_service import EmailService

router = APIRouter(prefix="/api/email", tags=["Email Notifications"])



class EmailConfigIn(BaseModel):
    account_id:               Optional[int]  = None
    smtp_host:                str             = "smtp.gmail.com"
    smtp_port:                int             = 587
    smtp_username:            str
    smtp_password:            str
    recipient_email:          str
    sender_name:              str             = "CloudShield Security"
    enabled:                  bool            = False
    notify_on_critical:       bool            = True
    notify_on_scan_complete:  bool            = True
    notify_on_drift:          bool            = True

    class Config:
        extra = "allow"



def _mask(cfg: EmailConfig) -> dict:
    """Return config dict with password masked."""
    return {
        "id":                      cfg.id,
        "account_id":              cfg.account_id,
        "smtp_host":               cfg.smtp_host,
        "smtp_port":               cfg.smtp_port,
        "smtp_username":           cfg.smtp_username or "",
        "smtp_password":           "••••••••" if cfg.smtp_password else "",
        "recipient_email":         cfg.recipient_email or "",
        "sender_name":             cfg.sender_name or "CloudShield Security",
        "enabled":                 cfg.enabled,
        "notify_on_critical":      cfg.notify_on_critical,
        "notify_on_scan_complete": cfg.notify_on_scan_complete,
        "notify_on_drift":         cfg.notify_on_drift,
        "updated_at":              cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


def _preflight(cfg) -> Optional[str]:
    """Fast pre-validation before making an SMTP connection.
    Returns an error string or None if everything looks OK."""
    if not cfg.smtp_host:
        return "SMTP host is empty."
    if not cfg.smtp_username or "@" not in cfg.smtp_username:
        return "Sender email (username) is missing or invalid."
    if not cfg.smtp_password:
        return "Password is empty — enter your App Password and Save first."
    if not cfg.recipient_email or "@" not in cfg.recipient_email:
        return "Recipient email is missing or invalid."
    if "gmail" in (cfg.smtp_host or "").lower():
        pw = (cfg.smtp_password or "").replace(" ", "")
        if len(pw) != 16:
            return (
                f"Gmail App Password must be exactly 16 characters — yours is {len(pw)}. "
                "Go to myaccount.google.com/apppasswords to generate one. "
                "Do NOT use your Gmail login password."
            )
    return None



@router.get("/config")
def get_email_config(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    cfg = EmailService.get_config(account_id, db)
    if not cfg:
        return format_response(
            module="email_config", mode="READ",
            data={
                "configured": False,
                "account_id": account_id,
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "smtp_username": "",
                "smtp_password": "",
                "recipient_email": "",
                "sender_name": "CloudShield Security",
                "enabled": False,
                "notify_on_critical": True,
                "notify_on_scan_complete": True,
                "notify_on_drift": True,
            }
        )
    return format_response(
        module="email_config", mode="READ",
        data={"configured": True, **_mask(cfg)}
    )



@router.post("/config")
def save_email_config(
    body: EmailConfigIn,
    db:   Session = Depends(get_db)
):
    cfg = EmailService.get_config(body.account_id, db)

    if cfg:
        cfg.smtp_host               = body.smtp_host
        cfg.smtp_port               = body.smtp_port
        cfg.smtp_username           = body.smtp_username
        if body.smtp_password and body.smtp_password not in ("••••••••", ""):
            cfg.smtp_password       = body.smtp_password
        cfg.recipient_email         = body.recipient_email
        cfg.sender_name             = body.sender_name
        cfg.enabled                 = body.enabled
        cfg.notify_on_critical      = body.notify_on_critical
        cfg.notify_on_scan_complete = body.notify_on_scan_complete
        cfg.notify_on_drift         = body.notify_on_drift
        cfg.updated_at              = datetime.utcnow()
    else:
        cfg = EmailConfig(
            account_id              = body.account_id,
            smtp_host               = body.smtp_host,
            smtp_port               = body.smtp_port,
            smtp_username           = body.smtp_username,
            smtp_password           = body.smtp_password,
            recipient_email         = body.recipient_email,
            sender_name             = body.sender_name,
            enabled                 = body.enabled,
            notify_on_critical      = body.notify_on_critical,
            notify_on_scan_complete = body.notify_on_scan_complete,
            notify_on_drift         = body.notify_on_drift,
        )
        db.add(cfg)

    db.commit()
    db.refresh(cfg)

    return format_response(
        module="email_config", mode="WRITE",
        data={"saved": True, **_mask(cfg)}
    )



@router.post("/test")
async def send_test_email(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    cfg = EmailService.get_config(account_id, db)
    if not cfg:
        return format_response(
            module="email_test", mode="ACTION",
            data={"sent": False, "error": "No email config saved. Fill in SMTP settings and click Save first."}
        )

    err = _preflight(cfg)
    if err:
        return format_response(
            module="email_test", mode="ACTION",
            data={"sent": False, "error": err}
        )

    ok, err = await asyncio.to_thread(EmailService.send_test, cfg)
    return format_response(
        module="email_test", mode="ACTION",
        data={"sent": ok, "recipient": cfg.recipient_email if ok else None, "error": err}
    )



@router.post("/send-alert")
async def send_manual_alert(
    account_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Manually trigger a critical-alert email using the latest scan's findings."""
    cfg = EmailService.get_config(account_id, db)
    if not cfg or not cfg.enabled:
        return format_response(
            module="email_alert", mode="ACTION",
            data={"sent": False, "error": "Email notifications not configured or disabled."}
        )

    err = _preflight(cfg)
    if err:
        return format_response(
            module="email_alert", mode="ACTION",
            data={"sent": False, "error": err}
        )

    q = db.query(Scan)
    if account_id:
        q = q.filter(Scan.account_id == account_id)
    scan = q.order_by(Scan.created_at.desc()).first()
    if not scan:
        return format_response(
            module="email_alert", mode="ACTION",
            data={"sent": False, "error": "No scans found. Run a scan first."}
        )

    findings = db.query(Finding).filter(
        Finding.scan_id == scan.id,
        Finding.severity.in_(["CRITICAL", "HIGH"])
    ).all()

    if not findings:
        return format_response(
            module="email_alert", mode="ACTION",
            data={"sent": False, "error": "No CRITICAL/HIGH findings in latest scan — nothing to alert."}
        )

    acct = db.query(Account).filter(Account.id == account_id).first() if account_id else None
    account_name = acct.aws_account_id if acct else "Your AWS Account"

    findings_dicts = [
        {"type": f.type, "severity": f.severity, "resource_id": f.resource_id, "region": f.region}
        for f in findings
    ]

    ok, err = await asyncio.to_thread(EmailService.send_critical_alert, findings_dicts, account_name, cfg)
    return format_response(
        module="email_alert", mode="ACTION",
        data={"sent": ok, "count": len(findings_dicts), "error": err}
    )
