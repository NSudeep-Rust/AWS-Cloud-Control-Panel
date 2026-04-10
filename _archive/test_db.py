from app.database.db import engine

try:
    conn = engine.connect()
    print("✅ Database connected successfully")
    conn.close()
except Exception as e:
    print("❌ DB connection failed:", e)