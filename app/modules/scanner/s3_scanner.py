from app.config.security_config import SEVERITY_MAP
class S3Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):
        """
        Scan S3 buckets for security misconfigurations.
        """
        session = self.aws_session.session
        s3 = session.client("s3", region_name="us-east-1")

        findings = []

        response = s3.list_buckets()

        for bucket in response.get("Buckets", []):
            bucket_name = bucket["Name"]

            try:
                acl = s3.get_bucket_acl(Bucket=bucket_name)

                for grant in acl.get("Grants", []):
                    grantee = grant.get("Grantee", {})

                    if grantee.get("URI") in [
                        "http://acs.amazonaws.com/groups/global/AllUsers",
                        "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"
                    ]:

                        findings.append({
                            "id": f"public-s3-acl-{bucket_name}",
                            "type": "PUBLIC_S3_BUCKET",
                            "severity": SEVERITY_MAP["PUBLIC_S3_BUCKET"],
                            "resource_id": bucket_name,
                            "description": "S3 bucket is publicly accessible via ACL"
                        })

                        break

            except Exception:
                # Some buckets may deny ACL access
                pass

            # -------------------------
            # Check: Bucket Encryption
            # -------------------------
            try:
                encryption = s3.get_bucket_encryption(Bucket=bucket_name)

            except s3.exceptions.ClientError as e:
                error_code = e.response["Error"]["Code"]

                if error_code == "ServerSideEncryptionConfigurationNotFoundError":
                    findings.append({
                        "id": f"s3-no-encryption-{bucket_name}",
                        "type": "S3_NO_ENCRYPTION",
                        "severity": SEVERITY_MAP["S3_NO_ENCRYPTION"],
                        "resource_id": bucket_name,
                        "description": "S3 bucket does not have default encryption enabled"
                    })


            # -------------------------
            # Check: Bucket Versioning
            # -------------------------
            try:
                versioning = s3.get_bucket_versioning(Bucket=bucket_name)

                status = versioning.get("Status")

                if status != "Enabled":
                    findings.append({
                        "id": f"s3-versioning-disabled-{bucket_name}",
                        "type": "S3_VERSIONING_DISABLED",
                        "severity": SEVERITY_MAP["S3_VERSIONING_DISABLED"],
                        "resource_id": bucket_name,
                        "description": "S3 bucket does not have versioning enabled"
                    })

            except Exception:
                pass


            # -------------------------
            # Check: Bucket Logging
            # -------------------------
            try:
                logging = s3.get_bucket_logging(Bucket=bucket_name)

                if "LoggingEnabled" not in logging:
                    findings.append({
                        "id": f"s3-logging-disabled-{bucket_name}",
                        "type": "S3_LOGGING_DISABLED",
                        "severity": SEVERITY_MAP["S3_LOGGING_DISABLED"],
                        "resource_id": bucket_name,
                        "description": "S3 bucket does not have access logging enabled"
                    })

            except Exception:
                pass


            # -------------------------
            # Check: Block Public Access
            # -------------------------
            try:
                public_access = s3.get_public_access_block(Bucket=bucket_name)

                config = public_access["PublicAccessBlockConfiguration"]

                if not all(config.values()):
                    findings.append({
                        "id": f"s3-public-access-block-disabled-{bucket_name}",
                        "type": "S3_BLOCK_PUBLIC_ACCESS_DISABLED",
                        "severity": SEVERITY_MAP["S3_BLOCK_PUBLIC_ACCESS_DISABLED"],
                        "resource_id": bucket_name,
                        "description": "S3 bucket does not have full block public access enabled"
                    })

            except Exception:
                pass



        return findings