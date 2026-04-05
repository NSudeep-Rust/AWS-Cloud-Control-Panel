from app.config.security_config import SEVERITY_MAP


class CloudWatchScanner:
    """
    Scans CloudWatch Log Groups for missing retention policies.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session
        logs = session.client("logs", region_name=region)

        findings = []
        seen_ids = set()

        # -------------------------
        # CLOUDWATCH LOG GROUP NO RETENTION
        # -------------------------
        try:
            paginator = logs.get_paginator("describe_log_groups")
            pages = paginator.paginate()

            for page in pages:
                for log_group in page.get("logGroups", []):
                    group_name = log_group["logGroupName"]
                    retention_days = log_group.get("retentionInDays")

                    # None means "Never expire" — no retention set
                    if retention_days is None:
                        finding_id = f"cloudwatch-no-retention-{group_name.replace('/', '-').strip('-')}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "CLOUDWATCH_LOG_GROUP_NO_RETENTION",
                                "severity": SEVERITY_MAP.get("CLOUDWATCH_LOG_GROUP_NO_RETENTION", "LOW"),
                                "resource_id": group_name,
                                "region": region,
                                "log_group_name": group_name,
                                "description": f"CloudWatch Log Group '{group_name}' has no retention policy (logs never expire)"
                            })

        except Exception as e:
            print(f"CloudWatch log group scan error ({region}):", str(e))

        return findings
