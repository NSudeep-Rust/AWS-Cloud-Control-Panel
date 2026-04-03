from app.config.security_config import SEVERITY_MAP
from datetime import datetime, timezone
from app.utils.iam_policy_utils import has_wildcard, is_full_admin, normalize_statements

class IAMManager:
    """
    IAM auditing and remediation detection logic.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    region = "global"

    def audit(self):

        session = self.aws_session.session
        iam = session.client("iam")
        region = "global"

        findings = []
        seen_ids = set()   # ✅ ADDED

        def add_finding(f):   # ✅ ADDED
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                findings.append(f)

        # -------------------------
        # Account Level Password Policy Check
        # -------------------------
        try:
            password_policy = iam.get_account_password_policy()["PasswordPolicy"]

            if not password_policy.get("ExpirePasswords", False):

                add_finding({
                    "id": "iam-password-never-expires",
                    "type": "IAM_PASSWORD_NEVER_EXPIRES",
                    "severity": SEVERITY_MAP["IAM_PASSWORD_NEVER_EXPIRES"],
                    "resource_id": "account",
                    "region": "global",
                    "description": "IAM password policy does not enforce password expiration"
                })

        except iam.exceptions.NoSuchEntityException:
            add_finding({
                "id": "iam-password-policy-missing",
                "type": "IAM_PASSWORD_POLICY_MISSING",
                "severity": SEVERITY_MAP["IAM_PASSWORD_POLICY_MISSING"],
                "resource_id": "account",
                "region": "global",
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
                    add_finding({
                        "id": f"iam-admin-{user_name}",
                        "type": "IAM_ADMIN_USER",
                        "severity": SEVERITY_MAP["IAM_ADMIN_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "policy_arn": policy["PolicyArn"],
                        "description": "IAM user has AdministratorAccess policy attached",
                      
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

                        add_finding({
                            "id": f"iam-full-admin-policy-{user_name}",
                            "type": "IAM_POLICY_FULL_ADMIN",
                            "severity": SEVERITY_MAP["IAM_POLICY_FULL_ADMIN"],
                            "resource_id": user_name,
                            "region": "global",
                            "description": "IAM policy grants full administrative access (Action:* Resource:*)"
                        })

            # -------------------------
            # Check: IAM User Without MFA
            # -------------------------
            mfa_devices = iam.list_mfa_devices(UserName=user_name).get("MFADevices", [])

            if len(mfa_devices) == 0:

                add_finding({
                    "id": f"iam-no-mfa-{user_name}",
                    "type": "IAM_USER_WITHOUT_MFA",
                    "severity": SEVERITY_MAP["IAM_USER_WITHOUT_MFA"],
                    "resource_id": user_name,
                    "region": "global",
                    "description": "IAM user does not have MFA enabled",
                })

            # -------------------------
            # Access Key Security Checks (FINAL LOGIC)
            # -------------------------
            access_keys = iam.list_access_keys(UserName=user_name).get("AccessKeyMetadata", [])

            for key in access_keys:

                key_id = key["AccessKeyId"]
                status = key["Status"]

                last_used_info = iam.get_access_key_last_used(
                    AccessKeyId=key_id
                )["AccessKeyLastUsed"]

                last_used_date = last_used_info.get("LastUsedDate")

                print("DEBUG KEY:", user_name, key_id, status, last_used_date)

                # -----------------------------------
                # 1️⃣ INACTIVE → DELETE
                # -----------------------------------
                if status == "Inactive":
                    add_finding({
                        "id": f"iam-old-inactive-key-{user_name}-{key_id}",
                        "type": "IAM_ACCESS_KEY_OLD_INACTIVE",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_OLD_INACTIVE"],
                        "resource_id": user_name,
                        "region": "global",
                        "access_key_id": key_id,
                        "description": "Inactive access key should be removed"
                    })
                    continue

                # -----------------------------------
                # 2️⃣ ACTIVE + NEVER USED → DISABLE
                # -----------------------------------
                if not last_used_date:
                    add_finding({
                        "id": f"iam-unused-access-key-{user_name}-{key_id}",
                        "type": "IAM_ACCESS_KEY_UNUSED",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_UNUSED"],
                        "resource_id": user_name,
                        "region": "global",
                        "access_key_id": key_id,
                        "description": "Access key has never been used"
                    })
                    continue


            # -------------------------
            # Check: Unused IAM Users
            # -------------------------

            password_last_used = user.get("PasswordLastUsed")
            create_date = user.get("CreateDate")

            now = datetime.utcnow()

            # Case 1: NEVER USED (MOST IMPORTANT)
            if not password_last_used:
                days_unused = (now - create_date.replace(tzinfo=None)).days

                if days_unused >= 0:   # 🔥 NEW USER GRACE PERIOD
                    add_finding({
                        "id": f"iam-unused-user-never-{user_name}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "description": f"IAM user never used for {days_unused} days"
                    })

            # Case 2: USED BUT INACTIVE
            else:
                days_unused = (now - password_last_used.replace(tzinfo=None)).days

                if days_unused >= 0:
                    add_finding({
                        "id": f"iam-unused-user-{user_name}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "description": f"IAM user inactive for {days_unused} days"
                    })

            # -------------------------
            # INLINE POLICIES (FINAL CLEAN FIX)
            # -------------------------

            inline_policies = iam.list_user_policies(UserName=user_name).get("PolicyNames", [])

            for policy_name in inline_policies:

                policy_doc = iam.get_user_policy(
                    UserName=user_name,
                    PolicyName=policy_name
                )["PolicyDocument"]
                statements = normalize_statements(policy_doc)


                for stmt in statements:

                    action = stmt.get("Action")
                    resource = stmt.get("Resource")

                    # -------------------------
                    # FULL ADMIN
                    # -------------------------
                    if is_full_admin(action, resource):
                        add_finding({
                            "id": f"iam-inline-admin-{user_name}-{policy_name}",
                            "type": "IAM_INLINE_ADMIN_POLICY",
                            "severity": SEVERITY_MAP["IAM_INLINE_ADMIN_POLICY"],
                            "resource_id": user_name,
                            "region": "global",
                            "policy_name": policy_name,
                            "description": "Inline policy grants full admin access"
                        })

                    # -------------------------
                    # WILDCARD
                    # -------------------------
                    elif has_wildcard(action) or has_wildcard(resource):
                        add_finding({
                            "id": f"iam-wildcard-{user_name}-{policy_name}",
                            "type": "IAM_WILDCARD_POLICY",
                            "severity": SEVERITY_MAP["IAM_WILDCARD_POLICY"],
                            "resource_id": user_name,
                            "region": "global",
                            "policy_name": policy_name,
                            "description": "Inline policy contains wildcard permissions"
                        })

        # -------------------------
        # IAM Role External Trust Check
        # -------------------------
        roles = iam.list_roles().get("Roles", [])

        for role in roles:

            role_name = role["RoleName"]

            attached_role_policies = iam.list_attached_role_policies(
                RoleName=role_name
            ).get("AttachedPolicies", [])

            for policy in attached_role_policies:

                if policy["PolicyName"] == "AdministratorAccess":

                    add_finding({
                        "id": f"iam-role-admin-policy-{role_name}",
                        "type": "IAM_ROLE_ADMIN_POLICY",
                        "severity": SEVERITY_MAP["IAM_ROLE_ADMIN_POLICY"],
                        "resource_id": role_name,
                        "region": "global",
                        "description": "IAM role has AdministratorAccess policy attached"
                    })

            trust_policy = role.get("AssumeRolePolicyDocument", {})

            for statement in trust_policy.get("Statement", []):

                principal = statement.get("Principal", {})

                aws_principal = principal.get("AWS")

                if aws_principal:

                    if not isinstance(aws_principal, list):
                        aws_principal = [aws_principal]

                    for p in aws_principal:

                        if ":root" in p and "arn:aws:iam::" in p:

                            add_finding({
                                "id": f"iam-external-trust-{role_name}",
                                "type": "IAM_ROLE_EXTERNAL_TRUST",
                                "severity": SEVERITY_MAP["IAM_ROLE_EXTERNAL_TRUST"],
                                "resource_id": role_name,
                                "region": "global",
                                "description": "IAM role trust policy allows external AWS account to assume this role"
                            })

        return findings