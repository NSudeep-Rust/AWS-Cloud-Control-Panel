"""
policy_engine.py — Evaluates IAM/S3/EC2/Network/Logging findings
against defined governance policies.

Each policy specifies:
  - id, name, description, severity
  - matching_types: the finding type strings (from the scanner) that violate it
  - framework: CIS / PCI / NIST / INTERNAL — for Step 5 compliance mapping

The evaluate() method iterates over findings and returns one violation record
per (finding × policy) match.  This is what the /api/analytics/policy-violations
endpoint exposes to the Analytics → Violations tab.
"""


POLICIES = [

    {
        "id":          "IAM-001",
        "name":        "MFA Required for All IAM Users",
        "description": "Every IAM user must have MFA enabled. "
                       "Without MFA an attacker only needs a stolen password to gain full access.",
        "severity":    "CRITICAL",
        "framework":   "CIS 1.10 / PCI 8.3",
        "matching_types": ["IAM_USER_WITHOUT_MFA"],
        "remediation": "Enable MFA on the IAM user via the AWS Console → IAM → Users → Security Credentials.",
    },
    {
        "id":          "IAM-002",
        "name":        "No IAM Users with Direct Admin Access",
        "description": "IAM users should not be granted AdministratorAccess directly. "
                       "Use roles and least-privilege policies instead.",
        "severity":    "CRITICAL",
        "framework":   "CIS 1.16 / NIST AC-6",
        "matching_types": ["IAM_ADMIN_USER"],
        "remediation": "Remove AdministratorAccess from the user and assign scoped permissions via a role.",
    },
    {
        "id":          "IAM-003",
        "name":        "No Wildcard Admin Policies",
        "description": "IAM policies granting Action:* Resource:* give unrestricted access "
                       "and violate least-privilege principles.",
        "severity":    "CRITICAL",
        "framework":   "CIS 1.22 / NIST AC-6",
        "matching_types": ["IAM_POLICY_FULL_ADMIN"],
        "remediation": "Replace wildcard policies with scoped permissions using specific Action and Resource values.",
    },
    {
        "id":          "IAM-004",
        "name":        "No IAM Roles with Admin Access",
        "description": "IAM roles should not carry AdministratorAccess. "
                       "Services and users should only have the permissions they need.",
        "severity":    "HIGH",
        "framework":   "CIS 1.16 / NIST AC-6",
        "matching_types": ["IAM_ROLE_ADMIN_POLICY"],
        "remediation": "Revoke AdministratorAccess from the role and apply scoped service-level permissions.",
    },
    {
        "id":          "IAM-005",
        "name":        "No External Trust Relationships on IAM Roles",
        "description": "IAM roles with cross-account trust to unknown external accounts "
                       "create a potential pivot point for attackers.",
        "severity":    "HIGH",
        "framework":   "CIS 1.20 / NIST AC-3",
        "matching_types": ["IAM_ROLE_EXTERNAL_TRUST"],
        "remediation": "Review and revoke the trust policy for any external AWS account IDs you do not control.",
    },
    {
        "id":          "IAM-006",
        "name":        "Revoke or Rotate Unused Access Keys",
        "description": "Access keys that have not been used in 90+ days are stale credentials "
                       "that represent unnecessary attack surface.",
        "severity":    "MEDIUM",
        "framework":   "CIS 1.13 / PCI 8.1.4",
        "matching_types": ["IAM_ACCESS_KEY_UNUSED"],
        "remediation": "Delete or deactivate the unused access key in IAM → Users → Security Credentials.",
    },
    {
        "id":          "IAM-007",
        "name":        "IAM Password Policy Must Be Configured",
        "description": "An account-wide IAM password policy enforces minimum complexity, "
                       "reuse restrictions, and rotation frequency.",
        "severity":    "MEDIUM",
        "framework":   "CIS 1.8 / PCI 8.2",
        "matching_types": ["IAM_PASSWORD_POLICY_MISSING"],
        "remediation": "Set an account password policy via IAM → Account Settings → Password Policy.",
    },
    {
        "id":          "IAM-008",
        "name":        "Remove Unused IAM Users",
        "description": "IAM users that have never logged in or have been inactive for extended "
                       "periods should be removed to reduce the attack surface.",
        "severity":    "LOW",
        "framework":   "CIS 1.3 / NIST IA-4",
        "matching_types": ["IAM_UNUSED_USER"],
        "remediation": "Delete or disable IAM users that show no recent login activity.",
    },

    {
        "id":          "NET-001",
        "name":        "No Unrestricted SSH Access (Port 22)",
        "description": "Security groups must not allow inbound SSH (TCP 22) from 0.0.0.0/0 or ::/0. "
                       "This is one of the most commonly exploited entry points.",
        "severity":    "CRITICAL",
        "framework":   "CIS 5.2 / PCI 1.3",
        "matching_types": ["SECURITY_GROUP_UNRESTRICTED_SSH"],
        "remediation": "Restrict the security group inbound rule for port 22 to specific CIDR ranges or bastion IPs.",
    },
    {
        "id":          "NET-002",
        "name":        "No Unrestricted RDP Access (Port 3389)",
        "description": "Security groups must not allow inbound RDP (TCP 3389) from 0.0.0.0/0 or ::/0.",
        "severity":    "CRITICAL",
        "framework":   "CIS 5.3 / PCI 1.3",
        "matching_types": ["SECURITY_GROUP_UNRESTRICTED_RDP"],
        "remediation": "Restrict the security group inbound rule for port 3389 to specific CIDR ranges or a VPN.",
    },
    {
        "id":          "NET-003",
        "name":        "No Publicly Open Security Groups",
        "description": "Security groups allowing unrestricted inbound access (0.0.0.0/0) on any port "
                       "expose resources to the entire internet.",
        "severity":    "HIGH",
        "framework":   "CIS 5.4 / NIST SC-7",
        "matching_types": ["PUBLIC_SECURITY_GROUP"],
        "remediation": "Review and restrict inbound rules on security groups to only necessary ports and CIDR ranges.",
    },
    {
        "id":          "NET-004",
        "name":        "NACLs Must Restrict Inbound Traffic",
        "description": "Network ACLs that allow all inbound traffic (0.0.0.0/0) bypass subnet-level "
                       "network controls and are equivalent to no access control.",
        "severity":    "HIGH",
        "framework":   "CIS 5.1 / NIST SC-7",
        "matching_types": ["NACL_ALLOW_ALL_INBOUND"],
        "remediation": "Update the NACL to only allow required protocols and source CIDR blocks.",
    },
    {
        "id":          "NET-005",
        "name":        "NACLs Must Restrict Outbound Traffic",
        "description": "Network ACLs that allow all outbound traffic make it trivial for "
                       "a compromised instance to exfiltrate data.",
        "severity":    "MEDIUM",
        "framework":   "NIST SC-7",
        "matching_types": ["NACL_ALLOW_ALL_OUTBOUND"],
        "remediation": "Restrict NACL outbound rules to only required destination ports and CIDR ranges.",
    },
    {
        "id":          "NET-006",
        "name":        "EC2 Instances Must Not Have Public IPs",
        "description": "EC2 instances with public IP addresses are directly reachable from the internet. "
                       "Place instances in private subnets and use a load balancer or NAT gateway.",
        "severity":    "HIGH",
        "framework":   "CIS 5.6 / NIST SC-7",
        "matching_types": ["PUBLIC_EC2_INSTANCE"],
        "remediation": "Move the instance to a private subnet and route outbound traffic via NAT Gateway.",
    },
    {
        "id":          "NET-007",
        "name":        "VPC Flow Logs Must Be Enabled",
        "description": "VPC Flow Logs capture network traffic metadata and are essential for "
                       "incident response and anomaly detection.",
        "severity":    "HIGH",
        "framework":   "CIS 3.9 / PCI 10.2",
        "matching_types": ["VPC_FLOW_LOGS_DISABLED"],
        "remediation": "Enable VPC Flow Logs on all VPCs, publishing to CloudWatch Logs or S3.",
    },

    {
        "id":          "S3-001",
        "name":        "S3 Public Access Block Must Be Enabled",
        "description": "The S3 Block Public Access setting must be enabled at bucket and account level "
                       "to prevent accidental public exposure of sensitive data.",
        "severity":    "CRITICAL",
        "framework":   "CIS 2.1.5 / PCI 1.3",
        "matching_types": ["S3_BLOCK_PUBLIC_ACCESS_DISABLED"],
        "remediation": "Enable S3 Block Public Access on the bucket via S3 → Permissions → Block Public Access.",
    },
    {
        "id":          "S3-002",
        "name":        "S3 Bucket Versioning Must Be Enabled",
        "description": "Versioning protects against accidental deletion and ransomware by maintaining "
                       "previous object versions.",
        "severity":    "MEDIUM",
        "framework":   "CIS 2.1.3 / PCI 12.10",
        "matching_types": ["S3_VERSIONING_DISABLED"],
        "remediation": "Enable versioning on the S3 bucket via S3 → Properties → Bucket Versioning.",
    },
    {
        "id":          "S3-003",
        "name":        "S3 Access Logging Must Be Enabled",
        "description": "Server access logging records detailed records for requests made to a bucket, "
                       "which is essential for security auditing.",
        "severity":    "MEDIUM",
        "framework":   "CIS 2.6 / PCI 10.2",
        "matching_types": ["S3_ACCESS_LOGGING_DISABLED"],
        "remediation": "Enable server access logging on the S3 bucket and direct logs to a separate audit bucket.",
    },

    {
        "id":          "LOG-001",
        "name":        "CloudTrail Must Be Enabled",
        "description": "AWS CloudTrail records API calls and is the primary source of audit logs "
                       "for security investigations and compliance.",
        "severity":    "CRITICAL",
        "framework":   "CIS 3.1 / PCI 10.1",
        "matching_types": ["CLOUDTRAIL_DISABLED"],
        "remediation": "Enable CloudTrail in all regions via CloudTrail → Create Trail → Apply to all regions.",
    },
    {
        "id":          "LOG-002",
        "name":        "CloudTrail Must Be Actively Logging",
        "description": "A trail that is paused or stopped does not record events, creating a "
                       "blind spot in your audit log.",
        "severity":    "CRITICAL",
        "framework":   "CIS 3.1 / PCI 10.1",
        "matching_types": ["CLOUDTRAIL_NOT_LOGGING"],
        "remediation": "Start logging on the CloudTrail trail via CloudTrail → Trails → Start Logging.",
    },
    {
        "id":          "LOG-003",
        "name":        "CloudWatch Log Groups Must Have Retention",
        "description": "Log groups without a retention policy store logs indefinitely, increasing cost "
                       "and violating data minimisation requirements.",
        "severity":    "LOW",
        "framework":   "NIST AU-11",
        "matching_types": ["CLOUDWATCH_LOG_GROUP_NO_RETENTION"],
        "remediation": "Set a retention policy (e.g. 90 days) on the CloudWatch log group.",
    },

    {
        "id":          "ENC-001",
        "name":        "EBS Volumes Must Be Encrypted",
        "description": "Unencrypted EBS volumes expose data at rest if the underlying storage "
                       "is accessed without virtualisation-layer access.",
        "severity":    "HIGH",
        "framework":   "CIS 2.2.1 / PCI 3.4",
        "matching_types": ["EBS_UNENCRYPTED_VOLUME"],
        "remediation": "Create an encrypted snapshot and restore the volume from it, or migrate data to an encrypted volume.",
    },
    {
        "id":          "ENC-002",
        "name":        "EBS Default Encryption Must Be Enabled",
        "description": "Enabling EBS default encryption ensures any new volume created in the region "
                       "is automatically encrypted, preventing accidental unencrypted volumes.",
        "severity":    "HIGH",
        "framework":   "CIS 2.2.1 / PCI 3.4",
        "matching_types": ["EBS_DEFAULT_ENCRYPTION_DISABLED"],
        "remediation": "Enable EBS default encryption per region via EC2 → Settings → EBS Encryption.",
    },
    {
        "id":          "ENC-003",
        "name":        "EBS Snapshots Must Be Encrypted",
        "description": "Unencrypted EBS snapshots can be shared or copied, exposing data outside "
                       "your intended boundaries.",
        "severity":    "MEDIUM",
        "framework":   "CIS 2.2.1 / PCI 3.4",
        "matching_types": ["EBS_SNAPSHOT_NOT_ENCRYPTED"],
        "remediation": "Re-create the snapshot with encryption enabled by copying the snapshot and setting Encrypt true.",
    },
    {
        "id":          "ENC-004",
        "name":        "KMS Key Rotation Must Be Enabled",
        "description": "Automatic annual rotation of KMS keys reduces the risk of a cryptographic key "
                       "being compromised through long-term exposure.",
        "severity":    "MEDIUM",
        "framework":   "CIS 2.8 / PCI 3.6",
        "matching_types": ["KMS_KEY_ROTATION_DISABLED"],
        "remediation": "Enable automatic key rotation on the KMS key via KMS → Customer managed keys → Key rotation.",
    },
]


class PolicyEngine:
    """
    Evaluates a list of finding dicts (from the DB or scanner) against
    POLICIES and returns a flat list of violation records.

    Example finding dict:
      { "type": "IAM_USER_WITHOUT_MFA", "severity": "CRITICAL",
        "resource_id": "arn:aws:iam::123456789012:user/dev-bot", "region": "us-east-1" }

    Each violation record includes the policy metadata so the UI can show
    the policy description and remediation instructions.
    """

    def __init__(self):
        self._type_map: dict = {}
        for policy in POLICIES:
            for t in policy["matching_types"]:
                if t not in self._type_map:
                    self._type_map[t] = []
                self._type_map[t].append(policy)

    def evaluate(self, findings: list) -> list:
        violations = []
        for finding in findings:
            ftype = (finding.get("type") or "").upper()
            for policy in self._type_map.get(ftype, []):
                violations.append({
                    "policy_id":        policy["id"],
                    "policy_name":      policy["name"],
                    "policy_severity":  policy["severity"],
                    "framework":        policy.get("framework", ""),
                    "description":      policy["description"],
                    "remediation":      policy.get("remediation", ""),
                    "finding_type":     ftype,
                    "finding_severity": finding.get("severity"),
                    "resource_id":      finding.get("resource_id"),
                    "region":           finding.get("region"),
                    "status":           "NON_COMPLIANT",
                })
        return violations

    def summary(self, findings: list) -> dict:
        """Convenience: returns counts by policy severity."""
        violations = self.evaluate(findings)
        by_sev = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for v in violations:
            by_sev[v["policy_severity"]] = by_sev.get(v["policy_severity"], 0) + 1
        return {
            "total_violations":   len(violations),
            "by_severity":        by_sev,
            "total_policies":     len(POLICIES),
            "policies_violated":  len({v["policy_id"] for v in violations}),
        }