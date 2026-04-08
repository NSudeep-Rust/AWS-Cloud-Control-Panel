import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── SQLite — portable, zero-install, perfect for single-user desktop app ──
# Stores the DB in the user's AppData folder so it persists across app restarts
# and is isolated per Windows user account.
_data_dir = os.path.join(
    os.getenv("APPDATA") or os.path.expanduser("~"),
    "CloudSecurityPanel"
)
os.makedirs(_data_dir, exist_ok=True)

_db_path     = os.path.join(_data_dir, "cloudshield.db")
DATABASE_URL  = f"sqlite:///{_db_path}"

engine = create_engine(
    DATABASE_URL,
    # Required for SQLite when used across multiple threads (FastAPI uses a thread pool)
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Dependency for FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()   # ← CRITICAL: roll back dirty txn so pool stays clean
        raise
    finally:
        db.close()