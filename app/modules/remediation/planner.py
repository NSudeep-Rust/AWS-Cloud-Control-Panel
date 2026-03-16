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
        if finding_type == "IAM_WILDCARD_POLICY":
            return {
                "action": "REMOVE_INLINE_POLICY",
                "reason": "IAM inline policy contains wildcard permissions",
                "recommended_fix": "Remove or restrict inline policy",
                "severity": finding["severity"]
            }

        return {
            "action": "NO_ACTION",
            "reason": "No remediation required"
        }