from pydantic import BaseModel, Field
from typing import List
from typing import List, Optional


class ScanRequest(BaseModel):
    account_id: int            
    mode: str
    regions: Optional[List[str]] = None   


class ExecuteRequest(BaseModel):
    scan_id: str
    finding_ids: List[str]
    mode: str = "DRY_RUN"
    approval_token: str | None = None
    confirm: bool = False

class ThreatRequest(BaseModel):
    scan_id: str


class RollbackRequest(BaseModel):
    execution_id: str = Field(..., example="execution-uuid")