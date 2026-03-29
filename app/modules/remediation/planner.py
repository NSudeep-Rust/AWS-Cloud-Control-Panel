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
        # IAM wildcard inline policy
        # ---------------------------
        if finding_type in ["IAM_WILDCARD_POLICY", "IAM_INLINE_ADMIN_POLICY"]:
            return {
                "action": "REMOVE_INLINE_POLICY",
                "reason": "IAM inline policy contains excessive permissions",
                "recommended_fix": "Remove or restrict inline policy",
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
        # OLD KEY
        # ---------------------------

        if finding_type == "IAM_ACCESS_KEY_OLD":
            return {
                "action": "ROTATE_ACCESS_KEY",
                "reason": "Access key older than 90 days",
                "recommended_fix": "Rotate access key",
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



        return {
            "action": "NO_ACTION",
            "reason": "No remediation required"
        }
        