"""
CloudShield Web Auth Routes
────────────────────────────
POST /api/auth/register  → create a new web account
POST /api/auth/login     → email + password → JWT token
GET  /api/auth/me        → return current user info

All endpoints return 400 in desktop/EXE mode — they simply don't apply there.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os

from app.database.db import get_db, APP_MODE
from app.database.models import WebUser
from app.core.auth import (
    hash_password, verify_password,
    create_access_token, get_current_web_user,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email:    str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    email:        str
    mode:         str = "web"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _require_web_mode():
    if APP_MODE != "web":
        raise HTTPException(
            status_code=400,
            detail="This endpoint is only available in web mode. "
                   "Desktop/EXE users do not need a CloudShield account.",
        )


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new CloudShield web account."""
    _require_web_mode()

    if not req.email or "@" not in req.email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = db.query(WebUser).filter(WebUser.email == req.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = WebUser(
        email=req.email.lower().strip(),
        hashed_password=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   Session = Depends(get_db),
):
    """Login with email + password. Returns a JWT token."""
    _require_web_mode()

    user = db.query(WebUser).filter(WebUser.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
    )


@router.get("/me")
def get_me(current_user=Depends(get_current_web_user)):
    """Return current user info. In desktop mode returns mode info only."""
    if current_user is None:
        return {"mode": "desktop", "authenticated": False, "message": "No login required in EXE mode"}

    return {
        "mode":          "web",
        "authenticated": True,
        "user_id":       current_user.id,
        "email":         current_user.email,
        "created_at":    current_user.created_at.isoformat() if current_user.created_at else None,
    }


class ForgotPasswordRequest(BaseModel):
    email: str


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Send a password reset link to the user's email."""
    _require_web_mode()

    import secrets, datetime
    from app.database.models import PasswordResetToken

    user = db.query(WebUser).filter(WebUser.email == req.email.lower()).first()

    # Always return success (don't reveal if email exists)
    if not user:
        return {"message": "If that email is registered, a reset link has been sent."}

    # Create a reset token valid for 1 hour
    token = secrets.token_urlsafe(48)
    expires = datetime.datetime.utcnow() + datetime.timedelta(hours=1)

    # Store token
    reset = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires,
    )
    db.add(reset)
    db.commit()

    # Send email (uses existing EmailService)
    try:
        from app.core.email_service import EmailService
        base_url = os.getenv("WEB_BASE_URL", "https://cloudshield.me")
        reset_url = f"{base_url}/auth?reset_token={token}"
        EmailService.send_raw(
            to_email=user.email,
            subject="CloudShield — Reset your password",
            body=f"Click the link below to reset your password (expires in 1 hour):\n\n{reset_url}\n\nIf you didn't request this, ignore this email.",
        )
    except Exception:
        pass  # Don't reveal email errors to the client

    return {"message": "If that email is registered, a reset link has been sent."}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using a valid reset token."""
    _require_web_mode()

    import datetime
    from app.database.models import PasswordResetToken

    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == req.token,
        PasswordResetToken.used == False,
    ).first()

    if not reset or reset.expires_at < datetime.datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")

    user = db.query(WebUser).filter(WebUser.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.hashed_password = hash_password(req.new_password)
    reset.used = True
    db.commit()

    return {"message": "Password reset successfully. You can now sign in."}

