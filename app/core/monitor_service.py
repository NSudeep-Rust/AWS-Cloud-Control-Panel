import threading
import time
from app.modules.diff_engine.diff_engine import DiffEngine
from app.database.db import get_db, SessionLocal
from app.database.models import FindingChange, Account
from app.config.security_config import ALERT_SEVERITIES
from app.core.email_service import EmailService
from datetime import datetime

import os as _os
_ICON_PATH = _os.path.normpath(
    _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "assets", "aws_cloudshield.ico")
)
try:
    from winotify import Notification as _WiNotif
    _NOTIF_BACKEND = "winotify"
except ImportError:
    try:
        from plyer import notification as desktop_notif
        _NOTIF_BACKEND = "plyer"
    except ImportError:
        _NOTIF_BACKEND = None


def _fire_windows_toast(severity: str, finding_id: str, message: str):
    """Fire a branded Windows OS toast showing 'AWS CloudShield' (not 'Python')."""
    sev_icon = {"CRITICAL": "[CRIT]", "HIGH": "[HIGH]", "MEDIUM": "[MED]", "LOW": "[LOW]"}
    title = f"[AWS CloudShield] {severity} Security Alert"
    short_id = finding_id[:48] if finding_id else "Unknown"
    body = f"{message}\n{short_id}"
    if _NOTIF_BACKEND == "winotify":
        try:
            toast = _WiNotif(
                app_id="AWS CloudShield",
                title=title,
                msg=body[:200],
                icon=_ICON_PATH if _os.path.exists(_ICON_PATH) else "",
                duration="short",
            )
            toast.show()
            print(f"[Toast] Fired (winotify): [{severity}] {short_id}")
        except Exception as e:
            print(f"[Toast] winotify error: {e}")
    elif _NOTIF_BACKEND == "plyer":
        try:
            desktop_notif.notify(title=title, message=body[:200], app_name="AWS CloudShield", timeout=10)
            print(f"[Toast] Fired (plyer): [{severity}] {short_id}")
        except Exception as e:
            print(f"[Toast] plyer error: {e}")


class MonitorService:

    def __init__(self, monitor, interval=15, broadcast_fn=None, account_db_id=None):
        self.monitor = monitor
        self.interval = interval
        self.running = False
        self.thread = None
        self.previous_findings = None
        self.broadcast_fn = broadcast_fn
        self.account_db_id = account_db_id   # DB integer id --- used to store live findings

    def _loop(self):
        print(f"[Monitor] Started at {datetime.utcnow().isoformat()}")
        while self.running:
            try:
                current_findings = self.monitor.run_once()

                if self.previous_findings is None:
                    print("[Monitor] First run - establishing baseline (no alerts)")
                else:
                    diff = DiffEngine.compare(self.previous_findings, current_findings)

                    print("[Monitor] DIFF RESULT")
                    print(f"[Monitor] NEW: {len(diff['new'])}")
                    print(f"[Monitor] RESOLVED: {len(diff['resolved'])}")
                    print(f"[Monitor] UNCHANGED: {len(diff['unchanged'])}")

                    try:
                        db = next(get_db())

                        for fid in diff["new"]:
                            db.add(FindingChange(
                                finding_id=fid,
                                change_type="NEW"
                            ))

                        for fid in diff["resolved"]:
                            db.add(FindingChange(
                                finding_id=fid,
                                change_type="RESOLVED"
                            ))

                        db.commit()
                        db.close()

                        # Fire Windows toast for new CRITICAL/HIGH findings
                        current_map = {f["id"]: f for f in current_findings}
                        for fid in diff["new"]:
                            finding = current_map.get(fid)
                            if not finding:
                                continue
                            sev = finding.get("severity")
                            if sev in ALERT_SEVERITIES:
                                _fire_windows_toast(
                                    severity=sev,
                                    finding_id=fid,
                                    message=f"New {sev} issue detected"
                                )

                    except Exception as db_error:
                        print(f"[Monitor] DB ERROR: {db_error}")

                self.previous_findings = current_findings
            except Exception as e:
                print(f"[Monitor] ERROR: {e}")

            time.sleep(5)


    def start(self):
        if self.running:
            return "Already running"

        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

        return "Monitoring started"

    def stop(self):
        self.running = False
        return "Monitoring stopped"

    def get_status(self):
        return {
            "running": self.running,
            "interval": self.interval
        }


