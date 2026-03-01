class AWSConnectionConfig:
    """
    Holds AWS account connection details.
    This mimics what a user would enter via UI.
    """

    def __init__(
        self,
        account_id: str,
        region: str,
        read_only_role_arn: str = None,
        remediation_role_arn: str = None,
        execution_mode: str = "DRY_RUN"
    ):
        self.account_id = account_id
        self.region = region
        self.read_only_role_arn = read_only_role_arn
        self.remediation_role_arn = remediation_role_arn
        self.execution_mode = execution_mode

    def is_role_based(self):
        return self.read_only_role_arn is not None
