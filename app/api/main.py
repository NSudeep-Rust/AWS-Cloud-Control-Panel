from fastapi import FastAPI
from app.api.routes import scan_routes
from app.api.routes import threat_routes
from app.api.routes import history_routes
from app.api.routes import analytics_routes
from app.api.routes import execute_routes
from app.api.routes import rollback_routes
from app.api.routes import account_routes


app = FastAPI(title="AWS Cloud Security Panel API")

app.include_router(scan_routes.router)        # 1
app.include_router(threat_routes.router)      # 2
app.include_router(execute_routes.router)     # 4
app.include_router(rollback_routes.router)    # 5
app.include_router(history_routes.router)     # 6
app.include_router(analytics_routes.router)   # 7
app.include_router(account_routes.router)

@app.get("/")
def root():
    return {
        "status": "API Layer Active",
        "phase": 2
    }