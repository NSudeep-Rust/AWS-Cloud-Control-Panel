from app.database.db import get_connection

conn = get_connection()
cursor = conn.cursor()

print("\n--- SCANS ---")
cursor.execute("SELECT * FROM scans")
for row in cursor.fetchall():
    print(dict(row))

print("\n--- FINDINGS COUNT ---")
cursor.execute("SELECT COUNT(*) as count FROM findings")
print(cursor.fetchone()["count"])

print("\n--- EXECUTIONS ---")
rows = cursor.execute("SELECT * FROM executions").fetchall()
for row in rows:
    print(dict(row))

conn.close()