from app.config.security_config import SEVERITY_MAP


class LoggingScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):

        session = self.aws_session.session

        cloudtrail = session.client("cloudtrail", region_name=region)
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        # -------------------------
        # CloudTrail Disabled / Not Logging
        # -------------------------
        try:
            trails = cloudtrail.describe_trails()["trailList"]

            if len(trails) == 0:
                finding_id = "cloudtrail-disabled"

                if finding_id not in seen_ids:
                    seen_ids.add(finding_id)
                    findings.append({
                        "id": finding_id,
                        "type": "CLOUDTRAIL_DISABLED",
                        "severity": SEVERITY_MAP["CLOUDTRAIL_DISABLED"],
                        "resource_id": "account",
                        "region": region,
                        "description": "CloudTrail is not enabled for the AWS account"
                    })

            else:
                # 🔥 Check if logging is actually enabled
                status = cloudtrail.get_trail_status(Name=trails[0]["Name"])

                if not status.get("IsLogging", False):
                    finding_id = "cloudtrail-not-logging"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "CLOUDTRAIL_NOT_LOGGING",
                            "severity": SEVERITY_MAP.get("CLOUDTRAIL_DISABLED"),
                            "resource_id": "account",
                            "region": region,
                            "description": "CloudTrail exists but is not actively logging"
                        })

        except Exception as e:
            print("CloudTrail error:", str(e))

        # -------------------------
        # VPC Flow Logs Disabled
        # -------------------------
        try:
            vpcs = ec2.describe_vpcs()["Vpcs"]
            flow_logs = ec2.describe_flow_logs()["FlowLogs"]

            vpc_flow_log_map = {}

            for log in flow_logs:
                vpc_flow_log_map[log["ResourceId"]] = True

            for vpc in vpcs:
                vpc_id = vpc["VpcId"]

                if vpc_id not in vpc_flow_log_map:
                    finding_id = f"vpc-flowlogs-disabled-{vpc_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "VPC_FLOW_LOGS_DISABLED",
                            "severity": SEVERITY_MAP["VPC_FLOW_LOGS_DISABLED"],
                            "resource_id": vpc_id,
                            "region": region,
                            "description": "VPC does not have flow logs enabled"
                        })

        except Exception as e:
            print("VPC Flow Logs error:", str(e))

        return findings