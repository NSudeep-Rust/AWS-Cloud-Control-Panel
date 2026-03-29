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

        # -----------------------------------
        # S3 PUBLIC ACL ROLLBACK
        # -----------------------------------
        if action == "REMOVE_PUBLIC_S3_ACL":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            bucket_name = inner.get("bucket_name")
            previous_acl = inner.get("previous_acl")
            owner = inner.get("owner")  # ⚠️ may be missing currently

            if not bucket_name or not previous_acl:
                return {
                    "status": "FAILED",
                    "reason": "Missing ACL metadata for rollback"
                }

            s3 = self.aws_session.session.client("s3")

            try:
                s3.put_bucket_acl(
                    Bucket=bucket_name,
                    AccessControlPolicy={
                        "Grants": previous_acl,
                        "Owner": owner or {"ID": previous_acl[0]["Grantee"].get("ID", "")}
                    }
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "bucket_name": bucket_name
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # -----------------------------------
        # S3_Access_Logging
        # -----------------------------------

        if action == "ENABLE_S3_ACCESS_LOGGING":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            bucket_name = inner.get("bucket_name")
            previous_logging = inner.get("previous_logging")

            # ✅ STEP 1 — NEW (extract these)
            log_bucket = inner.get("target_bucket")
            previous_policy = inner.get("previous_policy")

            s3 = self.aws_session.session.client("s3")

            # -----------------------------------
            # Restore logging
            # -----------------------------------
            if previous_logging:
                s3.put_bucket_logging(
                    Bucket=bucket_name,
                    BucketLoggingStatus={
                        "LoggingEnabled": previous_logging
                    }
                )
            else:
                # disable logging
                s3.put_bucket_logging(
                    Bucket=bucket_name,
                    BucketLoggingStatus={}
                )

            # -----------------------------------
            # Restore bucket policy (STEP 2 — NEW)
            # -----------------------------------
            if log_bucket:
                try:
                    if previous_policy:
                        s3.put_bucket_policy(
                            Bucket=log_bucket,
                            Policy=previous_policy
                        )
                    else:
                        s3.delete_bucket_policy(Bucket=log_bucket)
                except Exception as e:
                    return {
                        "status": "FAILED",
                        "reason": f"Policy rollback failed: {str(e)}"
                    }

            return {
                "status": "ROLLBACK_SUCCESS",
                "execution_id": execution_id,
                "bucket_name": bucket_name
            }


        # -----------------------------------
        # IAM ACCESS KEY ROLLBACK
        # -----------------------------------
        if action == "DISABLE_ACCESS_KEY":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            user_name = inner.get("user_name")
            access_key_id = inner.get("access_key_id")
            previous_status = inner.get("previous_status")

            if not user_name or not access_key_id:
                return {
                    "status": "FAILED",
                    "reason": "Missing access key metadata"
                }

            iam = self.aws_session.session.client("iam")

            try:
                iam.update_access_key(
                    UserName=user_name,
                    AccessKeyId=access_key_id,
                    Status=previous_status or "Active"
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "user_name": user_name,
                    "access_key_id": access_key_id,
                    "restored_status": previous_status
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }


        # -----------------------------------
        # ROTATE ACCESS KEY ROLLBACK
        # -----------------------------------
        if action == "ROTATE_ACCESS_KEY":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            user_name = inner.get("user_name")
            old_key_id = inner.get("old_key_id")
            new_key_id = inner.get("new_key_id")

            if not user_name or not old_key_id or not new_key_id:
                return {
                    "status": "FAILED",
                    "reason": "Missing metadata for rollback"
                }

            iam = self.aws_session.session.client("iam")

            try:
                # -----------------------------------
                # STEP 1 — Re-enable old key
                # -----------------------------------
                iam.update_access_key(
                    UserName=user_name,
                    AccessKeyId=old_key_id,
                    Status="Active"
                )

                # -----------------------------------
                # STEP 2 — Delete new key
                # -----------------------------------
                iam.delete_access_key(
                    UserName=user_name,
                    AccessKeyId=new_key_id
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "user_name": user_name
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # -----------------------------------
        # DELETE ACCESS KEY ROLLBACK
        # -----------------------------------
        if action == "DELETE_ACCESS_KEY":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            user_name = (
                metadata.get("user_name") or
                metadata.get("metadata", {}).get("user_name")
            )

            if not user_name:
                return {
                    "status": "FAILED",
                    "reason": "Missing user_name for rollback"
                }

            iam = self.aws_session.session.client("iam")

            try:
                # ⚠️ IMPORTANT:
                # Deleted key CANNOT be restored → create new one

                new_key = iam.create_access_key(UserName=user_name)["AccessKey"]

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "action": "DELETE_ACCESS_KEY",
                    "user_name": user_name,
                    "message": "Deleted key cannot be restored. New key created.",
                    "new_key_id": new_key["AccessKeyId"],
                    "new_secret": new_key["SecretAccessKey"],
                    "warning": "Store this secret immediately. It cannot be retrieved again."
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # -----------------------------------
        # KMS KEY ROTATION ROLLBACK
        # -----------------------------------
        if action == "ENABLE_KMS_KEY_ROTATION":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            key_id = inner.get("key_id")
            previous_state = inner.get("previous_rotation_state")

            if not key_id:
                return {
                    "status": "FAILED",
                    "reason": "Missing key_id in metadata"
                }

            if previous_state is None:
                return {
                    "status": "FAILED",
                    "reason": "Missing previous rotation state"
                }

            kms = self.aws_session.session.client("kms")

            try:
                # Restore previous state
                if previous_state is True:
                    kms.enable_key_rotation(KeyId=key_id)
                else:
                    kms.disable_key_rotation(KeyId=key_id)

                # Verify
                current = kms.get_key_rotation_status(KeyId=key_id)

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "key_id": key_id,
                    "restored_rotation_state": current.get("KeyRotationEnabled")
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # -----------------------------------
        # VPC FLOW
        # -----------------------------------

        # -----------------------------------
        # VPC FLOW LOGS ROLLBACK
        # -----------------------------------

        if action == "ENABLE_VPC_FLOW_LOGS":

            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
            inner = metadata.get("metadata") or metadata

            flow_log_id = inner.get("flow_log_id")
            region = inner.get("region")

            if not flow_log_id or not region:
                return {
                    "status": "FAILED",
                    "reason": "Missing flow_log_id or region for rollback"
                }

            ec2 = self.aws_session.session.client("ec2", region_name=region)

            try:
                ec2.delete_flow_logs(FlowLogIds=[flow_log_id])

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "flow_log_id": flow_log_id
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # =====================================================
        # UNKNOWN
        # =====================================================
        return {
            "status": "FAILED",
            "reason": f"Rollback not supported for action: {action}"
        }