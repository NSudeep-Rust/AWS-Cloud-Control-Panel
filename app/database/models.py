from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.base import Base
from sqlalchemy import PrimaryKeyConstraint
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB


# -------------------------
# 1️⃣ ACCOUNTS
# -------------------------
class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)

    aws_account_id = Column(String, nullable=False)   # real AWS account ID
    profile_name = Column(String, nullable=True)      # for local profiles
    role_arn = Column(String, nullable=True)          # for cross-account access
    region = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


# -------------------------
# 2️⃣ SCANS
# -------------------------
class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, index=True)  # UUID
    account_id = Column(Integer, ForeignKey("accounts.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    findings = relationship("Finding", back_populates="scan")


# -------------------------
# 3️⃣ FINDINGS
# -------------------------
class Finding(Base):
    __tablename__ = "findings"

    id = Column(String)
    scan_id = Column(String, ForeignKey("scans.id"))
    account_id = Column(String, nullable=False) 
    type = Column(String)
    severity = Column(String)
    resource_id = Column(String)
    region = Column(String)
    status = Column(String, default="OPEN")
    bucket_name = Column(String, nullable=True)
    access_key_id = Column(String, nullable=True)
    policy_name = Column(String, nullable=True)

    scan = relationship("Scan", back_populates="findings")

    __table_args__ = (
        PrimaryKeyConstraint("scan_id", "id"),
    )


# -------------------------
# 4️⃣ EXECUTIONS
# -------------------------
class Execution(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String, index=True)
    scan_id = Column(String)
    finding_id = Column(String)
    action = Column(String)
    status = Column(String)
    reason = Column(Text)
    approval_token = Column(String)
    resource_name = Column(String)
    meta = Column("metadata", JSONB)
    created_at = Column(DateTime, default=datetime.utcnow)


# -------------------------
# 5️⃣ ROLLBACKS
# -------------------------
class Rollback(Base):
    __tablename__ = "rollbacks"

    id = Column(String, primary_key=True, index=True)
    execution_id = Column(String, ForeignKey("executions.id"))
    status = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


# -------------------------
# 6️⃣ ALERTS (for monitoring)
# -------------------------
class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    finding_id = Column(String)
    message = Column(String)
    severity = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)