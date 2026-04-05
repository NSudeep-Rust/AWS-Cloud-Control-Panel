from app.config.security_config import SEVERITY_MAP
from datetime import datetime, timezone


class IAMExtraScanner:
    """
    Scans for IAM access keys not rotated in 90+ days.
    Separate from IAMManager to keep concerns clean.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):
        session = self.aws_session.session
        iam = session.client("iam")

        findings = []
        seen_ids = set()

        KEY_ROTATION_DAYS = 90

        try:
            users = iam.list_users().get("Users", [])

            for user in users:
                user_name = user["UserName"]

                try:
                    access_keys = iam.list_access_keys(
                        UserName=user_name
                    ).get("AccessKeyMetadata", [])

                    for key in access_keys:
                        key_id = key["AccessKeyId"]
                        status = key["Status"]
                        create_date = key["CreateDate"]

                        # Only check ACTIVE keys
                        if status != "Active":
                            continue

                        now = datetime.now(timezone.utc)
                        age_days = (now - create_date).days

                        if age_days >= KEY_ROTATION_DAYS:
                            finding_id = f"iam-key-not-rotated-{user_name}-{key_id}"

                            if finding_id not in seen_ids:
                                seen_ids.add(finding_id)
                                findings.append({
                                    "id": finding_id,
                                    "type": "IAM_ACCESS_KEY_NOT_ROTATED",
                                    "severity": SEVERITY_MAP.get("IAM_ACCESS_KEY_NOT_ROTATED", "HIGH"),
                                    "resource_id": user_name,
                                    "region": "global",
                                    "access_key_id": key_id,
                                    "age_days": age_days,
                                    "description": f"IAM access key '{key_id}' for user '{user_name}' has not been rotated in {age_days} days"
                                })

                except Exception as e:
                    print(f"IAM key rotation scan error ({user_name}):", str(e))

        except Exception as e:
            print("IAM extra scan error:", str(e))

        return findings
