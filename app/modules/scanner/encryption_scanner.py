from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


class EncryptionScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session

        # FIX: all three clients MUST specify region_name —
        # previously kms/rds defaulted to us-east-1 regardless of the scanned region
        ec2 = session.client("ec2", region_name=region)
        kms = session.client("kms", region_name=region)
        rds = session.client("rds", region_name=region)

        findings = []
        lock = threading.Lock()

        def _add(f):
            fid = f.get("id")
            if not fid:
                return
            with lock:
                if not any(x["id"] == fid for x in findings):
                    findings.append(f)

        # ── Check 1: EBS default encryption ──────────────────────────────────
        def check_ebs_default():
            try:
                if not ec2.get_ebs_encryption_by_default().get("EbsEncryptionByDefault"):
                    _add({
                        "id":          "ebs-default-encryption-disabled",
                        "type":        "EBS_DEFAULT_ENCRYPTION_DISABLED",
                        "severity":    SEVERITY_MAP["EBS_DEFAULT_ENCRYPTION_DISABLED"],
                        "resource_id": "account",
                        "region":      region,
                        "description": "EBS default encryption is not enabled for the account",
                    })
            except Exception as e:
                print("EBS default encryption error:", e)

        # ── Check 2: KMS key rotation (keys fetched + checked in parallel) ───
        def check_kms():
            try:
                # Pre-fetch aliases and key list concurrently
                alias_map = {}
                keys = []

                def _get_aliases():
                    try:
                        for a in kms.list_aliases().get("Aliases", []):
                            if "TargetKeyId" in a:
                                alias_map[a["TargetKeyId"]] = a["AliasName"]
                    except Exception as e:
                        print("KMS alias error:", e)

                def _get_keys():
                    try:
                        keys.extend(kms.list_keys().get("Keys", []))
                    except Exception as e:
                        print("KMS list error:", e)

                with ThreadPoolExecutor(max_workers=2) as pre:
                    list(pre.map(lambda fn: fn(), [_get_aliases, _get_keys]))

                if not keys:
                    return

                # Check each customer key for rotation in parallel
                def _check_key(key):
                    key_id = key["KeyId"]
                    try:
                        meta = kms.describe_key(KeyId=key_id)["KeyMetadata"]
                        if meta.get("KeyManager") != "CUSTOMER":
                            return
                        if not kms.get_key_rotation_status(KeyId=key_id).get("KeyRotationEnabled"):
                            alias = alias_map.get(key_id)
                            _add({
                                "id":            f"kms-rotation-disabled-{key_id}",
                                "type":          "KMS_KEY_ROTATION_DISABLED",
                                "severity":      SEVERITY_MAP["KMS_KEY_ROTATION_DISABLED"],
                                "resource_id":   key_id,
                                "region":        region,
                                "resource_name": alias or f"kms-key-{key_id[:8]}",
                                "description":   f"KMS key rotation is not enabled ({alias or key_id})",
                            })
                    except Exception as e:
                        print(f"KMS key error ({key_id}):", e)

                with ThreadPoolExecutor(max_workers=min(len(keys), 10)) as kpool:
                    list(kpool.map(_check_key, keys))

            except Exception as e:
                print("KMS check error:", e)

        # ── Check 3: Unencrypted EBS snapshots ───────────────────────────────
        def check_ebs_snapshots():
            try:
                for snap in ec2.describe_snapshots(OwnerIds=["self"]).get("Snapshots", []):
                    if not snap.get("Encrypted"):
                        sid = snap["SnapshotId"]
                        _add({
                            "id":          f"ebs-snapshot-unencrypted-{sid}",
                            "type":        "EBS_SNAPSHOT_NOT_ENCRYPTED",
                            "severity":    SEVERITY_MAP["EBS_SNAPSHOT_NOT_ENCRYPTED"],
                            "resource_id": sid,
                            "region":      region,
                            "description": "EBS snapshot is not encrypted",
                        })
            except Exception as e:
                print("EBS snapshot error:", e)

        # ── Check 4: Unencrypted RDS instances ───────────────────────────────
        def check_rds():
            try:
                for db in rds.describe_db_instances().get("DBInstances", []):
                    if not db.get("StorageEncrypted"):
                        db_id = db["DBInstanceIdentifier"]
                        _add({
                            "id":          f"rds-storage-unencrypted-{db_id}",
                            "type":        "RDS_STORAGE_NOT_ENCRYPTED",
                            "severity":    SEVERITY_MAP["RDS_STORAGE_NOT_ENCRYPTED"],
                            "resource_id": db_id,
                            "region":      region,
                            "description": "RDS database storage is not encrypted",
                        })
            except Exception as e:
                print("RDS error:", e)

        # ── Run all 4 checks concurrently ────────────────────────────────────
        checks = [check_ebs_default, check_kms, check_ebs_snapshots, check_rds]
        with ThreadPoolExecutor(max_workers=len(checks)) as pool:
            futs = [pool.submit(c) for c in checks]
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception as e:
                    print(f"[EncryptionScanner] check failed in {region}: {e}")

        return findings