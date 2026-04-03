import boto3
from botocore.exceptions import NoCredentialsError, ProfileNotFound, ClientError


class AWSSession:
    """
    Centralized AWS session handler.
    """

    def __init__(self, profile_name=None, region_name=None, role_arn=None,access_key=None,secret_key=None):

        self.profile_name = profile_name
        self.region_name = region_name
        self.role_arn = role_arn
        self.access_key = access_key
        self.secret_key = secret_key
        self.session = None


    def initialize(self):
        try:
                        # Priority: Access Keys > Profile

            if self.access_key and self.secret_key:
                print("🔐 Using ACCESS KEY authentication")

                self.session = boto3.Session(
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key,
                    region_name=self.region_name
                )

            elif self.profile_name:
                print("👤 Using PROFILE authentication:", self.profile_name)

                self.session = boto3.Session(
                    profile_name=self.profile_name,
                    region_name=self.region_name
                )

            else:
                print("⚠️ Using DEFAULT boto3 session")

                self.session = boto3.Session(
                    region_name=self.region_name
                )

            # Validate credentials
            sts = self.session.client("sts")
            identity = sts.get_caller_identity()

            print("✅ ACTIVE AWS ACCOUNT:", identity.get("Account"))

        except ProfileNotFound:
            raise RuntimeError(
                f"AWS profile '{self.profile_name}' not found."
            )

        except NoCredentialsError:
            raise RuntimeError(
                "AWS credentials not found. Run 'aws configure'."
            )

        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize AWS session: {str(e)}"
            )

    def assume_role(self, role_arn: str, session_name: str = "CloudSecurityPanel"):
        """
        Assume an IAM role using STS and return a boto3 session.
        """
        try:
            base_session = self.session
            sts_client = base_session.client("sts")

            response = sts_client.assume_role(
                RoleArn=role_arn,
                RoleSessionName=session_name
            )

            credentials = response["Credentials"]

            assumed_session = boto3.Session(
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"],
                region_name=self.region_name
            )

            return assumed_session

        except ClientError as e:
            raise RuntimeError(
                f"Failed to assume role {role_arn}: {str(e)}"
            )

    def validate_role_connection(self, role_arn: str):
        """
        Validate that the provided IAM role can be assumed.
        """
        session = self.assume_role(role_arn)
        sts = session.client("sts")

        identity = sts.get_caller_identity()

        return {
            "account": identity.get("Account"),
            "arn": identity.get("Arn"),
            "user_id": identity.get("UserId")
        }

    def get_account_id(self):
        """
        Returns AWS account ID for the current session.
        """
        if not self.session:
            raise RuntimeError("AWS session not initialized")

        sts = self.session.client("sts")
        identity = sts.get_caller_identity()

        return identity.get("Account")

    def get_all_regions(self):
        """
        Return only approved high-usage regions (performance optimized).
        """
        return [
            "us-east-1",
            "us-west-2",
            "eu-west-1",
            "ap-northeast-1",
            "eu-central-1"
        ]