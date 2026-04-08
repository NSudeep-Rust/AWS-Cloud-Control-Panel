from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from app.api.routes import scan_routes
from app.api.routes import threat_routes
from app.api.routes import history_routes
from app.api.routes import analytics_routes
from app.api.routes import execute_routes
from app.api.routes import rollback_routes
from app.api.routes import account_routes
from app.api.routes import alert_routes
from app.api.routes import session_routes
from app.api.routes import live_finding_routes
from app.api.routes import drift_routes
from app.api.routes import schedule_routes
from app.api.routes import email_routes
from app.core.scheduler_service import scheduler_service
from app.api.websocket_manager import ws_manager
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AWS Cloud Security Panel API", version="0.1.0")

@app.on_event("startup")
async def on_startup():
    """Auto-start the scheduler so scheduled scans run even after server restart."""
    scheduler_service.start()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket endpoint for instant alert push ─────────────────────────────
@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive — client sends ping every 30s
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

app.include_router(scan_routes.router)
app.include_router(threat_routes.router)
app.include_router(execute_routes.router)
app.include_router(rollback_routes.router)
app.include_router(history_routes.router)
app.include_router(analytics_routes.router)
app.include_router(account_routes.router)
app.include_router(alert_routes.router)
app.include_router(session_routes.router)
app.include_router(live_finding_routes.router)
app.include_router(schedule_routes.router)
app.include_router(drift_routes.router)
app.include_router(email_routes.router)

@app.get("/")
def root():
    return {
        "status": "API Layer Active",
        "phase": 2
    }