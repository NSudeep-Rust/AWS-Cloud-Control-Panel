"""
IAM View — Fast IAM Identity Risk Scanner
Uses get_account_authorization_details — a SINGLE AWS API call that returns
ALL users, roles, and their attached/inline policies at once.

Old approach: (N_users × 4 calls) + (N_roles × 2 calls) = ~90 API calls
New approach: 1-3 paginator calls + MFA-only parallel = ~12 calls total
Result: 2-4 seconds instead of 12-20 seconds.
"""
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Risk classification ───────────────────────────────────────────────────────

_CRITICAL_POLICIES = {"AdministratorAccess", "AWSAdministratorAccess"}
_CRITICAL_KEYWORDS = ["Administrator", "RootAccess"]
_LOW_KEYWORDS      = ["ReadOnly", "ViewOnly", "ReadAccess", "ViewAccess",
                      "ListOnly", "GetOnly"]


def _compute_risk(policy_names: list) -> tuple:
    """Returns (risk_level, access_level)."""
    if not policy_names:
        return "LOW", "No Permissions"

    joined = " ".join(policy_names)

    for p in policy_names:
        if p in _CRITICAL_POLICIES:
            return "CRITICAL", "Full Admin"

    if any(kw in joined for kw in _CRITICAL_KEYWORDS):
        return "CRITICAL", "Full Admin"

    full_access_count = sum(1 for p in policy_names if "FullAccess" in p)
    if "PowerUser" in joined or full_access_count >= 2:
        return "HIGH", "Power User"
    if full_access_count == 1:
        return "HIGH", "Single Service Full Access"

    all_read = all(any(kw in p for kw in _LOW_KEYWORDS) for p in policy_names)
    if all_read:
        return "LOW", "Read Only"

    return "MEDIUM", "Read / Write"


def _fmt_date(dt):
    if dt is None:
        return None
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


def _check_mfa(client, username: str) -> tuple:
    """Returns (username, has_mfa). Runs in thread pool."""
    try:
        devices = client.list_mfa_devices(UserName=username).get("MFADevices", [])
        return username, len(devices) > 0
    except Exception:
        return username, False


# ── Main scanner ──────────────────────────────────────────────────────────────

def scan_iam_identities(aws_session) -> dict:
    """
    Fast IAM scanner using get_account_authorization_details.

    Single mega-call returns ALL users + roles + ALL their policies.
    Only MFA check requires extra per-user calls (parallelised).
    Typical time: 2-4 seconds vs 12-20 seconds with per-identity calls.
    """
    client  = aws_session.session.client("iam")
    results = []
    summary = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0}

    # ── STEP 1: One mega paginator call — all users, roles, policies ──────────
    users_raw = []   # UserDetailList items
    roles_raw = []   # RoleDetailList items

    try:
        paginator = client.get_paginator("get_account_authorization_details")
        for page in paginator.paginate(Filter=["User", "Role"]):
            users_raw.extend(page.get("UserDetailList", []))
            roles_raw.extend(page.get("RoleDetailList", []))
        print(f"[IAMView] get_account_authorization_details → "
              f"{len(users_raw)} users, {len(roles_raw)} roles")
    except Exception as exc:
        print(f"[IAMView] get_account_authorization_details error: {exc}")
        return {"identities": [], "summary": summary,
                "scanned_at": datetime.utcnow().isoformat(),
                "error": str(exc)}

    # ── STEP 2: MFA check for users only (parallel, 1 call each) ─────────────
    mfa_map: dict[str, bool] = {}
    if users_raw:
        with ThreadPoolExecutor(max_workers=min(20, len(users_raw))) as pool:
            futures = {
                pool.submit(_check_mfa, client, u["UserName"]): u["UserName"]
                for u in users_raw
            }
            for fut in as_completed(futures):
                try:
                    uname, has_mfa = fut.result()
                    mfa_map[uname] = has_mfa
                except Exception:
                    pass

    # ── STEP 3: Build user records (no more API calls — all data from step 1) ─
    for user in users_raw:
        uname = user["UserName"]

        # Managed policy names are embedded in the response
        policy_names = [p["PolicyName"]
                        for p in user.get("AttachedManagedPolicies", [])]
        # Inline policy names are also embedded
        policy_names += [p["PolicyName"]
                         for p in user.get("UserPolicyList", [])]

        risk, access_level = _compute_risk(policy_names)

        results.append({
            "id":               user["UserId"],
            "name":             uname,
            "type":             "USER",
            "arn":              user["Arn"],
            "risk_level":       risk,
            "access_level":     access_level,
            "policies":         policy_names,
            "groups":           user.get("GroupList", []),
            "mfa_enabled":      mfa_map.get(uname, False),
            "last_active":      _fmt_date(user.get("PasswordLastUsed")),
            "created":          _fmt_date(user.get("CreateDate")),
            "trust_principals": [],
        })
        summary["total"] += 1
        summary[risk.lower()] += 1

    # ── STEP 4: Build role records (no extra API calls needed) ────────────────
    for role in roles_raw:
        # Skip AWS-managed service-linked roles
        if "/aws-service-role/" in role.get("Path", ""):
            continue

        rname = role["RoleName"]

        policy_names = [p["PolicyName"]
                        for p in role.get("AttachedManagedPolicies", [])]
        policy_names += [p["PolicyName"]
                         for p in role.get("RolePolicyList", [])]

        risk, access_level = _compute_risk(policy_names)

        # Trust policy principals
        trust_principals = []
        try:
            for stmt in role.get("AssumeRolePolicyDocument", {}).get("Statement", []):
                principal = stmt.get("Principal", {})
                if isinstance(principal, str):
                    trust_principals.append(principal)
                elif isinstance(principal, dict):
                    for vals in principal.values():
                        if isinstance(vals, list):
                            trust_principals.extend(vals)
                        else:
                            trust_principals.append(vals)
        except Exception:
            pass

        results.append({
            "id":               role["RoleId"],
            "name":             rname,
            "type":             "ROLE",
            "arn":              role["Arn"],
            "risk_level":       risk,
            "access_level":     access_level,
            "policies":         policy_names,
            "groups":           [],
            "mfa_enabled":      None,
            "last_active":      None,
            "created":          _fmt_date(role.get("CreateDate")),
            "trust_principals": trust_principals[:5],
        })
        summary["total"] += 1
        summary[risk.lower()] += 1

    # ── Sort: CRITICAL → HIGH → MEDIUM → LOW ─────────────────────────────────
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    results.sort(key=lambda x: order.get(x["risk_level"], 4))

    return {
        "identities": results,
        "summary":    summary,
        "scanned_at": datetime.utcnow().isoformat(),
    }
