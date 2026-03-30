from app.config.security_config import SEVERITY_MAP

class EncryptionScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):

        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        # -------------------------
        # EBS Default Encryption Disabled
        # -------------------------
        try:
            response = ec2.get_ebs_encryption_by_default()

            if not response.get("EbsEncryptionByDefault"):
                finding_id = "ebs-default-encryption-disabled"

                if finding_id not in seen_ids:
                    seen_ids.add(finding_id)
                    findings.append({
                        "id": finding_id,
                        "type": "EBS_DEFAULT_ENCRYPTION_DISABLED",
                        "severity": SEVERITY_MAP["EBS_DEFAULT_ENCRYPTION_DISABLED"],
                        "resource_id": "account",
                        "region": region,
                        "description": "EBS default encryption is not enabled for the account"
                    })

        except Exception as e:
            print("EBS default encryption error:", str(e))

        

        # -------------------------
        # KMS Key Rotation Disabled
        # -------------------------
        kms = session.client("kms")

        alias_map = {}
        try:
            aliases = kms.list_aliases()["Aliases"]
            for a in aliases:
                if "TargetKeyId" in a:
                    alias_map[a["TargetKeyId"]] = a["AliasName"]
        except Exception as e:
            print("KMS alias error:", str(e))

        try:
            keys = kms.list_keys()["Keys"]

            for key in keys:
                key_id = key["KeyId"]

                try:
                    meta = kms.describe_key(KeyId=key_id)["KeyMetadata"]

                    if meta["KeyManager"] != "CUSTOMER":
                        continue

                    rotation = kms.get_key_rotation_status(KeyId=key_id)

                    if not rotation["KeyRotationEnabled"]:
                        alias = alias_map.get(key_id)
                        finding_id = f"kms-rotation-disabled-{key_id}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "KMS_KEY_ROTATION_DISABLED",
                                "severity": SEVERITY_MAP["KMS_KEY_ROTATION_DISABLED"],
                                "resource_id": key_id,
                                "region": region,
                                "resource_name": alias or f"kms-key-{key_id[:8]}",
                                "description": f"KMS key rotation is not enabled ({alias if alias else key_id})"
                            })

                except Exception as e:
                    print(f"KMS key error ({key_id}):", str(e))

        except Exception as e:
            print("KMS list error:", str(e))

        # -------------------------
        # EBS Snapshot Not Encrypted
        # -------------------------
        try:
            snapshots = ec2.describe_snapshots(OwnerIds=["self"])["Snapshots"]

            for snapshot in snapshots:
                if not snapshot.get("Encrypted"):
                    snapshot_id = snapshot["SnapshotId"]
                    finding_id = f"ebs-snapshot-unencrypted-{snapshot_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "EBS_SNAPSHOT_NOT_ENCRYPTED",
                            "severity": SEVERITY_MAP["EBS_SNAPSHOT_NOT_ENCRYPTED"],
                            "resource_id": snapshot_id,
                            "region": region,
                            "description": "EBS snapshot is not encrypted"
                        })

        except Exception as e:
            print("EBS snapshot error:", str(e))

        # -------------------------
        # RDS Storage Not Encrypted
        # -------------------------
        rds = session.client("rds")

        try:
            databases = rds.describe_db_instances()["DBInstances"]

            for db in databases:
                if not db.get("StorageEncrypted"):
                    db_id = db["DBInstanceIdentifier"]
                    finding_id = f"rds-storage-unencrypted-{db_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "RDS_STORAGE_NOT_ENCRYPTED",
                            "severity": SEVERITY_MAP["RDS_STORAGE_NOT_ENCRYPTED"],
                            "resource_id": db_id,
                            "region": region,
                            "description": "RDS database storage is not encrypted"
                        })

        except Exception as e:
            print("RDS error:", str(e))

        return findings