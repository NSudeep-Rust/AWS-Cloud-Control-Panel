"""
CloudShield Encryption & AWS Session Builder
─────────────────────────────────────────────
Mode-aware encryption for AWS credentials:
  desktop / EXE  → encrypt() and decrypt() are no-ops (plain text, as before)
  web            → Fernet symmetric encryption using ENCRYPTION_KEY env var

Also provides build_aws_session(account_or_iam_user) — a single helper used
by all route files to get a ready-to-use AWSSession with decrypted keys.

Environment variable (web server only):
  ENCRYPTION_KEY  : a Fernet key — generate once with:
                    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import os
from app.database.db import APP_MODE

# ── Fernet key setup ──────────────────────────────────────────────────────────
_raw_key     = os.getenv("ENCRYPTION_KEY", "")
_fernet      = None          # lazily initialized

def _get_fernet():
    global _fernet
    if _fernet is None:
        if not _raw_key:
            raise RuntimeError(
                "ENCRYPTION_KEY env var is required in web mode. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        from cryptography.fernet import Fernet
        _fernet = Fernet(_raw_key.encode())
    return _fernet


# ── Public helpers ────────────────────────────────────────────────────────────
def encrypt(value: str | None) -> str | None:
    """
    Encrypt a plaintext string for storage in the database.
    • desktop mode → returns value unchanged (no encryption needed)
    • web mode     → returns a Fernet-encrypted, base64-encoded string
    """
    if APP_MODE != "web" or value is None:
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    """
    Decrypt a value that was encrypted with encrypt().
    • desktop mode → returns value unchanged
    • web mode     → decrypts and returns plaintext
    """
    if APP_MODE != "web" or value is None:
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except Exception:
        # Already plaintext (migration safety) or decryption error
        return value


def build_aws_session(account):
    """
    Create and initialize an AWSSession from an Account or IamUser model row.
    Automatically decrypts access_key and secret_key in web mode.

    Usage (replaces the repeated AWSSession(...) + .initialize() blocks):
        from app.core.crypto import build_aws_session
        aws_session = build_aws_session(account)
    """
    from app.core.aws_session import AWSSession

    raw_access = decrypt(getattr(account, "access_key", None))
    raw_secret = decrypt(getattr(account, "secret_key", None))

    session = AWSSession(
        profile_name=getattr(account, "profile_name", None),
        role_arn=getattr(account, "role_arn", None),
        access_key=raw_access,
        secret_key=raw_secret,
        region_name=getattr(account, "region", "us-east-1"),
    )
    session.initialize()
    return session
