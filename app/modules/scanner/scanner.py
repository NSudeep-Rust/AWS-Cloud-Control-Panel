from app.modules.scanner.s3_scanner import S3Scanner
from app.modules.scanner.iam_scanner import IAMScanner
from app.modules.scanner.ec2_scanner import EC2Scanner
from app.modules.scanner.security_group_scanner import SecurityGroupScanner
from app.modules.scanner.logging_scanner import LoggingScanner
from app.modules.scanner.encryption_scanner import EncryptionScanner
from app.modules.scanner.network_scanner import NetworkScanner



class Scanner:
    """
    Placeholder for security scanning logic.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

        self.s3_scanner = S3Scanner(aws_session)
        self.iam_scanner = IAMScanner(aws_session)
        self.ec2_scanner = EC2Scanner(aws_session)
        self.security_group_scanner = SecurityGroupScanner(aws_session)
        self.logging_scanner = LoggingScanner(aws_session)
        self.encryption_scanner = EncryptionScanner(aws_session)
        self.network_scanner = NetworkScanner(aws_session)


    def run(self):
        """
        Run all scanners.
        """

        findings = []

        # S3 Scanner
        s3_findings = self.s3_scanner.scan()
        findings.extend(s3_findings)

        return findings

    def get_all_regions(self):
        """
        Fetch all available AWS regions.
        """
        session = self.aws_session.session
        ec2 = session.client("ec2", region_name="us-east-1")

        response = ec2.describe_regions(AllRegions=True)

        return [region["RegionName"] for region in response["Regions"]]


    def find_public_security_groups(self):
        """
        Detect security groups with inbound rules open to the world.
        """
        session = self.aws_session.session
        regions = self.get_all_regions()
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
                                "id": f"public-sg-{sg['GroupId']}",
                                "type": "PUBLIC_SECURITY_GROUP",
                                "severity": "HIGH",
                                "region": region,
                                "resource_id": sg["GroupId"],
                                "resource_name": sg["GroupName"],
                                "protocol": protocol,
                                "port_range": port_range,
                                "description": "Security group allows inbound traffic from 0.0.0.0/0"
                            })
        return findings
