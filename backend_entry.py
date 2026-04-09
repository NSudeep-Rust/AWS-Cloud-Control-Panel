import sys
import os
import multiprocessing
import traceback
import datetime

multiprocessing.freeze_support()

# Critical: add bundle dir to sys.path
if getattr(sys, "frozen", False):
    _bundle = sys._MEIPASS
    if _bundle not in sys.path:
        sys.path.insert(0, _bundle)
    os.chdir(_bundle)

_appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
_app_dir = os.path.join(_appdata, "CloudSecurityPanel")
os.makedirs(os.path.join(_app_dir, "logs"), exist_ok=True)
_log_file = os.path.join(_app_dir, "logs", "backend.log")


def _log(msg):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    line = "[" + ts + "] " + str(msg) + "\n"
    try:
        with open(_log_file, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


try:
    _log("Backend starting")
    _log("sys.path[0]: " + (sys.path[0] if sys.path else "empty"))
    _log("CWD: " + os.getcwd())
    _log("frozen: " + str(getattr(sys, "frozen", False)))

    import uvicorn
    _log("uvicorn imported OK")

    # Import app directly so import errors are caught and logged here
    _log("Importing app.api.main...")
    import app.api.main as _app_module
    _log("app.api.main imported OK")

    if __name__ == "__main__":
        _log("Launching uvicorn on 127.0.0.1:8000")
        uvicorn.run(
            _app_module.app,          # pass object directly, not string
            host="127.0.0.1",
            port=8000,
            reload=False,
            log_level="info",         # info so startup errors are visible
            access_log=False,
        )
        _log("uvicorn exited normally")

except SystemExit as e:
    _log("SystemExit code: " + str(e.code))
    sys.exit(e.code)
except Exception as e:
    _log("FATAL: " + str(e))
    _log(traceback.format_exc())
    sys.exit(1)
