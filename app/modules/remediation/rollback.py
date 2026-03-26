from datetime import datetime
from app.database.db import get_connection
import json
from app.core.aws_session import AWSSession
class RollbackEngine:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def rollback(self, execution_id):

        conn = get_connection()
        cursor = conn.cursor()

        # -----------------------------------
        # 1. Fetch execution from DB
        # -----------------------------------
        cursor.execute("""
            SELECT * FROM executions WHERE execution_id = ?
        """, (execution_id,))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return {
                "status": "FAILED",
                "reason": "Execution ID not found in DB"
            }

        action = row["action"]
        metadata = json.loads(row["metadata"]) if row["metadata"] else {}

        resource_id = (
            metadata.get("user_name") or
            metadata.get("bucket_name") or
            metadata.get("resource_id") or
            row["resource_name"]
        )

        # =====================================================
        # IAM ROLLBACK (ADMIN POLICY)
        # =====================================================
        if action == "DETACH_ADMIN_POLICY":

            try:
                iam = self.aws_session.session.client("iam")

                iam.attach_user_policy(
                    UserName=resource_id,
                    PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess"
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "action": action,
                    "resource_id": resource_id,
                    "timestamp": datetime.utcnow().isoformat()
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # =====================================================
        # INLINE POLICY ROLLBACK (NOT POSSIBLE)
        # =====================================================
        if action == "REMOVE_INLINE_POLICY":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            user_name = inner.get("user_name")
            policies = inner.get("policies", [])

            if not user_name or not policies:
                return {
                    "status": "FAILED",
                    "reason": "No backup policies found"
                }

            iam = self.aws_session.session.client("iam")

            for policy in policies:
                iam.put_user_policy(
                    UserName=user_name,
                    PolicyName=policy["policy_name"],
                    PolicyDocument=json.dumps(policy["document"])
                )

            return {
                "status": "ROLLBACK_SUCCESS",
                "execution_id": execution_id,
                "restored_policies": len(policies)
            }

        # =====================================================
        # SECURITY GROUP ROLLBACK
        # =====================================================
        if action == "RESTRICT_SECURITY_GROUP":

            metadata = json.loads(row["metadata"])

            revoked_rules = metadata.get("revoked_rules")
            resource_id = metadata.get("resource_id")
            region = metadata.get("region")

            if not revoked_rules:
                return {
                    "status": "FAILED",
                    "reason": "No revoked rules stored"
                }

            ec2 = self.aws_session.session.client("ec2", region_name=region)

            ec2.authorize_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=revoked_rules
            )

            return {
                "status": "ROLLBACK_SUCCESS",
                "execution_id": execution_id
            }
        
        # -----------------------------------
        # S3 VERSIONING ROLLBACK
        # -----------------------------------
        if action == "ENABLE_S3_VERSIONING":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}

            # 🔥 SAFE EXTRACTION (handles all nesting cases)
            inner = metadata.get("metadata") or metadata

            bucket_name = inner.get("bucket_name")
            previous_status = inner.get("previous_versioning_status")

            print("EXTRACTED:", bucket_name, previous_status)

            if not bucket_name:
                return {
                    "status": "FAILED",
                    "reason": "Missing bucket_name in metadata"
                }

            s3 = self.aws_session.session.client("s3")

            if previous_status in ["Enabled", "Suspended"]:
                s3.put_bucket_versioning(
                    Bucket=bucket_name,
                    VersioningConfiguration={"Status": previous_status}
                )
            else:
                s3.put_bucket_versioning(
                    Bucket=bucket_name,
                    VersioningConfiguration={"Status": "Suspended"}
                )

            return {
                "status": "ROLLBACK_SUCCESS",
                "execution_id": execution_id,
                "bucket_name": bucket_name,
                "restored_to": previous_status
            }


        # -----------------------------------
        # S3 BLOCK PUBLIC ACCESS ROLLBACK
        # -----------------------------------
        if action == "ENABLE_BLOCK_PUBLIC_ACCESS":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            bucket_name = inner.get("bucket_name")
            previous_config = inner.get("previous_public_access_block")

            if not bucket_name or not previous_config:
                return {
                    "status": "FAILED",
                    "reason": "Missing metadata for rollback"
                }

            s3 = self.aws_session.session.client("s3")

            s3.put_public_access_block(
                Bucket=bucket_name,
                PublicAccessBlockConfiguration=previous_config
            )

            return {
                "status": "ROLLBACK_SUCCESS",
                "execution_id": execution_id,
                "bucket_name": bucket_name,
                "restored_config": previous_config
            }





        # =====================================================
        # UNKNOWN
        # =====================================================
        return {
            "status": "FAILED",
            "reason": f"Rollback not supported for action: {action}"
        }