from app.modules.scanner.s3_scanner import S3Scanner
from app.modules.scanner.ec2_scanner import EC2Scanner
from app.modules.scanner.logging_scanner import LoggingScanner
from app.modules.scanner.encryption_scanner import EncryptionScanner
from app.modules.scanner.network_scanner import NetworkScanner
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

        # Individual scanners
        self.s3_scanner = S3Scanner(aws_session)
        self.ec2_scanner = EC2Scanner(aws_session)
        self.logging_scanner = LoggingScanner(aws_session)
        self.encryption_scanner = EncryptionScanner(aws_session)
        self.network_scanner = NetworkScanner(aws_session)
        self.regions = self.get_all_regions()
        sts = boto3.client("sts")
        self.account_id = sts.get_caller_identity()["Account"]

        # IAM handled separately (IMPORTANT)
        self.iam_manager = IAMManager(aws_session)

    def get_all_regions(self):
        """
        Use centralized region control from AWSSession.
        """
        return self.aws_session.get_all_regions()

    def find_public_security_groups(self):
        """
        Detect public security groups.
        """
        session = self.aws_session.session
        regions = self.regions
        findings = []

        for region in regions:
            print("Scanning region:", region)

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
        # Run all scanners
        # -------------------------
        s3_findings = self.s3_scanner.scan()
        # ✅ enforce global region
        for f in s3_findings:
            f["region"] = "global"
        iam_findings = self.iam_manager.audit()   # ✅ FIXED
        ec2_findings = self.ec2_scanner.scan()
        logging_findings = self.logging_scanner.scan()
        encryption_findings = self.encryption_scanner.scan()
        network_findings = []

        for region in self.regions:

            try:
                regional_findings = self.network_scanner.scan(region=region)

                # attach region if missing
                for f in regional_findings:
                    f["region"] = region

                network_findings.extend(regional_findings)

            except Exception as e:
                print(f"[ERROR] Network scan failed in {region}: {e}")
        firewall_findings = self.find_public_security_groups()

        # -------------------------
        # Combine everything
        # -------------------------
        all_findings = []

        all_findings.extend(s3_findings)
        all_findings.extend(iam_findings)
        all_findings.extend(ec2_findings)
        all_findings.extend(logging_findings)
        all_findings.extend(encryption_findings)
        all_findings.extend(network_findings)
        all_findings.extend(firewall_findings)

        # ✅ fix null regions
        for f in all_findings:
            if not f.get("region"):
                f["region"] = "global"
            f["account_id"] = self.account_id   # 🔥 ADD THIS LINE

        unique = {}

        for f in all_findings:
            key = f.get("id")
            unique[key] = f

        return list(unique.values())