import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

try:
    from dotenv import load_dotenv
    load_dotenv()          # picks up .env in the project root
except ImportError:
    pass

# ── Runtime mode detection ────────────────────────────────────────────────────
_pg_url = os.getenv("DATABASE_URL")   # set on web server, absent on EXE

if _pg_url:
    # ── WEB: PostgreSQL ───────────────────────────────────────────────────────
    # DigitalOcean sometimes gives "postgres://" URLs — SQLAlchemy needs "postgresql://"
    if _pg_url.startswith("postgres://"):
        _pg_url = _pg_url.replace("postgres://", "postgresql://", 1)

    APP_MODE     = "web"
    DATABASE_URL = _pg_url

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,      # auto-reconnect if connection drops
        pool_size=10,            # handle concurrent web users
        max_overflow=20,
    )
    print("[DB] Mode: WEB — PostgreSQL")

else:
    # ── EXE: SQLite (default, unchanged) ─────────────────────────────────────
    _data_dir = os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"),
        "CloudSecurityPanel"
    )
    os.makedirs(_data_dir, exist_ok=True)

    APP_MODE     = "desktop"
    DATABASE_URL = f"sqlite:///{os.path.join(_data_dir, 'cloudshield.db')}"

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    print(f"[DB] Mode: DESKTOP — SQLite")


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()   # roll back dirty txn so pool stays clean
        raise
    finally:
        db.close()