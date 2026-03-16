from datetime import datetime


class RollbackEngine:
    """
    Restores previously executed remediation actions.
    Supports firewall and IAM rollback.
    """

    def __init__(self, aws_session, history):
        self.aws_session = aws_session
        self.history = history

    def rollback(self, execution_id):

        history_data = self.history.read_history()

        target_execution = None

        # -----------------------------------
        # Locate execution in history
        # -----------------------------------
        for event in history_data:
            for detail in event.get("details", []):
                execution = detail.get("execution")

                if not execution:
                    continue

                if execution.get("execution_id") == execution_id:
                    target_execution = execution
                    break

        if not target_execution:
            return {
                "status": "FAILED",
                "reason": "Execution ID not found"
            }

        action = target_execution.get("action")

        # =====================================================
        # FIREWALL ROLLBACK
        # =====================================================
        if action == "RESTRICT_SECURITY_GROUP":

            revoked_rules = target_execution.get("revoked_rules")
            resource_id = target_execution.get("resource_id")
            region = target_execution.get("region")

            if not revoked_rules:
                return {
                    "status": "FAILED",
                    "reason": "No revoked rules found for this execution"
                }

            try:
                ec2 = self.aws_session.session.client("ec2", region_name=region)

                ec2.authorize_security_group_ingress(
                    GroupId=resource_id,
                    IpPermissions=revoked_rules
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "rollback_timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "resource_id": resource_id,
                    "region": region,
                    "restored_rules": revoked_rules
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # =====================================================
        # IAM ROLLBACK
        # =====================================================
        if action == "DETACH_ADMIN_POLICY":

            user_name = target_execution.get("user_name")

            try:
                iam = self.aws_session.session.client("iam")

                iam.attach_user_policy(
                    UserName=user_name,
                    PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess"
                )

                return {
                    "status": "ROLLBACK_SUCCESS",
                    "rollback_timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "resource_id": user_name,
                    "restored_policy": "AdministratorAccess"
                }

            except Exception as e:
                return {
                    "status": "FAILED",
                    "reason": str(e)
                }

        # =====================================================
        # UNKNOWN ACTION
        # =====================================================
        return {
            "status": "FAILED",
            "reason": f"Rollback not supported for action: {action}"
        }