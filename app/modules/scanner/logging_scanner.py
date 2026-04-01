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
                for trail in trails:

                    trail_name = trail["Name"]
                    trail_arn = trail["TrailARN"]
                    home_region = trail.get("HomeRegion", region)

                    try:
                        status = cloudtrail.get_trail_status(Name=trail_arn)

                        if not status.get("IsLogging", False):

                            finding_id = f"cloudtrail-not-logging-{trail_name}"

                            if finding_id not in seen_ids:
                                seen_ids.add(finding_id)

                                findings.append({
                                    "id": finding_id,
                                    "type": "CLOUDTRAIL_NOT_LOGGING",
                                    "severity": SEVERITY_MAP["CLOUDTRAIL_NOT_LOGGING"], 
                                    "resource_id": trail_name,
                                    "region": home_region,
                                    "trail_arn": trail_arn, 
                                    "description": f"CloudTrail '{trail_name}' is not actively logging"
                                })

                    except Exception as e:
                        print(f"Error checking trail {trail_name}:", str(e))

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
                            "severity": SEVERITY_MAP["CLOUDTRAIL_NOT_LOGGING"],
                            "resource_id": vpc_id,
                            "region": region,
                            "description": "VPC does not have flow logs enabled"
                        })

        except Exception as e:
            print("VPC Flow Logs error:", str(e))

        return findings