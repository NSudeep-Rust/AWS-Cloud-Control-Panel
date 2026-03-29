from fastapi import FastAPI
from app.api.routes import scan_routes
from app.api.routes import threat_routes
from app.api.routes import history_routes
from app.api.routes import firewall_routes
from app.api.routes import analytics_routes
from app.api.routes import execute_routes


app = FastAPI(title="Cloud Security Panel API")

app.include_router(scan_routes.router)
app.include_router(threat_routes.router)
app.include_router(firewall_routes.router)
app.include_router(history_routes.router)
app.include_router(analytics_routes.router)
app.include_router(execute_routes.router)

@app.get("/")
def root():
    return {
        "status": "API Layer Active",
        "phase": 2
    }