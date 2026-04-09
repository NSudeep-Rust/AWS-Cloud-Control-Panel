from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.base import Base
from sqlalchemy import PrimaryKeyConstraint
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy import JSON
import uuid
from sqlalchemy import Enum



class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    aws_account_id = Column(String, nullable=False)   # real AWS account ID
    profile_name = Column(String, nullable=True)      # for local profiles
    role_arn = Column(String, nullable=True)          # for cross-account access
    access_key = Column(String, nullable=True)
    secret_key = Column(String, nullable=True)
    region = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    iam_users = relationship("IamUser", back_populates="account")


class Scan(Base):
    __tablename__ = "scans"

    id         = Column(String, primary_key=True, index=True)  # UUID
    account_id = Column(Integer, ForeignKey("accounts.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    source     = Column(String, nullable=True, default="MANUAL")  # MANUAL | SCHEDULED

    findings = relationship("Finding", back_populates="scan")


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
    meta = Column("metadata", JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class Rollback(Base):
    __tablename__ = "rollbacks"

    id = Column(String, primary_key=True, index=True)
    execution_id = Column(String, ForeignKey("executions.id"))
    status = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    finding_id = Column(String)
    message = Column(String)
    severity = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class FindingChange(Base):
    __tablename__ = "finding_changes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    finding_id = Column(String, nullable=False)
    change_type = Column(String, nullable=False)  # NEW / RESOLVED
    scan_id = Column(String, nullable=True)
    previous_scan_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class IamUser(Base):
    __tablename__ = "iam_users"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)  # parent root account
    username = Column(String, nullable=False)       # display label e.g. "varun-dev"
    access_key = Column(String, nullable=False)     # IAM user's own access key
    secret_key = Column(String, nullable=False)     # IAM user's own secret key
    region = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="iam_users")


class LiveMonitorFinding(Base):
    """
    Stores the CURRENT set of CRITICAL/HIGH findings seen by the live threat monitor.
    Refreshed on every scan cycle. Completely separate from the Alert table
    which is used for WebSocket toast / Windows-Defender-style popup notifications.
    """
    __tablename__ = "live_monitor_findings"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    finding_id         = Column(String,  nullable=False, index=True)   # scanner finding ID
    finding_type       = Column(String,  nullable=False)
    severity           = Column(String,  nullable=False)               # CRITICAL | HIGH
    resource_id        = Column(String,  nullable=True)
    region             = Column(String,  nullable=True, default="global")
    account_db_id      = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    remediation_action = Column(String,  nullable=True)
    remediation_reason = Column(Text,    nullable=True)
    dismissed          = Column(Integer, nullable=False, default=0)    # 0=active  1=dismissed
    detected_at        = Column(DateTime, default=datetime.utcnow)


class ScheduleConfig(Base):
    """
    One row per account.  Stores the user's automated scan schedule.
    The SchedulerService background thread reads this every minute and fires
    run_full_scan() when   now >= next_run_at   and   enabled == 1.
    """
    __tablename__ = "schedule_configs"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    account_db_id  = Column(Integer, ForeignKey("accounts.id"), unique=True, nullable=False, index=True)
    enabled        = Column(Integer, nullable=False, default=0)         # 0=off  1=on
    interval_hours = Column(Integer, nullable=False, default=24)        # 1 | 6 | 12 | 24
    last_run_at    = Column(DateTime, nullable=True)
    next_run_at    = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow)


from sqlalchemy import Boolean

class EmailConfig(Base):
    """
    Stores SMTP credentials and notification preferences per account.
    One row per account (or one global row when account_id is NULL).
    Password is stored as plain text — for production use a secrets manager.
    """
    __tablename__ = "email_configs"

    id                      = Column(Integer, primary_key=True, autoincrement=True)
    account_id              = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)

    smtp_host               = Column(String, default="smtp.gmail.com")
    smtp_port               = Column(Integer, default=587)
    smtp_username           = Column(String, nullable=True)   # sender Gmail / Outlook address
    smtp_password           = Column(String, nullable=True)   # app-password (not login password)
    recipient_email         = Column(String, nullable=True)   # where alerts are sent
    sender_name             = Column(String, default="CloudShield Security")

    enabled                 = Column(Boolean, default=False)

    notify_on_critical      = Column(Boolean, default=True)   # live monitor CRITICAL findings
    notify_on_scan_complete = Column(Boolean, default=True)   # scan finish summary
    notify_on_drift         = Column(Boolean, default=True)   # drift detected (new findings)

    created_at              = Column(DateTime, default=datetime.utcnow)
    updated_at              = Column(DateTime, default=datetime.utcnow)

