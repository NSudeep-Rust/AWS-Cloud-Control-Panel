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
    """Auto-create SQLite tables on first run, start background scheduler."""
    import asyncio
    import logging
    _log = logging.getLogger("cloudshield.startup")

    # Capture event loop NOW (async context) so ws_manager.broadcast_sync()
    # works from the scheduler thread (asyncio.get_event_loop() is broken in threads on Py3.10+)
    ws_manager._loop = asyncio.get_running_loop()

    try:
        from app.database.base import Base
        from app.database.db import engine
        from app.database import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        _log.info("Database tables ready")
    except Exception as e:
        _log.error("Database init failed: %s", e)

    try:
        scheduler_service.start()
        _log.info("Scheduler started")
    except Exception as e:
        _log.error("Scheduler failed to start (non-fatal): %s", e)


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_origins=["http://127.0.0.1:8000"],
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

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes (production + Electron)."""
        index = _dist / "index.html"
        return FileResponse(str(index))
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"status": "API active — run: cd app/ui && npm run build"}
