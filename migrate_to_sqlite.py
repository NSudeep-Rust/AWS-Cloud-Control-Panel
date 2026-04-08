"""One-time script to clean test data and finalize SQLite migration."""
import sqlite3, os

db_path = os.path.join(os.getenv("APPDATA") or "", "CloudSecurityPanel", "cloudshield.db")
print(f"DB: {db_path}")

con = sqlite3.connect(db_path)
cur = con.cursor()

# Remove the 2 test accounts inserted during testing
cur.execute("DELETE FROM accounts WHERE aws_account_id IN ('987654321000', '111122223333')")
print(f"Deleted {cur.rowcount} test accounts")

# Find the current id of test-account-2 (596953737128) to correctly link the IAM user
cur.execute("SELECT id FROM accounts WHERE aws_account_id = '596953737128'")
row = cur.fetchone()
acc_id = row[0] if row else None
print(f"test-account-2 (596953737128) current id = {acc_id}")

# Re-insert the IAM user linked to the correct account id
cur.execute("DELETE FROM iam_users WHERE username = 'testuser'")
if acc_id:
    cur.execute(
        "INSERT INTO iam_users (account_id, username, access_key, secret_key, region, created_at) "
        "VALUES (?,?,?,?,?,datetime('now'))",
        (acc_id, "testuser", "AKIAYV7JXE6ULSWAZPUT", "DP8ghm/k5xS826TSHKzCw1S2TdNRhAq/8OOUvXJ8", "us-east-1")
    )
    print(f"IAM 'testuser' linked to account id={acc_id}")

con.commit()

print()
print("=== FINAL ROOT ACCOUNTS IN SQLITE ===")
for row in cur.execute("SELECT id, aws_account_id, profile_name FROM accounts ORDER BY id"):
    print(f"  id={row[0]}  {row[1]}  ({row[2]})")

print()
print("=== IAM USERS ===")
for row in cur.execute("SELECT id, account_id, username FROM iam_users"):
    print(f"  id={row[0]}  account_id={row[1]}  username={row[2]}")

con.close()
print()
print(">>> Migration complete <<<")
