from pydantic import BaseModel, Field
from typing import List
from pydantic import BaseModel

class ScanRequest(BaseModel):
    account_id: str = Field(..., example="123456789012")
    regions: List[str] = Field(..., example=["ap-south-1"])
    mode: str = Field(default="DRY_RUN", example="DRY_RUN")

class FirewallPreviewRequest(BaseModel):
    account_id: str = Field(..., example="default")
    region: str = Field(..., example="ap-south-1")
    security_group_id: str = Field(..., example="sg-0123456789abcdef0")
    mode: str = Field(default="DRY_RUN", example="DRY_RUN")

class FirewallExecuteRequest(BaseModel):
    account_id: str = Field(..., example="default")
    mode: str = Field(default="DRY_RUN", example="LIVE")
    confirm: bool = Field(default=False, example=True)
    execution_token: str | None = Field(default=None, example="abc123xyz")


class FirewallRollbackRequest(BaseModel):
    execution_id: str