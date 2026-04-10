import sqlite3
conn = sqlite3.connect(r"p:\CloudSecurityPanel\security.db")
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", tables)
for t in ["accounts", "aws_accounts"]:
    if t in tables:
        cur.execute(f"SELECT * FROM {t} LIMIT 10")
        rows = cur.fetchall()
        cur.execute(f"PRAGMA table_info({t})")
        cols = [c[1] for c in cur.fetchall()]
        print(f"\n{t} columns: {cols}")
        print(f"{t} ({len(rows)} rows):")
        for r in rows:
            print(" ", r)
conn.close()