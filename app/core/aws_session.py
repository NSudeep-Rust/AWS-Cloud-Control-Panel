import boto3
import os
import sys
import functools
from botocore.exceptions import NoCredentialsError, ProfileNotFound, ClientError
from botocore.config import Config

# Resolve certifi CA bundle - MUST use _MEIPASS directly in PyInstaller bundle
# because certifi.where() returns path inside PYZ archive (wrong) in frozen apps
try:
    if getattr(sys, 'frozen', False):
        # In PyInstaller bundle: cacert.pem was placed at _MEIPASS/certifi/cacert.pem
        _ca = os.path.join(sys._MEIPASS, 'certifi', 'cacert.pem')
    else:
        import certifi as _certifi
        _ca = _certifi.where()
    os.environ["SSL_CERT_FILE"]      = _ca
    os.environ["REQUESTS_CA_BUNDLE"] = _ca
    os.environ["AWS_CA_BUNDLE"]      = _ca
    _SSL_VERIFY = _ca if os.path.exists(_ca) else True
except Exception:
    _SSL_VERIFY = True  # fall back to system CA bundle

_FAST_CONFIG = Config(
    connect_timeout=10,
    read_timeout=30,
    retries={'max_attempts': 2},
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

            sts = self.session.client("sts")
            identity = sts.get_caller_identity()

            print("✅ ACTIVE AWS ACCOUNT:", identity.get("Account"))

            _orig_client = self.session.client

            @functools.wraps(_orig_client)
            def _fast_client(service_name, *args, **kwargs):
                if 'config' not in kwargs:
                    kwargs['config'] = _FAST_CONFIG
                # Always pass certifi CA bundle so SSL works in PyInstaller bundle
                if 'verify' not in kwargs:
                    kwargs['verify'] = _SSL_VERIFY
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
            "us-east-1",       # N. Virginia - highest traffic globally
            "us-east-2",       # Ohio - US secondary
            "us-west-2",       # Oregon - US West primary
            "eu-west-1",       # Ireland - EU primary
            "eu-central-1",    # Frankfurt - EU enterprise
            "eu-north-1",      # Stockholm
            "ap-northeast-1",  # Tokyo - APAC primary
            "ap-southeast-1",  # Singapore - SE Asia
            "ap-south-1",      # Mumbai - South Asia
        ]