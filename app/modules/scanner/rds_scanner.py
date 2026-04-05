from app.config.security_config import SEVERITY_MAP


class RDSScanner:
    """
    Scans RDS instances for security misconfigurations.
    Findings: publicly accessible, backup disabled, deletion protection disabled.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session
        rds = session.client("rds", region_name=region)

        findings = []
        seen_ids = set()

        try:
            databases = rds.describe_db_instances()["DBInstances"]
        except Exception as e:
            print(f"RDS scan error ({region}):", str(e))
            return findings

        for db in databases:
            db_id = db["DBInstanceIdentifier"]

            # -------------------------
            # RDS PUBLICLY ACCESSIBLE
            # -------------------------
            if db.get("PubliclyAccessible"):
                finding_id = f"rds-publicly-accessible-{db_id}"
                if finding_id not in seen_ids:
                    seen_ids.add(finding_id)
                    findings.append({
                        "id": finding_id,
                        "type": "RDS_PUBLICLY_ACCESSIBLE",
                        "severity": SEVERITY_MAP.get("RDS_PUBLICLY_ACCESSIBLE", "HIGH"),
                        "resource_id": db_id,
                        "region": region,
                        "description": f"RDS instance '{db_id}' is publicly accessible"
                    })

            # -------------------------
            # RDS BACKUP DISABLED
            # -------------------------
            if db.get("BackupRetentionPeriod", 0) == 0:
                finding_id = f"rds-backup-disabled-{db_id}"
                if finding_id not in seen_ids:
                    seen_ids.add(finding_id)
                    findings.append({
                        "id": finding_id,
                        "type": "RDS_BACKUP_DISABLED",
                        "severity": SEVERITY_MAP.get("RDS_BACKUP_DISABLED", "MEDIUM"),
                        "resource_id": db_id,
                        "region": region,
                        "description": f"RDS instance '{db_id}' has automated backups disabled"
                    })

            # -------------------------
            # RDS DELETION PROTECTION DISABLED
            # -------------------------
            if not db.get("DeletionProtection", False):
                finding_id = f"rds-deletion-protection-disabled-{db_id}"
                if finding_id not in seen_ids:
                    seen_ids.add(finding_id)
                    findings.append({
                        "id": finding_id,
                        "type": "RDS_DELETION_PROTECTION_DISABLED",
                        "severity": SEVERITY_MAP.get("RDS_DELETION_PROTECTION_DISABLED", "MEDIUM"),
                        "resource_id": db_id,
                        "region": region,
                        "description": f"RDS instance '{db_id}' does not have deletion protection enabled"
                    })

        return findings
