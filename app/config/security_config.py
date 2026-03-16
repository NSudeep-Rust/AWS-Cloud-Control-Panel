"""
Global security guardrails for Cloud Security Panel.
"""

# Default execution mode
DEFAULT_EXECUTION_MODE = "DRY_RUN"

# LIVE execution requires BOTH to be true:
LIVE_EXECUTION_ENABLED = True
LIVE_EXECUTION_APPROVED_BY_USER = True

ALLOWED_LIVE_ACTIONS = {
    "RESTRICT_SECURITY_GROUP",
    "DETACH_ADMIN_POLICY"
}

# --------------------------------------------------
# Severity Mapping for all scanner findings
# --------------------------------------------------

SEVERITY_MAP = {

    # Firewall
    "PUBLIC_SECURITY_GROUP": "HIGH",

    # S3
    "PUBLIC_S3_BUCKET": "CRITICAL",
    "S3_BLOCK_PUBLIC_ACCESS_DISABLED": "HIGH",
    "S3_VERSIONING_DISABLED": "MEDIUM",
    "S3_LOGGING_DISABLED": "LOW",
    "S3_ACCESS_LOGGING_DISABLED": "LOW",

    # EC2
    "EC2_WITHOUT_IAM_ROLE": "MEDIUM",
    "EC2_TERMINATION_PROTECTION_DISABLED": "LOW",

    # Encryption
    "EBS_DEFAULT_ENCRYPTION_DISABLED": "HIGH",
    "KMS_KEY_ROTATION_DISABLED": "MEDIUM",
    "EBS_SNAPSHOT_NOT_ENCRYPTED": "HIGH",

    # IAM
    "IAM_ADMIN_USER": "CRITICAL",
    "IAM_POLICY_FULL_ADMIN": "CRITICAL",
    "IAM_INLINE_ADMIN_POLICY": "CRITICAL",
    "IAM_ROLE_ADMIN_POLICY": "CRITICAL",
    "IAM_ROLE_EXTERNAL_TRUST": "CRITICAL",
    "IAM_USER_WITHOUT_MFA": "HIGH",
    "IAM_WILDCARD_POLICY": "HIGH",
    "IAM_MULTIPLE_ACCESS_KEYS": "HIGH",
    "IAM_ACCESS_KEY_UNUSED": "MEDIUM",
    "IAM_UNUSED_USER": "MEDIUM",
    "IAM_PASSWORD_NEVER_EXPIRES": "MEDIUM",

    # Logging
    "VPC_FLOW_LOGS_DISABLED": "MEDIUM",

    # Network
    "PUBLIC_SUBNET_DETECTED": "MEDIUM",
    "ROUTE_TABLE_PUBLIC_ROUTE": "MEDIUM",
    "NACL_ALLOW_ALL_INBOUND": "HIGH",
    "NACL_ALLOW_ALL_OUTBOUND": "MEDIUM",
    "INTERNET_GATEWAY_ATTACHED": "LOW",
    "UNUSED_SECURITY_GROUP": "LOW",
    "VPC_WITHOUT_NAT_GATEWAY": "LOW",
}

# --------------------------------------------------
# Severity → Enforcement rules
# --------------------------------------------------

ENFORCEMENT_MAP = {
    "CRITICAL": "AUTO_FIX",
    "HIGH": "AUTO_FIX",
    "MEDIUM": "REQUIRE_APPROVAL",
    "LOW": "IGNORE",
    "INFO": "IGNORE"
}

# --------------------------------------------------
# Risk scoring weights
# --------------------------------------------------

RISK_WEIGHTS = {
    "CRITICAL": 10,
    "HIGH": 7,
    "MEDIUM": 4,
    "LOW": 2,
    "INFO": 1
}