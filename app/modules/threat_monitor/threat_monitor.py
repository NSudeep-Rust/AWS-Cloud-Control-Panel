from app.modules.scanner.scanner import Scanner
from app.modules.remediation.planner import RemediationPlanner
from app.modules.protection_history.history import ProtectionHistory
from app.modules.remediation.executor import RemediationExecutor
from app.modules.iam_manager.iam_manager import IAMManager
from app.config.security_config import LIVE_EXECUTION_APPROVED_BY_USER




class ThreatMonitor:
    """
    Coordinates security checks over time.
    """

    def __init__(self, aws_session, execution_mode="DRY_RUN", live_approved=False):
        self.aws_session = aws_session
        self.scanner = Scanner(aws_session)
        self.remediation_planner = RemediationPlanner()
        self.history = ProtectionHistory()
        self.executor = RemediationExecutor(
            aws_session=aws_session,
            history=self.history,
            execution_mode=execution_mode
        )
        self.live_approved = live_approved
        self.iam_manager = IAMManager(aws_session)




    def start(self):
            """
            Full monitoring lifecycle:
            """

            # -------------------------
            # 1️⃣ Scan Firewall
            # -------------------------
            raw_findings = self.scanner.find_public_security_groups()

            # -------------------------
            # 2️⃣ Normalize Firewall Findings
            # -------------------------
            grouped = {}

            for finding in raw_findings:
                key = (finding["resource_id"], finding["region"])

                if key not in grouped:
                    grouped[key] = {
                        "resource_id": finding["resource_id"],
                        "resource_name": finding["resource_name"],
                        "region": finding["region"],
                        "severity": finding["severity"],
                        "protocols": set(),
                        "ports": set(),
                        "description": finding["description"],
                    }

                grouped[key]["protocols"].add(finding["protocol"])
                grouped[key]["ports"].add(finding["port_range"])

            normalized_findings = []

            for item in grouped.values():
                item["protocols"] = list(item["protocols"])
                item["ports"] = list(item["ports"])
                normalized_findings.append(item)

            # -------------------------
            # 3️⃣ Firewall Remediation
            # -------------------------
            enriched_firewall_findings = []

            for finding in normalized_findings:

                remediation = self.remediation_planner.plan({
                    "type": "PUBLIC_SECURITY_GROUP",
                    "severity": finding["severity"]
                })

                finding["remediation"] = remediation
                execution = self.executor.execute(finding)
                finding["execution"] = execution

                enriched_firewall_findings.append(finding)

            # -------------------------
            # 4️⃣ IAM Audit + Remediation
            # -------------------------
            raw_iam_findings = self.iam_manager.audit()

            enriched_iam_findings = []

            for finding in raw_iam_findings:

                remediation = self.remediation_planner.plan({
                    "type": finding["type"],
                    "severity": finding["severity"]
                })

                finding["remediation"] = remediation
                execution = self.executor.execute(finding)
                finding["execution"] = execution

                enriched_iam_findings.append(finding)

            # -------------------------
            # 5️⃣ Persist History
            # -------------------------
            if enriched_firewall_findings:
                self.history.record_event(
                    event_type="public_security_groups",
                    findings=enriched_firewall_findings
                )

            if enriched_iam_findings:
                self.history.record_event(
                    event_type="iam_findings",
                    findings=enriched_iam_findings
                )

            # -------------------------
            # 6️⃣ Return Result
            # -------------------------
            return {
                "public_security_groups": enriched_firewall_findings,
                "iam_findings": enriched_iam_findings
            }