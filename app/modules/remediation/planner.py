class RemediationPlanner:
    """
    Generates remediation recommendations for security findings.
    """

    def plan(self, finding):
        """
        Decide what should be done for a given finding.
        """

        finding_type = finding.get("type")

        # ---------------------------
        # Firewall remediation
        # ---------------------------
        if finding_type == "PUBLIC_SECURITY_GROUP":
            return {
                "action": "RESTRICT_SECURITY_GROUP",
                "reason": "Inbound access open to 0.0.0.0/0",
                "recommended_fix": "Limit CIDR to trusted IP ranges",
                "severity": finding["severity"]
            }

        # ---------------------------
        # IAM admin policy remediation
        # ---------------------------
        if finding_type == "IAM_ADMIN_USER":
            return {
                "action": "DETACH_ADMIN_POLICY",
                "reason": "IAM user has AdministratorAccess attached",
                "recommended_fix": "Detach AdministratorAccess policy from user",
                "severity": finding["severity"]
            }

        # ---------------------------
        # IAM wildcard inline policy (TRANSFORM, NOT DELETE)
        # ---------------------------
        if finding_type == "REMOVE_INLINE_WILDCARD_POLICY":
            return {
                "action": "REMOVE_INLINE_WILDCARD_POLICY",
                "reason": "IAM inline policy contains wildcard permissions",
                "recommended_fix": "Replace wildcard actions with least privilege actions",
                "severity": finding["severity"]
            }

        # ---------------------------
        # IAM inline admin (still DELETE)
        # ---------------------------
        if finding_type == "REMOVE_INLINE_POLICY":
            return {
                "action": "REMOVE_INLINE_POLICY",
                "reason": "IAM inline policy has full admin access",
                "recommended_fix": "Remove inline admin policy",
                "severity": finding["severity"]
            }
     
        # ---------------------------
        # S3 versioning remediation
        # ---------------------------
        if finding_type == "S3_VERSIONING_DISABLED":
            return {
                "action": "ENABLE_S3_VERSIONING",
                "reason": "S3 bucket versioning is disabled",
                "recommended_fix": "Enable versioning on the bucket",
                "severity": finding["severity"]
            }

        # ---------------------------
        # S3 Block Public Access
        # ---------------------------
        if finding_type == "S3_BLOCK_PUBLIC_ACCESS_DISABLED":
            return {
                "action": "ENABLE_BLOCK_PUBLIC_ACCESS",
                "reason": "S3 bucket public access block is disabled",
                "recommended_fix": "Enable block public access settings",
                "severity": finding["severity"]
            }

        # ---------------------------
        # S3 Public ACL remediation
        # ---------------------------
        if finding_type == "S3_PUBLIC_ACL":
            return {
                "action": "REMOVE_PUBLIC_S3_ACL",
                "reason": "S3 bucket is publicly accessible via ACL",
                "recommended_fix": "Remove public access from bucket ACL",
                "severity": finding["severity"]
            }

        # ---------------------------
        # S3 Access Logging remediation
        # ---------------------------
        if finding_type == "S3_ACCESS_LOGGING_DISABLED":
            return {
                "action": "ENABLE_S3_ACCESS_LOGGING",
                "reason": "S3 bucket access logging is disabled",
                "recommended_fix": "Enable server access logging",
                "severity": finding["severity"]
            }

        # ---------------------------
        # IAM MFA
        # ---------------------------

        if finding_type == "IAM_USER_WITHOUT_MFA":
            return {
                "action": "ENABLE_MFA",
                "reason": "IAM user does not have MFA enabled",
                "recommended_fix": "Enable MFA for the user",
                "severity": finding["severity"]
            }

        # ---------------------------
        # Access Key
        # ---------------------------

        if finding_type == "IAM_ACCESS_KEY_UNUSED":
            return {
                "action": "DISABLE_ACCESS_KEY",
                "reason": "Access key is unused and poses security risk",
                "recommended_fix": "Disable unused access key",
                "severity": finding["severity"]
            }



        # ---------------------------
        # OLD INACTIVE KEY (SAFE DELETE)
        # ---------------------------
        if finding_type == "IAM_ACCESS_KEY_OLD_INACTIVE":
            return {
                "action": "DELETE_ACCESS_KEY",
                "reason": "Old inactive access key should be removed",
                "recommended_fix": "Delete unused inactive access key",
                "severity": finding["severity"]
            }

        # ---------------------------
        # KMS Key Rotation
        # ---------------------------
        if finding_type == "KMS_KEY_ROTATION_DISABLED":
            return {
                "action": "ENABLE_KMS_KEY_ROTATION",
                "reason": "KMS key rotation is disabled",
                "recommended_fix": "Enable automatic key rotation",
                "severity": finding["severity"]
            }

        # ---------------------------
        # VPC FLOW
        # ---------------------------

        if finding_type == "VPC_FLOW_LOGS_DISABLED":
            return {
                "action": "ENABLE_VPC_FLOW_LOGS",
                "reason": "VPC Flow Logs are not enabled",
                "recommended_fix": "Enable VPC Flow Logs for monitoring network traffic",
                "severity": finding["severity"]
            }

        # ---------------------------
        # UNUSED SECURITY GROUP
        # ---------------------------
        if finding_type == "UNUSED_SECURITY_GROUP":
            return {
                "action": "DELETE_UNUSED_SECURITY_GROUP",
                "reason": "Security group is not attached to any resource",
                "recommended_fix": "Delete unused security group to reduce attack surface",
                "severity": finding["severity"]
            }

        # ---------------------------
        # NACL INBOUND
        # ---------------------------
        if finding_type == "NACL_ALLOW_ALL_INBOUND":
            return {
                "action": "RESTRICT_NACL_INBOUND",
                "reason": "NACL allows unrestricted inbound access (0.0.0.0/0)",
                "recommended_fix": "Restrict inbound CIDR or remove allow rule",
                "severity": finding["severity"]
            }

        # ---------------------------
        # NACL OUTBOUND
        # ---------------------------
        if finding_type == "NACL_ALLOW_ALL_OUTBOUND":
            return {
                "action": "RESTRICT_NACL_OUTBOUND",
                "reason": "NACL allows unrestricted outbound access (0.0.0.0/0)",
                "recommended_fix": "Restrict outbound CIDR or remove allow rule",
                "severity": finding["severity"]
            }

        # ---------------------------
        # ROUTE TABLE PUBLIC ROUTE
        # ---------------------------
        if finding_type == "ROUTE_TABLE_PUBLIC_ROUTE":
            return {
                "action": "REMOVE_PUBLIC_ROUTE",
                "reason": "Route table exposes subnet to internet via IGW",
                "recommended_fix": "Remove 0.0.0.0/0 route to Internet Gateway",
                "severity": finding["severity"]
            }

        # ---------------------------
        # IAM ROLE EXTERNAL TRUST
        # ---------------------------
        if finding_type == "IAM_ROLE_EXTERNAL_TRUST":
            return {
                "action": "RESTRICT_ROLE_EXTERNAL_TRUST",
                "reason": "IAM role trust policy allows external account access",
                "recommended_fix": "Restrict trust policy to current AWS account only",
                "severity": finding["severity"]
            }

        # ---------------------------
        #   CLOUDTRAIL_DISABLED
        # ---------------------------

        if finding_type == "CLOUDTRAIL_DISABLED":
            return {
                "action": "ENABLE_CLOUDTRAIL",
                "reason": "CloudTrail is not enabled",
                "recommended_fix": "Enable CloudTrail with multi-region logging",
                "severity": finding["severity"]
            }

        if finding_type == "CLOUDTRAIL_NOT_LOGGING":
            return {
                "action": "START_CLOUDTRAIL_LOGGING",
                "reason": "CloudTrail exists but logging is disabled",
                "recommended_fix": "Enable logging for existing CloudTrail",
                "severity": finding["severity"]
            }

        if finding_type == "EC2_TERMINATION_PROTECTION_DISABLED":
            return {
                "action": "ENABLE_TERMINATION_PROTECTION",
                "reason": "EC2 termination protection is disabled",
                "recommended_fix": "Enable termination protection to prevent accidental deletion",
                "severity": finding["severity"]
            }

        # ---------------------------
        # EBS UNENCRYPTED VOLUME
        # ---------------------------
        if finding_type == "EBS_UNENCRYPTED_VOLUME":
            return {
                "action": "ENCRYPT_EBS_VOLUME",
                "reason": "EBS volume is not encrypted",
                "recommended_fix": "Create encrypted copy of the volume and replace it",
                "severity": finding["severity"]
            }

        # ---------------------------
        # EC2 WITHOUT IAM ROLE
        # ---------------------------
        if finding_type == "EC2_WITHOUT_IAM_ROLE":
            return {
                "action": "ATTACH_IAM_ROLE_TO_INSTANCE",
                "reason": "EC2 instance does not have an IAM role attached",
                "recommended_fix": "Attach IAM role using instance profile",
                "severity": finding["severity"]
            }

        # ---------------------------
        # EC2 DEFAULT SECURITY GROUP
        # ---------------------------
        if finding_type == "EC2_DEFAULT_SECURITY_GROUP":
            return {
                "action": "REPLACE_SECURITY_GROUP",
                "reason": "Instance is using default security group",
                "recommended_fix": "Attach a restricted security group and remove default",
                "severity": finding["severity"]
            }

        # ---------------------------
        # EC2 ELASTIC IP (PUBLIC)
        # ---------------------------
        if finding_type == "EC2_PUBLIC_ELASTIC_IP":
            return {
                "action": "REMOVE_ELASTIC_IP",
                "reason": "Unused Elastic IP (not attached)",
                "recommended_fix": "Release unused Elastic IP to reduce cost and attack surface",
                "severity": finding["severity"]
            }

        # ---------------------------
        # EC2 PUBLIC INSTANCE
        # ---------------------------
        if finding_type == "PUBLIC_EC2_INSTANCE":
            return {
                "action": "REMOVE_ELASTIC_IP",
                "reason": "EC2 instance is publicly exposed",
                "recommended_fix": "Remove Elastic IP to prevent public exposure",
                "severity": finding["severity"]
            }

        return {
            "action": "NO_ACTION",
            "reason": "No remediation required"
        }
        