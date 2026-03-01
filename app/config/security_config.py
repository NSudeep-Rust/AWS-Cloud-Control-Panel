"""
Global security guardrails for Cloud Security Panel.
"""

# Default execution mode
DEFAULT_EXECUTION_MODE = "DRY_RUN"

# LIVE execution requires BOTH to be true:
LIVE_EXECUTION_ENABLED = True
LIVE_EXECUTION_APPROVED_BY_USER = True

# Allowed LIVE actions (strict allow-list)
ALLOWED_LIVE_ACTIONS = {
    "RESTRICT_SECURITY_GROUP"
}
