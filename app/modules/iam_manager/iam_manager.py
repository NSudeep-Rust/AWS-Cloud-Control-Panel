class IAMManager:
    """
    IAM auditing and remediation detection logic.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def audit(self):

        session = self.aws_session.session
        iam = session.client("iam")

        findings = []

        users = iam.list_users().get("Users", [])

        for user in users:
            user_name = user["UserName"]

            # ----------------------------
            # 1️⃣ AdministratorAccess check
            # ----------------------------
            attached_policies = iam.list_attached_user_policies(
                UserName=user_name
            ).get("AttachedPolicies", [])

            for policy in attached_policies:
                if policy["PolicyName"] == "AdministratorAccess":
                    findings.append({
                        "id": f"iam-admin-{user_name}",
                        "type": "IAM_ADMIN_USER",
                        "severity": "CRITICAL",
                        "resource_id": user_name,
                        "policy_arn": policy["PolicyArn"],
                        "description": "IAM user has AdministratorAccess policy attached",
                        "remediation": {
                            "action": "DETACH_ADMIN_POLICY",
                            "recommended_fix": "Detach AdministratorAccess from user"
                        }
                    })

            # ----------------------------
            # 2️⃣ Inline wildcard policy check
            # ----------------------------
            inline_policies = iam.list_user_policies(
                UserName=user_name
            ).get("PolicyNames", [])

            for policy_name in inline_policies:

                policy_doc = iam.get_user_policy(
                    UserName=user_name,
                    PolicyName=policy_name
                )["PolicyDocument"]

                statements = policy_doc.get("Statement", [])

                for stmt in statements:
                    action = stmt.get("Action")
                    resource = stmt.get("Resource")

                    if action == "*" or resource == "*":
                        findings.append({
                            "id": f"iam-wildcard-{user_name}",
                            "type": "IAM_WILDCARD_POLICY",
                            "severity": "HIGH",
                            "resource_id": user_name,
                            "policy_name": policy_name,
                            "description": "Inline policy contains wildcard permissions",
                            "remediation": {
                                "action": "REMOVE_INLINE_POLICY",
                                "recommended_fix": "Remove or restrict wildcard permissions"
                            }
                        })

        return findings