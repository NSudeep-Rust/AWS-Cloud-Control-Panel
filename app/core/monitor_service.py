import threading
import time
import uuid
from app.modules.diff_engine.diff_engine import DiffEngine
from app.database.db import get_db
from app.database.models import FindingChange
from app.config.security_config import ALERT_SEVERITIES
from datetime import datetime
from app.database.models import Alert


class MonitorService:

    def __init__(self, monitor, interval=60):
        self.monitor = monitor
        self.interval = interval
        self.running = False
        self.thread = None
        self.previous_findings = None

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

                                    alert = Alert(
                                        id=str(uuid.uuid4()),
                                        finding_id=fid,
                                        message=f"New {severity} issue detected",
                                        severity=severity
                                    )
                                    db.add(alert)

                            db.commit()
                            db.close()

                            # ✅ SMART PRINT
                            if severities_triggered:
                                print(f"🚨 Alerts generated for: {', '.join(severities_triggered)}")
                            else:
                                print("ℹ️ No alert-worthy findings")

                        except Exception as alert_error:
                            print(f"❌ ALERT ERROR: {alert_error}")

                    except Exception as db_error:
                        print(f"❌ DB ERROR (diff store): {db_error}")

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