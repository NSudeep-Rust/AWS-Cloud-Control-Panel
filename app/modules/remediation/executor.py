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

    def execute(self, finding):

        if finding.get("type") != "PUBLIC_SECURITY_GROUP":
            return {
                "status": "SKIPPED",
                "reason": "No remediation defined"
            }

        remediation = finding.get("remediation")

        if not remediation or remediation.get("action") == "NO_ACTION":
            return {
                "status": "SKIPPED",
                "reason": "No remediation defined"
            }

        action = remediation.get("action")
        resource_id = finding.get("resource_id")
        region = finding.get("region")

        # -----------------------------------
        # IAM Remediation Handling
        # -----------------------------------
        if action == "DETACH_ADMIN_POLICY":

            if self.execution_mode == "DRY_RUN":
                return {
                    "status": "DRY_RUN",
                    "action": action,
                    "user_name": finding.get("resource_id"),
                    "recommended_fix": remediation.get("recommended_fix")
                }

            iam = self.aws_session.session.client("iam")

            iam.detach_user_policy(
                UserName=finding.get("resource_id"),
                PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess"
            )

            return {
                "status": "EXECUTED",
                "execution_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "action": action,
                "user_name": finding.get("resource_id")
            }



        # -----------------------------------
        # LIVE Safety Gate
        # -----------------------------------
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
        # Smart Idempotency Check (only if history exists)
        # -----------------------------------
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
        # -----------------------------------
        # Fetch current Security Group
        # -----------------------------------
        ec2 = self.aws_session.session.client("ec2", region_name=region)

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
        # DRY RUN MODE
        # -----------------------------------
        if self.execution_mode == "DRY_RUN":
            return {
                "status": "DRY_RUN",
                "action": action,
                "resource_id": resource_id,
                "region": region,
                "recommended_fix": remediation.get("recommended_fix"),
                "targeted_rules": targeted_rules
            }


        # -----------------------------------
        # LIVE MODE (Actual AWS Modification)
        # -----------------------------------
        execution_id = str(uuid.uuid4())

        revoked_rules = []

        for rule in targeted_rules:
            ec2.revoke_security_group_ingress(
                GroupId=resource_id,
                IpPermissions=[rule]
            )
            revoked_rules.append(rule)

        # Save execution to history (for rollback)
        if self.history:
            self.history.record_execution({
                "execution_id": execution_id,
                "resource_id": resource_id,
                "region": region,
                "action": action,
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
            "action": action,
            "revoked_rules": revoked_rules,
            "snapshot_before": snapshot_before
        }