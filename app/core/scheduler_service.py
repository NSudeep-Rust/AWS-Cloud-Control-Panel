"""
scheduler_service.py

Background thread that checks every 60 seconds for accounts with an active
ScheduleConfig and fires run_full_scan() when   now >= next_run_at.

Architecture:
  - Single SchedulerService instance created in main.py
  - FastAPI @app.on_event("startup") calls scheduler_service.start()
  - Completely independent from MonitorService (different purpose)
  
  MonitorService  → real-time diff-driven alerting (threat monitor)
  SchedulerService → periodic snapshot scans stored in history
"""
import threading
import time
import uuid
from datetime import datetime, timedelta

from app.database.db import get_db
from app.database.models import Account, Scan, Finding, ScheduleConfig
from app.core.aws_session import AWSSession
from app.modules.scanner.scanner import run_full_scan
from app.api.websocket_manager import ws_manager


def get_interval_td(interval_hours: int):
    """Negative = minutes (e.g. -1 → 1 min, -20 → 20 min). Positive = hours."""
    if interval_hours < 0:
        return timedelta(minutes=abs(interval_hours))
    return timedelta(hours=interval_hours)


class SchedulerService:

    def __init__(self):
        self.running = False
        self.thread  = None

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread  = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        print("⏰ SchedulerService started")

    def stop(self):
        self.running = False
        print("⏰ SchedulerService stopped")

    def get_status(self):
        return {"running": self.running}

    def _loop(self):
        while self.running:
            try:
                self._check_and_run()
            except Exception as e:
                print(f"❌ SchedulerService loop error: {e}")
            time.sleep(60)      # re-check every minute

    def _check_and_run(self):
        """Find all enabled schedules whose next_run_at is in the past and fire them."""
        db = next(get_db())
        try:
            now = datetime.utcnow()
            due = (
                db.query(ScheduleConfig)
                .filter(
                    ScheduleConfig.enabled == 1,
                    ScheduleConfig.next_run_at <= now,
                )
                .all()
            )
            for cfg in due:
                self._run_scheduled_scan(cfg.account_db_id, cfg.id, db)
        finally:
            db.close()

    def _run_scheduled_scan(self, account_db_id: int, config_id: int, db):
        """Execute a full scan for one account and persist results + update schedule."""
        account = db.query(Account).filter(Account.id == account_db_id).first()
        if not account:
            print(f"⏰ Scheduled scan skipped — account {account_db_id} not found")
            return

        print(f"⏰ Scheduled scan STARTING for account {account.aws_account_id}")
        try:
            aws = AWSSession(
                profile_name=account.profile_name,
                role_arn=account.role_arn,
                access_key=getattr(account, "access_key", None),
                secret_key=getattr(account, "secret_key", None),
                region_name=account.region,
            )
            aws.initialize()

            findings = run_full_scan(aws, source="SCHEDULED")

            scan_id = str(uuid.uuid4())
            db.add(Scan(id=scan_id, account_id=account.id, source="SCHEDULED"))
            db.commit()

            for f in findings:
                try:
                    db.add(Finding(
                        id          = f.get("id"),
                        scan_id     = scan_id,
                        account_id  = account.id,
                        type        = f.get("type"),
                        severity    = f.get("severity"),
                        resource_id = f.get("resource_id"),
                        region      = f.get("region"),
                        status      = "OPEN",
                        access_key_id = f.get("access_key_id"),
                        policy_name   = f.get("policy_name"),
                        bucket_name   = f.get("bucket_name"),
                    ))
                except Exception:
                    pass   # duplicate ID edge-case — skip silently
            db.commit()

            cfg = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
            if cfg:
                cfg.last_run_at = datetime.utcnow()
                cfg.next_run_at = datetime.utcnow() + get_interval_td(cfg.interval_hours)
                cfg.updated_at  = datetime.utcnow()
                db.commit()

            print(f"⏰ Scheduled scan COMPLETE for account {account.aws_account_id} "
                  f"— {len(findings)} findings — scan_id={scan_id}")

            ws_manager.broadcast_sync({
                "event":          "scan_complete",
                "scan_id":        scan_id,
                "account_id":     account.id,
                "findings_count": len(findings),
                "source":         "SCHEDULED",
            })

        except Exception as e:
            print(f"❌ Scheduled scan FAILED for account {account_db_id}: {e}")
            try:
                cfg = db.query(ScheduleConfig).filter(ScheduleConfig.id == config_id).first()
                if cfg:
                    cfg.next_run_at = datetime.utcnow() + get_interval_td(cfg.interval_hours)
                    cfg.updated_at  = datetime.utcnow()
                    db.commit()
            except Exception:
                pass

    def run_now(self, account_db_id: int):
        """Fire a scheduled scan immediately in a separate thread."""
        def _fire():
            db = next(get_db())
            try:
                cfg = (
                    db.query(ScheduleConfig)
                    .filter(ScheduleConfig.account_db_id == account_db_id)
                    .first()
                )
                config_id = cfg.id if cfg else None
                self._run_scheduled_scan(account_db_id, config_id, db)
            finally:
                db.close()

        t = threading.Thread(target=_fire, daemon=True)
        t.start()


scheduler_service = SchedulerService()
