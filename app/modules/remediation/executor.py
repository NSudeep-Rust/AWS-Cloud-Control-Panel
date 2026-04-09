from app.modules.remediation.safety_guard import RemediationSafetyGuard
from botocore.exceptions import ClientError
import json  
import copy
import time
from app.utils.iam_policy_utils import has_wildcard, normalize_statements
from app.utils.json_utils import make_json_safe


from app.config.security_config import (
    DEFAULT_EXECUTION_MODE,
    LIVE_EXECUTION_ENABLED,
    LIVE_EXECUTION_APPROVED_BY_USER,
    ALLOWED_LIVE_ACTIONS
)

import uuid
from datetime import datetime


class RemediationExecutor:
    """
    Executes remediation actions.
    Supports DRY_RUN and LIVE modes.
    """

    def __init__(self, aws_session, history, execution_mode=DEFAULT_EXECUTION_MODE):
        self.aws_session = aws_session
        self.history = history
        self.execution_mode = execution_mode
        self.safety_guard = RemediationSafetyGuard(aws_session)

        self.action_handlers = {
            "ENABLE_S3_VERSIONING": self._handle_enable_s3_versioning,
            "ENABLE_BLOCK_PUBLIC_ACCESS": self._handle_enable_block_public_access,
            "DETACH_ADMIN_POLICY": self._handle_detach_admin_policy,
            "REMOVE_PUBLIC_S3_ACL": self._handle_remove_public_s3_acl,
            "RESTRICT_SECURITY_GROUP": self._handle_restrict_security_group,
            "ENABLE_S3_ACCESS_LOGGING": self._handle_enable_s3_access_logging,
            "ENABLE_MFA": self._handle_enable_mfa,
            "DISABLE_ACCESS_KEY": self._handle_disable_access_key,
            "DELETE_ACCESS_KEY": self._handle_delete_access_key,
            "ENABLE_KMS_KEY_ROTATION": self._handle_enable_kms_rotation,
            "ENABLE_VPC_FLOW_LOGS": self._handle_enable_vpc_flow_logs,
            "DELETE_UNUSED_SECURITY_GROUP": self._handle_delete_unused_security_group,
            "RESTRICT_NACL_INBOUND": self._handle_restrict_nacl_inbound,
            "RESTRICT_NACL_OUTBOUND": self._handle_restrict_nacl_outbound,
            "REMOVE_PUBLIC_ROUTE": self._handle_remove_public_route,
            "RESTRICT_ROLE_EXTERNAL_TRUST": self._handle_restrict_role_external_trust,
            "ENABLE_CLOUDTRAIL": self._handle_enable_cloudtrail,
            "START_CLOUDTRAIL_LOGGING": self._handle_start_cloudtrail_logging,
            "ENABLE_TERMINATION_PROTECTION": self._handle_enable_termination_protection,
            "ENCRYPT_EBS_VOLUME": self._handle_encrypt_ebs_volume,
            "ATTACH_IAM_ROLE_TO_INSTANCE": self._handle_attach_iam_role,
            "REPLACE_SECURITY_GROUP": self._handle_replace_security_group,
            "REMOVE_ELASTIC_IP": self._handle_remove_elastic_ip,
            "REMOVE_INLINE_POLICY": self._handle_remove_inline_policy,
            "REMOVE_INLINE_WILDCARD_POLICY": self._handle_remove_inline_wildcard_policy,
            "DELETE_UNUSED_IAM_USER": self._handle_delete_unused_iam_user,
            "STOP_EC2_INSTANCE": self._handle_stop_ec2_instance,
            "TERMINATE_EC2_INSTANCE": self._handle_terminate_ec2_instance,
            "FORCE_TERMINATE_EC2_INSTANCE": self._handle_force_terminate_ec2_instance,
            "REVOKE_UNRESTRICTED_SSH":self._handle_revoke_unrestricted_ssh,
            "REVOKE_UNRESTRICTED_RDP":self._handle_revoke_unrestricted_rdp,
            "ENFORCE_IMDSV2":self._handle_enforce_imdsv2,
            "MAKE_SNAPSHOT_PRIVATE":self._handle_make_snapshot_private,
            "DISABLE_RDS_PUBLIC_ACCESS":self._handle_disable_rds_public_access,
            "ENABLE_RDS_BACKUP":self._handle_enable_rds_backup,
            "ENABLE_RDS_DELETION_PROTECTION":self._handle_enable_rds_deletion_protection,
            "DISABLE_STALE_ACCESS_KEY":self._handle_disable_stale_access_key,
            "SET_LOG_GROUP_RETENTION":self._handle_set_log_group_retention,
            "DELETE_DEFAULT_VPC":     self._handle_delete_default_vpc,
        }


    def _handle_enable_s3_versioning(self, finding, remediation):

        bucket_name = finding.get("bucket_name") or finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_S3_VERSIONING",
                "bucket_name": bucket_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_versioning_status": "Disabled"
                }
            }

        s3 = self.aws_session.session.client("s3")

        current = s3.get_bucket_versioning(Bucket=bucket_name)
        previous_status = current.get("Status", "Disabled")

        s3.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration={"Status": "Enabled"}
        )

        execution_id = str(uuid.uuid4())

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "ENABLE_S3_VERSIONING",
                "resource_id": bucket_name,
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_versioning_status": previous_status
                },
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat(),
            "action": "ENABLE_S3_VERSIONING",
            "bucket_name": bucket_name,
            "metadata": {
                "bucket_name": bucket_name,
                "previous_versioning_status": previous_status
            }
        }


    def _handle_enable_block_public_access(self, finding, remediation):

        bucket_name = finding.get("bucket_name") or finding.get("resource_id")

        s3 = self.aws_session.session.client("s3")

        try:
            current_config = s3.get_public_access_block(Bucket=bucket_name)
            previous_config = current_config.get("PublicAccessBlockConfiguration", {})
        except Exception:
            previous_config = {
                "BlockPublicAcls": False,
                "IgnorePublicAcls": False,
                "BlockPublicPolicy": False,
                "RestrictPublicBuckets": False
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
                "bucket_name": bucket_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_public_access_block": previous_config
                }
            }

        s3.put_public_access_block(
            Bucket=bucket_name,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True
            }
        )

        execution_id = str(uuid.uuid4())

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
                "resource_id": bucket_name,
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_public_access_block": previous_config
                },
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat(),
            "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
            "bucket_name": bucket_name,
            "metadata": {
                "bucket_name": bucket_name,
                "previous_public_access_block": previous_config
            }
        }


    def _handle_detach_admin_policy(self, finding, remediation):

        user_name = finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DETACH_ADMIN_POLICY",
                "user_name": user_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        iam = self.aws_session.session.client("iam")

        iam.detach_user_policy(
            UserName=user_name,
            PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess"
        )

        execution_id = str(uuid.uuid4())

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "DETACH_ADMIN_POLICY",
                "resource_id": user_name,
                "metadata": {
                    "user_name": user_name,
                    "policy": "AdministratorAccess"
                },
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat(),
            "action": "DETACH_ADMIN_POLICY",
            "user_name": user_name,
            "metadata": {
                "user_name": user_name,
                "policy": "AdministratorAccess"
            }
        }


    def _handle_remove_public_s3_acl(self, finding, remediation):

        bucket_name = finding.get("bucket_name") or finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REMOVE_PUBLIC_S3_ACL",
                "bucket_name": bucket_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        s3 = self.aws_session.session.client("s3")

        try:
            acl = s3.get_bucket_acl(Bucket=bucket_name)
            previous_grants = acl.get("Grants", [])

            new_grants = []

            for grant in previous_grants:
                grantee = grant.get("Grantee", {})
                uri = grantee.get("URI", "")

                if "AllUsers" in uri or "AuthenticatedUsers" in uri:
                    continue

                new_grants.append(grant)

            s3.put_bucket_acl(
                Bucket=bucket_name,
                AccessControlPolicy={
                    "Grants": new_grants,
                    "Owner": acl["Owner"]
                }
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "REMOVE_PUBLIC_S3_ACL",
                    "resource_id": bucket_name,
                    "metadata": {
                        "bucket_name": bucket_name,
                        "previous_acl": previous_grants,
                        "owner": acl["Owner"]
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "REMOVE_PUBLIC_S3_ACL",
                "bucket_name": bucket_name,
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_acl": previous_grants,
                    "owner": acl["Owner"]
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REMOVE_PUBLIC_S3_ACL",
                "reason": str(e)
            }


    def _handle_remove_inline_policy(self, finding, remediation):

        user_name = finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REMOVE_INLINE_POLICY",
                "user_name": user_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        iam = self.aws_session.session.client("iam")

        try:
            policies = iam.list_user_policies(UserName=user_name)

            backup_policies = []

            for policy_name in policies.get("PolicyNames", []):
                policy_doc = iam.get_user_policy(
                    UserName=user_name,
                    PolicyName=policy_name
                )

                backup_policies.append({
                    "policy_name": policy_name,
                    "document": policy_doc["PolicyDocument"]
                })

                iam.delete_user_policy(
                    UserName=user_name,
                    PolicyName=policy_name
                )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "REMOVE_INLINE_POLICY",
                    "resource_id": user_name,
                    "metadata": {
                        "user_name": user_name,
                        "policies": backup_policies
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "REMOVE_INLINE_POLICY",
                "user_name": user_name,
                "metadata": {
                    "user_name": user_name,
                    "policies": backup_policies
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REMOVE_INLINE_POLICY",
                "reason": str(e)
            }


    def _handle_restrict_security_group(self, finding, remediation):

        resource_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            response = ec2.describe_security_groups(GroupIds=[resource_id])
            sgs = response.get("SecurityGroups", [])
            if not sgs:
                return {
                    "status": "FAILED",
                    "action": "RESTRICT_SECURITY_GROUP",
                    "reason": f"Security group {resource_id} not found in region {region}",
                    "metadata": {}
                }
            sg = sgs[0]
        except ClientError as e:
            return {
                "status": "FAILED",
                "action": "RESTRICT_SECURITY_GROUP",
                "reason": f"AWS error fetching security group: {str(e)}",
                "metadata": {}
            }

        snapshot_before = sg.get("IpPermissions", [])

        targeted_rules = []

        for permission in snapshot_before:
            protocol = permission.get("IpProtocol")
            from_port = permission.get("FromPort")
            to_port = permission.get("ToPort")

            for ip_range in permission.get("IpRanges", []):
                if ip_range.get("CidrIp") == "0.0.0.0/0":
                    targeted_rules.append({
                        "IpProtocol": protocol,
                        "FromPort": from_port,
                        "ToPort": to_port,
                        "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
                    })

        if not targeted_rules:
            return {
                "status": "SKIPPED",
                "action": "RESTRICT_SECURITY_GROUP",
                "reason": "No 0.0.0.0/0 inbound rules found — already restricted",
                "metadata": {"security_group_id": resource_id, "region": region}
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "RESTRICT_SECURITY_GROUP",
                "resource_id": resource_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix"),
                "targeted_rules": targeted_rules,
                "metadata": {}
            }

        execution_id = str(uuid.uuid4())
        revoked_rules = []

        try:
            for rule in targeted_rules:
                ec2.revoke_security_group_ingress(
                    GroupId=resource_id,
                    IpPermissions=[rule]
                )
                revoked_rules.append(rule)
        except ClientError as e:
            return {
                "status": "FAILED",
                "action": "RESTRICT_SECURITY_GROUP",
                "reason": f"Failed to revoke rule: {str(e)}",
                "metadata": {"security_group_id": resource_id, "region": region}
            }

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "resource_id": resource_id,
                "region": region,
                "action": "RESTRICT_SECURITY_GROUP",
                "snapshot_before": snapshot_before,
                "revoked_rules": revoked_rules,
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat(),
            "resource_id": resource_id,
            "region": region,
            "action": "RESTRICT_SECURITY_GROUP",
            "revoked_rules": revoked_rules,
            "snapshot_before": snapshot_before,
            "metadata": {
                "security_group_id": resource_id,
                "region": region,
                "revoked_rules": revoked_rules
            }
        }

    def _handle_enable_s3_access_logging(self, finding, remediation):

        bucket_name = finding.get("bucket_name") or finding.get("resource_id")

        account_id = self.aws_session.get_account_id()
        log_bucket = f"security-logs-{account_id}"

        s3 = self.aws_session.session.client("s3")

        try:
            current = s3.get_bucket_logging(Bucket=bucket_name)
            previous_logging = current.get("LoggingEnabled", {})
        except Exception:
            previous_logging = {}

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_S3_ACCESS_LOGGING",
                "bucket_name": bucket_name,
                "target_bucket": log_bucket,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "bucket_name": bucket_name,
                    "previous_logging": previous_logging
                }
            }

        
   

        try:
            s3.head_bucket(Bucket=log_bucket)

        except ClientError as e:
            error_code = e.response['Error']['Code']

            if error_code in ["404", "NoSuchBucket"]:
                region = self.aws_session.session.region_name

                if region == "us-east-1":
                    s3.create_bucket(Bucket=log_bucket)
                else:
                    s3.create_bucket(
                        Bucket=log_bucket,
                        CreateBucketConfiguration={
                            "LocationConstraint": region
                        }
                    )

            elif error_code in ["403", "AccessDenied"]:
                raise Exception(f"Access denied to log bucket: {log_bucket}")

            else:
                raise


        try:
            current_policy = s3.get_bucket_policy(Bucket=log_bucket)
            previous_policy = current_policy["Policy"]
        except:
            previous_policy = None


        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "S3ServerAccessLogsPolicy",
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "logging.s3.amazonaws.com"
                    },
                    "Action": "s3:PutObject",
                    "Resource": f"arn:aws:s3:::{log_bucket}/*",
                    "Condition": {
                        "StringEquals": {
                            "aws:SourceAccount": account_id
                        }
                    }
                }
            ]
        }

        s3.put_bucket_policy(
            Bucket=log_bucket,
            Policy=json.dumps(policy)
        )
        
        
        try:
            s3.put_bucket_logging(
                Bucket=bucket_name,
                BucketLoggingStatus={
                    "LoggingEnabled": {
                        "TargetBucket": log_bucket,
                        "TargetPrefix": f"{bucket_name}/logs/"
                    }
                }
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENABLE_S3_ACCESS_LOGGING",
                "bucket_name": bucket_name,
                "metadata": {
                   "bucket_name": bucket_name,
                   "previous_logging": previous_logging,
                   "target_bucket": log_bucket,
                   "previous_policy": previous_policy
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENABLE_S3_ACCESS_LOGGING",
                "reason": str(e)
            }




    def _handle_enable_mfa(self, finding, remediation):

        user_name = finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_MFA",
                "user_name": user_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "message": "MFA must be enabled manually or enforced via IAM policy"
            }

        return {
            "status": "MANUAL_REQUIRED",
            "execution_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "action": "ENABLE_MFA",
            "user_name": user_name,
            "metadata": {
                "user_name": user_name,
                "note": "MFA cannot be auto-enabled. Manual action required.",
                "remediation_type": "MANUAL"
            }
        }



    def _handle_disable_access_key(self, finding, remediation):

        user_name = finding.get("resource_id")
        access_key_id = (
            finding.get("access_key_id") or
            finding.get("metadata", {}).get("access_key_id")
        )

        if not access_key_id:
            return {
                "status": "FAILED",
                "reason": "Missing access_key_id"
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DISABLE_ACCESS_KEY",
                "user_name": user_name,
                "access_key_id": access_key_id,
                "recommended_fix": remediation.get("recommended_fix")
            }

        iam = self.aws_session.session.client("iam")

        try:
            key_metadata = iam.list_access_keys(UserName=user_name)["AccessKeyMetadata"]

            previous_status = None
            for key in key_metadata:
                if key["AccessKeyId"] == access_key_id:
                    previous_status = key["Status"]
                    break

            iam.update_access_key(
                UserName=user_name,
                AccessKeyId=access_key_id,
                Status="Inactive"
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "DISABLE_ACCESS_KEY",
                "user_name": user_name,
                "metadata": {
                    "user_name": user_name,
                    "access_key_id": access_key_id,
                    "previous_status": previous_status
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "DISABLE_ACCESS_KEY",
                "reason": str(e)
            }



    def _handle_delete_access_key(self, finding, remediation):

        user_name = finding.get("resource_id")
        access_key_id = (
            finding.get("access_key_id") or
            finding.get("metadata", {}).get("access_key_id")
        )

        if not access_key_id:
            return {
                "status": "FAILED",
                "reason": "Missing access_key_id"
            }

        iam = self.aws_session.session.client("iam")

        all_keys = iam.list_access_keys(UserName=user_name)["AccessKeyMetadata"]

        key_metadata = None
        for key in all_keys:
            if key["AccessKeyId"] == access_key_id:
                key_metadata = key
                break
        safe_metadata = key_metadata.copy()

        if "CreateDate" in safe_metadata:
            safe_metadata["CreateDate"] = safe_metadata["CreateDate"].isoformat()

        if not key_metadata:
            return {
                "status": "FAILED",
                "reason": "Access key not found",
                "user_name": user_name
            }

        if key_metadata["Status"] != "Inactive":
            return {
                "status": "SKIPPED",
                "reason": "Refusing to delete active key",
                "user_name": user_name
            }

        if len(all_keys) <= 1:
            return {
                "status": "SKIPPED",
                "reason": "Cannot delete the only access key",
                "user_name": user_name
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DELETE_ACCESS_KEY",
                "user_name": user_name,
                "access_key_id": access_key_id,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            key_metadata = None
            for key in all_keys:
                if key["AccessKeyId"] == access_key_id:
                    key_metadata = key
                    break

            iam.delete_access_key(
                UserName=user_name,
                AccessKeyId=access_key_id
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "DELETE_ACCESS_KEY",

                "user_name": user_name,
                "access_key_id": access_key_id,

                "metadata": {
                    "previous_metadata": safe_metadata,
                    "deleted_key_id": access_key_id,
                    "user_name": user_name,                     # 🔥 ADD THIS
                    "access_key_id": access_key_id, 
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "DELETE_ACCESS_KEY",
                "reason": str(e)
            }


    def _handle_enable_kms_rotation(self, finding, remediation):

        key_id = finding.get("resource_id")

        if not key_id:
            return {
                "status": "FAILED",
                "reason": "Missing key_id"
            }

        kms = self.aws_session.session.client("kms")

        try:
            current = kms.get_key_rotation_status(KeyId=key_id)
            previous_state = current.get("KeyRotationEnabled", False)
        except Exception as e:
            return {
                "status": "FAILED",
                "reason": f"Failed to fetch current rotation state: {str(e)}"
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_KMS_KEY_ROTATION",
                "key_id": key_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "previous_rotation_state": previous_state
                }
            }

        try:
            kms.enable_key_rotation(KeyId=key_id)

            execution_id = str(uuid.uuid4())   # ✅ create once

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "ENABLE_KMS_KEY_ROTATION",
                    "resource_id": key_id,
                    "metadata": {
                        "key_id": key_id,
                        "previous_rotation_state": previous_state
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENABLE_KMS_KEY_ROTATION",
                "key_id": key_id,
                "metadata": {
                    "key_id": key_id,
                    "previous_rotation_state": previous_state
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENABLE_KMS_KEY_ROTATION",
                "reason": str(e)
            }


    def _handle_enable_vpc_flow_logs(self, finding, remediation):

        vpc_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)
        logs = self.aws_session.session.client("logs", region_name=region)
        iam = self.aws_session.session.client("iam")

        log_group_name = f"/cloudsecure/vpc-flow-logs/{vpc_id}"
        role_name = "CloudSecure-FlowLogs-Role"

        existing = ec2.describe_flow_logs(
            Filters=[{"Name": "resource-id", "Values": [vpc_id]}]
        )["FlowLogs"]

        if existing:
            return {
                "status": "SKIPPED",
                "reason": "Flow logs already enabled",
                "vpc_id": vpc_id
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_VPC_FLOW_LOGS",
                "vpc_id": vpc_id,
                "log_group": log_group_name,
                "role": role_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            logs.create_log_group(logGroupName=log_group_name)
        except logs.exceptions.ResourceAlreadyExistsException:
            pass

        try:
            role = iam.get_role(RoleName=role_name)
            role_arn = role["Role"]["Arn"]
        except iam.exceptions.NoSuchEntityException:

            assume_policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "vpc-flow-logs.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }

            role = iam.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(assume_policy)
            )

            role_arn = role["Role"]["Arn"]

            policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": [
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    "Resource": f"arn:aws:logs:{region}:*:*"
                }]
            }

            iam.put_role_policy(
                RoleName=role_name,
                PolicyName="FlowLogsPolicy",
                PolicyDocument=json.dumps(policy)
            )

        response = ec2.create_flow_logs(
            ResourceIds=[vpc_id],
            ResourceType="VPC",
            TrafficType="ALL",
            LogGroupName=log_group_name,
            DeliverLogsPermissionArn=role_arn
        )

        flow_log_id = response["FlowLogIds"][0]

        if self.history:
            self.history.record_execution({
                "execution_id": str(uuid.uuid4()),
                "action": "ENABLE_VPC_FLOW_LOGS",
                "resource_id": vpc_id,
                "region": region,
                "flow_log_id": flow_log_id,
                "log_group": log_group_name,
                "role_name": role_name,
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": str(uuid.uuid4()),
            "action": "ENABLE_VPC_FLOW_LOGS",
            "vpc_id": vpc_id,
            "flow_log_id": flow_log_id,
            "metadata": {
                "vpc_id": vpc_id,
                "flow_log_id": flow_log_id,
                "region": region,  # 🔥 ADD THIS
                "log_group": log_group_name,
                "role_name": role_name
            }
        }

    def _handle_delete_unused_security_group(self, finding, remediation):

        sg_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            sg = ec2.describe_security_groups(GroupIds=[sg_id])["SecurityGroups"][0]
        except Exception:
            return {
                "status": "FAILED",
                "reason": "Security group not found",
                "resource_id": sg_id
            }

        if sg.get("GroupName") == "default":
            return {
                "status": "SKIPPED",
                "reason": "Cannot delete default security group",
                "resource_id": sg_id
            }

        enis = ec2.describe_network_interfaces()["NetworkInterfaces"]

        for eni in enis:
            for group in eni.get("Groups", []):
                if group["GroupId"] == sg_id:
                    return {
                        "status": "SKIPPED",
                        "reason": "Security group is now in use",
                        "resource_id": sg_id
                    }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DELETE_UNUSED_SECURITY_GROUP",
                "resource_id": sg_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix")
            }

        execution_id = str(uuid.uuid4())

        try:
            ec2.delete_security_group(GroupId=sg_id)

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "DELETE_UNUSED_SECURITY_GROUP",
                    "resource_id": sg_id,
                    "region": region,
                    "snapshot_before": sg,
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "resource_id": sg_id,
                "region": region,
                "action": "DELETE_UNUSED_SECURITY_GROUP",
                "metadata": {
                    "security_group": sg,
                    "region": region
                }
            }

        except ClientError as e:

            return {
                "status": "FAILED",
                "action": "DELETE_UNUSED_SECURITY_GROUP",
                "resource_id": sg_id,
                "reason": e.response["Error"]["Message"]
            }

    def _handle_remove_inline_wildcard_policy(self, finding, remediation):

        user_name = finding.get("resource_id")
        policy_name = finding.get("policy_name")

        if not user_name or not policy_name:
            return {
                "status": "FAILED",
                "reason": "Missing user_name or policy_name"
            }

        iam = self.aws_session.session.client("iam")

        try:
            policy_doc = iam.get_user_policy(
                UserName=user_name,
                PolicyName=policy_name
            )["PolicyDocument"]

        except Exception as e:
            return {
                "status": "FAILED",
                "reason": f"Failed to fetch policy: {str(e)}"
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REMOVE_INLINE_WILDCARD_POLICY",
                "user_name": user_name,
                "policy_name": policy_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

     
        transformed_policy = json.loads(json.dumps(policy_doc))
        statements = normalize_statements(transformed_policy)


        def has_wildcard(value):
            if isinstance(value, str):
                return "*" in value
            if isinstance(value, list):
                return any("*" in v for v in value)
            return False


        for stmt in statements:

            actions = stmt.get("Action")
            resources = stmt.get("Resource")

            if has_wildcard(actions):
                stmt["Action"] = [
                    "s3:GetObject",
                    "ec2:DescribeInstances"
                ]

            if has_wildcard(resources):
                stmt["Resource"] = "*"

        transformed_policy["Statement"] = statements

        try:
            iam.put_user_policy(
                UserName=user_name,
                PolicyName=policy_name,
                PolicyDocument=json.dumps(transformed_policy)
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "REMOVE_INLINE_WILDCARD_POLICY",
                "user_name": user_name,
                "metadata": {
                    "user_name": user_name,
                    "policy_name": policy_name,
                    "original_policy": policy_doc  # 🔥 CRITICAL FOR ROLLBACK
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REMOVE_INLINE_WILDCARD_POLICY",
                "reason": str(e)
            }

    def _handle_restrict_nacl_inbound(self, finding, remediation):

        nacl_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        nacl = ec2.describe_network_acls(NetworkAclIds=[nacl_id])["NetworkAcls"][0]

        targeted_rules = []

        for entry in nacl.get("Entries", []):
            if (
                entry.get("Egress") is False and
                entry.get("RuleAction") == "allow" and
                entry.get("CidrBlock") == "0.0.0.0/0"
            ):
                targeted_rules.append(entry)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "RESTRICT_NACL_INBOUND",
                "nacl_id": nacl_id,
                "region": region,
                "targeted_rules": targeted_rules
            }

        execution_id = str(uuid.uuid4())
        removed_rules = []

        for rule in targeted_rules:
            ec2.delete_network_acl_entry(
                NetworkAclId=nacl_id,
                RuleNumber=rule["RuleNumber"],
                Egress=False
            )
            removed_rules.append(rule)

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "RESTRICT_NACL_INBOUND",
                "resource_id": nacl_id,
                "region": region,
                "removed_rules": removed_rules
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "action": "RESTRICT_NACL_INBOUND",
            "metadata": {
                "nacl_id": nacl_id,
                "region": region,
                "removed_rules": removed_rules
            }
        }

    def _handle_restrict_nacl_outbound(self, finding, remediation):

        nacl_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        nacl = ec2.describe_network_acls(NetworkAclIds=[nacl_id])["NetworkAcls"][0]

        targeted_rules = []

        for entry in nacl.get("Entries", []):
            if (
                entry.get("Egress") is True and
                entry.get("RuleAction") == "allow" and
                entry.get("CidrBlock") == "0.0.0.0/0"
            ):
                targeted_rules.append(entry)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "RESTRICT_NACL_OUTBOUND",
                "nacl_id": nacl_id,
                "region": region,
                "targeted_rules": targeted_rules
            }

        execution_id = str(uuid.uuid4())
        removed_rules = []

        for rule in targeted_rules:
            ec2.delete_network_acl_entry(
                NetworkAclId=nacl_id,
                RuleNumber=rule["RuleNumber"],
                Egress=True
            )
            removed_rules.append(rule)

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "RESTRICT_NACL_OUTBOUND",
                "resource_id": nacl_id,
                "region": region,
                "removed_rules": removed_rules
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "action": "RESTRICT_NACL_OUTBOUND",
            "metadata": {
                "nacl_id": nacl_id,
                "region": region,
                "removed_rules": removed_rules
            }
        }


    def _handle_remove_public_route(self, finding, remediation):

        route_table_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        rt = ec2.describe_route_tables(RouteTableIds=[route_table_id])["RouteTables"][0]

        target_route = None

        for route in rt.get("Routes", []):
            if (
                route.get("DestinationCidrBlock") == "0.0.0.0/0" and
                str(route.get("GatewayId", "")).startswith("igw")
            ):
                target_route = route
                break

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REMOVE_PUBLIC_ROUTE",
                "route_table_id": route_table_id,
                "region": region,
                "target_route": target_route
            }

        if not target_route:
            return {
                "status": "SKIPPED",
                "reason": "No public route found",
                "route_table_id": route_table_id
            }

        execution_id = str(uuid.uuid4())

        ec2.delete_route(
            RouteTableId=route_table_id,
            DestinationCidrBlock="0.0.0.0/0"
        )

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "REMOVE_PUBLIC_ROUTE",
                "resource_id": route_table_id,
                "region": region,
                "deleted_route": target_route
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "action": "REMOVE_PUBLIC_ROUTE",
            "metadata": {
                "route_table_id": route_table_id,
                "region": region,
                "deleted_route": target_route
            }
        }

    def _handle_restrict_role_external_trust(self, finding, remediation):

        role_name = finding.get("resource_id")

        iam = self.aws_session.session.client("iam")

        try:
            role = iam.get_role(RoleName=role_name)["Role"]
            current_policy = role["AssumeRolePolicyDocument"]
        except Exception as e:
            return {
                "status": "FAILED",
                "reason": f"Failed to fetch role: {str(e)}"
            }

        account_id = self.aws_session.get_account_id()

     
        new_policy = copy.deepcopy(current_policy)

        for stmt in new_policy.get("Statement", []):
            principal = stmt.get("Principal", {})

            if "AWS" in principal:
                principal["AWS"] = f"arn:aws:iam::{account_id}:root"

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "RESTRICT_ROLE_EXTERNAL_TRUST",
                "role_name": role_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "previous_policy": current_policy
                }
            }

        try:
            iam.update_assume_role_policy(
                RoleName=role_name,
                PolicyDocument=json.dumps(new_policy)
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "RESTRICT_ROLE_EXTERNAL_TRUST",
                "role_name": role_name,
                "metadata": {
                    "role_name": role_name,
                    "previous_policy": current_policy
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "RESTRICT_ROLE_EXTERNAL_TRUST",
                "reason": str(e)
            }

    def _handle_enable_cloudtrail(self, finding, remediation):

        region = finding.get("region")

        if not region or region == "global":
            region = self.aws_session.session.region_name or "us-east-1"

        cloudtrail = self.aws_session.session.client("cloudtrail", region_name=region)
        s3 = self.aws_session.session.client("s3", region_name=region)

        account_id = self.aws_session.get_account_id()

        trail_name = "cloudsecure-trail"
        bucket_name = f"cloudsecure-trail-{account_id}"

        

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_CLOUDTRAIL",
                "trail_name": trail_name,
                "bucket_name": bucket_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        existing_trails = cloudtrail.describe_trails()["trailList"]

        for t in existing_trails:
            if t["Name"] == trail_name:
                return {
                    "status": "SKIPPED",
                    "reason": "CloudTrail already exists",
                    "trail_name": trail_name
                }

        bucket_created = False

        try:
            s3.head_bucket(Bucket=bucket_name)
        except:
            if region == "us-east-1":
                s3.create_bucket(Bucket=bucket_name)
            else:
                s3.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={"LocationConstraint": region}
                )
            bucket_created = True



        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "AWSCloudTrailAclCheck",
                    "Effect": "Allow",
                    "Principal": {"Service": "cloudtrail.amazonaws.com"},
                    "Action": "s3:GetBucketAcl",
                    "Resource": f"arn:aws:s3:::{bucket_name}"
                },
                {
                    "Sid": "AWSCloudTrailWrite",
                    "Effect": "Allow",
                    "Principal": {"Service": "cloudtrail.amazonaws.com"},
                    "Action": "s3:PutObject",
                    "Resource": f"arn:aws:s3:::{bucket_name}/AWSLogs/{account_id}/*",
                    "Condition": {
                        "StringEquals": {
                            "s3:x-amz-acl": "bucket-owner-full-control"
                        }
                    }
                }
            ]
        }

        s3.put_bucket_policy(
            Bucket=bucket_name,
            Policy=json.dumps(policy)
        )

        cloudtrail.create_trail(
            Name=trail_name,
            S3BucketName=bucket_name,
            IsMultiRegionTrail=True,
            IncludeGlobalServiceEvents=True
        )

        cloudtrail.start_logging(Name=trail_name)

        execution_id = str(uuid.uuid4())

        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "action": "ENABLE_CLOUDTRAIL",
                "trail_name": trail_name,
                "bucket_name": bucket_name,
                "bucket_created": bucket_created,
                "region": region,
                "timestamp": datetime.utcnow().isoformat()
            })

        return {
            "status": "EXECUTED",
            "execution_id": execution_id,
            "action": "ENABLE_CLOUDTRAIL",
            "trail_name": trail_name,
            "bucket_name": bucket_name,
            "metadata": {
                "trail_name": trail_name,
                "bucket_name": bucket_name,
                "bucket_created": bucket_created,
                "region": region
            }
        }

    def _handle_start_cloudtrail_logging(self, finding, remediation):

        region = finding.get("region")

        if not region or region == "global":
            region = self.aws_session.session.region_name or "us-east-1"

        cloudtrail = self.aws_session.session.client("cloudtrail", region_name=region)

        trail_name = finding.get("resource_id")

        if not trail_name:
            return {
                "status": "FAILED",
                "reason": "Missing trail_name in finding"
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "START_CLOUDTRAIL_LOGGING",
                "trail_name": trail_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            cloudtrail.start_logging(Name=trail_name)

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "START_CLOUDTRAIL_LOGGING",
                "trail_name": trail_name,
                "metadata": {
                    "trail_name": trail_name,
                    "region": region
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "START_CLOUDTRAIL_LOGGING",
                "reason": str(e)
            }

    def _handle_enable_termination_protection(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region = finding.get("region")
        if not region or region == "global":
            region = self.aws_session.session.region_name   

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            attr = ec2.describe_instance_attribute(
                InstanceId=instance_id,
                Attribute="disableApiTermination"
            )
            previous_state = attr["DisableApiTermination"]["Value"]
        except Exception as e:
            return {
                "status": "FAILED",
                "reason": f"Failed to fetch termination protection: {str(e)}"
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_TERMINATION_PROTECTION",
                "instance_id": instance_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "previous_state": previous_state
                }
            }

        try:
            ec2.modify_instance_attribute(
                InstanceId=instance_id,
                DisableApiTermination={"Value": True}
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENABLE_TERMINATION_PROTECTION",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "previous_state": previous_state
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENABLE_TERMINATION_PROTECTION",
                "reason": str(e)
            }

    def _handle_encrypt_ebs_volume(self, finding, remediation):

        volume_id = finding.get("resource_id")
        region = finding.get("region")
        original_volume = ec2.describe_volumes(VolumeIds=[volume_id])["Volumes"][0]

        attachments = original_volume.get("Attachments", [])

        instance_id = attachments[0]["InstanceId"] if attachments else None
        device_name = attachments[0]["Device"] if attachments else None

        if not region or region == "global":
            region = self.aws_session.session.region_name

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENCRYPT_EBS_VOLUME",
                "volume_id": volume_id,
                "instance_id": instance_id,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            snapshot = ec2.create_snapshot(
                VolumeId=volume_id,
                Description="Snapshot for encryption"
            )
            snapshot_id = snapshot["SnapshotId"]

            waiter = ec2.get_waiter('snapshot_completed')

            waiter.wait(
                SnapshotIds=[snapshot_id],
                WaiterConfig={
                    'Delay': 15,        # seconds between checks
                    'MaxAttempts': 120  # 30 minutes total
                }
            )

            encrypted_snapshot = ec2.copy_snapshot(
                SourceSnapshotId=snapshot_id,
                SourceRegion=region,
                Encrypted=True
            )
            encrypted_snapshot_id = encrypted_snapshot["SnapshotId"]

            waiter.wait(SnapshotIds=[encrypted_snapshot_id])

            original_volume = ec2.describe_volumes(VolumeIds=[volume_id])["Volumes"][0]

            new_volume = ec2.create_volume(
                SnapshotId=encrypted_snapshot_id,
                AvailabilityZone=original_volume["AvailabilityZone"],
                VolumeType=original_volume["VolumeType"]
            )
            new_volume_id = new_volume["VolumeId"]

            vol_waiter = ec2.get_waiter("volume_available")
            vol_waiter.wait(VolumeIds=[new_volume_id])

            if not instance_id:
                return {
                    "status": "SKIPPED",
                    "reason": "Volume is not attached to any instance",
                    "volume_id": volume_id
                }

            ec2.stop_instances(InstanceIds=[instance_id])

            snapshot_waiter = ec2.get_waiter('snapshot_completed')
            snapshot_waiter.wait(SnapshotIds=[snapshot_id])

            snapshot_waiter.wait(SnapshotIds=[encrypted_snapshot_id])

            volume_waiter = ec2.get_waiter("volume_available")
            volume_waiter.wait(VolumeIds=[new_volume_id])

            instance_waiter = ec2.get_waiter("instance_stopped")
            instance_waiter.wait(InstanceIds=[instance_id])

            attachments = original_volume.get("Attachments", [])

            device_name = None
            if attachments:
                device_name = attachments[0]["Device"]

                ec2.detach_volume(
                    VolumeId=volume_id,
                    InstanceId=instance_id,
                    Device=device_name,
                    Force=True
                )

                vol_waiter.wait(VolumeIds=[volume_id])

            if device_name:
                ec2.attach_volume(
                    VolumeId=new_volume_id,
                    InstanceId=instance_id,
                    Device=device_name
                )

            ec2.start_instances(InstanceIds=[instance_id])

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENCRYPT_EBS_VOLUME",
                "volume_id": volume_id,
                "metadata": {
                    "original_volume_id": volume_id,
                    "new_volume_id": new_volume_id,
                    "snapshot_id": snapshot_id,
                    "encrypted_snapshot_id": encrypted_snapshot_id,
                    "instance_id": instance_id,
                    "device": device_name,
                    "region": region
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENCRYPT_EBS_VOLUME",
                "reason": str(e)
            }

    def _handle_attach_iam_role(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region = finding.get("region")

        if not region or region == "global":
            region = self.aws_session.session.region_name

        ec2 = self.aws_session.session.client("ec2", region_name=region)
        iam = self.aws_session.session.client("iam")

        role_name = "CloudSecure-EC2-Role"
        profile_name = "CloudSecure-EC2-InstanceProfile"

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ATTACH_IAM_ROLE_TO_INSTANCE",
                "instance_id": instance_id,
                "role": role_name
            }

        try:
            try:
                iam.get_role(RoleName=role_name)
            except iam.exceptions.NoSuchEntityException:

                assume_policy = {
                    "Version": "2012-10-17",
                    "Statement": [{
                        "Effect": "Allow",
                        "Principal": {"Service": "ec2.amazonaws.com"},
                        "Action": "sts:AssumeRole"
                    }]
                }

                iam.create_role(
                    RoleName=role_name,
                    AssumeRolePolicyDocument=json.dumps(assume_policy)
                )

            for _ in range(10):
                try:
                    iam.get_instance_profile(InstanceProfileName=profile_name)
                    break
                except iam.exceptions.NoSuchEntityException:
                    time.sleep(2)

            try:
                iam.get_instance_profile(InstanceProfileName=profile_name)
            except iam.exceptions.NoSuchEntityException:
                iam.create_instance_profile(InstanceProfileName=profile_name)

            try:
                iam.add_role_to_instance_profile(
                    InstanceProfileName=profile_name,
                    RoleName=role_name
                )
            except Exception:
                pass  # already attached

            time.sleep(10)  # 🔥 REQUIRED (IAM propagation delay)

            response = ec2.describe_iam_instance_profile_associations(
                Filters=[{"Name": "instance-id", "Values": [instance_id]}]
            )

            if response["IamInstanceProfileAssociations"]:
                return {
                    "status": "SKIPPED",
                    "reason": "Instance already has IAM role",
                    "instance_id": instance_id
                }

            assoc = ec2.associate_iam_instance_profile(
                InstanceId=instance_id,
                IamInstanceProfile={"Name": profile_name}
            )

            association_id = assoc["IamInstanceProfileAssociation"]["AssociationId"]

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ATTACH_IAM_ROLE_TO_INSTANCE",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "role_name": role_name,
                    "profile_name": profile_name,
                    "association_id": association_id,
                    "region": region
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ATTACH_IAM_ROLE_TO_INSTANCE",
                "reason": str(e)
            }

    def _handle_replace_security_group(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region = finding.get("region")

        if not region or region == "global":
            region = self.aws_session.session.region_name or "us-east-1"

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        response = ec2.describe_instances(InstanceIds=[instance_id])
        instance = response["Reservations"][0]["Instances"][0]

        current_sgs = instance.get("SecurityGroups", [])
        current_sg_ids = [sg["GroupId"] for sg in current_sgs]

        default_sg = next((sg for sg in current_sgs if sg["GroupName"] == "default"), None)

        if not default_sg:
            return {
                "status": "SKIPPED",
                "reason": "Default security group not attached",
                "instance_id": instance_id
            }

        default_sg_id = default_sg["GroupId"]

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REPLACE_SECURITY_GROUP",
                "instance_id": instance_id,
                "region": region,
                "default_sg": default_sg_id,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            vpc_id = instance["VpcId"]

            sg_response = ec2.create_security_group(
                GroupName=f"cloudsecure-sg-{instance_id}",
                Description="Restricted security group created by CloudSecure",
                VpcId=vpc_id
            )

            new_sg_id = sg_response["GroupId"]

            ec2.authorize_security_group_ingress(
                GroupId=new_sg_id,
                IpPermissions=[{
                    "IpProtocol": "tcp",
                    "FromPort": 22,
                    "ToPort": 22,
                    "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
                }]
            )

            updated_sgs = [sg for sg in current_sg_ids if sg != default_sg_id]
            updated_sgs.append(new_sg_id)

            ec2.modify_instance_attribute(
                InstanceId=instance_id,
                Groups=updated_sgs
            )

            if self.history:
                self.history.record_execution({
                    "execution_id": str(uuid.uuid4()),
                    "action": "REPLACE_SECURITY_GROUP",
                    "resource_id": instance_id,
                    "region": region,
                    "previous_sgs": current_sg_ids,
                    "new_sg": new_sg_id,
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "action": "REPLACE_SECURITY_GROUP",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region": region,
                    "previous_sgs": current_sg_ids,
                    "new_sg": new_sg_id
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REPLACE_SECURITY_GROUP",
                "reason": str(e)
            }

    def _handle_remove_elastic_ip(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region = finding.get("region")

        if not region or region == "global":
            region = self.aws_session.session.region_name or "us-east-1"

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            addrs = ec2.describe_addresses(
                Filters=[{"Name": "instance-id", "Values": [instance_id]}]
            ).get("Addresses", [])
        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REMOVE_ELASTIC_IP",
                "reason": f"Could not look up EIP for {instance_id}: {str(e)}"
            }

        if not addrs:
            return {
                "status": "SKIPPED",
                "action": "REMOVE_ELASTIC_IP",
                "reason": f"Instance {instance_id} has no Elastic IP (only an auto-assigned public IP which cannot be released). No action needed.",
                "execution_id": str(uuid.uuid4()),
            }

        addr = addrs[0]
        allocation_id   = addr.get("AllocationId")
        association_id  = addr.get("AssociationId")
        public_ip       = addr.get("PublicIp")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REMOVE_ELASTIC_IP",
                "allocation_id": allocation_id,
                "public_ip": public_ip,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            if association_id:
                ec2.disassociate_address(AssociationId=association_id)

            ec2.release_address(AllocationId=allocation_id)

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "action": "REMOVE_ELASTIC_IP",
                "metadata": {
                    "instance_id": instance_id,
                    "allocation_id": allocation_id,
                    "public_ip": public_ip,
                    "region": region
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REMOVE_ELASTIC_IP",
                "reason": str(e)
            }

    def _handle_delete_unused_iam_user(self, finding, remediation):

        user_name = finding.get("resource_id")
        iam = self.aws_session.session.client("iam")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DELETE_UNUSED_IAM_USER",
                "user_name": user_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            user = iam.get_user(UserName=user_name)["User"]

            backup = {
                "user": user,
                "login_profile": None,
                "access_keys": [],
                "inline_policies": [],
                "attached_policies": [],
                "groups": []
            }

            try:
                profile = iam.get_login_profile(UserName=user_name)
                backup["login_profile"] = profile["LoginProfile"]

                iam.delete_login_profile(UserName=user_name)

            except iam.exceptions.NoSuchEntityException:
                pass

            keys = iam.list_access_keys(UserName=user_name)["AccessKeyMetadata"]

            for key in keys:
                backup["access_keys"].append({
                    "AccessKeyId": key["AccessKeyId"],
                    "Status": key["Status"]
                })

                iam.update_access_key(
                    UserName=user_name,
                    AccessKeyId=key["AccessKeyId"],
                    Status="Inactive"
                )

                iam.delete_access_key(
                    UserName=user_name,
                    AccessKeyId=key["AccessKeyId"]
                )

            inline = iam.list_user_policies(UserName=user_name)["PolicyNames"]

            for p in inline:
                doc = iam.get_user_policy(UserName=user_name, PolicyName=p)

                backup["inline_policies"].append({
                    "policy_name": p,
                    "document": doc["PolicyDocument"]
                })

                iam.delete_user_policy(UserName=user_name, PolicyName=p)

            attached = iam.list_attached_user_policies(UserName=user_name)["AttachedPolicies"]

            for p in attached:
                backup["attached_policies"].append(p)

                iam.detach_user_policy(
                    UserName=user_name,
                    PolicyArn=p["PolicyArn"]
                )

            groups = iam.list_groups_for_user(UserName=user_name)["Groups"]

            for g in groups:
                backup["groups"].append(g)

                iam.remove_user_from_group(
                    UserName=user_name,
                    GroupName=g["GroupName"]
                )

            iam.delete_user(UserName=user_name)
            safe_backup = make_json_safe(backup)

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "DELETE_UNUSED_IAM_USER",
                "user_name": user_name,
                "metadata": {
                    "user_backup": safe_backup
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "DELETE_UNUSED_IAM_USER",
                "reason": str(e)
            }

    def _handle_stop_ec2_instance(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "STOP_EC2_INSTANCE",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region": region
                }
            }

        try:
            ec2.stop_instances(InstanceIds=[instance_id])

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "STOP_EC2_INSTANCE",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region": region,
                    "previous_state": "running"
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "STOP_EC2_INSTANCE",
                "reason": str(e)
            }


    def _handle_terminate_ec2_instance(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region      = finding.get("region")

        if self.execution_mode == "DRY_RUN":
            return {
                "status":        "DRY_RUN",
                "action":        "TERMINATE_EC2_INSTANCE",
                "instance_id":   instance_id,
                "resource_id":   instance_id,
                "resource_name": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region":      region,
                    "note":        "Instance will be permanently terminated. Termination protection will be disabled automatically if needed."
                }
            }

        try:
            ec2 = self.aws_session.session.client("ec2", region_name=region)

            try:
                desc  = ec2.describe_instances(InstanceIds=[instance_id])
                rsvns = desc.get("Reservations", [])
                if not rsvns:
                    return {
                        "status":        "FAILED",
                        "action":        "TERMINATE_EC2_INSTANCE",
                        "reason":        f"Instance {instance_id} not found in region {region}",
                        "resource_id":   instance_id,
                        "resource_name": instance_id,
                    }
                instance = rsvns[0]["Instances"][0]
                state    = instance["State"]["Name"]
            except ClientError as e:
                return {
                    "status":        "FAILED",
                    "action":        "TERMINATE_EC2_INSTANCE",
                    "reason":        f"Could not describe instance — {e.response['Error']['Message']}",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            if state not in ("stopped", "stopping"):
                return {
                    "status":        "SKIPPED",
                    "action":        "TERMINATE_EC2_INSTANCE",
                    "reason":        f"Instance is in state '{state}'. It must be stopped before termination.",
                    "instance_id":   instance_id,
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            protection_disabled = False
            try:
                attr = ec2.describe_instance_attribute(
                    InstanceId=instance_id,
                    Attribute="disableApiTermination"
                )
                if attr.get("DisableApiTermination", {}).get("Value", False):
                    print(f"⚠️  {instance_id}: Termination protection ON — disabling automatically")
                    ec2.modify_instance_attribute(
                        InstanceId=instance_id,
                        DisableApiTermination={"Value": False}
                    )
                    protection_disabled = True
                    print(f"✅  {instance_id}: Termination protection disabled")
            except ClientError as e:
                code = e.response["Error"]["Code"]
                msg  = e.response["Error"]["Message"]
                return {
                    "status":        "FAILED",
                    "action":        "TERMINATE_EC2_INSTANCE",
                    "reason":        f"Could not disable termination protection ({code}): {msg}",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            try:
                ec2.terminate_instances(InstanceIds=[instance_id])
            except ClientError as e:
                code = e.response["Error"]["Code"]
                msg  = e.response["Error"]["Message"]
                return {
                    "status":        "FAILED",
                    "action":        "TERMINATE_EC2_INSTANCE",
                    "reason":        f"Termination failed ({code}): {msg}. Check ec2:TerminateInstances IAM permission.",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            return {
                "status":        "EXECUTED",
                "execution_id":  str(uuid.uuid4()),
                "timestamp":     datetime.utcnow().isoformat(),
                "action":        "TERMINATE_EC2_INSTANCE",
                "instance_id":   instance_id,
                "resource_id":   instance_id,
                "resource_name": instance_id,
                "metadata": {
                    "instance_id":          instance_id,
                    "region":               region,
                    "previous_state":       "stopped",
                    "protection_disabled":  protection_disabled,
                }
            }

        except Exception as e:
            return {
                "status":        "FAILED",
                "action":        "TERMINATE_EC2_INSTANCE",
                "reason":        str(e),
                "resource_id":   instance_id,
                "resource_name": instance_id,
            }

    def _handle_force_terminate_ec2_instance(self, finding, remediation):

        instance_id = finding.get("resource_id")
        region      = finding.get("region")

        if self.execution_mode == "DRY_RUN":
            return {
                "status":        "DRY_RUN",
                "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                "instance_id":   instance_id,
                "resource_id":   instance_id,
                "resource_name": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region":      region,
                    "note":        "Running instance will be directly terminated. Termination protection disabled automatically if needed."
                }
            }

        try:
            ec2 = self.aws_session.session.client("ec2", region_name=region)

            try:
                desc  = ec2.describe_instances(InstanceIds=[instance_id])
                rsvns = desc.get("Reservations", [])
                if not rsvns:
                    return {
                        "status":        "FAILED",
                        "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                        "reason":        f"Instance {instance_id} not found in region {region}",
                        "resource_id":   instance_id,
                        "resource_name": instance_id,
                    }
                instance = rsvns[0]["Instances"][0]
                state    = instance["State"]["Name"]
            except ClientError as e:
                return {
                    "status":        "FAILED",
                    "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                    "reason":        f"Could not describe instance — {e.response['Error']['Message']}",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            if state in ("terminated", "shutting-down"):
                return {
                    "status":        "SKIPPED",
                    "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                    "reason":        f"Instance is already in state '{state}'",
                    "instance_id":   instance_id,
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            protection_disabled = False
            try:
                attr = ec2.describe_instance_attribute(
                    InstanceId=instance_id,
                    Attribute="disableApiTermination"
                )
                if attr.get("DisableApiTermination", {}).get("Value", False):
                    print(f"⚠️  {instance_id}: Termination protection ON — disabling automatically")
                    ec2.modify_instance_attribute(
                        InstanceId=instance_id,
                        DisableApiTermination={"Value": False}
                    )
                    protection_disabled = True
                    print(f"✅  {instance_id}: Termination protection disabled")
            except ClientError as e:
                code = e.response["Error"]["Code"]
                msg  = e.response["Error"]["Message"]
                return {
                    "status":        "FAILED",
                    "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                    "reason":        f"Could not disable termination protection ({code}): {msg}",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            try:
                ec2.terminate_instances(InstanceIds=[instance_id])
            except ClientError as e:
                code = e.response["Error"]["Code"]
                msg  = e.response["Error"]["Message"]
                return {
                    "status":        "FAILED",
                    "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                    "reason":        f"Termination failed ({code}): {msg}. Check ec2:TerminateInstances IAM permission.",
                    "resource_id":   instance_id,
                    "resource_name": instance_id,
                }

            return {
                "status":        "EXECUTED",
                "execution_id":  str(uuid.uuid4()),
                "timestamp":     datetime.utcnow().isoformat(),
                "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                "instance_id":   instance_id,
                "resource_id":   instance_id,
                "resource_name": instance_id,
                "metadata": {
                    "instance_id":         instance_id,
                    "region":              region,
                    "previous_state":      state,
                    "protection_disabled": protection_disabled,
                }
            }

        except Exception as e:
            return {
                "status":        "FAILED",
                "action":        "FORCE_TERMINATE_EC2_INSTANCE",
                "reason":        str(e),
                "resource_id":   instance_id,
                "resource_name": instance_id,
            }

    def _handle_revoke_unrestricted_ssh(self, finding, remediation):
        resource_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            response = ec2.describe_security_groups(GroupIds=[resource_id])
            sgs = response.get("SecurityGroups", [])
            if not sgs:
                return {
                    "status": "FAILED",
                    "action": "REVOKE_UNRESTRICTED_SSH",
                    "reason": f"Security group {resource_id} not found in region {region}",
                    "metadata": {}
                }
            sg = sgs[0]
        except ClientError as e:
            return {
                "status": "FAILED",
                "action": "REVOKE_UNRESTRICTED_SSH",
                "reason": f"AWS error fetching security group: {str(e)}",
                "metadata": {}
            }

        rules_to_revoke = []
        for permission in sg.get("IpPermissions", []):
            from_port = permission.get("FromPort", 0)
            to_port = permission.get("ToPort", 65535)
            protocol = permission.get("IpProtocol", "")

            for ip_range in permission.get("IpRanges", []):
                if ip_range.get("CidrIp") == "0.0.0.0/0":
                    if protocol in ["-1", "tcp"] and from_port <= 22 <= to_port:
                        rules_to_revoke.append({
                            "IpProtocol": protocol,
                            "FromPort": from_port,
                            "ToPort": to_port,
                            "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
                        })

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REVOKE_UNRESTRICTED_SSH",
                "resource_id": resource_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix"),
                "rules_to_revoke": rules_to_revoke,
                "metadata": {
                    "resource_id": resource_id,
                    "region": region,
                    "revoked_rules": rules_to_revoke
                }
            }

        if not rules_to_revoke:
            return {
                "status": "SKIPPED",
                "reason": "No matching SSH rule found",
                "resource_id": resource_id,
                "metadata": {}
            }

        try:
            ec2.revoke_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=rules_to_revoke
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "REVOKE_UNRESTRICTED_SSH",
                    "resource_id": resource_id,
                    "metadata": {
                        "resource_id": resource_id,
                        "region": region,
                        "revoked_rules": rules_to_revoke
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "REVOKE_UNRESTRICTED_SSH",
                "resource_id": resource_id,
                "metadata": {
                    "resource_id": resource_id,
                    "region": region,
                    "revoked_rules": rules_to_revoke
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REVOKE_UNRESTRICTED_SSH",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_revoke_unrestricted_rdp(self, finding, remediation):
        resource_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            response = ec2.describe_security_groups(GroupIds=[resource_id])
            sgs = response.get("SecurityGroups", [])
            if not sgs:
                return {
                    "status": "FAILED",
                    "action": "REVOKE_UNRESTRICTED_RDP",
                    "reason": f"Security group {resource_id} not found in region {region}",
                    "metadata": {}
                }
            sg = sgs[0]
        except ClientError as e:
            return {
                "status": "FAILED",
                "action": "REVOKE_UNRESTRICTED_RDP",
                "reason": f"AWS error fetching security group: {str(e)}",
                "metadata": {}
            }

        rules_to_revoke = []
        for permission in sg.get("IpPermissions", []):
            from_port = permission.get("FromPort", 0)
            to_port = permission.get("ToPort", 65535)
            protocol = permission.get("IpProtocol", "")

            for ip_range in permission.get("IpRanges", []):
                if ip_range.get("CidrIp") == "0.0.0.0/0":
                    if protocol in ["-1", "tcp"] and from_port <= 3389 <= to_port:
                        rules_to_revoke.append({
                            "IpProtocol": protocol,
                            "FromPort": from_port,
                            "ToPort": to_port,
                            "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
                        })

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "REVOKE_UNRESTRICTED_RDP",
                "resource_id": resource_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix"),
                "rules_to_revoke": rules_to_revoke,
                "metadata": {
                    "resource_id": resource_id,
                    "region": region,
                    "revoked_rules": rules_to_revoke
                }
            }

        if not rules_to_revoke:
            return {
                "status": "SKIPPED",
                "reason": "No matching RDP rule found",
                "resource_id": resource_id,
                "metadata": {}
            }

        try:
            ec2.revoke_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=rules_to_revoke
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "REVOKE_UNRESTRICTED_RDP",
                    "resource_id": resource_id,
                    "metadata": {
                        "resource_id": resource_id,
                        "region": region,
                        "revoked_rules": rules_to_revoke
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "REVOKE_UNRESTRICTED_RDP",
                "resource_id": resource_id,
                "metadata": {
                    "resource_id": resource_id,
                    "region": region,
                    "revoked_rules": rules_to_revoke
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "REVOKE_UNRESTRICTED_RDP",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_enforce_imdsv2(self, finding, remediation):
        instance_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENFORCE_IMDSV2",
                "instance_id": instance_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "instance_id": instance_id,
                    "region": region,
                    "previous_http_tokens": "optional"
                }
            }

        try:
            ec2.modify_instance_metadata_options(
                InstanceId=instance_id,
                HttpTokens="required",
                HttpEndpoint="enabled"
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "ENFORCE_IMDSV2",
                    "resource_id": instance_id,
                    "metadata": {
                        "instance_id": instance_id,
                        "region": region,
                        "previous_http_tokens": "optional"
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENFORCE_IMDSV2",
                "instance_id": instance_id,
                "metadata": {
                    "instance_id": instance_id,
                    "region": region,
                    "previous_http_tokens": "optional"
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENFORCE_IMDSV2",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_make_snapshot_private(self, finding, remediation):
        snapshot_id = finding.get("resource_id")
        region = finding.get("region")

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "MAKE_SNAPSHOT_PRIVATE",
                "snapshot_id": snapshot_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "snapshot_id": snapshot_id,
                    "region": region,
                    "previous_permission": "public"
                }
            }

        try:
            ec2.modify_snapshot_attribute(
                SnapshotId=snapshot_id,
                Attribute="createVolumePermission",
                OperationType="remove",
                GroupNames=["all"]
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "MAKE_SNAPSHOT_PRIVATE",
                    "resource_id": snapshot_id,
                    "metadata": {
                        "snapshot_id": snapshot_id,
                        "region": region,
                        "previous_permission": "public"
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "MAKE_SNAPSHOT_PRIVATE",
                "snapshot_id": snapshot_id,
                "metadata": {
                    "snapshot_id": snapshot_id,
                    "region": region,
                    "previous_permission": "public"
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "MAKE_SNAPSHOT_PRIVATE",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_disable_rds_public_access(self, finding, remediation):
        db_id = finding.get("resource_id")
        region = finding.get("region")

        rds = self.aws_session.session.client("rds", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DISABLE_RDS_PUBLIC_ACCESS",
                "db_id": db_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_publicly_accessible": True
                }
            }

        try:
            rds.modify_db_instance(
                DBInstanceIdentifier=db_id,
                PubliclyAccessible=False,
                ApplyImmediately=True
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "DISABLE_RDS_PUBLIC_ACCESS",
                    "resource_id": db_id,
                    "metadata": {
                        "db_id": db_id,
                        "region": region,
                        "previous_publicly_accessible": True
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "DISABLE_RDS_PUBLIC_ACCESS",
                "db_id": db_id,
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_publicly_accessible": True
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "DISABLE_RDS_PUBLIC_ACCESS",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_enable_rds_backup(self, finding, remediation):
        db_id = finding.get("resource_id")
        region = finding.get("region")

        rds = self.aws_session.session.client("rds", region_name=region)

        try:
            desc = rds.describe_db_instances(DBInstanceIdentifier=db_id)
            previous_retention = desc["DBInstances"][0].get("BackupRetentionPeriod", 0)
        except Exception:
            previous_retention = 0

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_RDS_BACKUP",
                "db_id": db_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_retention_period": previous_retention
                }
            }

        try:
            rds.modify_db_instance(
                DBInstanceIdentifier=db_id,
                BackupRetentionPeriod=7,
                ApplyImmediately=True
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "ENABLE_RDS_BACKUP",
                    "resource_id": db_id,
                    "metadata": {
                        "db_id": db_id,
                        "region": region,
                        "previous_retention_period": previous_retention
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENABLE_RDS_BACKUP",
                "db_id": db_id,
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_retention_period": previous_retention
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENABLE_RDS_BACKUP",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_enable_rds_deletion_protection(self, finding, remediation):
        db_id = finding.get("resource_id")
        region = finding.get("region")

        rds = self.aws_session.session.client("rds", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_RDS_DELETION_PROTECTION",
                "db_id": db_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_deletion_protection": False
                }
            }

        try:
            rds.modify_db_instance(
                DBInstanceIdentifier=db_id,
                DeletionProtection=True,
                ApplyImmediately=True
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "ENABLE_RDS_DELETION_PROTECTION",
                    "resource_id": db_id,
                    "metadata": {
                        "db_id": db_id,
                        "region": region,
                        "previous_deletion_protection": False
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ENABLE_RDS_DELETION_PROTECTION",
                "db_id": db_id,
                "metadata": {
                    "db_id": db_id,
                    "region": region,
                    "previous_deletion_protection": False
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ENABLE_RDS_DELETION_PROTECTION",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_disable_stale_access_key(self, finding, remediation):
        user_name = finding.get("resource_id")
        access_key_id = (
            finding.get("access_key_id") or
            finding.get("metadata", {}).get("access_key_id")
        )

        if not access_key_id:
            return {
                "status": "FAILED",
                "reason": "Missing access_key_id",
                "metadata": {}
            }

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DISABLE_STALE_ACCESS_KEY",
                "user_name": user_name,
                "access_key_id": access_key_id,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "user_name": user_name,
                    "access_key_id": access_key_id,
                    "previous_status": "Active"
                }
            }

        iam = self.aws_session.session.client("iam")

        try:
            iam.update_access_key(
                UserName=user_name,
                AccessKeyId=access_key_id,
                Status="Inactive"
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "DISABLE_STALE_ACCESS_KEY",
                    "resource_id": user_name,
                    "metadata": {
                        "user_name": user_name,
                        "access_key_id": access_key_id,
                        "previous_status": "Active"
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "DISABLE_STALE_ACCESS_KEY",
                "user_name": user_name,
                "metadata": {
                    "user_name": user_name,
                    "access_key_id": access_key_id,
                    "previous_status": "Active"
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "DISABLE_STALE_ACCESS_KEY",
                "reason": str(e),
                "metadata": {}
            }


    def _handle_set_log_group_retention(self, finding, remediation):
        log_group_name = finding.get("resource_id")  # resource_id IS the log group name
        region = finding.get("region")

        logs = self.aws_session.session.client("logs", region_name=region)

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "SET_LOG_GROUP_RETENTION",
                "log_group_name": log_group_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "metadata": {
                    "log_group_name": log_group_name,
                    "region": region,
                    "previous_retention_days": None,
                    "new_retention_days": 90
                }
            }

        try:
            logs.put_retention_policy(
                logGroupName=log_group_name,
                retentionInDays=90
            )

            execution_id = str(uuid.uuid4())

            if self.history:
                self.history.record_execution({
                    "execution_id": execution_id,
                    "action": "SET_LOG_GROUP_RETENTION",
                    "resource_id": log_group_name,
                    "metadata": {
                        "log_group_name": log_group_name,
                        "region": region,
                        "previous_retention_days": None,
                        "new_retention_days": 90
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })

            return {
                "status": "EXECUTED",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "action": "SET_LOG_GROUP_RETENTION",
                "log_group_name": log_group_name,
                "metadata": {
                    "log_group_name": log_group_name,
                    "region": region,
                    "previous_retention_days": None,
                    "new_retention_days": 90
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "SET_LOG_GROUP_RETENTION",
                "reason": str(e),
                "metadata": {}
            }



    def execute(self, finding):

        remediation = finding.get("remediation")

        if not isinstance(remediation, dict):
            return {
                "status": "SKIPPED",
                "reason": "Invalid remediation format",
                "found_type": str(type(remediation)),
                "finding_id": finding.get("id"),
                "metadata": {}
            }

        if remediation.get("action") == "NO_ACTION":
            return {
                "status": "SKIPPED",
                "reason": "No remediation defined",
                "metadata": {}
            }

        action = remediation.get("action")

        force_execute = finding.get("force_execute", False)

        guard = self.safety_guard.validate(finding, action)

        if not guard["allowed"] and not force_execute:
            return {
                "status": guard.get("status", "BLOCKED_BY_POLICY"),
                "reason": guard.get("reason", "Blocked by safety guard"),
                "action": action,
                "resource_id": finding.get("resource_id"),
                "metadata": {
                    "resource_id": finding.get("resource_id")
                }
            }


        resource_id = finding.get("resource_id")
        region = finding.get("region")
        if self.history:

            previously_executed = self.history.has_execution(
                resource_id=resource_id,
                action=action,
                region=region
            )
            if previously_executed:

                if action == "RESTRICT_SECURITY_GROUP":

                    try:
                        ec2 = self.aws_session.session.client("ec2", region_name=region)
                        response = ec2.describe_security_groups(GroupIds=[resource_id])
                        sgs = response.get("SecurityGroups", [])
                        sg = sgs[0] if sgs else None
                    except Exception:
                        sg = None

                    still_public = False

                    if sg:
                        for permission in sg.get("IpPermissions", []):
                            for ip_range in permission.get("IpRanges", []):
                                if ip_range.get("CidrIp") == "0.0.0.0/0":
                                    still_public = True
                                    break

                    if not still_public:
                        return {
                            "status": "SKIPPED",
                            "reason": "Already executed and no public exposure detected",
                            "resource_id": resource_id,
                            "action": action,
                            "region": region,
                            "metadata": {}
                        }

                else:
                    return {
                        "status": "SKIPPED",
                        "reason": "Already executed",
                        "resource_id": resource_id,
                        "action": action,
                        "region": region,
                        "metadata": {}
                    }
        

        if self.execution_mode == "LIVE":

            if not LIVE_EXECUTION_ENABLED or not LIVE_EXECUTION_APPROVED_BY_USER:
                return {
                    "status": "BLOCKED",
                    "reason": "LIVE execution not approved",
                    "resource_id": resource_id,
                    "action": action,
                    "region": region,
                    "metadata": {}
                }

            if action not in ALLOWED_LIVE_ACTIONS:
                return {
                    "status": "BLOCKED",
                    "reason": "Action not allow-listed for LIVE execution",
                    "resource_id": resource_id,
                    "action": action,
                    "region": region,
                    "metadata": {}
                }


        handler = self.action_handlers.get(action)
        if handler:
            try:
                result = handler(finding, remediation)
            except Exception as handler_exc:
                import traceback
                traceback.print_exc()
                result = {
                    "status": "FAILED",
                    "reason": f"Handler error [{action}]: {str(handler_exc)}",
                    "action": action,
                    "resource_id": finding.get("resource_id"),
                    "metadata": {}
                }

            if not isinstance(result, dict):
                result = {"status": "FAILED", "reason": "Handler returned non-dict", "metadata": {}}
            if "metadata" not in result or result["metadata"] is None:
                result["metadata"] = {}

            return result
        else:
            return {
                "status": "FAILED",
                "reason": f"No handler implemented for action: {action}",
                "action": action,
                "resource_id": finding.get("resource_id"),
                "metadata": {}
            }

    def _handle_delete_default_vpc(self, finding, remediation):
        vpc_id  = finding.get("resource_id")
        region  = finding.get("region")

        if not vpc_id or not region:
            return {
                "status":   "FAILED",
                "reason":   "Missing vpc_id or region in finding",
                "metadata": {}
            }

        ec2 = self.aws_session.session.client("ec2", region_name=region)

        try:
            subnets = ec2.describe_subnets(
                Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
            )["Subnets"]

            route_tables = ec2.describe_route_tables(
                Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
            )["RouteTables"]

            igws = ec2.describe_internet_gateways(
                Filters=[{"Name": "attachment.vpc-id", "Values": [vpc_id]}]
            )["InternetGateways"]

            nat_gateways = ec2.describe_nat_gateways(
                Filters=[
                    {"Name": "vpc-id",  "Values": [vpc_id]},
                    {"Name": "state",   "Values": ["available", "pending"]},
                ]
            )["NatGateways"]

            peering_req = ec2.describe_vpc_peering_connections(
                Filters=[
                    {"Name": "requester-vpc-info.vpc-id", "Values": [vpc_id]},
                    {"Name": "status-code",               "Values": ["active", "pending-acceptance"]},
                ]
            )["VpcPeeringConnections"]
            peering_acc = ec2.describe_vpc_peering_connections(
                Filters=[
                    {"Name": "accepter-vpc-info.vpc-id",  "Values": [vpc_id]},
                    {"Name": "status-code",               "Values": ["active", "pending-acceptance"]},
                ]
            )["VpcPeeringConnections"]
            _peering_map = {p["VpcPeeringConnectionId"]: p for p in peering_req + peering_acc}
            peering = list(_peering_map.values())

            sgs = ec2.describe_security_groups(
                Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
            )["SecurityGroups"]

            vpc_detail = ec2.describe_vpcs(VpcIds=[vpc_id])["Vpcs"][0]

        except Exception as e:
            return {
                "status":   "FAILED",
                "reason":   f"Failed to collect VPC inventory: {e}",
                "metadata": {}
            }

        non_main_rts = [rt for rt in route_tables if not any(a.get("Main") for a in rt.get("Associations", []))]

        summary_lines = [
            f"VPC: {vpc_id} ({vpc_detail.get('CidrBlock', '?')}) in {region}",
            f"  {len(subnets)} subnet(s) to delete",
            f"  {len(igws)} internet gateway(s) to detach & delete",
            f"  {len(nat_gateways)} NAT gateway(s) to delete",
            f"  {len(non_main_rts)} non-main route table(s) to delete",
            f"  {len(peering)} VPC peering connection(s) to delete",
            f"  {len([s for s in sgs if s['GroupName'] != 'default'])} non-default security group(s) to delete",
        ]

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DELETE_DEFAULT_VPC",
                "vpc_id": vpc_id,
                "region": region,
                "summary": "\n".join(summary_lines),
                "would_delete": {
                    "subnets":        [s["SubnetId"] for s in subnets],
                    "internet_gateways": [g["InternetGatewayId"] for g in igws],
                    "nat_gateways":   [n["NatGatewayId"] for n in nat_gateways],
                    "route_tables":   [r["RouteTableId"] for r in non_main_rts],
                    "peering":        [p["VpcPeeringConnectionId"] for p in peering],
                },
                "metadata": {
                    "vpc_id":        vpc_id,
                    "region":        region,
                    "cidr_block":    vpc_detail.get("CidrBlock"),
                    "vpc_snapshot":  make_json_safe(vpc_detail),
                    "subnets":       make_json_safe(subnets),
                    "route_tables":  make_json_safe(route_tables),
                    "igws":          make_json_safe(igws),
                    "nat_gateways":  make_json_safe(nat_gateways),
                    "peering":       make_json_safe(peering),
                }
            }

        deleted_log = []
        errors_log  = []

        for sg in sgs:
            sg_id = sg["GroupId"]
            try:
                if sg.get("IpPermissions"):
                    ec2.revoke_security_group_ingress(
                        GroupId=sg_id, IpPermissions=sg["IpPermissions"]
                    )
            except Exception as e:
                errors_log.append(f"SG ingress clear {sg_id}: {e}")
            try:
                if sg.get("IpPermissionsEgress"):
                    ec2.revoke_security_group_egress(
                        GroupId=sg_id, IpPermissions=sg["IpPermissionsEgress"]
                    )
            except Exception as e:
                errors_log.append(f"SG egress clear {sg_id}: {e}")

        nat_eip_alloc_ids = []
        for nat in nat_gateways:
            nat_id = nat["NatGatewayId"]
            try:
                for addr in nat.get("NatGatewayAddresses", []):
                    alloc = addr.get("AllocationId")
                    if alloc:
                        nat_eip_alloc_ids.append(alloc)

                ec2.delete_nat_gateway(NatGatewayId=nat_id)
                deleted_log.append(f"NAT Gateway deleted: {nat_id}")
            except Exception as e:
                errors_log.append(f"NAT {nat_id}: {e}")

        if nat_gateways:
            max_wait = 120  # 2 min max
            elapsed  = 0
            while elapsed < max_wait:
                try:
                    remaining = ec2.describe_nat_gateways(
                        Filters=[
                            {"Name": "vpc-id", "Values": [vpc_id]},
                            {"Name": "state",  "Values": ["deleting", "pending"]},
                        ]
                    )["NatGateways"]
                    if not remaining:
                        break
                except Exception:
                    break
                time.sleep(10)
                elapsed += 10

        for alloc_id in nat_eip_alloc_ids:
            try:
                ec2.release_address(AllocationId=alloc_id)
                deleted_log.append(f"EIP released: {alloc_id}")
            except Exception as e:
                errors_log.append(f"EIP {alloc_id}: {e}")

        for igw in igws:
            igw_id = igw["InternetGatewayId"]
            try:
                ec2.detach_internet_gateway(InternetGatewayId=igw_id, VpcId=vpc_id)
                deleted_log.append(f"IGW detached: {igw_id}")
            except Exception as e:
                errors_log.append(f"IGW detach {igw_id}: {e}")

            try:
                ec2.delete_internet_gateway(InternetGatewayId=igw_id)
                deleted_log.append(f"IGW deleted: {igw_id}")
            except Exception as e:
                errors_log.append(f"IGW delete {igw_id}: {e}")

        for subnet in subnets:
            subnet_id = subnet["SubnetId"]
            try:
                enis = ec2.describe_network_interfaces(
                    Filters=[
                        {"Name": "subnet-id", "Values": [subnet_id]},
                        {"Name": "status",    "Values": ["available"]},
                    ]
                )["NetworkInterfaces"]
                for eni in enis:
                    eni_id = eni["NetworkInterfaceId"]
                    try:
                        ec2.delete_network_interface(NetworkInterfaceId=eni_id)
                        deleted_log.append(f"ENI deleted: {eni_id}")
                    except Exception as e:
                        errors_log.append(f"ENI {eni_id}: {e}")
            except Exception as e:
                errors_log.append(f"ENI list for {subnet_id}: {e}")

        try:
            nacls = ec2.describe_network_acls(
                Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
            )["NetworkAcls"]
            for nacl in nacls:
                if not nacl.get("IsDefault"):
                    nacl_id = nacl["NetworkAclId"]
                    for assoc in nacl.get("Associations", []):
                        try:
                            default_nacl = next(
                                (n for n in nacls if n.get("IsDefault")), None
                            )
                            if default_nacl:
                                ec2.replace_network_acl_association(
                                    AssociationId=assoc["NetworkAclAssociationId"],
                                    NetworkAclId=default_nacl["NetworkAclId"],
                                )
                        except Exception:
                            pass
                    try:
                        ec2.delete_network_acl(NetworkAclId=nacl_id)
                        deleted_log.append(f"NACL deleted: {nacl_id}")
                    except Exception as e:
                        errors_log.append(f"NACL {nacl_id}: {e}")
        except Exception as e:
            errors_log.append(f"NACL list: {e}")

        for subnet in subnets:
            subnet_id = subnet["SubnetId"]
            try:
                ec2.delete_subnet(SubnetId=subnet_id)
                deleted_log.append(f"Subnet deleted: {subnet_id}")
            except Exception as e:
                errors_log.append(f"Subnet {subnet_id}: {e}")

        for rt in non_main_rts:
            rt_id = rt["RouteTableId"]
            try:
                ec2.delete_route_table(RouteTableId=rt_id)
                deleted_log.append(f"Route table deleted: {rt_id}")
            except Exception as e:
                errors_log.append(f"RT {rt_id}: {e}")

        for pc in peering:
            pc_id = pc["VpcPeeringConnectionId"]
            try:
                ec2.delete_vpc_peering_connection(VpcPeeringConnectionId=pc_id)
                deleted_log.append(f"VPC peering deleted: {pc_id}")
            except Exception as e:
                errors_log.append(f"Peering {pc_id}: {e}")

        for sg in sgs:
            if sg["GroupName"] == "default":
                continue
            sg_id = sg["GroupId"]
            try:
                ec2.delete_security_group(GroupId=sg_id)
                deleted_log.append(f"Security group deleted: {sg_id}")
            except Exception as e:
                errors_log.append(f"SG {sg_id}: {e}")

        try:
            ec2.delete_vpc(VpcId=vpc_id)
            deleted_log.append(f"VPC deleted: {vpc_id}")
            final_status = "EXECUTED"
        except Exception as e:
            errors_log.append(f"VPC delete {vpc_id}: {e}")
            final_status = "PARTIAL" if deleted_log else "FAILED"

        return {
            "status":       final_status,
            "action":       "DELETE_DEFAULT_VPC",
            "vpc_id":       vpc_id,
            "region":       region,
            "deleted":      deleted_log,
            "errors":       errors_log,
            "resource_id":  vpc_id,
            "resource_name": vpc_id,
            "metadata": {
                "vpc_id":        vpc_id,
                "region":        region,
                "cidr_block":    vpc_detail.get("CidrBlock"),
                "vpc_snapshot":  make_json_safe(vpc_detail),
                "subnets":       make_json_safe(subnets),
                "route_tables":  make_json_safe(route_tables),
                "igws":          make_json_safe(igws),
                "nat_gateways":  make_json_safe(nat_gateways),
                "peering":       make_json_safe(peering),
                "sgs":           make_json_safe([s for s in sgs if s["GroupName"] != "default"]),
                "deleted_log":   deleted_log,
                "errors_log":    errors_log,
            }
        }
