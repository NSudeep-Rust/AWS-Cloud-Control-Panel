"""
VPC Misconfiguration Scanner
Detects default VPCs that still exist in each region.

AWS best practice: Delete the default VPC in every region — it comes with
permissive settings (public subnets, open NACLs, internet gateway) that create
unnecessary attack surface for accounts that don't need it.

Finding type : DEFAULT_VPC_EXISTS
Severity     : MEDIUM
Action       : DELETE_DEFAULT_VPC   (auto-fix — cascades all dependencies)
"""

from app.config.security_config import SEVERITY_MAP


class VPCScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        """Return DEFAULT_VPC_EXISTS findings for the given region."""
        findings = []

        try:
            ec2 = self.aws_session.session.client("ec2", region_name=region)
            vpcs = ec2.describe_vpcs(
                Filters=[{"Name": "isDefault", "Values": ["true"]}]
            )["Vpcs"]

            for vpc in vpcs:
                vpc_id = vpc["VpcId"]
                cidr   = vpc.get("CidrBlock", "unknown")

                subnet_count = len(
                    ec2.describe_subnets(
                        Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
                    )["Subnets"]
                )
                igw_count = len(
                    ec2.describe_internet_gateways(
                        Filters=[{"Name": "attachment.vpc-id", "Values": [vpc_id]}]
                    )["InternetGateways"]
                )

                findings.append({
                    "id":          f"default-vpc-{vpc_id}-{region}",
                    "type":        "DEFAULT_VPC_EXISTS",
                    "severity":    SEVERITY_MAP["DEFAULT_VPC_EXISTS"],
                    "resource_id": vpc_id,
                    "region":      region,
                    "description": (
                        f"Default VPC {vpc_id} ({cidr}) exists in {region} "
                        f"with {subnet_count} subnet(s) and {igw_count} IGW(s). "
                        "AWS best practice is to delete the default VPC to reduce attack surface."
                    ),
                    "cidr_block":    cidr,
                    "subnet_count":  subnet_count,
                    "igw_count":     igw_count,
                })

        except Exception as e:
            print(f"[VPCScanner] Error in region {region}: {e}")

        return findings
