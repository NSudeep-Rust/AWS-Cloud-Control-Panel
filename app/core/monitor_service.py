import threading
import time
import uuid
from app.modules.diff_engine.diff_engine import DiffEngine
from app.database.db import get_db, SessionLocal
from app.database.models import FindingChange, Alert, LiveMonitorFinding, Account
from app.config.security_config import ALERT_SEVERITIES
from app.core.email_service import EmailService
from datetime import datetime

# Windows desktop notification — winotify (shows "AWS CloudShield", not "Python")
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
    sev_icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}
    title = f"{sev_icon.get(severity, '⚠️')} AWS Security Alert \u2014 {severity}"
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
            print(f"🔔 Windows toast fired (winotify): [{severity}] {short_id}")
        except Exception as e:
            print(f"⚠️  winotify toast error: {e}")
    elif _NOTIF_BACKEND == "plyer":
        try:
            desktop_notif.notify(title=title, message=body[:200], app_name="AWS CloudShield", timeout=10)
            print(f"🔔 Windows toast fired (plyer): [{severity}] {short_id}")
        except Exception as e:
            print(f"⚠️  plyer toast error: {e}")


class MonitorService:

    def __init__(self, monitor, interval=15, broadcast_fn=None, account_db_id=None):
        self.monitor = monitor
        self.interval = interval
        self.running = False
        self.thread = None
        self.previous_findings = None
        self.broadcast_fn = broadcast_fn
        self.account_db_id = account_db_id   # DB integer id — used to store live findings

    def _loop(self):
        print(f"🟢 Monitoring Started at {datetime.utcnow().isoformat()}")
        while self.running:
            try:
                current_findings = self.monitor.run_once()

                                # FIRST RUN → NO DIFF
                if self.previous_findings is None:
                    print("ℹ️ First run — skipping diff")
                else:
                    diff = DiffEngine.compare(self.previous_findings, current_findings)

                    print("🔍 DIFF RESULT")
                    print(f"🆕 NEW: {len(diff['new'])}")
                    print(f"✅ RESOLVED: {len(diff['resolved'])}")
                    print(f"➖ UNCHANGED: {len(diff['unchanged'])}")

                    # ------------------------
                    # STORE DIFF IN DB  ✅ HERE
                    # ------------------------
                    try:
                        db = next(get_db())

                        # NEW
                        for fid in diff["new"]:
                            db.add(FindingChange(
                                finding_id=fid,
                                change_type="NEW"
                            ))

                        # RESOLVED
                        for fid in diff["resolved"]:
                            db.add(FindingChange(
                                finding_id=fid,
                                change_type="RESOLVED"
                            ))

                        db.commit()
                        db.close()

                        # ------------------------
                        # 🚨 ALERT ENGINE (ADD HERE)
                        # ------------------------
                        try:
                            db = next(get_db())

                            current_map = {f["id"]: f for f in current_findings}

                            severities_triggered = set()

                            for fid in diff["new"]:
                                finding = current_map.get(fid)

                                if not finding:
                                    continue

                                severity = finding.get("severity")

                                if severity in ALERT_SEVERITIES:
                                    severities_triggered.add(severity)
                                    alert_id = str(uuid.uuid4())

                                    alert = Alert(
                                        id=alert_id,
                                        finding_id=fid,
                                        message=f"New {severity} issue detected",
                                        severity=severity
                                    )
                                    db.add(alert)

                                    # ⚡ Instant WebSocket push — fires before DB commit
                                    if self.broadcast_fn:
                                        try:
                                            self.broadcast_fn({
                                                "event":       "new_alert",
                                                "id":          alert_id,
                                                "finding_id":  fid,
                                                "type":        finding.get("type", ""),
                                                "resource_id": finding.get("resource_id", fid),
                                                "message":     f"New {severity} issue detected",
                                                "severity":    severity,
                                                "timestamp":   datetime.utcnow().isoformat(),
                                            })
                                        except Exception as ws_err:
                                            print(f"⚡ WS push error: {ws_err}")

                            db.commit()
                            db.close()

                            # ✅ SMART PRINT + Windows toast
                            if severities_triggered:
                                print(f"🚨 Alerts generated for: {', '.join(severities_triggered)}")
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
                            else:
                                print("ℹ️ No alert-worthy findings")

                        except Exception as alert_error:
                            print(f"❌ ALERT ERROR: {alert_error}")

                    except Exception as db_error:
                        print(f"❌ DB ERROR (diff store): {db_error}")

                # ── Save current CRITICAL/HIGH findings to LiveMonitorFinding table ──
                if self.account_db_id:
                    try:
                        db = next(get_db())
                        # Replace all active (non-dismissed) findings for this account
                        # so the dashboard always shows what the monitor CURRENTLY sees
                        db.query(LiveMonitorFinding).filter(
                            LiveMonitorFinding.account_db_id == self.account_db_id,
                            LiveMonitorFinding.dismissed == 0
                        ).delete(synchronize_session=False)

                        for f in current_findings:
                            if f.get("severity") in ("CRITICAL", "HIGH"):
                                remediation = f.get("remediation") or {}
                                db.add(LiveMonitorFinding(
                                    finding_id         = f.get("id", ""),
                                    finding_type       = f.get("type", ""),
                                    severity           = f.get("severity", ""),
                                    resource_id        = f.get("resource_id", ""),
                                    region             = f.get("region", "global"),
                                    account_db_id      = self.account_db_id,
                                    remediation_action = remediation.get("action", ""),
                                    remediation_reason = remediation.get("reason", ""),
                                    dismissed          = 0,
                                ))
                        db.commit()
                        db.close()
                        crit = sum(1 for f in current_findings if f.get("severity") == "CRITICAL")
                        high = sum(1 for f in current_findings if f.get("severity") == "HIGH")
                        print(f"📊 LiveMonitorFindings updated → CRITICAL:{crit} HIGH:{high}")

                        # 📧 Send critical alert email (fire-and-forget)
                        crit_high = [
                            {"type": f.get("type",""), "severity": f.get("severity",""),
                             "resource_id": f.get("resource_id",""), "region": f.get("region","global")}
                            for f in current_findings if f.get("severity") in ("CRITICAL", "HIGH")
                        ]
                        if crit_high and self.account_db_id:
                            def _email_alert(acct_id, findings_list):
                                try:
                                    em_db = SessionLocal()
                                    cfg   = EmailService.get_config(acct_id, em_db)
                                    if cfg and cfg.enabled and cfg.notify_on_critical:
                                        acct  = em_db.query(Account).filter(Account.id == acct_id).first()
                                        name  = acct.aws_account_id if acct else "Your AWS Account"
                                        EmailService.send_critical_alert(findings_list, name, cfg)
                                    em_db.close()
                                except Exception as em_err:
                                    print(f"[Email] Monitor alert error: {em_err}")
                            threading.Thread(
                                target=_email_alert,
                                args=(self.account_db_id, crit_high),
                                daemon=True
                            ).start()

                    except Exception as live_err:
                        print(f"❌ LiveMonitorFinding save error: {live_err}")

                # UPDATE STATE
                self.previous_findings = current_findings
            except Exception as e:
                print(f"❌ Monitor error: {e}")

            time.sleep(self.interval)

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