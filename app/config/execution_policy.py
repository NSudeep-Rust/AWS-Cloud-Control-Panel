"""
Execution Policy — defines which remediation actions are allowed to run live,
and which require an extra inline confirmation due to being destructive/irreversible.

Design intent:
  - Dry Run always runs first, so the user has already seen the plan.
  - For most fixes (reversible), one "Apply Fix to AWS" click is sufficient.
  - Only truly destructive / hard-to-reverse actions get require_approval=True,
    which shows a single inline danger-checkbox before the button activates.
"""

EXECUTION_POLICY = {

    # ─────────────────────────────────────────────────────────────────────────
    # Action-level control
    # require_approval=True  →  renders an inline "I understand" danger guard
    # require_approval=False →  runs immediately after dry-run is accepted
    # ─────────────────────────────────────────────────────────────────────────
    "actions": {

        # ── IAM ──────────────────────────────────────────────────────────────
        "DETACH_ADMIN_POLICY":            {"allowed": True, "require_approval": False},
        "REMOVE_INLINE_POLICY":           {"allowed": True, "require_approval": False},
        "REMOVE_INLINE_WILDCARD_POLICY":  {"allowed": True, "require_approval": False},
        "DELETE_UNUSED_IAM_USER":         {"allowed": True, "require_approval": True},   # irreversible
        "DISABLE_ACCESS_KEY":             {"allowed": True, "require_approval": False},
        "DELETE_ACCESS_KEY":              {"allowed": True, "require_approval": True},    # irreversible
        "DISABLE_STALE_ACCESS_KEY":       {"allowed": True, "require_approval": False},
        "ENABLE_MFA":                     {"allowed": True, "require_approval": False},
        "RESTRICT_ROLE_EXTERNAL_TRUST":   {"allowed": True, "require_approval": False},

        # ── S3 ───────────────────────────────────────────────────────────────
        "ENABLE_BLOCK_PUBLIC_ACCESS":     {"allowed": True, "require_approval": False},
        "REMOVE_PUBLIC_S3_ACL":           {"allowed": True, "require_approval": False},
        "ENABLE_S3_VERSIONING":           {"allowed": True, "require_approval": False},
        "ENABLE_S3_ACCESS_LOGGING":       {"allowed": True, "require_approval": False},

        # ── EC2 / Network ─────────────────────────────────────────────────────
        "STOP_EC2_INSTANCE":              {"allowed": True, "require_approval": False},
        "TERMINATE_EC2_INSTANCE":         {"allowed": True, "require_approval": True},   # irreversible
        "REMOVE_ELASTIC_IP":              {"allowed": True, "require_approval": False},
        "RESTRICT_SECURITY_GROUP":        {"allowed": True, "require_approval": False},
        "REVOKE_UNRESTRICTED_SSH":        {"allowed": True, "require_approval": False},
        "REVOKE_UNRESTRICTED_RDP":        {"allowed": True, "require_approval": False},
        "REPLACE_SECURITY_GROUP":         {"allowed": True, "require_approval": False},
        "DELETE_UNUSED_SECURITY_GROUP":   {"allowed": True, "require_approval": False},
        "ENABLE_TERMINATION_PROTECTION":  {"allowed": True, "require_approval": False},
        "ENFORCE_IMDSV2":                 {"allowed": True, "require_approval": False},
        "ATTACH_IAM_ROLE_TO_INSTANCE":    {"allowed": True, "require_approval": False},
        "MAKE_SNAPSHOT_PRIVATE":          {"allowed": True, "require_approval": False},
        "ENCRYPT_EBS_VOLUME":             {"allowed": True, "require_approval": False},
        "DELETE_DEFAULT_VPC":             {"allowed": True, "require_approval": True},   # irreversible

        # ── VPC / Network ─────────────────────────────────────────────────────
        "ENABLE_VPC_FLOW_LOGS":           {"allowed": True, "require_approval": False},
        "RESTRICT_NACL_INBOUND":          {"allowed": True, "require_approval": False},
        "RESTRICT_NACL_OUTBOUND":         {"allowed": True, "require_approval": False},
        "REMOVE_PUBLIC_ROUTE":            {"allowed": True, "require_approval": False},

        # ── Logging / Encryption ──────────────────────────────────────────────
        "ENABLE_CLOUDTRAIL":              {"allowed": True, "require_approval": False},
        "START_CLOUDTRAIL_LOGGING":       {"allowed": True, "require_approval": False},
        "ENABLE_KMS_KEY_ROTATION":        {"allowed": True, "require_approval": False},
        "SET_LOG_GROUP_RETENTION":        {"allowed": True, "require_approval": False},

        # ── RDS ───────────────────────────────────────────────────────────────
        "DISABLE_RDS_PUBLIC_ACCESS":      {"allowed": True, "require_approval": False},
        "ENABLE_RDS_BACKUP":              {"allowed": True, "require_approval": False},
        "ENABLE_RDS_DELETION_PROTECTION": {"allowed": True, "require_approval": False},
        "ENCRYPT_RDS_INSTANCE":           {"allowed": True, "require_approval": False},
    },

    # ─────────────────────────────────────────────────────────────────────────
    # Resource scoping
    # ─────────────────────────────────────────────────────────────────────────
    "resource_control": {
        "mode": "ALLOW_ALL",
        "allowed_ids": []
    },

    # ─────────────────────────────────────────────────────────────────────────
    # Default fallback — any unlisted action runs without extra approval
    # ─────────────────────────────────────────────────────────────────────────
    "default": {
        "allowed": True,
        "require_approval": False
    }
}