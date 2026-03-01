from datetime import datetime


class RollbackEngine:
    """
    Restores only revoked rules using stored execution metadata.
    """

    def __init__(self, aws_session, history):
        self.aws_session = aws_session
        self.history = history

    def rollback(self, execution_id):

        history_data = self.history.read_history()

        target_detail = None

        for event in history_data:
            for detail in event.get("details", []):
                execution = detail.get("execution")
                if not execution:
                    continue

                if execution.get("execution_id") == execution_id:
                    target_detail = detail
                    break

        if not target_detail:
            return {
                "status": "FAILED",
                "reason": "Execution ID not found"
            }

        execution_data = target_detail.get("execution")

        revoked_rules = execution_data.get("revoked_rules")
        resource_id = execution_data.get("resource_id")
        region = execution_data.get("region")

        if not revoked_rules:
            return {
                "status": "FAILED",
                "reason": "No revoked rules found for this execution"
            }

        try:
            ec2 = self.aws_session.session.client("ec2", region_name=region)

            # Re-authorize only the rules that were revoked
            ec2.authorize_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=revoked_rules
            )

            rollback_record = {
                "status": "ROLLBACK_SUCCESS",
                "rollback_timestamp": datetime.utcnow().isoformat(),
                "execution_id": execution_id,
                "resource_id": resource_id,
                "region": region,
                "restored_rules": revoked_rules
            }

            return rollback_record

        except Exception as e:
            return {
                "status": "FAILED",
                "reason": str(e)
            }