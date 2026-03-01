class PolicyEngine:
    """
    Evaluates security findings against defined governance policies.
    """

    def __init__(self):
        # You can later load from JSON/YAML config
        self.policies = [
            {
                "id": "POLICY-001",
                "name": "No Public Inbound Access",
                "severity": "CRITICAL",
                "description": "Security groups must not allow 0.0.0.0/0 inbound access"
            }
        ]

    def evaluate(self, findings):

        violations = []

        for finding in findings:

            for policy in self.policies:

                # Rule logic for POLICY-001
                if policy["id"] == "POLICY-001":

                    if finding.get("severity") == "HIGH":

                        for port in finding.get("ports", []):
                            if "0.0.0.0/0" in finding.get("description", ""):
                                violations.append({
                                    "policy_id": policy["id"],
                                    "policy_name": policy["name"],
                                    "resource_id": finding.get("resource_id"),
                                    "region": finding.get("region"),
                                    "policy_severity": policy["severity"],
                                    "finding_severity": finding.get("severity"),
                                    "status": "NON_COMPLIANT"
                                })

        return violations