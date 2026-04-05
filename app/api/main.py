from fastapi import FastAPI
from app.api.routes import scan_routes
from app.api.routes import threat_routes
from app.api.routes import history_routes
from app.api.routes import analytics_routes
from app.api.routes import execute_routes
from app.api.routes import rollback_routes
from app.api.routes import account_routes
from app.api.routes import alert_routes
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AWS Cloud Security Panel API", version="0.1.0")
# ADD THIS BLOCK
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(scan_routes.router)        # 1
app.include_router(threat_routes.router)      # 2
app.include_router(execute_routes.router)     # 4
app.include_router(rollback_routes.router)    # 5
app.include_router(history_routes.router)     # 6
app.include_router(analytics_routes.router)   # 7
app.include_router(account_routes.router)
app.include_router(alert_routes.router)

@app.get("/")
def root():
    return {
        "status": "API Layer Active",
        "phase": 2
    }