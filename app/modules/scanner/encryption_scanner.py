from app.config.security_config import SEVERITY_MAP
class EncryptionScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):

        session = self.aws_session.session
        ec2 = session.client("ec2")
        s3 = session.client("s3")

        findings = []

        # -------------------------
        # EBS Default Encryption Disabled
        # -------------------------

        response = ec2.get_ebs_encryption_by_default()

        if not response.get("EbsEncryptionByDefault"):

            findings.append({
                "id": "ebs-default-encryption-disabled",
                "type": "EBS_DEFAULT_ENCRYPTION_DISABLED",
                "severity": SEVERITY_MAP["EBS_DEFAULT_ENCRYPTION_DISABLED"],
                "resource_id": "account",
                "description": "EBS default encryption is not enabled for the account"
            })



        # -------------------------
        # S3 Bucket Encryption Disabled
        # -------------------------

        s3 = self.aws_session.session.client("s3")

        buckets = s3.list_buckets()["Buckets"]

        for bucket in buckets:

            bucket_name = bucket["Name"]

            try:
                response = s3.get_bucket_encryption(Bucket=bucket_name)

                rules = response["ServerSideEncryptionConfiguration"]["Rules"]

                if not rules:
                    raise Exception("No encryption rules")

            except Exception:

                findings.append({
                    "id": f"s3-encryption-disabled-{bucket_name}",
                    "type": "S3_BUCKET_ENCRYPTION_DISABLED",
                    "severity": SEVERITY_MAP["S3_BUCKET_ENCRYPTION_DISABLED"],
                    "resource_id": bucket_name,
                    "description": "S3 bucket does not have default encryption enabled"
                })

        # -------------------------
        # KMS Key Rotation Disabled
        # -------------------------

        kms = session.client("kms")
        # 🔥 Fetch aliases once
        alias_map = {}
        try:
            aliases = kms.list_aliases()["Aliases"]
            for a in aliases:
                if "TargetKeyId" in a:
                    alias_map[a["TargetKeyId"]] = a["AliasName"]
        except Exception:
            pass

        try:

            keys = kms.list_keys()["Keys"]

            for key in keys:

                key_id = key["KeyId"]

                try:
                    meta = kms.describe_key(KeyId=key_id)["KeyMetadata"]

                    # Skip AWS managed keys
                    if meta["KeyManager"] != "CUSTOMER":
                        continue

                    rotation = kms.get_key_rotation_status(KeyId=key_id)

                    if not rotation["KeyRotationEnabled"]:

                        alias = alias_map.get(key_id)

                        findings.append({
                            "id": f"kms-rotation-disabled-{key_id}",
                            "type": "KMS_KEY_ROTATION_DISABLED",
                            "severity": SEVERITY_MAP["KMS_KEY_ROTATION_DISABLED"],
                            "resource_id": key_id,
                            "resource_name": alias or f"kms-key-{key_id[:8]}",
                            "description": f"KMS key rotation is not enabled ({alias if alias else key_id})"
                        })

                except Exception:
                    pass

        except Exception:
            pass

        # -------------------------
        # EBS Snapshot Not Encrypted
        # -------------------------

        try:

            snapshots = ec2.describe_snapshots(OwnerIds=["self"])["Snapshots"]

            for snapshot in snapshots:

                if not snapshot.get("Encrypted"):

                    snapshot_id = snapshot["SnapshotId"]

                    findings.append({
                        "id": f"ebs-snapshot-unencrypted-{snapshot_id}",
                        "type": "EBS_SNAPSHOT_NOT_ENCRYPTED",
                        "severity": SEVERITY_MAP["EBS_SNAPSHOT_NOT_ENCRYPTED"],
                        "resource_id": snapshot_id,
                        "description": "EBS snapshot is not encrypted"
                    })

        except Exception:
            pass

        # -------------------------
        # RDS Storage Not Encrypted
        # -------------------------

        rds = session.client("rds")

        try:

            databases = rds.describe_db_instances()["DBInstances"]

            for db in databases:

                if not db.get("StorageEncrypted"):

                    db_id = db["DBInstanceIdentifier"]

                    findings.append({
                        "id": f"rds-storage-unencrypted-{db_id}",
                        "type": "RDS_STORAGE_NOT_ENCRYPTED",
                        "severity": SEVERITY_MAP["RDS_STORAGE_NOT_ENCRYPTED"],
                        "resource_id": db_id,
                        "description": "RDS database storage is not encrypted"
                    })

        except Exception:
            pass

        return findings