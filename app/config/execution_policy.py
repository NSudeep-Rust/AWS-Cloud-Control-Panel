EXECUTION_POLICY = {

    # -----------------------------
    # Action-level control
    # -----------------------------
    "actions": {
        "RESTRICT_SECURITY_GROUP": {
            "allowed": True,
            "severities": ["HIGH", "CRITICAL"]
        },
 
        # 🔥 ADD THIS
        "ENABLE_BLOCK_PUBLIC_ACCESS": {
            "allowed": True,
            "require_approval": True
        },

        "ENABLE_S3_VERSIONING": {
            "allowed": True,
            "require_approval": True
        },

        "DETACH_ADMIN_POLICY": {
            "allowed": True,
            "require_approval": True
        },
        "REMOVE_INLINE_POLICY": {
            "allowed": False, # explicitly blocked for now
            "require_approval": True
        }
    },

    # -----------------------------
    # Resource scoping
    # -----------------------------
    "resource_control": {
        "mode": "ALLOW_ALL",  # or "RESTRICTED"
        "allowed_ids": [
            # "test-autofix-rust"
        ]
    },

    # -----------------------------
    # Global fallback (optional)
    # -----------------------------
    "default": {
        "allowed": False
    }
}