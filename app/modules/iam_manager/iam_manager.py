"""
IAM Auditor — rewritten to use get_account_authorization_details.

OLD approach: list_users + list_roles + per-user (4 API calls) + per-policy (2 API calls)
             = roughly 80-120 individual API calls from India → 40-70 seconds
NEW approach: 1-3 paginator calls + parallel MFA + parallel keys + parallel key-last-used
             = roughly 20-30 calls total → expected 3-8 seconds
"""
from app.config.security_config import SEVERITY_MAP
from datetime import datetime, timezone
from app.utils.iam_policy_utils import has_wildcard, is_full_admin, normalize_statements
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


# AWS managed policies that grant full admin — checked by name (no extra API call needed)
_ADMIN_POLICY_NAMES = {"AdministratorAccess", "AWSAdministratorAccess"}


class IAMManager:
    """
    IAM auditing and remediation detection logic.
    Uses get_account_authorization_details for bulk fetch of all users/roles/policies.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    region = "global"

    def audit(self):
        session = self.aws_session.session
        iam     = session.client("iam")

        findings = []
        seen_ids = set()
        lock     = threading.Lock()

        def add(f):
            with lock:
                if f["id"] not in seen_ids:
                    seen_ids.add(f["id"])
                    findings.append(f)

        # ── 1. Password policy (1 call) ───────────────────────────────────────
        try:
            pp = iam.get_account_password_policy()["PasswordPolicy"]
            if not pp.get("ExpirePasswords", False):
                add({
                    "id": "iam-password-never-expires",
                    "type": "IAM_PASSWORD_NEVER_EXPIRES",
                    "severity": SEVERITY_MAP["IAM_PASSWORD_NEVER_EXPIRES"],
                    "resource_id": "account", "region": "global",
                    "description": "IAM password policy does not enforce password expiration",
                })
        except iam.exceptions.NoSuchEntityException:
            add({
                "id": "iam-password-policy-missing",
                "type": "IAM_PASSWORD_POLICY_MISSING",
                "severity": SEVERITY_MAP["IAM_PASSWORD_POLICY_MISSING"],
                "resource_id": "account", "region": "global",
                "description": "IAM account does not have a password policy configured",
            })
        except Exception:
            pass

        # ── 2. BULK fetch: ALL users + roles + ALL their policies ─────────────
        # Replaces: list_users, list_roles, list_attached_user_policies,
        #           list_user_policies (inline), list_attached_role_policies
        users_raw: list = []
        roles_raw: list = []
        try:
            paginator = iam.get_paginator("get_account_authorization_details")
            for page in paginator.paginate(Filter=["User", "Role"]):
                users_raw.extend(page.get("UserDetailList", []))
                roles_raw.extend(page.get("RoleDetailList", []))
            print(f"[IAMManager] bulk: {len(users_raw)} users, {len(roles_raw)} roles")
        except Exception as e:
            print(f"[IAMManager] get_account_authorization_details failed: {e}")
            return findings

        # ── 3. Parallel: MFA status + access key list for all users ──────────
        # (access key DETAILS are not in the bulk response — still need 1 call each)
        mfa_map: dict  = {}   # username → [mfa_devices]
        keys_map: dict = {}   # username → [access_key_metadata]

        def _fetch_user_data(user):
            uname = user["UserName"]
            try:
                mfa  = iam.list_mfa_devices(UserName=uname).get("MFADevices", [])
            except Exception:
                mfa  = []
            try:
                keys = iam.list_access_keys(UserName=uname).get("AccessKeyMetadata", [])
            except Exception:
                keys = []
            return uname, mfa, keys

        if users_raw:
            w = min(len(users_raw), 20)
            with ThreadPoolExecutor(max_workers=w) as pool:
                for uname, mfa, keys in pool.map(_fetch_user_data, users_raw):
                    mfa_map[uname]  = mfa
                    keys_map[uname] = keys

        # ── 4. Parallel: get_access_key_last_used for every key ──────────────
        all_key_pairs = [
            (uname, k)
            for uname, keys in keys_map.items()
            for k in keys
        ]
        key_last_used: dict = {}  # AccessKeyId → LastUsedDate | None

        def _fetch_key_last_used(item):
            _, key = item
            kid = key["AccessKeyId"]
            try:
                info = iam.get_access_key_last_used(AccessKeyId=kid)["AccessKeyLastUsed"]
                return kid, info.get("LastUsedDate")
            except Exception:
                return kid, None

        if all_key_pairs:
            w = min(len(all_key_pairs), 20)
            with ThreadPoolExecutor(max_workers=w) as pool:
                for kid, last_used in pool.map(_fetch_key_last_used, all_key_pairs):
                    key_last_used[kid] = last_used

        # ── 5. Analyse users (zero extra API calls — all data already in hand) ─
        now = datetime.utcnow()

        for user in users_raw:
            uname        = user["UserName"]
            attached     = user.get("AttachedManagedPolicies", [])   # [{PolicyName, PolicyArn}]
            inline       = user.get("UserPolicyList", [])            # [{PolicyName, PolicyDocument}]
            mfa_devices  = mfa_map.get(uname, [])
            access_keys  = keys_map.get(uname, [])

            # Admin via managed policy name
            for pol in attached:
                if pol["PolicyName"] in _ADMIN_POLICY_NAMES:
                    add({
                        "id": f"iam-admin-{uname}",
                        "type": "IAM_ADMIN_USER",
                        "severity": SEVERITY_MAP["IAM_ADMIN_USER"],
                        "resource_id": uname, "region": "global",
                        "policy_arn": pol["PolicyArn"],
                        "description": "IAM user has AdministratorAccess policy attached",
                    })

            # Wildcard / full-admin inline policies (document embedded — no API call!)
            for inline_pol in inline:
                pol_name = inline_pol.get("PolicyName", "")
                doc      = inline_pol.get("PolicyDocument", {})
                for stmt in normalize_statements(doc):
                    action   = stmt.get("Action")
                    resource = stmt.get("Resource")
                    if is_full_admin(action, resource):
                        add({
                            "id": f"iam-inline-admin-{uname}-{pol_name}",
                            "type": "IAM_INLINE_ADMIN_POLICY",
                            "severity": SEVERITY_MAP["IAM_INLINE_ADMIN_POLICY"],
                            "resource_id": uname, "region": "global",
                            "policy_name": pol_name,
                            "description": "Inline policy grants full admin access",
                        })
                    elif has_wildcard(action) or has_wildcard(resource):
                        add({
                            "id": f"iam-wildcard-{uname}-{pol_name}",
                            "type": "IAM_WILDCARD_POLICY",
                            "severity": SEVERITY_MAP["IAM_WILDCARD_POLICY"],
                            "resource_id": uname, "region": "global",
                            "policy_name": pol_name,
                            "description": "Inline policy contains wildcard permissions",
                        })

            # MFA
            if not mfa_devices:
                add({
                    "id": f"iam-no-mfa-{uname}",
                    "type": "IAM_USER_WITHOUT_MFA",
                    "severity": SEVERITY_MAP["IAM_USER_WITHOUT_MFA"],
                    "resource_id": uname, "region": "global",
                    "description": "IAM user does not have MFA enabled",
                })

            # Access keys
            for key in access_keys:
                kid    = key["AccessKeyId"]
                status = key["Status"]
                last   = key_last_used.get(kid)
                if status == "Inactive":
                    add({
                        "id": f"iam-old-inactive-key-{uname}-{kid}",
                        "type": "IAM_ACCESS_KEY_OLD_INACTIVE",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_OLD_INACTIVE"],
                        "resource_id": uname, "region": "global",
                        "access_key_id": kid,
                        "description": "Inactive access key should be removed",
                    })
                elif not last:
                    add({
                        "id": f"iam-unused-access-key-{uname}-{kid}",
                        "type": "IAM_ACCESS_KEY_UNUSED",
                        "severity": SEVERITY_MAP["IAM_ACCESS_KEY_UNUSED"],
                        "resource_id": uname, "region": "global",
                        "access_key_id": kid,
                        "description": "Access key has never been used",
                    })

            # Unused user
            create_date       = user.get("CreateDate")
            password_last_used = user.get("PasswordLastUsed")
            if not password_last_used:
                days_unused = (now - create_date.replace(tzinfo=None)).days if create_date else 0
                if days_unused >= 0:
                    add({
                        "id": f"iam-unused-user-never-{uname}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": uname, "region": "global",
                        "description": f"IAM user never used for {days_unused} days",
                    })
            else:
                days_unused = (now - password_last_used.replace(tzinfo=None)).days
                if days_unused >= 0:
                    add({
                        "id": f"iam-unused-user-{uname}",
                        "type": "IAM_UNUSED_USER",
                        "severity": SEVERITY_MAP["IAM_UNUSED_USER"],
                        "resource_id": uname, "region": "global",
                        "description": f"IAM user inactive for {days_unused} days",
                    })

        # ── 6. Analyse roles (zero extra API calls — all data already in hand) ─
        for role in roles_raw:
            role_name = role["RoleName"]
            attached  = role.get("AttachedManagedPolicies", [])
            trust     = role.get("AssumeRolePolicyDocument", {})

            for pol in attached:
                if pol["PolicyName"] == "AdministratorAccess":
                    add({
                        "id": f"iam-role-admin-policy-{role_name}",
                        "type": "IAM_ROLE_ADMIN_POLICY",
                        "severity": SEVERITY_MAP["IAM_ROLE_ADMIN_POLICY"],
                        "resource_id": role_name, "region": "global",
                        "description": "IAM role has AdministratorAccess policy attached",
                    })

            for stmt in trust.get("Statement", []):
                aws_principal = stmt.get("Principal", {}).get("AWS")
                if aws_principal:
                    if not isinstance(aws_principal, list):
                        aws_principal = [aws_principal]
                    for p in aws_principal:
                        if ":root" in p and "arn:aws:iam::" in p:
                            add({
                                "id": f"iam-external-trust-{role_name}",
                                "type": "IAM_ROLE_EXTERNAL_TRUST",
                                "severity": SEVERITY_MAP["IAM_ROLE_EXTERNAL_TRUST"],
                                "resource_id": role_name, "region": "global",
                                "description": "IAM role trust policy allows external AWS account to assume this role",
                            })

        return findings
