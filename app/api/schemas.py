from pydantic import BaseModel, Field
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
    source: str | None = None   # e.g. "attack_surface" — used to tag executions for separate rollback display


class ThreatRequest(BaseModel):
    scan_id: str


class MonitorRequest(BaseModel):
    account_id: str


class RollbackRequest(BaseModel):
    execution_id: str = Field(..., example="execution-uuid")


class AccountCreateRequest(BaseModel):
    aws_account_id: str
    profile_name: str | None = None
    region: str
    access_key: str | None = None
    secret_key: str | None = None


class IamUserCreateRequest(BaseModel):
    account_id: int           # FK to parent root Account.id
    username: str             # display label e.g. "varun-dev"
    access_key: str
    secret_key: str
    region: str