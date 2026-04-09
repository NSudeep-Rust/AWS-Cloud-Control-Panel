import boto3
import functools
from botocore.exceptions import NoCredentialsError, ProfileNotFound, ClientError
from botocore.config import Config

# Applied to every boto3 client: prevents any single API call from
# hanging the scan for 60s (the boto3 default). Max per-call: 18s.
# retries=1 so throttled calls get one retry but don't spiral.
_FAST_CONFIG = Config(
    connect_timeout=5,
    read_timeout=18,
    retries={'max_attempts': 1},
)


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

            # Patch session.client() so ALL scanners automatically get
            # _FAST_CONFIG (18s read timeout, no 60s hangs).
            # Callers that pass their own config= keep it unchanged.
            _orig_client = self.session.client

            @functools.wraps(_orig_client)
            def _fast_client(service_name, *args, **kwargs):
                if 'config' not in kwargs:
                    kwargs['config'] = _FAST_CONFIG
                return _orig_client(service_name, *args, **kwargs)

            self.session.client = _fast_client

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
            "us-east-1",       # N. Virginia — highest traffic globally
            "us-east-2",       # Ohio — US secondary
            "us-west-2",       # Oregon — US West primary
            "eu-west-1",       # Ireland — EU primary
            "eu-central-1",    # Frankfurt — EU enterprise
            "eu-north-1",      # Stockholm
            "ap-northeast-1",  # Tokyo — APAC primary
            "ap-southeast-1",  # Singapore — SE Asia
            "ap-south-1",      # Mumbai — South Asia
        ]