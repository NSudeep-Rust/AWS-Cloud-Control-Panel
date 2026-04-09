from app.config.security_config import SEVERITY_MAP
from datetime import datetime, timezone
from app.utils.iam_policy_utils import has_wildcard, is_full_admin, normalize_statements
from concurrent.futures import ThreadPoolExecutor, as_completed

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

        findings = []
        seen_ids = set()
        import threading
        lock = threading.Lock()

        def add_finding(f):
            with lock:
                if f["id"] not in seen_ids:
                    seen_ids.add(f["id"])
                    findings.append(f)

        try:
            password_policy = iam.get_account_password_policy()["PasswordPolicy"]
            if not password_policy.get("ExpirePasswords", False):
                add_finding({
                    "id": "iam-password-never-expires",
                    "type": "IAM_PASSWORD_NEVER_EXPIRES",
                    "severity": SEVERITY_MAP["IAM_PASSWORD_NEVER_EXPIRES"],
                    "resource_id": "account",
                    "region": "global",
                    "description": "IAM password policy does not enforce password expiration",
                })
        except iam.exceptions.NoSuchEntityException:
            add_finding({
                "id": "iam-password-policy-missing",
                "type": "IAM_PASSWORD_POLICY_MISSING",
                "severity": SEVERITY_MAP["IAM_PASSWORD_POLICY_MISSING"],
                "resource_id": "account",
                "region": "global",
                "description": "IAM account does not have a password policy configured",
            })

        try:
            users = iam.list_users().get("Users", [])
        except Exception:
            users = []
        try:
            roles = iam.list_roles().get("Roles", [])
        except Exception:
            roles = []

        def audit_user(user):
            user_name = user["UserName"]
            local = []

            def ladd(f):
                local.append(f)

            def fetch_attached():
                try:
                    return iam.list_attached_user_policies(UserName=user_name).get("AttachedPolicies", [])
                except Exception:
                    return []

            def fetch_mfa():
                try:
                    return iam.list_mfa_devices(UserName=user_name).get("MFADevices", [])
                except Exception:
                    return []

            def fetch_keys():
                try:
                    return iam.list_access_keys(UserName=user_name).get("AccessKeyMetadata", [])
                except Exception:
                    return []

            def fetch_inline():
                try:
                    return iam.list_user_policies(UserName=user_name).get("PolicyNames", [])
                except Exception:
                    return []

            with ThreadPoolExecutor(max_workers=4) as p:
                f_att   = p.submit(fetch_attached)
                f_mfa   = p.submit(fetch_mfa)
                f_keys  = p.submit(fetch_keys)
                f_inl   = p.submit(fetch_inline)
                attached_policies = f_att.result()
                mfa_devices        = f_mfa.result()
                access_keys        = f_keys.result()
                inline_policies    = f_inl.result()

            for policy in attached_policies:
                if policy["PolicyName"] == "AdministratorAccess":
                    ladd({
                        "id": f"iam-admin-{user_name}",
                        "type": "IAM_ADMIN_USER",
                        "severity": SEVERITY_MAP["IAM_ADMIN_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "policy_arn": policy["PolicyArn"],
                        "description": "IAM user has AdministratorAccess policy attached",
                    })

            def check_policy_doc(policy):
                try:
                    ver = iam.get_policy(PolicyArn=policy["PolicyArn"])["Policy"]["DefaultVersionId"]
                    doc = iam.get_policy_version(PolicyArn=policy["PolicyArn"], VersionId=ver)["PolicyVersion"]["Document"]
                    for stmt in doc.get("Statement", []):
                        if stmt.get("Action") == "*" and stmt.get("Resource") == "*":
                            ladd({
                                "id": f"iam-full-admin-policy-{user_name}",
                                "type": "IAM_POLICY_FULL_ADMIN",
                                "severity": SEVERITY_MAP["IAM_POLICY_FULL_ADMIN"],
                                "resource_id": user_name,
                                "region": "global",
                                "description": "IAM policy grants full administrative access (Action:* Resource:*)",
                            })
                            break
                except Exception:
                    pass

            if attached_policies:
                with ThreadPoolExecutor(max_workers=min(len(attached_policies), 4)) as p:
                    list(p.map(check_policy_doc, attached_policies))

            if len(mfa_devices) == 0:
                ladd({
                    "id": f"iam-no-mfa-{user_name}",
                    "type": "IAM_USER_WITHOUT_MFA",
                    "severity": SEVERITY_MAP["IAM_USER_WITHOUT_MFA"],
                    "resource_id": user_name,
                    "region": "global",
                    "description": "IAM user does not have MFA enabled",
                })

            def check_key(key):
                key_id = key["AccessKeyId"]
                status = key["Status"]
                try:
                    last_used_info = iam.get_access_key_last_used(AccessKeyId=key_id)["AccessKeyLastUsed"]
                    last_used_date = last_used_info.get("LastUsedDate")
                except Exception:
                    last_used_date = None

                if status == "Inactive":
                    ladd({
                        "id": f"iam-old-inactive-key-{user_name}-{key_id}",
                        "type": "IAM_ACCESS_KEY_OLD_INACTIVE",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_OLD_INACTIVE"],
                        "resource_id": user_name,
                        "region": "global",
                        "access_key_id": key_id,
                        "description": "Inactive access key should be removed",
                    })
                elif not last_used_date:
                    ladd({
                        "id": f"iam-unused-access-key-{user_name}-{key_id}",
                        "type": "IAM_ACCESS_KEY_UNUSED",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_UNUSED"],
                        "resource_id": user_name,
                        "region": "global",
                        "access_key_id": key_id,
                        "description": "Access key has never been used",
                    })

            if access_keys:
                with ThreadPoolExecutor(max_workers=min(len(access_keys), 4)) as p:
                    list(p.map(check_key, access_keys))

            password_last_used = user.get("PasswordLastUsed")
            create_date        = user.get("CreateDate")
            now = datetime.utcnow()
            if not password_last_used:
                days_unused = (now - create_date.replace(tzinfo=None)).days
                if days_unused >= 0:
                    ladd({
                        "id": f"iam-unused-user-never-{user_name}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "description": f"IAM user never used for {days_unused} days",
                    })
            else:
                days_unused = (now - password_last_used.replace(tzinfo=None)).days
                if days_unused >= 0:
                    ladd({
                        "id": f"iam-unused-user-{user_name}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": user_name,
                        "region": "global",
                        "description": f"IAM user inactive for {days_unused} days",
                    })

            def check_inline_policy(policy_name):
                try:
                    doc = iam.get_user_policy(UserName=user_name, PolicyName=policy_name)["PolicyDocument"]
                    for stmt in normalize_statements(doc):
                        action   = stmt.get("Action")
                        resource = stmt.get("Resource")
                        if is_full_admin(action, resource):
                            ladd({
                                "id": f"iam-inline-admin-{user_name}-{policy_name}",
                                "type": "IAM_INLINE_ADMIN_POLICY",
                                "severity": SEVERITY_MAP["IAM_INLINE_ADMIN_POLICY"],
                                "resource_id": user_name,
                                "region": "global",
                                "policy_name": policy_name,
                                "description": "Inline policy grants full admin access",
                            })
                        elif has_wildcard(action) or has_wildcard(resource):
                            ladd({
                                "id": f"iam-wildcard-{user_name}-{policy_name}",
                                "type": "IAM_WILDCARD_POLICY",
                                "severity": SEVERITY_MAP["IAM_WILDCARD_POLICY"],
                                "resource_id": user_name,
                                "region": "global",
                                "policy_name": policy_name,
                                "description": "Inline policy contains wildcard permissions",
                            })
                except Exception:
                    pass

            if inline_policies:
                with ThreadPoolExecutor(max_workers=min(len(inline_policies), 4)) as p:
                    list(p.map(check_inline_policy, inline_policies))

            return local

        def audit_role(role):
            role_name = role["RoleName"]
            local = []
            try:
                attached = iam.list_attached_role_policies(RoleName=role_name).get("AttachedPolicies", [])
                for policy in attached:
                    if policy["PolicyName"] == "AdministratorAccess":
                        local.append({
                            "id": f"iam-role-admin-policy-{role_name}",
                            "type": "IAM_ROLE_ADMIN_POLICY",
                            "severity": SEVERITY_MAP["IAM_ROLE_ADMIN_POLICY"],
                            "resource_id": role_name,
                            "region": "global",
                            "description": "IAM role has AdministratorAccess policy attached",
                        })
            except Exception:
                pass

            trust = role.get("AssumeRolePolicyDocument", {})
            for stmt in trust.get("Statement", []):
                aws_principal = stmt.get("Principal", {}).get("AWS")
                if aws_principal:
                    if not isinstance(aws_principal, list):
                        aws_principal = [aws_principal]
                    for p in aws_principal:
                        if ":root" in p and "arn:aws:iam::" in p:
                            local.append({
                                "id": f"iam-external-trust-{role_name}",
                                "type": "IAM_ROLE_EXTERNAL_TRUST",
                                "severity": SEVERITY_MAP["IAM_ROLE_EXTERNAL_TRUST"],
                                "resource_id": role_name,
                                "region": "global",
                                "description": "IAM role trust policy allows external AWS account to assume this role",
                            })
            return local

        max_w = max(1, min(len(users) + len(roles), 10))
        with ThreadPoolExecutor(max_workers=max_w) as pool:
            user_futs = {pool.submit(audit_user, u): u["UserName"] for u in users}
            role_futs = {pool.submit(audit_role, r): r["RoleName"] for r in roles}
            for fut in as_completed({**user_futs, **role_futs}):
                try:
                    for f in fut.result():
                        add_finding(f)
                except Exception as e:
                    print(f"[IAMManager] worker error: {e}")

        return findings

