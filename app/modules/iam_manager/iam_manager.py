from datetime import datetime
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
        # -------------------------
        # Account Level Password Policy Check
        # -------------------------
        try:
            password_policy = iam.get_account_password_policy()["PasswordPolicy"]

            if not password_policy.get("ExpirePasswords", False):

                findings.append({
                    "id": "iam-password-never-expires",
                    "type": "IAM_PASSWORD_NEVER_EXPIRES",
                    "severity": "MEDIUM",
                    "resource_id": "account",
                    "description": "IAM password policy does not enforce password expiration"
                })

        except iam.exceptions.NoSuchEntityException:
            findings.append({
                "id": "iam-password-policy-missing",
                "type": "IAM_PASSWORD_POLICY_MISSING",
                "severity": "HIGH",
                "resource_id": "account",
                "description": "IAM account does not have a password policy configured"
            })



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

            # -------------------------
            # Check: Full Admin Policy
            # -------------------------

            for policy in attached_policies:

                policy_version = iam.get_policy(
                    PolicyArn=policy["PolicyArn"]
                )["Policy"]["DefaultVersionId"]

                policy_doc = iam.get_policy_version(
                    PolicyArn=policy["PolicyArn"],
                    VersionId=policy_version
                )["PolicyVersion"]["Document"]

                for statement in policy_doc.get("Statement", []):

                    actions = statement.get("Action")
                    resources = statement.get("Resource")

                    if actions == "*" and resources == "*":

                        findings.append({
                            "id": f"iam-full-admin-policy-{user_name}",
                            "type": "IAM_POLICY_FULL_ADMIN",
                            "severity": "CRITICAL",
                            "resource_id": user_name,
                            "description": "IAM policy grants full administrative access (Action:* Resource:*)"
                        })

            # -------------------------
            # Check: IAM User Without MFA
            # -------------------------

            mfa_devices = iam.list_mfa_devices(UserName=user_name).get("MFADevices", [])

            if len(mfa_devices) == 0:

                findings.append({
                    "id": f"iam-no-mfa-{user_name}",
                    "type": "IAM_USER_WITHOUT_MFA",
                    "severity": "HIGH",
                    "resource_id": user_name,
                    "description": "IAM user does not have MFA enabled"
                })


            # -------------------------
            # Check: Old Access Keys
            # -------------------------

            access_keys = iam.list_access_keys(UserName=user_name).get("AccessKeyMetadata", [])

            for key in access_keys:

                create_date = key["CreateDate"]
                key_id = key["AccessKeyId"]

                age_days = (datetime.utcnow() - create_date.replace(tzinfo=None)).days

                if age_days > 90:

                    findings.append({
                        "id": f"iam-old-access-key-{user_name}",
                        "type": "IAM_ACCESS_KEY_OLD",
                        "severity": "HIGH",
                        "resource_id": user_name,
                        "description": f"Access key {key_id} is older than 90 days"
                    })


                # -------------------------
                # Check: Unused Access Key
                # -------------------------

                last_used_info = iam.get_access_key_last_used(
                    AccessKeyId=key_id
                )["AccessKeyLastUsed"]

                last_used_date = last_used_info.get("LastUsedDate")

                if not last_used_date:

                    findings.append({
                        "id": f"iam-unused-access-key-{user_name}",
                        "type": "IAM_ACCESS_KEY_UNUSED",
                        "severity": "MEDIUM",
                        "resource_id": user_name,
                        "description": f"Access key {key_id} has never been used"
                    })

                else:

                    days_unused = (datetime.utcnow() - last_used_date.replace(tzinfo=None)).days

                    if days_unused > 90:

                        findings.append({
                            "id": f"iam-unused-access-key-{user_name}",
                            "type": "IAM_ACCESS_KEY_UNUSED",
                            "severity": "MEDIUM",
                            "resource_id": user_name,
                            "description": f"Access key {key_id} has not been used for {days_unused} days"
                        })

            # -------------------------
            # Check: Multiple Access Keys
            # -------------------------

            active_keys = [
                key for key in access_keys
                if key["Status"] == "Active"
            ]

            if len(active_keys) > 1:

                findings.append({
                    "id": f"iam-multiple-keys-{user_name}",
                    "type": "IAM_MULTIPLE_ACCESS_KEYS",
                    "severity": "HIGH",
                    "resource_id": user_name,
                    "description": "IAM user has multiple active access keys"
                })

            # -------------------------
            # Check: Unused IAM Users
            # -------------------------

            password_last_used = user.get("PasswordLastUsed")

            if password_last_used:

                days_unused = (datetime.utcnow() - password_last_used.replace(tzinfo=None)).days

                if days_unused > 90:

                    findings.append({
                        "id": f"iam-unused-user-{user_name}",
                        "type": "IAM_UNUSED_USER",
                        "severity": "MEDIUM",
                        "resource_id": user_name,
                        "description": f"IAM user has not logged in for {days_unused} days"
                    })
            # -------------------------
            # Check: Inline Admin Policy
            # -------------------------

            inline_policies = iam.list_user_policies(UserName=user_name).get("PolicyNames", [])

            for policy_name in inline_policies:

                policy_doc = iam.get_user_policy(
                    UserName=user_name,
                    PolicyName=policy_name
                )["PolicyDocument"]

                for statement in policy_doc.get("Statement", []):

                    actions = statement.get("Action")
                    resources = statement.get("Resource")

                    if actions == "*" or actions == ["*"]:

                        findings.append({
                            "id": f"iam-inline-admin-{user_name}",
                            "type": "IAM_INLINE_ADMIN_POLICY",
                            "severity": "CRITICAL",
                            "resource_id": user_name,
                            "description": "IAM user has inline policy with full administrative permissions"
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
        # -------------------------
        # IAM Role External Trust Check
        # -------------------------

        roles = iam.list_roles().get("Roles", [])

        for role in roles:

            role_name = role["RoleName"]
            # -------------------------
            # Check: Role With AdministratorAccess
            # -------------------------

            attached_role_policies = iam.list_attached_role_policies(
                RoleName=role_name
            ).get("AttachedPolicies", [])

            for policy in attached_role_policies:

                if policy["PolicyName"] == "AdministratorAccess":

                    findings.append({
                        "id": f"iam-role-admin-policy-{role_name}",
                        "type": "IAM_ROLE_ADMIN_POLICY",
                        "severity": "CRITICAL",
                        "resource_id": role_name,
                        "description": "IAM role has AdministratorAccess policy attached"
                    })


            trust_policy = role.get("AssumeRolePolicyDocument", {})

            for statement in trust_policy.get("Statement", []):

                principal = statement.get("Principal", {})

                aws_principal = principal.get("AWS")

                if aws_principal:

                    # Normalize to list
                    if not isinstance(aws_principal, list):
                        aws_principal = [aws_principal]

                    for p in aws_principal:

                        # Detect external account access
                        if ":root" in p and "arn:aws:iam::" in p:

                            findings.append({
                                "id": f"iam-external-trust-{role_name}",
                                "type": "IAM_ROLE_EXTERNAL_TRUST",
                                "severity": "CRITICAL",
                                "resource_id": role_name,
                                "description": "IAM role trust policy allows external AWS account to assume this role"
                            })

        return findings