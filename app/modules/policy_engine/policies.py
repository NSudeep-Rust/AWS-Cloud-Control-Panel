"""
Defines security policies evaluated by the Policy Engine.
"""

POLICIES = [

    {
        "policy_id": "CSP-001",
        "name": "Public SSH Exposure",
        "description": "Security groups must not allow SSH access from 0.0.0.0/0",
        "finding_type": "PUBLIC_SECURITY_GROUP",
        "severity": "HIGH",
        "enforcement": "AUTO_FIX"
    },

    {
        "policy_id": "CSP-002",
        "name": "IAM Administrator Access",
        "description": "IAM users must not have AdministratorAccess policy",
        "finding_type": "IAM_ADMIN_USER",
        "severity": "CRITICAL",
        "enforcement": "REQUIRE_APPROVAL"
    }

]