from app.modules.policy_engine.policies import POLICIES
from app.config.security_config import ENFORCEMENT_MAP


class PolicyEngine:
    """
    Evaluates findings against defined security policies.
    """

    def evaluate(self, findings):

        violations = []

        for finding in findings:

            for policy in POLICIES:

                if finding.get("type") == policy["finding_type"]:

                    severity = policy["severity"]
                    enforcement = ENFORCEMENT_MAP.get(severity, "IGNORE")

                    violations.append({
                        "policy_id": policy["policy_id"],
                        "policy_name": policy["name"],
                        "description": policy["description"],
                        "severity": severity,
                        "enforcement": enforcement,
                        "resource_id": finding.get("resource_id"),
                        "finding": finding
                    })

        return violations