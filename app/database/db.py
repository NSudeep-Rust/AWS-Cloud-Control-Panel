from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 🔐 Update with your password
DATABASE_URL = "postgresql://postgres:rust@localhost:5432/cloud_security_panel"

engine = create_engine(DATABASE_URL)

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