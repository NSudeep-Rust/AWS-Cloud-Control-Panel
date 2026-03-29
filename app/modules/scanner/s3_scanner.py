from app.config.security_config import SEVERITY_MAP


class S3Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        """
        Scan S3 buckets for security misconfigurations.
        """
        session = self.aws_session.session
        s3 = session.client("s3")  # ✅ FIXED (removed region)

        findings = []
        seen_ids = set()

        response = s3.list_buckets()

        for bucket in response.get("Buckets", []):
            bucket_name = bucket["Name"]

            # -------------------------
            # PUBLIC ACL
            # -------------------------
            try:
                acl = s3.get_bucket_acl(Bucket=bucket_name)

                for grant in acl.get("Grants", []):
                    grantee = grant.get("Grantee", {})
                    uri = grantee.get("URI", "")

                    if "AllUsers" in uri or "AuthenticatedUsers" in uri:
                        finding_id = f"s3-public-acl-{bucket_name}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "S3_PUBLIC_ACL",
                                "severity": "CRITICAL",
                                "resource_id": bucket_name,
                                "region": "global",
                                "description": "S3 bucket is publicly accessible via ACL",
                                "remediation": {
                                    "action": "REMOVE_PUBLIC_S3_ACL",
                                    "reason": "S3 bucket is publicly accessible via ACL",
                                    "recommended_fix": "Remove public access from bucket ACL",
                                    "severity": "CRITICAL"
                                }
                            })
                        break

            except Exception as e:
                print(f"S3 ACL error ({bucket_name}):", str(e))

            # -------------------------
            # ENCRYPTION
            # -------------------------
            try:
                s3.get_bucket_encryption(Bucket=bucket_name)

            except s3.exceptions.ClientError as e:
                error_code = e.response["Error"]["Code"]

                if error_code == "ServerSideEncryptionConfigurationNotFoundError":
                    finding_id = f"s3-no-encryption-{bucket_name}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "S3_NO_ENCRYPTION",
                            "severity": SEVERITY_MAP["S3_NO_ENCRYPTION"],
                            "resource_id": bucket_name,
                            "region": "global",
                            "description": "S3 bucket does not have default encryption enabled"
                        })

            # -------------------------
            # VERSIONING
            # -------------------------
            try:
                versioning = s3.get_bucket_versioning(Bucket=bucket_name)
                status = versioning.get("Status")

                if status != "Enabled":
                    finding_id = f"s3-versioning-disabled-{bucket_name}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "S3_VERSIONING_DISABLED",
                            "severity": SEVERITY_MAP["S3_VERSIONING_DISABLED"],
                            "resource_id": bucket_name,
                            "region": "global",
                            "description": "S3 bucket does not have versioning enabled",
                            "remediation": {
                                "action": "ENABLE_S3_VERSIONING",
                                "reason": "S3 bucket versioning is disabled",
                                "recommended_fix": "Enable versioning on the bucket",
                                "severity": "MEDIUM"
                            }
                        })

            except Exception as e:
                print(f"S3 versioning error ({bucket_name}):", str(e))

            # -------------------------
            # ACCESS LOGGING
            # -------------------------
            try:
                logging = s3.get_bucket_logging(Bucket=bucket_name)

                if "LoggingEnabled" not in logging:
                    finding_id = f"s3-access-logging-disabled-{bucket_name}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "S3_ACCESS_LOGGING_DISABLED",
                            "severity": "MEDIUM",
                            "resource_id": bucket_name,
                            "region": "global",
                            "description": "S3 bucket does not have access logging enabled",
                            "remediation": {
                                "action": "ENABLE_S3_ACCESS_LOGGING",
                                "reason": "S3 bucket access logging is disabled",
                                "recommended_fix": "Enable server access logging",
                                "severity": "MEDIUM"
                            }
                        })

            except Exception as e:
                print(f"S3 logging error ({bucket_name}):", str(e))

            # -------------------------
            # BLOCK PUBLIC ACCESS
            # -------------------------
            try:
                public_access = s3.get_public_access_block(Bucket=bucket_name)
                config = public_access["PublicAccessBlockConfiguration"]

                if not all(config.values()):
                    finding_id = f"s3-public-access-block-disabled-{bucket_name}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "S3_BLOCK_PUBLIC_ACCESS_DISABLED",
                            "severity": SEVERITY_MAP["S3_BLOCK_PUBLIC_ACCESS_DISABLED"],
                            "resource_id": bucket_name,
                            "region": "global",
                            "description": "S3 bucket does not have full block public access enabled",
                            "remediation": {
                                "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
                                "reason": "S3 bucket public access block is disabled",
                                "recommended_fix": "Enable block public access settings",
                                "severity": "HIGH"
                            }
                        })

            except Exception as e:
                print(f"S3 public access error ({bucket_name}):", str(e))

        return findings