from app.config.security_config import SEVERITY_MAP
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed


class IAMExtraScanner:
    """
    Scans for IAM access keys not rotated in 90+ days.
    Parallelized — all per-user checks run concurrently via ThreadPoolExecutor.
    """

    KEY_ROTATION_DAYS = 90

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def _check_user(self, iam, user):
        """Return list of findings for a single IAM user (called concurrently)."""
        user_name = user["UserName"]
        results = []
        try:
            access_keys = iam.list_access_keys(UserName=user_name).get("AccessKeyMetadata", [])
            now = datetime.now(timezone.utc)
            for key in access_keys:
                if key["Status"] != "Active":
                    continue
                age_days = (now - key["CreateDate"]).days
                if age_days >= self.KEY_ROTATION_DAYS:
                    key_id = key["AccessKeyId"]
                    results.append({
                        "id":          f"iam-key-not-rotated-{user_name}-{key_id}",
                        "type":        "IAM_ACCESS_KEY_NOT_ROTATED",
                        "severity":    SEVERITY_MAP.get("IAM_ACCESS_KEY_NOT_ROTATED", "HIGH"),
                        "resource_id": user_name,
                        "region":      "global",
                        "access_key_id": key_id,
                        "age_days":    age_days,
                        "description": (
                            f"IAM access key '{key_id}' for user '{user_name}' "
                            f"has not been rotated in {age_days} days"
                        ),
                    })
        except Exception as e:
            print(f"IAM key rotation scan error ({user_name}): {e}")
        return results

    def scan(self):
        session = self.aws_session.session
        iam     = session.client("iam")
        findings = []
        seen_ids = set()

        try:
            users = iam.list_users().get("Users", [])
            if not users:
                return findings

            # 8 workers avoids IAM API throttling (rate limit ~10 req/s)
            # 20 workers caused ThrottlingException + exponential backoff = 20s+
            max_w = min(len(users), 8)
            with ThreadPoolExecutor(max_workers=max_w) as pool:
                futs = [pool.submit(self._check_user, iam, u) for u in users]
                for fut in as_completed(futs):
                    for f in fut.result():
                        if f["id"] not in seen_ids:
                            seen_ids.add(f["id"])
                            findings.append(f)

        except Exception as e:
            print("IAM extra scan error:", e)

        return findings
