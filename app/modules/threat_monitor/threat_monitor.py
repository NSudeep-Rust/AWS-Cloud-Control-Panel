from app.modules.scanner.scanner import Scanner
from app.modules.remediation.planner import RemediationPlanner
from app.modules.protection_history.history import ProtectionHistory
from app.modules.remediation.executor import RemediationExecutor
from app.modules.iam_manager.iam_manager import IAMManager
from app.config.security_config import LIVE_EXECUTION_APPROVED_BY_USER
from app.modules.policy_engine.policy_engine import PolicyEngine
from app.modules.scanner.s3_scanner import S3Scanner
from app.modules.scanner.ec2_scanner import EC2Scanner
from app.modules.scanner.logging_scanner import LoggingScanner
from app.modules.scanner.encryption_scanner import EncryptionScanner
from app.modules.scanner.network_scanner import NetworkScanner
import uuid
from app.core.scan_storage import SCAN_STORAGE


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
        self.policy_engine = PolicyEngine()
        self.s3_scanner = S3Scanner(aws_session)
        self.ec2_scanner = EC2Scanner(aws_session)
        self.logging_scanner = LoggingScanner(aws_session)
        self.encryption_scanner = EncryptionScanner(aws_session)
        self.network_scanner = NetworkScanner(aws_session)




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
                        "id": f"sg-{finding['resource_id']}-{str(uuid.uuid4())[:6]}", 
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

                # ✅ ADD THIS LINE
                finding["type"] = "PUBLIC_SECURITY_GROUP"

                remediation = self.remediation_planner.plan({
                    "type": finding["type"],
                    "severity": finding["severity"]
                })

                finding["remediation"] = remediation

                execution = {
                    "status": "PLANNED",
                    "action": remediation.get("action"),
                    "message": "Execution deferred"
                }

                finding["execution"] = execution

                enriched_firewall_findings.append(finding)

            # -------------------------
            #  S3 Scan
            # -------------------------
            s3_findings = self.s3_scanner.scan()

            enriched_s3_findings = []

            for finding in s3_findings:

                remediation = self.remediation_planner.plan({
                    "type": finding["type"],
                    "severity": finding["severity"]
                })

                finding["remediation"] = remediation

                execution = {
                    "status": "PLANNED",
                    "action": remediation.get("action"),
                    "message": "Execution deferred"
                }

                finding["execution"] = execution

                enriched_s3_findings.append(finding)






            # -------------------------
            # EC2 Scan
            # -------------------------
            ec2_findings = self.ec2_scanner.scan()



            # -------------------------
            # Logging Scan
            # -------------------------
            logging_findings = self.logging_scanner.scan()


            # -------------------------
            # encryption findings
            # -------------------------

            encryption_findings = self.encryption_scanner.scan()

            # -------------------------
            # network findings
            # -------------------------

            network_findings = self.network_scanner.scan()


            # -------------------------
            # 4️⃣ IAM Audit + Remediation
            # -------------------------
            raw_iam_findings = self.iam_manager.audit()

            # -------------------------
            # Combine all findings for policy evaluation
            # -------------------------
            all_findings = []

            for finding in enriched_firewall_findings:
                finding["type"] = "PUBLIC_SECURITY_GROUP"
                all_findings.append(finding)

            for finding in enriched_s3_findings:
                all_findings.append(finding)

            for finding in ec2_findings:
                all_findings.append(finding)

            for finding in logging_findings:
                all_findings.append(finding)

            for finding in encryption_findings:
                all_findings.append(finding)

            for finding in network_findings:
                all_findings.append(finding)



            for finding in raw_iam_findings:
                all_findings.append(finding)

            # -------------------------
            #  Policy Engine Evaluation
            # -------------------------
            policy_results = self.policy_engine.evaluate(all_findings)
            print("Policy violations detected:", policy_results)
            # -------------------------
            # Build policy violation report
            # -------------------------
            policy_violations = []

            for violation in policy_results:
                policy_violations.append({
                    "policy_id": violation["policy_id"],
                    "policy_name": violation["policy_name"],
                    "severity": violation["severity"],
                    "enforcement": violation["enforcement"],
                    "resource_id": violation["resource_id"]
                })

            # -------------------------
            # Calculate risk score
            # -------------------------
            severity_weights = {
                "CRITICAL": 20,
                "HIGH": 10,
                "MEDIUM": 5,
                "LOW": 1
            }

            risk_score = 0

            for violation in policy_violations:
                severity = violation.get("severity", "LOW").strip().upper()
                risk_score += severity_weights.get(severity, 0)

            security_score = max(0, 100 - risk_score)



            enriched_iam_findings = []

            for finding in raw_iam_findings:

                remediation = self.remediation_planner.plan({
                    "type": finding["type"],
                    "severity": finding["severity"]
                })

                finding["remediation"] = remediation

                # Check policy enforcement
                enforcement = "AUTO_FIX"

                for violation in policy_results:
                    if violation["resource_id"] == finding["resource_id"]:
                        enforcement = violation["enforcement"]

                if enforcement == "AUTO_FIX":
                    execution = {
                        "status": "PLANNED",
                        "action": remediation.get("action"),
                        "message": "Execution deferred"
                    }
                else:
                    execution = {
                        "status": "BLOCKED_BY_POLICY",
                        "reason": f"Policy requires {enforcement}",
                        "action": remediation.get("action")
                    }

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
            result = {
                "public_security_groups": enriched_firewall_findings,
                "s3_findings": enriched_s3_findings,
                "ec2_findings": ec2_findings,
                "logging_findings": logging_findings,
                "encryption_findings": encryption_findings,
                "iam_findings": enriched_iam_findings,
                "network_findings": network_findings,
                "policy_violations": policy_violations,
                "risk_summary": {
                    "security_score": security_score,
                    "total_violations": len(policy_violations)
                }
            }

            return result