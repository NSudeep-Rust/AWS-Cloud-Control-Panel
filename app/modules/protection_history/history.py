import json
import os
from datetime import datetime


class ProtectionHistory:
    """
    Stores security findings and remediation decisions.
    """

    def __init__(self):
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        self.file_path = os.path.join(BASE_DIR, "database", "history.json")

        if not os.path.exists(self.file_path):
            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            with open(self.file_path, "w") as f:
                json.dump([], f)

    def record_event(self, event_type, findings):

        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "count": len(findings),
            "details": findings
        }

        if os.path.exists(self.file_path):
            with open(self.file_path, "r") as f:
                data = json.load(f)
        else:
            data = []

        data.append(record)

        with open(self.file_path, "w") as f:
            json.dump(data, f, indent=2)

    def read_history(self):
        """
        Read all stored security events.
        """
        if not os.path.exists(self.file_path):
            return []

        with open(self.file_path, "r") as f:
            return json.load(f)

    def has_execution(self, resource_id, action, region):
        """
        Check if a remediation action was already EXECUTED (not DRY_RUN)
        for a given resource.
        """
        for event in self.read_history():
            for detail in event.get("details", []):
                execution = detail.get("execution")
                if not execution:
                    continue

                if (
                    execution.get("resource_id") == resource_id
                    and execution.get("action") == action
                    and execution.get("region") == region 
                    and execution.get("status") == "EXECUTED"
                ):
                    return True

        return False

    def record_execution(self, execution_data: dict):
        """
        Persist a LIVE execution for rollback and idempotency checks.
        """

        record = {
            "timestamp": execution_data.get("timestamp"),
            "event_type": "REMEDIATION_EXECUTION",
            "count": 1,
            "details": [
                {
                    "execution": {
                        "execution_id": execution_data.get("execution_id"),
                        "resource_id": execution_data.get("resource_id"),
                        "region": execution_data.get("region"),
                        "action": execution_data.get("action"),
                        "status": "EXECUTED",
                        "snapshot_before": execution_data.get("snapshot_before"),
                        "revoked_rules": execution_data.get("revoked_rules"),
                        "timestamp": execution_data.get("timestamp")
                    }
                }
            ]
        }

        history = self.read_history()
        history.append(record)

        with open(self.file_path, "w") as f:
            json.dump(history, f, indent=2)