class RemediationSafetyGuard:
    """
    Central safety enforcement layer for all remediation actions.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def validate(self, finding, action):
        from app.config.execution_policy import EXECUTION_POLICY

        resource_id = finding.get("resource_id")
        severity = finding.get("severity")

        actions_policy = EXECUTION_POLICY.get("actions", {})
        resource_control = EXECUTION_POLICY.get("resource_control", {})
        default_policy = EXECUTION_POLICY.get("default", {})

        action_config = actions_policy.get(action, default_policy)

        # -----------------------------------
        # 1. Action allowed?
        # -----------------------------------
        if not action_config.get("allowed", False):
            return self._deny(action, f"Action {action} not allowed by policy")

        # -----------------------------------
        # 2. Severity check (if defined)
        # -----------------------------------
        allowed_severities = action_config.get("severities")

        if allowed_severities and severity not in allowed_severities:
            return self._deny(
                action,
                f"Severity {severity} not allowed for action {action}"
            )

        # -----------------------------------
        # 3. Resource scope
        # -----------------------------------
        if resource_control.get("mode") == "RESTRICTED":
            allowed_ids = resource_control.get("allowed_ids", [])

            if resource_id not in allowed_ids:
                return self._deny(
                    action,
                    f"Resource {resource_id} not allowed"
                )

        # -----------------------------------
        # 4. Approval required?
        # -----------------------------------
        if action_config.get("require_approval"):
            return {
                "allowed": False,
                "status": "REQUIRE_APPROVAL",
                "reason": f"Action {action} requires approval"
            }

        # -----------------------------------
        # 5. Sanity checks
        # -----------------------------------
        sanity = self._sanity_checks(finding, action)
        if not sanity["allowed"]:
            return sanity

        return {"allowed": True}

    # -----------------------------------
    # INTERNAL HELPERS (MISSING BEFORE)
    # -----------------------------------

    def _deny(self, action, reason):
        return {
            "allowed": False,
            "status": "BLOCKED_BY_POLICY",
            "action": action,
            "reason": reason
        }

    def _sanity_checks(self, finding, action):
        """
        Basic safety validations before execution.
        """

        resource_id = finding.get("resource_id")

        if not resource_id:
            return self._deny(action, "Missing resource_id")

        return {"allowed": True}