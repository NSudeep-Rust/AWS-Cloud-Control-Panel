class RemediationPlanner:
    """
    Generates remediation recommendations for security findings.
    """

    def plan(self, finding):
        """
        Decide what should be done for a given finding.
        """

        finding_type = finding.get("type")

        if finding_type == "PUBLIC_SECURITY_GROUP":
            return {
                "action": "RESTRICT_SECURITY_GROUP",
                "reason": "Inbound access open to 0.0.0.0/0",
                "recommended_fix": "Limit CIDR to trusted IP ranges",
                "severity": finding.get("severity")
            }

        if finding_type == "SECURITY_GROUP_UNRESTRICTED_SSH":
            return {
                "action": "REVOKE_UNRESTRICTED_SSH",
                "reason": "Security group allows SSH (port 22) from 0.0.0.0/0",
                "recommended_fix": "Revoke the inbound rule that allows port 22 from 0.0.0.0/0",
                "severity": finding.get("severity")
            }

        if finding_type == "SECURITY_GROUP_UNRESTRICTED_RDP":
            return {
                "action": "REVOKE_UNRESTRICTED_RDP",
                "reason": "Security group allows RDP (port 3389) from 0.0.0.0/0",
                "recommended_fix": "Revoke the inbound rule that allows port 3389 from 0.0.0.0/0",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_IMDSV1_ENABLED":
            return {
                "action": "ENFORCE_IMDSV2",
                "reason": "EC2 instance allows IMDSv1 which is vulnerable to SSRF attacks",
                "recommended_fix": "Set HttpTokens to 'required' to enforce IMDSv2 only",
                "severity": finding.get("severity")
            }

        if finding_type == "EBS_SNAPSHOT_PUBLIC":
            return {
                "action": "MAKE_SNAPSHOT_PRIVATE",
                "reason": "EBS snapshot is publicly accessible to all AWS accounts",
                "recommended_fix": "Remove the 'all' group from snapshot create volume permissions",
                "severity": finding.get("severity")
            }

        if finding_type == "RDS_PUBLICLY_ACCESSIBLE":
            return {
                "action": "DISABLE_RDS_PUBLIC_ACCESS",
                "reason": "RDS instance is publicly accessible from the internet",
                "recommended_fix": "Set PubliclyAccessible to False on the RDS instance",
                "severity": finding.get("severity")
            }

        if finding_type == "RDS_BACKUP_DISABLED":
            return {
                "action": "ENABLE_RDS_BACKUP",
                "reason": "RDS automated backups are disabled (retention period = 0)",
                "recommended_fix": "Set backup retention period to at least 7 days",
                "severity": finding.get("severity")
            }

        if finding_type == "RDS_DELETION_PROTECTION_DISABLED":
            return {
                "action": "ENABLE_RDS_DELETION_PROTECTION",
                "reason": "RDS instance does not have deletion protection enabled",
                "recommended_fix": "Enable deletion protection to prevent accidental deletion",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_ACCESS_KEY_NOT_ROTATED":
            return {
                "action": "DISABLE_STALE_ACCESS_KEY",
                "reason": "Active access key has not been rotated in 90+ days",
                "recommended_fix": "Disable old access key and create a new one",
                "severity": finding.get("severity")
            }

        if finding_type == "CLOUDWATCH_LOG_GROUP_NO_RETENTION":
            return {
                "action": "SET_LOG_GROUP_RETENTION",
                "reason": "CloudWatch Log Group has no retention policy — logs accumulate forever",
                "recommended_fix": "Set a retention policy of 90 days on the log group",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_UNUSED_USER":
            return {
                "action": "DELETE_UNUSED_IAM_USER",
                "reason": "IAM user inactive for long duration",
                "recommended_fix": "Delete unused IAM user",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_ADMIN_USER":
            return {
                "action": "DETACH_ADMIN_POLICY",
                "reason": "IAM user has AdministratorAccess attached",
                "recommended_fix": "Detach AdministratorAccess policy from user",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_INLINE_ADMIN_POLICY":
            return {
                "action": "REMOVE_INLINE_POLICY",
                "reason": "Inline policy grants full admin access",
                "recommended_fix": "Delete inline policy",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_WILDCARD_POLICY":
            return {
                "action": "REMOVE_INLINE_WILDCARD_POLICY",
                "reason": "Inline policy contains wildcard permissions",
                "recommended_fix": "Restrict wildcard permissions",
                "severity": finding.get("severity")
            }

        if finding_type == "S3_VERSIONING_DISABLED":
            return {
                "action": "ENABLE_S3_VERSIONING",
                "reason": "S3 bucket versioning is disabled",
                "recommended_fix": "Enable versioning on the bucket",
                "severity": finding.get("severity")
            }

        if finding_type == "S3_BLOCK_PUBLIC_ACCESS_DISABLED":
            return {
                "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
                "reason": "S3 bucket public access block is disabled",
                "recommended_fix": "Enable block public access settings",
                "severity": finding.get("severity")
            }

        if finding_type == "S3_PUBLIC_ACL":
            return {
                "action": "REMOVE_PUBLIC_S3_ACL",
                "reason": "S3 bucket is publicly accessible via ACL",
                "recommended_fix": "Remove public access from bucket ACL",
                "severity": finding.get("severity")
            }

        if finding_type == "S3_ACCESS_LOGGING_DISABLED":
            return {
                "action": "ENABLE_S3_ACCESS_LOGGING",
                "reason": "S3 bucket access logging is disabled",
                "recommended_fix": "Enable server access logging",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_USER_WITHOUT_MFA":
            return {
                "action": "ENABLE_MFA",
                "reason": "IAM user does not have MFA enabled",
                "recommended_fix": "Enable MFA for the user",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_ACCESS_KEY_UNUSED":
            return {
                "action": "DISABLE_ACCESS_KEY",
                "reason": "Access key is unused and poses security risk",
                "recommended_fix": "Disable unused access key",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_ACCESS_KEY_OLD_INACTIVE":
            return {
                "action": "DELETE_ACCESS_KEY",
                "reason": "Old inactive access key should be removed",
                "recommended_fix": "Delete unused inactive access key",
                "severity": finding.get("severity")
            }

        if finding_type == "KMS_KEY_ROTATION_DISABLED":
            return {
                "action": "ENABLE_KMS_KEY_ROTATION",
                "reason": "KMS key rotation is disabled",
                "recommended_fix": "Enable automatic key rotation",
                "severity": finding.get("severity")
            }

        if finding_type == "VPC_FLOW_LOGS_DISABLED":
            return {
                "action": "ENABLE_VPC_FLOW_LOGS",
                "reason": "VPC Flow Logs are not enabled",
                "recommended_fix": "Enable VPC Flow Logs for monitoring network traffic",
                "severity": finding.get("severity")
            }

        if finding_type == "UNUSED_SECURITY_GROUP":
            return {
                "action": "DELETE_UNUSED_SECURITY_GROUP",
                "reason": "Security group is not attached to any resource",
                "recommended_fix": "Delete unused security group to reduce attack surface",
                "severity": finding.get("severity")
            }

        if finding_type == "NACL_ALLOW_ALL_INBOUND":
            return {
                "action": "RESTRICT_NACL_INBOUND",
                "reason": "NACL allows unrestricted inbound access (0.0.0.0/0)",
                "recommended_fix": "Restrict inbound CIDR or remove allow rule",
                "severity": finding.get("severity")
            }

        if finding_type == "NACL_ALLOW_ALL_OUTBOUND":
            return {
                "action": "RESTRICT_NACL_OUTBOUND",
                "reason": "NACL allows unrestricted outbound access (0.0.0.0/0)",
                "recommended_fix": "Restrict outbound CIDR or remove allow rule",
                "severity": finding.get("severity")
            }

        if finding_type == "ROUTE_TABLE_PUBLIC_ROUTE":
            return {
                "action": "REMOVE_PUBLIC_ROUTE",
                "reason": "Route table exposes subnet to internet via IGW",
                "recommended_fix": "Remove 0.0.0.0/0 route to Internet Gateway",
                "severity": finding.get("severity")
            }

        if finding_type == "IAM_ROLE_EXTERNAL_TRUST":
            return {
                "action": "RESTRICT_ROLE_EXTERNAL_TRUST",
                "reason": "IAM role trust policy allows external account access",
                "recommended_fix": "Restrict trust policy to current AWS account only",
                "severity": finding.get("severity")
            }

        if finding_type == "CLOUDTRAIL_DISABLED":
            return {
                "action": "ENABLE_CLOUDTRAIL",
                "reason": "CloudTrail is not enabled",
                "recommended_fix": "Enable CloudTrail with multi-region logging",
                "severity": finding.get("severity")
            }

        if finding_type == "CLOUDTRAIL_NOT_LOGGING":
            return {
                "action": "START_CLOUDTRAIL_LOGGING",
                "reason": "CloudTrail exists but logging is disabled",
                "recommended_fix": "Enable logging for existing CloudTrail",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_TERMINATION_PROTECTION_DISABLED":
            return {
                "action": "ENABLE_TERMINATION_PROTECTION",
                "reason": "EC2 termination protection is disabled",
                "recommended_fix": "Enable termination protection to prevent accidental deletion",
                "severity": finding.get("severity")
            }

        if finding_type == "EBS_UNENCRYPTED_VOLUME":
            return {
                "action": "ENCRYPT_EBS_VOLUME",
                "reason": "EBS volume is not encrypted",
                "recommended_fix": "Create encrypted copy of the volume and replace it",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_WITHOUT_IAM_ROLE":
            return {
                "action": "ATTACH_IAM_ROLE_TO_INSTANCE",
                "reason": "EC2 instance does not have an IAM role attached",
                "recommended_fix": "Attach IAM role using instance profile",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_DEFAULT_SECURITY_GROUP":
            return {
                "action": "REPLACE_SECURITY_GROUP",
                "reason": "Instance is using default security group",
                "recommended_fix": "Attach a restricted security group and remove default",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_PUBLIC_ELASTIC_IP":
            return {
                "action": "REMOVE_ELASTIC_IP",
                "reason": "Unused Elastic IP (not attached)",
                "recommended_fix": "Release unused Elastic IP to reduce cost and attack surface",
                "severity": finding.get("severity")
            }

        if finding_type == "PUBLIC_EC2_INSTANCE":
            return {
                "action": "REMOVE_ELASTIC_IP",
                "reason": "EC2 instance is publicly exposed",
                "recommended_fix": "Remove Elastic IP to prevent public exposure",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_INSTANCE_RUNNING":
            return {
                "action": "STOP_EC2_INSTANCE",
                "reason": "Instance is running unnecessarily",
                "recommended_fix": "Stop instance to save cost",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_INSTANCE_STOPPED":
            return {
                "action": "TERMINATE_EC2_INSTANCE",
                "reason": "Stopped instance unused",
                "recommended_fix": "Terminate instance to clean up",
                "severity": finding.get("severity")
            }

        if finding_type == "EC2_INSTANCE_RUNNING_UNMONITORED":
            return {
                "action": "FORCE_TERMINATE_EC2_INSTANCE",
                "reason": (
                    "Running EC2 instance is flagged for direct termination. "
                    "This skips the stop-first step and immediately terminates the instance. "
                    "Use when you want instant cleanup rather than a graceful shutdown first."
                ),
                "recommended_fix": (
                    "Directly terminate the running instance. "
                    "This is permanent — AWS does not allow restarting a terminated instance."
                ),
                "severity": finding.get("severity")
            }

        if finding_type == "DEFAULT_VPC_EXISTS":
            return {
                "action": "DELETE_DEFAULT_VPC",
                "reason": "Default VPC exists with permissive settings — increases attack surface",
                "recommended_fix": (
                    "Delete the default VPC and all its dependencies: subnets, route tables, "
                    "internet gateway, NAT gateways, and peering connections. "
                    "AWS best practice is to operate without a default VPC."
                ),
                "severity": finding.get("severity"),
                "steps": [
                    "1. Snapshot the VPC configuration for rollback",
                    "2. Delete all NAT gateways and wait for deletion",
                    "3. Release associated Elastic IPs (NAT)",
                    "4. Detach and delete Internet Gateway",
                    "5. Delete all subnets",
                    "6. Delete non-main route tables",
                    "7. Delete VPC peering connections",
                    "8. Delete the VPC itself",
                ]
            }

        return {
            "action": "NO_ACTION",
            "reason": "No remediation required"
        }

