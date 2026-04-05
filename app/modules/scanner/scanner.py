from app.modules.scanner.s3_scanner import S3Scanner
from app.modules.scanner.ec2_scanner import EC2Scanner
from app.modules.scanner.logging_scanner import LoggingScanner
from app.modules.scanner.encryption_scanner import EncryptionScanner
from app.modules.scanner.network_scanner import NetworkScanner
from app.modules.scanner.rds_scanner import RDSScanner
from app.modules.scanner.sg_scanner import SGScanner
from app.modules.scanner.cloudwatch_scanner import CloudWatchScanner
from app.modules.scanner.iam_extra_scanner import IAMExtraScanner
from app.modules.iam_manager.iam_manager import IAMManager
from app.config.security_config import SEVERITY_MAP
import boto3
import uuid


class Scanner:
    """
    Main Orchestrator for all security scanners.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

        # Individual scanners — existing
        self.s3_scanner = S3Scanner(aws_session)
        self.ec2_scanner = EC2Scanner(aws_session)
        self.logging_scanner = LoggingScanner(aws_session)
        self.encryption_scanner = EncryptionScanner(aws_session)
        self.network_scanner = NetworkScanner(aws_session)

        # New scanners
        self.rds_scanner = RDSScanner(aws_session)
        self.sg_scanner = SGScanner(aws_session)
        self.cloudwatch_scanner = CloudWatchScanner(aws_session)
        self.iam_extra_scanner = IAMExtraScanner(aws_session)

        self.regions = self.get_all_regions()

        sts = self.aws_session.session.client("sts")
        self.account_id = sts.get_caller_identity()["Account"]

        # IAM handled separately
        self.iam_manager = IAMManager(aws_session)

    def get_all_regions(self):
        """
        Use centralized region control from AWSSession.
        """
        return self.aws_session.get_all_regions()

    def find_public_security_groups(self):
        """
        Detect public security groups (generic — all ports).
        """
        session = self.aws_session.session
        regions = self.regions
        findings = []

        for region in regions:
            print(f"   🌍 Processing: {region}")

            ec2 = session.client("ec2", region_name=region)

            try:
                response = ec2.describe_security_groups()
            except Exception:
                continue

            for sg in response["SecurityGroups"]:
                for permission in sg.get("IpPermissions", []):
                    for ip_range in permission.get("IpRanges", []):
                        if ip_range.get("CidrIp") == "0.0.0.0/0":

                            from_port = permission.get("FromPort")
                            to_port = permission.get("ToPort")
                            protocol = permission.get("IpProtocol")

                            port_range = (
                                f"{from_port}-{to_port}"
                                if from_port is not None and to_port is not None
                                else "ALL"
                            )

                            findings.append({
                                "id": f"PUBLIC_SECURITY_GROUP-{sg['GroupId']}-{region}",
                                "type": "PUBLIC_SECURITY_GROUP",
                                "severity": SEVERITY_MAP["PUBLIC_SECURITY_GROUP"],
                                "region": region,
                                "resource_id": sg["GroupId"],
                                "resource_name": sg["GroupName"],
                                "protocol": protocol,
                                "port_range": port_range,
                                "description": "Security group allows inbound traffic from 0.0.0.0/0"
                            })

        return findings

    def scan(self, region=None):
        """
        Run FULL AWS security scan (all modules).
        """

        # -------------------------
        # Existing scanners
        # -------------------------
        s3_findings = self.s3_scanner.scan()
        for f in s3_findings:
            f["region"] = "global"

        iam_findings = self.iam_manager.audit()

        ec2_findings = []
        logging_findings = []
        encryption_findings = []
        rds_findings = []
        sg_findings = []
        cloudwatch_findings = []

        for region in self.regions:

            # EC2
            try:
                ec2_findings.extend(self.ec2_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] EC2 scan failed in {region}: {e}")

            # Logging
            try:
                logging_findings.extend(self.logging_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] Logging scan failed in {region}: {e}")

            # Encryption
            try:
                encryption_findings.extend(self.encryption_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] Encryption scan failed in {region}: {e}")

            # RDS
            try:
                rds_findings.extend(self.rds_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] RDS scan failed in {region}: {e}")

            # SG / SSH / RDP / IMDSv1 / Snapshot Public
            try:
                sg_findings.extend(self.sg_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] SG/IMDSv1 scan failed in {region}: {e}")

            # CloudWatch
            try:
                cloudwatch_findings.extend(self.cloudwatch_scanner.scan(region))
            except Exception as e:
                print(f"[ERROR] CloudWatch scan failed in {region}: {e}")

        # Network (regional)
        network_findings = []
        for region in self.regions:
            try:
                regional_findings = self.network_scanner.scan(region=region)
                for f in regional_findings:
                    f["region"] = region
                network_findings.extend(regional_findings)
            except Exception as e:
                print(f"[ERROR] Network scan failed in {region}: {e}")

        # IAM extra (global — access key rotation)
        try:
            iam_extra_findings = self.iam_extra_scanner.scan()
        except Exception as e:
            print(f"[ERROR] IAM extra scan failed: {e}")
            iam_extra_findings = []

        # Firewall (generic SG — all ports)
        firewall_findings = self.find_public_security_groups()

        # -------------------------
        # Combine everything
        # -------------------------
        all_findings = []
        all_findings.extend(s3_findings)
        all_findings.extend(iam_findings)
        all_findings.extend(iam_extra_findings)
        all_findings.extend(ec2_findings)
        all_findings.extend(logging_findings)
        all_findings.extend(encryption_findings)
        all_findings.extend(network_findings)
        all_findings.extend(firewall_findings)
        all_findings.extend(rds_findings)
        all_findings.extend(sg_findings)
        all_findings.extend(cloudwatch_findings)

        # Fix null regions + attach account_id
        for f in all_findings:
            if not f.get("region"):
                f["region"] = "global"
            f["account_id"] = self.account_id

        # Deduplicate by finding id
        unique = {}
        for f in all_findings:
            key = f.get("id")
            unique[key] = f

        return list(unique.values())


def run_full_scan(aws_session, source="UNKNOWN"):
    scanner = Scanner(aws_session)
    findings = scanner.scan()
    total = len(findings)

    if source == "API":
        print(f"📊 [API] TOTAL FINDINGS: {total}")
    elif source == "MONITOR":
        print(f"📊 [MONITOR] TOTAL FINDINGS: {total}")

    return findings
