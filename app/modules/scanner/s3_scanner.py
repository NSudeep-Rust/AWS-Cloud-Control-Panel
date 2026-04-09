from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed


class S3Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def _scan_bucket(self, s3, bucket_name):
        """Run all 5 security checks for a single bucket concurrently."""
        findings = []
        seen_ids = set()

        def add(f):
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                findings.append(f)

        def check_acl():
            try:
                acl = s3.get_bucket_acl(Bucket=bucket_name)
                for grant in acl.get("Grants", []):
                    uri = grant.get("Grantee", {}).get("URI", "")
                    if "AllUsers" in uri or "AuthenticatedUsers" in uri:
                        add({
                            "id": f"s3-public-acl-{bucket_name}",
                            "type": "S3_PUBLIC_ACL",
                            "severity": "CRITICAL",
                            "resource_id": bucket_name,
                            "region": "global",
                            "description": "S3 bucket is publicly accessible via ACL",
                        })
                        break
            except Exception:
                pass

        def check_encryption():
            try:
                s3.get_bucket_encryption(Bucket=bucket_name)
            except Exception as e:
                code = getattr(e, 'response', {}).get("Error", {}).get("Code", "")
                if code == "ServerSideEncryptionConfigurationNotFoundError":
                    add({
                        "id": f"s3-no-encryption-{bucket_name}",
                        "type": "S3_NO_ENCRYPTION",
                        "severity": SEVERITY_MAP["S3_NO_ENCRYPTION"],
                        "resource_id": bucket_name,
                        "region": "global",
                        "description": "S3 bucket does not have default encryption enabled",
                    })

        def check_versioning():
            try:
                status = s3.get_bucket_versioning(Bucket=bucket_name).get("Status")
                if status != "Enabled":
                    add({
                        "id": f"s3-versioning-disabled-{bucket_name}",
                        "type": "S3_VERSIONING_DISABLED",
                        "severity": SEVERITY_MAP["S3_VERSIONING_DISABLED"],
                        "resource_id": bucket_name,
                        "region": "global",
                        "description": "S3 bucket does not have versioning enabled",
                    })
            except Exception:
                pass

        def check_logging():
            try:
                resp = s3.get_bucket_logging(Bucket=bucket_name)
                if "LoggingEnabled" not in resp:
                    add({
                        "id": f"s3-access-logging-disabled-{bucket_name}",
                        "type": "S3_ACCESS_LOGGING_DISABLED",
                        "severity": "MEDIUM",
                        "resource_id": bucket_name,
                        "region": "global",
                        "description": "S3 bucket does not have access logging enabled",
                    })
            except Exception:
                pass

        def check_public_access():
            try:
                config = s3.get_public_access_block(Bucket=bucket_name)["PublicAccessBlockConfiguration"]
                if not all(config.values()):
                    add({
                        "id": f"s3-public-access-block-disabled-{bucket_name}",
                        "type": "S3_BLOCK_PUBLIC_ACCESS_DISABLED",
                        "severity": SEVERITY_MAP["S3_BLOCK_PUBLIC_ACCESS_DISABLED"],
                        "resource_id": bucket_name,
                        "region": "global",
                        "description": "S3 bucket does not have full block public access enabled",
                    })
            except Exception:
                pass

        # Run all 5 checks for this bucket concurrently (was sequential)
        checks = [check_acl, check_encryption, check_versioning, check_logging, check_public_access]
        with ThreadPoolExecutor(max_workers=5) as pool:
            futs = [pool.submit(fn) for fn in checks]
            for f in as_completed(futs):
                f.result()  # exceptions already swallowed inside each check

        return findings

    def scan(self, region=None):
        session = self.aws_session.session
        s3 = session.client("s3")

        try:
            buckets = s3.list_buckets().get("Buckets", [])
        except Exception as e:
            print(f"[S3Scanner] list_buckets failed: {e}")
            return []

        if not buckets:
            return []

        # Process all buckets in parallel (was fully sequential)
        all_findings = []
        with ThreadPoolExecutor(max_workers=min(len(buckets), 10)) as pool:
            future_map = {pool.submit(self._scan_bucket, s3, b["Name"]): b["Name"] for b in buckets}
            for fut in as_completed(future_map):
                try:
                    all_findings.extend(fut.result())
                except Exception as e:
                    print(f"[S3Scanner] bucket scan error ({future_map[fut]}): {e}")

        return all_findings