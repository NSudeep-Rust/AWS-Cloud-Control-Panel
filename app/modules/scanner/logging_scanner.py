from app.config.security_config import SEVERITY_MAP
import boto3


class LoggingScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):

        session = self.aws_session.session

        cloudtrail = session.client("cloudtrail")
        ec2 = session.client("ec2")
        s3 = session.client("s3")

        findings = []

        # -------------------------
        # CloudTrail Disabled
        # -------------------------

        trails = cloudtrail.describe_trails()["trailList"]

        if len(trails) == 0:

            findings.append({
                "id": "cloudtrail-disabled",
                "type": "CLOUDTRAIL_DISABLED",
                "severity": SEVERITY_MAP["CLOUDTRAIL_DISABLED"],
                "resource_id": "account",
                "description": "CloudTrail is not enabled for the AWS account"
            })

        # -------------------------
        # VPC Flow Logs Disabled
        # -------------------------

        vpcs = ec2.describe_vpcs()["Vpcs"]

        flow_logs = ec2.describe_flow_logs()["FlowLogs"]

        vpc_flow_log_map = {}

        for log in flow_logs:
            vpc_flow_log_map[log["ResourceId"]] = True

        for vpc in vpcs:

            vpc_id = vpc["VpcId"]

            if vpc_id not in vpc_flow_log_map:

                findings.append({
                    "id": f"vpc-flowlogs-disabled-{vpc_id}",
                    "type": "VPC_FLOW_LOGS_DISABLED",
                    "severity": SEVERITY_MAP["VPC_FLOW_LOGS_DISABLED"],
                    "resource_id": vpc_id,
                    "region": session.region_name,
                    "description": "VPC does not have flow logs enabled"
                })

        # -------------------------
        # S3 Access Logging Disabled
        # -------------------------

        buckets = s3.list_buckets()["Buckets"]

        for bucket in buckets:

            bucket_name = bucket["Name"]

            logging = s3.get_bucket_logging(Bucket=bucket_name)

            if "LoggingEnabled" not in logging:

                findings.append({
                    "id": f"s3-access-logging-disabled-{bucket_name}",
                    "type": "S3_ACCESS_LOGGING_DISABLED",
                    "severity": SEVERITY_MAP["S3_ACCESS_LOGGING_DISABLED"],
                    "resource_id": bucket_name,
                    "description": "S3 bucket does not have access logging enabled"
                })

        return findings