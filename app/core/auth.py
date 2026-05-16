"""
CloudShield Auth Utilities
──────────────────────────
Mode-aware authentication:
  desktop  → all auth checks are bypassed (EXE users don't need a login)
  web      → JWT token required; validated against web_users table

Environment variables used in web mode:
  JWT_SECRET_KEY  : random secret for signing tokens (required in production)
"""

import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database.db import APP_MODE, get_db

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY                = os.getenv("JWT_SECRET_KEY", "dev-secret-CHANGE-IN-PRODUCTION")
ALGORITHM                 = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# lazy import — only needed in web mode (avoids install requirement for EXE)
def _jose():
    from jose import jwt, JWTError
    return jwt, JWTError


def _bcrypt():
    import bcrypt
    return bcrypt


# OAuth2 scheme — auto_error=False so desktop mode doesn't blow up when
# no Authorization header is present
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    b = _bcrypt()
    return b.hashpw(plain.encode(), b.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    b = _bcrypt()
    return b.checkpw(plain.encode(), hashed.encode())


# ── Token helpers ─────────────────────────────────────────────────────────────
def create_access_token(user_id: int) -> str:
    jwt_mod, _ = _jose()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt_mod.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


# ── FastAPI dependency ─────────────────────────────────────────────────────────
def get_current_web_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    Dependency injected into protected routes.
    • desktop mode → returns None  (no auth required)
    • web mode     → validates JWT and returns WebUser row
    """
    if APP_MODE == "desktop":
        return None  # EXE: no auth gate at all

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    jwt_mod, JWTError = _jose()
    try:
        payload  = jwt_mod.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id  = int(payload.get("sub", 0))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # import here to avoid circular at module load time
    from app.database.models import WebUser
    user = db.query(WebUser).filter(WebUser.id == user_id, WebUser.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    return user
