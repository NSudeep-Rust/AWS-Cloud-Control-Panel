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

# Dependency for FastAPI routes (later use)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()