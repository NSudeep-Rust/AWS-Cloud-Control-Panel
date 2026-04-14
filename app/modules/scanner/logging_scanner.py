from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


class LoggingScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session
        cloudtrail = session.client("cloudtrail", region_name=region)
        ec2        = session.client("ec2",        region_name=region)

        findings = []
        seen_ids = set()
        lock = threading.Lock()

        def _add(f):
            fid = f.get("id")
            if not fid:
                return
            with lock:
                if fid not in seen_ids:
                    seen_ids.add(fid)
                    findings.append(f)

        # ── Check 1: CloudTrail (trails fetched once, statuses in parallel) ──
        def check_cloudtrail():
            try:
                trails = cloudtrail.describe_trails().get("trailList", [])
                if not trails:
                    _add({
                        "id":          "cloudtrail-disabled",
                        "type":        "CLOUDTRAIL_DISABLED",
                        "severity":    SEVERITY_MAP["CLOUDTRAIL_DISABLED"],
                        "resource_id": "account",
                        "region":      region,
                        "description": "CloudTrail is not enabled for the AWS account",
                    })
                    return

                # Check all trail statuses concurrently
                def _check_trail_status(trail):
                    trail_name = trail["Name"]
                    trail_arn  = trail["TrailARN"]
                    home_region = trail.get("HomeRegion", region)
                    try:
                        status = cloudtrail.get_trail_status(Name=trail_arn)
                        if not status.get("IsLogging", False):
                            _add({
                                "id":          f"cloudtrail-not-logging-{trail_name}",
                                "type":        "CLOUDTRAIL_NOT_LOGGING",
                                "severity":    SEVERITY_MAP["CLOUDTRAIL_NOT_LOGGING"],
                                "resource_id": trail_name,
                                "region":      home_region,
                                "trail_arn":   trail_arn,
                                "description": f"CloudTrail '{trail_name}' is not actively logging",
                            })
                    except Exception as e:
                        print(f"Error checking trail {trail_name}:", e)

                with ThreadPoolExecutor(max_workers=min(len(trails), 10)) as pool:
                    futs = [pool.submit(_check_trail_status, t) for t in trails]
                    for fut in as_completed(futs):
                        try:
                            fut.result()
                        except Exception as e:
                            print(f"[LoggingScanner] trail status error in {region}:", e)

            except Exception as e:
                print("CloudTrail error:", e)

        # ── Check 2: VPC flow logs (vpcs + flow_logs fetched concurrently) ───
        def check_vpc_flow_logs():
            vpcs      = []
            flow_logs = []

            def _get_vpcs():
                try:
                    vpcs.extend(ec2.describe_vpcs().get("Vpcs", []))
                except Exception as e:
                    print("VPC describe error:", e)

            def _get_flow_logs():
                try:
                    flow_logs.extend(ec2.describe_flow_logs().get("FlowLogs", []))
                except Exception as e:
                    print("Flow logs describe error:", e)

            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda fn: fn(), [_get_vpcs, _get_flow_logs]))

            vpc_with_logs = {log["ResourceId"] for log in flow_logs}
            for vpc in vpcs:
                vpc_id = vpc["VpcId"]
                if vpc_id not in vpc_with_logs:
                    _add({
                        "id":          f"vpc-flowlogs-disabled-{vpc_id}",
                        "type":        "VPC_FLOW_LOGS_DISABLED",
                        "severity":    SEVERITY_MAP["CLOUDTRAIL_NOT_LOGGING"],
                        "resource_id": vpc_id,
                        "region":      region,
                        "description": "VPC does not have flow logs enabled",
                    })

        # ── Run both checks concurrently ─────────────────────────────────────
        with ThreadPoolExecutor(max_workers=2) as pool:
            futs = [pool.submit(check_cloudtrail), pool.submit(check_vpc_flow_logs)]
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception as e:
                    print(f"[LoggingScanner] check error in {region}:", e)

        return findings