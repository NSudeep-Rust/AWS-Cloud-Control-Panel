from app.modules.remediation.safety_guard import RemediationSafetyGuard
from botocore.exceptions import ClientError
import json  # if not already at top
  

#from app.config.security_config import S3_LOGGING_BUCKET
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
            "REMOVE_INLINE_POLICY": self._handle_remove_inline_policy,
            "RESTRICT_SECURITY_GROUP": self._handle_restrict_security_group,
            "ENABLE_S3_ACCESS_LOGGING": self._handle_enable_s3_access_logging,
            "ENABLE_MFA": self._handle_enable_mfa,
            "DISABLE_ACCESS_KEY": self._handle_disable_access_key,
            "ROTATE_ACCESS_KEY": self._handle_rotate_access_key,
            "DELETE_ACCESS_KEY": self._handle_delete_access_key,
            "ENABLE_KMS_KEY_ROTATION": self._handle_enable_kms_rotation,
            "ENABLE_VPC_FLOW_LOGS": self._handle_enable_vpc_flow_logs,
           
        }


    def _handle_enable_s3_versioning(self, finding, remediation):
        bucket_name = finding.get("resource_id")

        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_S3_VERSIONING",
                "bucket_name": bucket_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        s3 = self.aws_session.session.client("s3")

        current = s3.get_bucket_versioning(Bucket=bucket_name)
        previous_status = current.get("Status", "Disabled")

        s3.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration={"Status": "Enabled"}
        )

        return {
            "status": "EXECUTED",
            "execution_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "action": "ENABLE_S3_VERSIONING",
            "bucket_name": bucket_name,
            "metadata": {
                "bucket_name": bucket_name,
                "previous_versioning_status": previous_status
            }
        }


    def _handle_enable_block_public_access(self, finding, remediation):

        bucket_name = finding.get("resource_id")

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

        return {
            "status": "EXECUTED",
            "execution_id": str(uuid.uuid4()),
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

        return {
            "status": "EXECUTED",
            "execution_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "action": "DETACH_ADMIN_POLICY",
            "user_name": user_name,
            "metadata": {
                "user_name": user_name,
                "policy": "AdministratorAccess"
            }
        }


    def _handle_remove_public_s3_acl(self, finding, remediation):

        bucket_name = finding.get("resource_id")

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

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
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

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
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

        # -----------------------------------
        # Fetch current Security Group
        # -----------------------------------
        response = ec2.describe_security_groups(GroupIds=[resource_id])
        sg = response["SecurityGroups"][0]

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

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "RESTRICT_SECURITY_GROUP",
                "resource_id": resource_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix"),
                "targeted_rules": targeted_rules
            }

        # -----------------------------------
        # LIVE EXECUTION
        # -----------------------------------
        execution_id = str(uuid.uuid4())
        revoked_rules = []

        for rule in targeted_rules:
            ec2.revoke_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=[rule]
            )
            revoked_rules.append(rule)

        # -----------------------------------
        # SAVE HISTORY (rollback support)
        # -----------------------------------
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

        bucket_name = finding.get("resource_id")

        account_id = self.aws_session.get_account_id()
        log_bucket = f"security-logs-{account_id}"

        s3 = self.aws_session.session.client("s3")

        # -----------------------------------
        # STEP 1 — GET CURRENT STATE
        # -----------------------------------
        try:
            current = s3.get_bucket_logging(Bucket=bucket_name)
            previous_logging = current.get("LoggingEnabled", {})
        except Exception:
            previous_logging = {}

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
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

        # -----------------------------------
        # LIVE EXECUTION
        # -----------------------------------
        
        # ✅ STEP 1 — Ensure log bucket exists
   

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

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_MFA",
                "user_name": user_name,
                "recommended_fix": remediation.get("recommended_fix"),
                "message": "MFA must be enabled manually or enforced via IAM policy"
            }

        # -----------------------------------
        # LIVE (ADVISORY ONLY)
        # -----------------------------------
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
        access_key_id = finding.get("access_key_id")

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
            # 🔥 Get current status for rollback
            key_metadata = iam.list_access_keys(UserName=user_name)["AccessKeyMetadata"]

            previous_status = None
            for key in key_metadata:
                if key["AccessKeyId"] == access_key_id:
                    previous_status = key["Status"]
                    break

            # 🔥 Disable key
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

    def _handle_rotate_access_key(self, finding, remediation):



        user_name = finding.get("resource_id")
        old_key_id = finding.get("access_key_id")

        if not user_name or not old_key_id:
            return {
                "status": "FAILED",
                "reason": "Missing user_name or access_key_id"
            }

        iam = self.aws_session.session.client("iam")

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ROTATE_ACCESS_KEY",
                "user_name": user_name,
                "old_key_id": old_key_id,
                "recommended_fix": remediation.get("recommended_fix")
            }



        # -----------------------------------
        # CHECK EXISTING KEYS COUNT
        # -----------------------------------
        existing_keys = iam.list_access_keys(UserName=user_name).get("AccessKeyMetadata", [])

        if len(existing_keys) >= 2:
            return {
                "status": "FAILED",
                "reason": "User already has 2 access keys. Cannot rotate.",
                "action": "ROTATE_ACCESS_KEY",
                "user_name": user_name
            }

        try:
            # -----------------------------------
            # STEP 1 — Create new key
            # -----------------------------------
            new_key = iam.create_access_key(UserName=user_name)["AccessKey"]

            new_key_id = new_key["AccessKeyId"]
            new_secret = new_key["SecretAccessKey"]

            # -----------------------------------
            # STEP 2 — Disable old key
            # -----------------------------------
            iam.update_access_key(
                UserName=user_name,
                AccessKeyId=old_key_id,
                Status="Inactive"
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": "ROTATE_ACCESS_KEY",
                "user_name": user_name,
                "metadata": {
                    "user_name": user_name,
                    "old_key_id": old_key_id,
                    "new_key_id": new_key_id,
                    "new_secret": new_secret   # ⚠️ IMPORTANT (for rollback)
                }
            }

        except Exception as e:
            return {
                "status": "FAILED",
                "action": "ROTATE_ACCESS_KEY",
                "reason": str(e)
            }


    def _handle_delete_access_key(self, finding, remediation):

        user_name = finding.get("resource_id")
        access_key_id = finding.get("access_key_id")

        if not access_key_id:
            return {
                "status": "FAILED",
                "reason": "Missing access_key_id"
            }

        iam = self.aws_session.session.client("iam")

        # -----------------------------------
        # SAFETY CHECK (VERY IMPORTANT)
        # -----------------------------------
        all_keys = iam.list_access_keys(UserName=user_name)["AccessKeyMetadata"]

        # 🔥 Find target key metadata FIRST
        key_metadata = None
        for key in all_keys:
            if key["AccessKeyId"] == access_key_id:
                key_metadata = key
                break
        # -----------------------------------
        # 🔥 FIX: Make metadata JSON safe
        # -----------------------------------
        safe_metadata = key_metadata.copy()

        if "CreateDate" in safe_metadata:
            safe_metadata["CreateDate"] = safe_metadata["CreateDate"].isoformat()

        # 🔥 If key not found
        if not key_metadata:
            return {
                "status": "FAILED",
                "reason": "Access key not found",
                "user_name": user_name
            }

        # 🔥 DO NOT delete active keys
        if key_metadata["Status"] != "Inactive":
            return {
                "status": "SKIPPED",
                "reason": "Refusing to delete active key",
                "user_name": user_name
            }

        # 🔥 DO NOT delete last remaining key
        if len(all_keys) <= 1:
            return {
                "status": "SKIPPED",
                "reason": "Cannot delete the only access key",
                "user_name": user_name
            }

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "DELETE_ACCESS_KEY",
                "user_name": user_name,
                "access_key_id": access_key_id,
                "recommended_fix": remediation.get("recommended_fix")
            }

        try:
            # 🔥 Capture previous state for rollback
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

                # 🔥 move these OUTSIDE metadata
                "user_name": user_name,
                "access_key_id": access_key_id,

                "metadata": {
                    "previous_metadata": safe_metadata,
                    "deleted_key_id": access_key_id
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

        # -----------------------------------
        # GET CURRENT STATE (for rollback)
        # -----------------------------------
        try:
            current = kms.get_key_rotation_status(KeyId=key_id)
            previous_state = current.get("KeyRotationEnabled", False)
        except Exception as e:
            return {
                "status": "FAILED",
                "reason": f"Failed to fetch current rotation state: {str(e)}"
            }

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
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

        # -----------------------------------
        # LIVE EXECUTION
        # -----------------------------------
        try:
            kms.enable_key_rotation(KeyId=key_id)

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
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

        # -----------------------------------
        # STEP 1 — Check existing flow logs
        # -----------------------------------
        existing = ec2.describe_flow_logs(
            Filters=[{"Name": "resource-id", "Values": [vpc_id]}]
        )["FlowLogs"]

        if existing:
            return {
                "status": "SKIPPED",
                "reason": "Flow logs already enabled",
                "vpc_id": vpc_id
            }

        # -----------------------------------
        # DRY RUN
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": "ENABLE_VPC_FLOW_LOGS",
                "vpc_id": vpc_id,
                "log_group": log_group_name,
                "role": role_name,
                "recommended_fix": remediation.get("recommended_fix")
            }

        # -----------------------------------
        # STEP 2 — Ensure Log Group
        # -----------------------------------
        try:
            logs.create_log_group(logGroupName=log_group_name)
        except logs.exceptions.ResourceAlreadyExistsException:
            pass

        # -----------------------------------
        # STEP 3 — Ensure IAM Role
        # -----------------------------------
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

        # -----------------------------------
        # STEP 4 — Create Flow Log
        # -----------------------------------
        response = ec2.create_flow_logs(
            ResourceIds=[vpc_id],
            ResourceType="VPC",
            TrafficType="ALL",
            LogGroupName=log_group_name,
            DeliverLogsPermissionArn=role_arn
        )

        flow_log_id = response["FlowLogIds"][0]

        # -----------------------------------
        # SAVE HISTORY (CRITICAL)
        # -----------------------------------
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

    def execute(self, finding):

        remediation = finding.get("remediation")

        # 🔥 FIX START
        if not isinstance(remediation, dict):
            return {
                "status": "SKIPPED",
                "reason": "Invalid remediation format",
                "found_type": str(type(remediation)),
                "finding_id": finding.get("id")
            }
        # 🔥 FIX END

        if remediation.get("action") == "NO_ACTION":
            return {
                "status": "SKIPPED",
                "reason": "No remediation defined"
            }

        action = remediation.get("action")

        force_execute = finding.get("force_execute", False)

        guard = self.safety_guard.validate(finding, action)

        if not guard["allowed"] and not force_execute:
            return {
                "status": "BLOCKED_BY_POLICY",
                "reason": "Blocked by safety guard",
                "action": action,
                "resource_id": finding.get("resource_id")
            }

        # 🔥 ADD LIVE GATE HERE (MOVE THIS UP)

        resource_id = finding.get("resource_id")
        region = finding.get("region")

        if self.execution_mode == "LIVE":

            if not LIVE_EXECUTION_ENABLED or not LIVE_EXECUTION_APPROVED_BY_USER:
                return {
                    "status": "BLOCKED",
                    "reason": "LIVE execution not approved",
                    "resource_id": resource_id,
                    "action": action,
                    "region": region
                }

            if action not in ALLOWED_LIVE_ACTIONS:
                return {
                    "status": "BLOCKED",
                    "reason": "Action not allow-listed for LIVE execution",
                    "resource_id": resource_id,
                    "action": action,
                    "region": region
                }

        # -----------------------------------
        # HANDLER EXECUTION (SAFE NOW)
        # -----------------------------------

        handler = self.action_handlers.get(action)
        if handler:
            return handler(finding, remediation)



        

        

        if self.history:

            previously_executed = self.history.has_execution(resource_id, action)

            if previously_executed:

                ec2 = self.aws_session.session.client("ec2", region_name=region)
                response = ec2.describe_security_groups(GroupIds=[resource_id])
                sg = response["SecurityGroups"][0]

                still_public = False

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
                        "region": region
                    }

        return {
            "status": "FAILED",
            "reason": f"No handler implemented for action: {action}",
            "action": action
        }
                    


        