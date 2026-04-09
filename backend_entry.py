"""
backend_entry.py — PyInstaller entry point for CloudShield backend

This file is what PyInstaller bundles. It:
1. Redirects the database + reports to AppData (not install dir)
2. Starts uvicorn WITHOUT reload (reload needs source files)
3. Sets sys._MEIPASS-aware paths for any bundled assets
"""

import sys
import os
import multiprocessing

# Required for PyInstaller + multiprocessing on Windows
multiprocessing.freeze_support()

# ── AppData paths for production ──────────────────────────────────────────────
_appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
_app_dir  = os.path.join(_appdata, "CloudSecurityPanel")
os.makedirs(_app_dir, exist_ok=True)
os.makedirs(os.path.join(_app_dir, "reports"), exist_ok=True)
os.makedirs(os.path.join(_app_dir, "logs"),    exist_ok=True)

# Expose to rest of app via env var (db.py already reads APPDATA)
os.environ["APPDATA"] = _appdata

# ── Version banner ─────────────────────────────────────────────────────────────
VERSION_FILE = os.path.join(
    getattr(sys, "_MEIPASS", os.path.dirname(__file__)), "VERSION"
)
VERSION = "1.0.0"
try:
    with open(VERSION_FILE) as f:
        VERSION = f.read().strip()
except FileNotFoundError:
    pass

print(f"[CloudShield] Backend v{VERSION} starting...")
print(f"[CloudShield] AppData dir: {_app_dir}")

# ── Start uvicorn (NO reload in production) ────────────────────────────────────
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.api.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="warning",
        access_log=False,
    )
