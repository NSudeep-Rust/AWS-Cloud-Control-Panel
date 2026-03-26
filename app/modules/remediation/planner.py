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






        return {
            "action": "NO_ACTION",
            "reason": "No remediation required"
        }
        