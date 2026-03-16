from app.modules.policy_engine.policies import POLICIES


class PolicyEngine:
    """
    Evaluates findings against defined security policies.
    """

    def evaluate(self, findings):

        violations = []

        for finding in findings:

            for policy in POLICIES:

                if finding.get("type") == policy["finding_type"]:

                    violations.append({
                        "policy_id": policy["policy_id"],
                        "policy_name": policy["name"],
                        "description": policy["description"],
                        "severity": policy["severity"],
                        "enforcement": policy.get("enforcement", "MONITOR"),
                        "resource_id": finding.get("resource_id"),
                        "finding": finding
                    })

        return violations