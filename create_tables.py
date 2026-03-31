from app.database.db import engine
from app.database.base import Base
from app.database import models

Base.metadata.create_all(bind=engine)

print("✅ Tables created successfully")