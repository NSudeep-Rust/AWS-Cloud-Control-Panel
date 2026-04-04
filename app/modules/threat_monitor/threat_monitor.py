# (imports unchanged)
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
from app.modules.scanner.scanner import run_full_scan
from app.api.routes.scan_routes import run_scan
import uuid
from app.core.scan_storage import SCAN_STORAGE
import time
from datetime import datetime


class ThreatMonitor:

    def __init__(self, aws_session, execution_mode="DRY_RUN", live_approved=False):
        self.aws_session = aws_session
        self.regions = aws_session.get_all_regions()
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
    
    def _build_execution(self, remediation):
        action = remediation.get("action")

        if action == "NO_ACTION":
            return {
                "status": "INFO",
                "action": "MANUAL_REVIEW_REQUIRED",
                "message": "No automated fix available"
            }

        return {
            "status": "PLANNED",
            "action": action,
            "message": "Execution deferred"
        }

    def start(self):

        raw_findings = self.scanner.find_public_security_groups()

        grouped = {}
        for finding in raw_findings:
            key = (finding["resource_id"], finding["region"])

            if key not in grouped:
                grouped[key] = {
                    "id": f"PUBLIC_SECURITY_GROUP-{finding['resource_id']}-{finding['region']}",
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

        enriched_firewall_findings = []
        for finding in normalized_findings:
            finding["type"] = "PUBLIC_SECURITY_GROUP"

            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })

            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)

            enriched_firewall_findings.append(finding)


        # S3
        s3_findings = self.s3_scanner.scan()
        enriched_s3_findings = []
        for finding in s3_findings:
            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })
            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)
            enriched_s3_findings.append(finding)

     
        # EC2
        ec2_findings_raw = self.ec2_scanner.scan()

        enriched_ec2_findings = []

        for finding in ec2_findings_raw:
            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })

            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)

            enriched_ec2_findings.append(finding)

        # Logging
        logging_findings_raw = self.logging_scanner.scan()
        enriched_logging_findings = []
        for finding in logging_findings_raw:
            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })
            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)
            enriched_logging_findings.append(finding)

        # Encryption
        encryption_findings = self.encryption_scanner.scan()
        enriched_encryption_findings = []
        for finding in encryption_findings:

            if finding["type"] in [
                "EBS_DEFAULT_ENCRYPTION_DISABLED",
                "EBS_SNAPSHOT_NOT_ENCRYPTED"
            ]:
                finding["execution"] = {
                    "status": "INFO",
                    "action": "MANUAL_REVIEW_REQUIRED",
                    "message": "Manual review required"
                }
                enriched_encryption_findings.append(finding)
                continue

            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })

            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)

            enriched_encryption_findings.append(finding)

        # Network
        network_findings_raw = []
        for region in self.regions:
            findings = self.network_scanner.scan(region=region)
            for f in findings:
                f["region"] = region
            network_findings_raw.extend(findings)

        enriched_network_findings = []
        for finding in network_findings_raw:

            if finding["type"] in [
                "PUBLIC_SUBNET_DETECTED",
                "INTERNET_GATEWAY_ATTACHED",
                "VPC_WITHOUT_NAT_GATEWAY"
            ]:
                finding["execution"] = {
                    "status": "INFO",
                    "action": "MANUAL_REVIEW_REQUIRED",
                    "message": "Manual review required"
                }
                enriched_network_findings.append(finding)
                continue

            remediation = self.remediation_planner.plan({
                "type": finding["type"],
                "severity": finding["severity"]
            })

            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)

            enriched_network_findings.append(finding)

        raw_iam_findings = self.iam_manager.audit()

        enriched_iam_findings = []

        for finding in raw_iam_findings:

            if finding["type"] in [
                "IAM_PASSWORD_NEVER_EXPIRES",
                "IAM_PASSWORD_POLICY_MISSING",
                "IAM_POLICY_FULL_ADMIN",
                "IAM_USER_WITHOUT_MFA",
                "IAM_MULTIPLE_ACCESS_KEYS",
                "IAM_UNUSED_USER",
                "IAM_ROLE_ADMIN_POLICY"
            ]:
                finding["execution"] = {
                    "status": "INFO",
                    "action": "MANUAL_REVIEW_REQUIRED",
                    "message": "Manual review required"
                }
                enriched_iam_findings.append(finding)
                continue

            remediation = self.remediation_planner.plan({
                "type": finding.get("type"),
                "severity": finding.get("severity")
            })

            finding["remediation"] = remediation
            finding["execution"] = self._build_execution(remediation)

            enriched_iam_findings.append(finding)


        # Combine
        all_findings = (
            enriched_firewall_findings +
            enriched_s3_findings +
            enriched_ec2_findings +
            enriched_logging_findings +
            enriched_encryption_findings +
            enriched_network_findings +
            enriched_iam_findings
        )

        # Dedup
        seen = set()
        deduped = []
        for f in all_findings:
            if f["id"] not in seen:
                seen.add(f["id"])
                deduped.append(f)
        all_findings = deduped

        for f in all_findings:
            if not f.get("region"):
                f["region"] = "global"

        # 🔥 Conflict resolution
        resource_map = {}
        for f in all_findings:
            key = f"{f['resource_id']}:{f['region']}"
            resource_map.setdefault(key, []).append(f)

        final_findings = []
        for findings in resource_map.values():
            delete_finding = next(
                (f for f in findings if f.get("remediation", {}).get("action") == "DELETE_UNUSED_SECURITY_GROUP"),
                None
            )
            if delete_finding:
                final_findings.append(delete_finding)
            else:
                final_findings.extend(findings)

        # ✅ FIXED: evaluate FINAL findings
        policy_results = self.policy_engine.evaluate(final_findings)

        # Policy violations
        policy_violations = []
        for v in policy_results:
            policy_violations.append({
                "policy_id": v["policy_id"],
                "policy_name": v["policy_name"],
                "severity": v["severity"],
                "enforcement": v["enforcement"],
                "resource_id": v["resource_id"]
            })

        # Risk score
        weights = {"CRITICAL": 20, "HIGH": 10, "MEDIUM": 5, "LOW": 1}
        risk_score = sum(weights.get(v["severity"], 0) for v in policy_violations)
        security_score = max(0, 100 - risk_score)

        # -------------------------
        # ✅ FINAL RETURN (CORRECT)
        # -------------------------
        def filter_by_types(findings, types):
            return [f for f in findings if f.get("type") in types]

        result = {
            "public_security_groups": filter_by_types(final_findings, ["PUBLIC_SECURITY_GROUP"]),
            "s3_findings": filter_by_types(final_findings, ["S3_PUBLIC_ACL","S3_NO_ENCRYPTION","S3_VERSIONING_DISABLED","S3_ACCESS_LOGGING_DISABLED","S3_BLOCK_PUBLIC_ACCESS_DISABLED"]),
            "ec2_findings": filter_by_types(final_findings, ["PUBLIC_EC2_INSTANCE","EC2_WITHOUT_IAM_ROLE","EC2_DEFAULT_SECURITY_GROUP","EC2_TERMINATION_PROTECTION_DISABLED","EBS_UNENCRYPTED_VOLUME","EC2_PUBLIC_ELASTIC_IP"]),
            "logging_findings": filter_by_types(final_findings, ["CLOUDTRAIL_DISABLED","CLOUDTRAIL_NOT_LOGGING","VPC_FLOW_LOGS_DISABLED"]),
            "encryption_findings": filter_by_types(final_findings, ["EBS_DEFAULT_ENCRYPTION_DISABLED","S3_BUCKET_ENCRYPTION_DISABLED","KMS_KEY_ROTATION_DISABLED","EBS_SNAPSHOT_NOT_ENCRYPTED","RDS_STORAGE_NOT_ENCRYPTED"]),
            "iam_findings": filter_by_types(final_findings, ["IAM_PASSWORD_NEVER_EXPIRES","IAM_PASSWORD_POLICY_MISSING","IAM_ADMIN_USER","IAM_POLICY_FULL_ADMIN","IAM_USER_WITHOUT_MFA","IAM_ACCESS_KEY_UNUSED","IAM_MULTIPLE_ACCESS_KEYS","IAM_UNUSED_USER","REMOVE_INLINE_POLICY","REMOVE_INLINE_WILDCARD_POLICY","IAM_ROLE_ADMIN_POLICY","IAM_ROLE_EXTERNAL_TRUST"]),
            "network_findings": filter_by_types(final_findings, ["UNUSED_SECURITY_GROUP","PUBLIC_SUBNET_DETECTED","ROUTE_TABLE_PUBLIC_ROUTE","NACL_ALLOW_ALL_INBOUND","NACL_ALLOW_ALL_OUTBOUND","INTERNET_GATEWAY_ATTACHED","VPC_WITHOUT_NAT_GATEWAY"]),
            "policy_violations": policy_violations,
            "risk_summary": {
                "security_score": security_score,
                "total_violations": len(policy_violations)
            }
        }

        return result

    def run_once(self):
        print("\n" + "-"*55)
        print(f"\n📡 MONITOR SCAN STARTED at {datetime.utcnow().isoformat()}")
        print("-"*55)

        findings = run_full_scan(self.aws_session, source="MONITOR")

        print(f"📡 MONITOR FINAL TOTAL: {len(findings)} at {datetime.utcnow().isoformat()}")

        print("-"*55)
        print(f"📡 MONITOR SCAN COMPLETED at {datetime.utcnow().isoformat()}")
        print("-"*55 + "\n")

        return findings