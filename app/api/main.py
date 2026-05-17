import sys
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.routes import scan_routes
from app.api.routes import threat_routes
from app.api.routes import history_routes
from app.api.routes import analytics_routes
from app.api.routes import execute_routes
from app.api.routes import rollback_routes
from app.api.routes import account_routes
from app.api.routes import session_routes
from app.api.routes import drift_routes
from app.api.routes import schedule_routes
from app.api.routes import email_routes
from app.api.routes import attack_surface_routes
from app.api.routes import iam_view_routes
from app.api.routes import auth_routes          # web auth (register / login / me)
from app.api.routes import oauth_routes         # Google + GitHub OAuth
from app.core.scheduler_service import scheduler_service
from app.api.websocket_manager import ws_manager
from fastapi.middleware.cors import CORSMiddleware


def _get_dist_path() -> Path:
    """React build directory — works in dev AND PyInstaller bundle."""
    if getattr(sys, "_MEIPASS", None):
        return Path(sys._MEIPASS) / "app" / "ui" / "dist"
    return Path(__file__).parent.parent / "ui" / "dist"


app = FastAPI(
    title="CloudShield API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


@app.on_event("startup")
async def on_startup():
    """Create DB tables, run safe migrations, start background scheduler."""
    import asyncio
    import logging
    _log = logging.getLogger("cloudshield.startup")

    ws_manager._loop = asyncio.get_running_loop()

    try:
        from app.database.base import Base
        from app.database.db import engine, APP_MODE
        from app.database import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        _log.info("Database tables ready (mode=%s)", APP_MODE)
    except Exception as e:
        _log.error("Database init failed: %s", e)

    # ── Safe migration: add web_user_id to accounts if missing ───────────────
    # Needed for existing EXE users whose SQLite DB was created before this
    # column existed.  Runs silently — if column already exists, it's a no-op.
    try:
        from sqlalchemy import text
        from app.database.db import engine
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE accounts ADD COLUMN web_user_id INTEGER REFERENCES web_users(id)"
            ))
            conn.commit()
        _log.info("Migration: web_user_id column added to accounts")
    except Exception:
        pass  # column already exists — that's fine

    try:
        scheduler_service.start()
        _log.info("Scheduler started")
    except Exception as e:
        _log.error("Scheduler failed to start (non-fatal): %s", e)


# ── CORS ──────────────────────────────────────────────────────────────────────
# Desktop/EXE: allow localhost only
# Web mode   : also allow the production domain (set WEB_ORIGIN env var on server)
import os as _os
_extra_origins = [o.strip() for o in _os.getenv("WEB_ORIGIN", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_origins=["http://127.0.0.1:8000"] + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    """Shared WS channel — used by ScanContext for scan_complete events."""
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.get("/api/version")
async def get_version():
    """Return the installed app version from the VERSION file."""
    import sys, os
    # In PyInstaller: look next to the EXE; in dev: project root
    if getattr(sys, "_MEIPASS", None):
        base = Path(os.path.dirname(sys.executable))
    else:
        base = Path(__file__).parent.parent.parent
    ver_file = base / "VERSION"
    try:
        version = ver_file.read_text(encoding="utf-8").strip()
    except Exception:
        version = "1.0.0.0"
    return {"version": version}



app.include_router(auth_routes.router)           # web auth
app.include_router(oauth_routes.router)          # Google + GitHub OAuth
app.include_router(scan_routes.router)
app.include_router(threat_routes.router)
app.include_router(execute_routes.router)
app.include_router(rollback_routes.router)
app.include_router(history_routes.router)
app.include_router(analytics_routes.router)
app.include_router(account_routes.router)
app.include_router(session_routes.router)
app.include_router(schedule_routes.router)
app.include_router(drift_routes.router)
app.include_router(email_routes.router)
app.include_router(attack_surface_routes.router)
app.include_router(iam_view_routes.router)


_dist = _get_dist_path()
if _dist.exists():
    _assets = _dist / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="vite-assets")

    @app.get("/favicon.png", include_in_schema=False)
    async def favicon_png():
        """Serve favicon PNG directly (bypasses SPA catch-all)."""
        return FileResponse(str(_dist / "favicon.png"), media_type="image/png")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon_ico():
        """Serve favicon ICO directly."""
        ico = _dist / "favicon.ico"
        if ico.exists():
            return FileResponse(str(ico), media_type="image/x-icon")
        return FileResponse(str(_dist / "favicon.png"), media_type="image/png")

    @app.get("/landing", include_in_schema=False)
    async def serve_landing():
        """Serve the CloudShield marketing landing page."""
        landing = Path(__file__).parent.parent.parent / "docs" / "index.html"
        if landing.exists():
            return FileResponse(str(landing), media_type="text/html")
        return FileResponse(str(_dist / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes (production + Electron)."""
        index = _dist / "index.html"
        return FileResponse(str(index))
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"status": "API active — run: cd app/ui && npm run build"}
