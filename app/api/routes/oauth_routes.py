"""
CloudShield OAuth Routes — Google & GitHub
──────────────────────────────────────────
GET /api/auth/{provider}/check   → tells frontend if OAuth is configured
GET /api/auth/google             → redirect to Google OAuth consent screen
GET /api/auth/google/callback    → handle Google callback, return JWT
GET /api/auth/github             → redirect to GitHub OAuth
GET /api/auth/github/callback    → handle GitHub callback, return JWT

Required env vars (set on DigitalOcean):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
  WEB_BASE_URL  (e.g. https://cloudshield.me)
"""

import os
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.database.db import get_db, APP_MODE
from app.database.models import WebUser
from app.core.auth import create_access_token, hash_password

router = APIRouter(prefix="/api/auth", tags=["OAuth"])

BASE_URL     = os.getenv("WEB_BASE_URL", "https://cloudshield.me")
GOOGLE_ID    = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_SEC   = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_ID    = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_SEC   = os.getenv("GITHUB_CLIENT_SECRET", "")


# ── Config check endpoints (called by frontend before redirecting) ─────────────
@router.get("/google/check")
def google_check():
    return {"provider": "google", "configured": bool(GOOGLE_ID and GOOGLE_SEC)}

@router.get("/github/check")
def github_check():
    return {"provider": "github", "configured": bool(GITHUB_ID and GITHUB_SEC)}


# ── Google OAuth ───────────────────────────────────────────────────────────────
@router.get("/google")
def google_login():
    if not GOOGLE_ID:
        return RedirectResponse(
            f"{BASE_URL}/auth?oauth_error=Google+OAuth+not+configured.+Set+GOOGLE_CLIENT_ID."
        )
    callback = f"{BASE_URL}/api/auth/google/callback"
    scope    = "openid%20email%20profile"
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_ID}&redirect_uri={callback}"
        f"&response_type=code&scope={scope}&access_type=offline"
    )
    return RedirectResponse(url)


@router.get("/google/callback")
def google_callback(code: str = "", error: str = "", db: Session = Depends(get_db)):
    if error or not code:
        return RedirectResponse(f"{BASE_URL}/auth?oauth_error=Google+login+cancelled")

    import httpx
    callback = f"{BASE_URL}/api/auth/google/callback"

    # Exchange code for tokens
    try:
        token_resp = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": GOOGLE_ID, "client_secret": GOOGLE_SEC,
            "redirect_uri": callback, "grant_type": "authorization_code",
        }, timeout=10).json()

        id_token_resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_resp['access_token']}"},
            timeout=10,
        ).json()

        email = id_token_resp.get("email", "").lower()
        if not email:
            return RedirectResponse(f"{BASE_URL}/auth?oauth_error=Could+not+get+email+from+Google")

        user = _get_or_create_user(db, email, provider="google")
        token = create_access_token(user.id)
        return RedirectResponse(f"{BASE_URL}/auth?token={token}&email={email}")

    except Exception as e:
        return RedirectResponse(f"{BASE_URL}/auth?oauth_error=Google+auth+failed:+{str(e)[:80]}")


# ── GitHub OAuth ───────────────────────────────────────────────────────────────
@router.get("/github")
def github_login():
    if not GITHUB_ID:
        return RedirectResponse(
            f"{BASE_URL}/auth?oauth_error=GitHub+OAuth+not+configured.+Set+GITHUB_CLIENT_ID."
        )
    callback = f"{BASE_URL}/api/auth/github/callback"
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_ID}&redirect_uri={callback}&scope=user:email"
    )
    return RedirectResponse(url)


@router.get("/github/callback")
def github_callback(code: str = "", error: str = "", db: Session = Depends(get_db)):
    if error or not code:
        return RedirectResponse(f"{BASE_URL}/auth?oauth_error=GitHub+login+cancelled")

    import httpx
    callback = f"{BASE_URL}/api/auth/github/callback"

    try:
        # Exchange code for access token
        token_resp = httpx.post(
            "https://github.com/login/oauth/access_token",
            data={"client_id": GITHUB_ID, "client_secret": GITHUB_SEC,
                  "code": code, "redirect_uri": callback},
            headers={"Accept": "application/json"}, timeout=10,
        ).json()

        access_token = token_resp.get("access_token", "")
        if not access_token:
            return RedirectResponse(f"{BASE_URL}/auth?oauth_error=GitHub+token+exchange+failed")

        # Get user emails
        emails_resp = httpx.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"token {access_token}", "Accept": "application/json"},
            timeout=10,
        ).json()

        email = next(
            (e["email"] for e in emails_resp if e.get("primary") and e.get("verified")),
            None
        )
        if not email:
            return RedirectResponse(f"{BASE_URL}/auth?oauth_error=No+verified+email+on+GitHub+account")

        email = email.lower()
        user  = _get_or_create_user(db, email, provider="github")
        token = create_access_token(user.id)
        return RedirectResponse(f"{BASE_URL}/auth?token={token}&email={email}")

    except Exception as e:
        return RedirectResponse(f"{BASE_URL}/auth?oauth_error=GitHub+auth+failed:+{str(e)[:80]}")


# ── Shared helper ──────────────────────────────────────────────────────────────
def _get_or_create_user(db: Session, email: str, provider: str) -> WebUser:
    """Find existing user or create a new one from OAuth."""
    import secrets
    user = db.query(WebUser).filter(WebUser.email == email).first()
    if not user:
        user = WebUser(
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),  # random password (can't log in with it)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
