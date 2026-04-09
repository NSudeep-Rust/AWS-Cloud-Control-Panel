block_cipher = None

from PyInstaller.utils.hooks import collect_data_files

boto3_datas    = collect_data_files("boto3")
botocore_datas = collect_data_files("botocore")

all_datas = boto3_datas + botocore_datas + [
    ("app", "app"),
    ("VERSION", "."),
]

hidden = [
    "uvicorn.logging","uvicorn.loops","uvicorn.loops.auto","uvicorn.loops.asyncio",
    "uvicorn.protocols","uvicorn.protocols.http","uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl","uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto","uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan","uvicorn.lifespan.on","uvicorn.lifespan.off",
    "fastapi","starlette","starlette.routing","starlette.middleware","starlette.middleware.cors",
    "email.mime.multipart","email.mime.text","smtplib","ssl",
    "sqlalchemy.dialects.sqlite","sqlalchemy.dialects.sqlite.pysqlite","sqlalchemy.orm",
    "boto3","botocore","botocore.loaders","botocore.regions","botocore.serialize",
    "botocore.parsers","botocore.hooks","botocore.handlers","botocore.endpoint",
    "botocore.session","botocore.config",
    "app.api.main","app.api.routes.scan_routes","app.api.routes.threat_routes",
    "app.api.routes.execute_routes","app.api.routes.rollback_routes",
    "app.api.routes.history_routes","app.api.routes.analytics_routes",
    "app.api.routes.account_routes","app.api.routes.alert_routes",
    "app.api.routes.session_routes","app.api.routes.live_finding_routes",
    "app.api.routes.schedule_routes","app.api.routes.drift_routes","app.api.routes.email_routes",
    "app.modules.scanner.scanner","app.modules.scanner.s3_scanner",
    "app.modules.scanner.ec2_scanner","app.modules.scanner.rds_scanner",
    "app.modules.scanner.cloudwatch_scanner","app.modules.scanner.encryption_scanner",
    "app.modules.scanner.iam_extra_scanner","app.modules.iam_manager.iam_manager",
    "app.modules.remediation.executor","app.modules.remediation.planner",
    "app.modules.remediation.rollback","app.modules.remediation.safety_guard",
    "app.modules.reporter.html_reporter","app.modules.protection_history.history",
    "app.core.aws_session","app.core.email_service","app.core.monitor_service",
    "app.core.scheduler_service","app.core.policy_engine","app.core.fast_watcher",
    "app.database.models","app.database.db","app.database.base","app.database.init_db",
    "winotify","plyer","plyer.platforms.win.notification",
    "multiprocessing","concurrent.futures","threading","json","zipfile","pathlib",
]

a = Analysis(
    ["backend_entry.py"],
    pathex=["."],
    binaries=[],
    datas=all_datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter","matplotlib","numpy","pandas","test","psycopg2","psycopg2_binary","PIL"],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="cloudshield-backend",
    debug=False, strip=False, upx=True,
    console=True,
    icon="installer/images/icon.ico",
)
coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=True, upx_exclude=[],
    name="cloudshield-backend",
)
