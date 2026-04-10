import os, sys, py_compile

ROOT = r"p:/CloudSecurityPanel"

# ── 1. cloudshield.spec ──────────────────────────────────────────────────────
spec_content = (
    "block_cipher = None\n"
    "\n"
    "from PyInstaller.utils.hooks import collect_data_files\n"
    "import certifi as _c\n"
    "\n"
    "boto3_datas    = collect_data_files('boto3')\n"
    "botocore_datas = collect_data_files('botocore')\n"
    "certifi_datas  = [(_c.where(), 'certifi')]\n"
    "\n"
    "all_datas = boto3_datas + botocore_datas + certifi_datas + [\n"
    "    ('app', 'app'),\n"
    "    ('VERSION', '.'),\n"
    "]\n"
    "\n"
    "hidden = [\n"
    "    'uvicorn.logging','uvicorn.loops','uvicorn.loops.auto','uvicorn.loops.asyncio',\n"
    "    'uvicorn.protocols','uvicorn.protocols.http','uvicorn.protocols.http.auto',\n"
    "    'uvicorn.protocols.http.h11_impl','uvicorn.protocols.websockets',\n"
    "    'uvicorn.protocols.websockets.auto','uvicorn.protocols.websockets.websockets_impl',\n"
    "    'uvicorn.lifespan','uvicorn.lifespan.on','uvicorn.lifespan.off',\n"
    "    'fastapi','starlette','starlette.routing','starlette.middleware','starlette.middleware.cors',\n"
    "    'email.mime.multipart','email.mime.text','smtplib','ssl','certifi',\n"
    "    'sqlalchemy.dialects.sqlite','sqlalchemy.dialects.sqlite.pysqlite','sqlalchemy.orm',\n"
    "    'boto3','botocore','botocore.loaders','botocore.regions','botocore.serialize',\n"
    "    'botocore.parsers','botocore.hooks','botocore.handlers','botocore.endpoint',\n"
    "    'botocore.session','botocore.config',\n"
    "    'app.api.main','app.api.routes.scan_routes','app.api.routes.threat_routes',\n"
    "    'app.api.routes.execute_routes','app.api.routes.rollback_routes',\n"
    "    'app.api.routes.history_routes','app.api.routes.analytics_routes',\n"
    "    'app.api.routes.account_routes','app.api.routes.alert_routes',\n"
    "    'app.api.routes.session_routes','app.api.routes.live_finding_routes',\n"
    "    'app.api.routes.schedule_routes','app.api.routes.drift_routes','app.api.routes.email_routes',\n"
    "    'app.modules.scanner.scanner','app.modules.scanner.s3_scanner',\n"
    "    'app.modules.scanner.ec2_scanner','app.modules.scanner.rds_scanner',\n"
    "    'app.modules.scanner.cloudwatch_scanner','app.modules.scanner.encryption_scanner',\n"
    "    'app.modules.scanner.iam_extra_scanner','app.modules.iam_manager.iam_manager',\n"
    "    'app.modules.remediation.executor','app.modules.remediation.planner',\n"
    "    'app.modules.remediation.rollback','app.modules.remediation.safety_guard',\n"
    "    'app.modules.reporter.html_reporter','app.modules.protection_history.history',\n"
    "    'app.core.aws_session','app.core.email_service','app.core.monitor_service',\n"
    "    'app.core.scheduler_service','app.core.policy_engine','app.core.fast_watcher',\n"
    "    'app.database.models','app.database.db','app.database.base','app.database.init_db',\n"
    "    'winotify','plyer','plyer.platforms.win.notification',\n"
    "    'multiprocessing','concurrent.futures','threading','json','zipfile','pathlib',\n"
    "]\n"
    "\n"
    "a = Analysis(\n"
    "    ['backend_entry.py'],\n"
    "    pathex=['.'],\n"
    "    binaries=[],\n"
    "    datas=all_datas,\n"
    "    hiddenimports=hidden,\n"
    "    hookspath=[],\n"
    "    runtime_hooks=[],\n"
    "    excludes=['tkinter','matplotlib','numpy','pandas','test','psycopg2','psycopg2_binary','PIL'],\n"
    "    cipher=block_cipher,\n"
    "    noarchive=False,\n"
    ")\n"
    "pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)\n"
    "exe = EXE(\n"
    "    pyz, a.scripts, [],\n"
    "    exclude_binaries=True,\n"
    "    name='cloudshield-backend',\n"
    "    debug=False, strip=False, upx=True,\n"
    "    console=True,\n"
    "    icon='installer/images/icon.ico',\n"
    ")\n"
    "coll = COLLECT(\n"
    "    exe, a.binaries, a.zipfiles, a.datas,\n"
    "    strip=False, upx=True, upx_exclude=[],\n"
    "    name='cloudshield-backend',\n"
    ")\n"
)
with open(ROOT + "/cloudshield.spec", "w") as f:
    f.write(spec_content)
print("1. cloudshield.spec OK")

# ── 2. backend_entry.py ──────────────────────────────────────────────────────
entry_lines = [
    "import sys, os, multiprocessing, traceback, datetime",
    "multiprocessing.freeze_support()",
    "",
    "if getattr(sys, 'frozen', False):",
    "    if sys._MEIPASS not in sys.path:",
    "        sys.path.insert(0, sys._MEIPASS)",
    "    os.chdir(sys._MEIPASS)",
    "",
    "_d = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'CloudSecurityPanel')",
    "os.makedirs(os.path.join(_d, 'logs'), exist_ok=True)",
    "_lf = os.path.join(_d, 'logs', 'backend.log')",
    "def _log(m):",
    "    ts = datetime.datetime.now().strftime('%H:%M:%S')",
    "    open(_lf, 'a', encoding='utf-8').write('[' + ts + '] ' + str(m) + chr(10))",
    "",
    "try:",
    "    _log('Backend starting')",
    "    _log('sys.path[0]: ' + (sys.path[0] if sys.path else 'empty'))",
    "    _log('frozen: ' + str(getattr(sys, 'frozen', False)))",
    "    try:",
    "        import certifi",
    "        _ca = certifi.where()",
    "        os.environ.setdefault('SSL_CERT_FILE', _ca)",
    "        os.environ.setdefault('REQUESTS_CA_BUNDLE', _ca)",
    "        os.environ.setdefault('AWS_CA_BUNDLE', _ca)",
    "        _log('certifi SSL: ' + _ca)",
    "    except Exception as _ce:",
    "        _log('certifi skip: ' + str(_ce))",
    "    import uvicorn",
    "    _log('uvicorn OK')",
    "    _log('Importing app.api.main...')",
    "    import app.api.main as _m",
    "    _log('app.api.main OK')",
    "    if __name__ == '__main__':",
    "        _log('Launching uvicorn on 127.0.0.1:8000')",
    "        uvicorn.run(_m.app, host='127.0.0.1', port=8000, reload=False, log_level='info', access_log=False)",
    "        _log('uvicorn exited normally')",
    "except SystemExit as e:",
    "    _log('SystemExit: ' + str(e.code))",
    "    sys.exit(e.code)",
    "except Exception as e:",
    "    _log('FATAL: ' + str(e))",
    "    _log(traceback.format_exc())",
    "    sys.exit(1)",
]
with open(ROOT + "/backend_entry.py", "w") as f:
    f.write("\n".join(entry_lines) + "\n")
print("2. backend_entry.py OK")

# ── Syntax check ─────────────────────────────────────────────────────────────
try:
    py_compile.compile(ROOT + "/backend_entry.py", doraise=True)
    print("   syntax OK")
except Exception as e:
    print("   SYNTAX ERROR:", e)
