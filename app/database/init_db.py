from app.database.db import get_connection


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scans (
        scan_id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS findings (
        id TEXT,
        scan_id TEXT,
        type TEXT,
        severity TEXT,
        resource_id TEXT,
        data TEXT,
        PRIMARY KEY (scan_id, id),
        FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS approvals (
        approval_token TEXT PRIMARY KEY,
        scan_id TEXT,
        finding_ids TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)


    cursor.execute("""
    CREATE TABLE IF NOT EXISTS executions (
        execution_id TEXT PRIMARY KEY,
        scan_id TEXT,
        finding_id TEXT,
        action TEXT,
        status TEXT,
        reason TEXT,
        approval_token TEXT,
        resource_name TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()