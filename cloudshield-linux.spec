block_cipher = None

# ──────────────────────────────────────────────────────────────────────────────
# CloudShield — Linux PyInstaller Spec
# Separate from cloudshield.spec (Windows). Nothing Windows-specific here.
# Output: dist/cloudshield-backend/cloudshield-backend  (ELF binary)
# ──────────────────────────────────────────────────────────────────────────────

from PyInstaller.utils.hooks import collect_data_files
import certifi as _c

boto3_datas    = collect_data_files('boto3')
botocore_datas = collect_data_files('botocore')
certifi_datas  = [(_c.where(), 'certifi')]

all_datas = boto3_datas + botocore_datas + certifi_datas + [
    ('app', 'app'),
    ('VERSION', '.'),
]

hidden = [
    'uvicorn.logging','uvicorn.loops','uvicorn.loops.auto','uvicorn.loops.asyncio',
    'uvicorn.protocols','uvicorn.protocols.http','uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl','uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto','uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.lifespan','uvicorn.lifespan.on','uvicorn.lifespan.off',
    'fastapi','starlette','starlette.routing','starlette.middleware','starlette.middleware.cors',
    'email.mime.multipart','email.mime.text','smtplib','ssl','certifi',
    'sqlalchemy.dialects.sqlite','sqlalchemy.dialects.sqlite.pysqlite','sqlalchemy.orm',
    # boto3 / botocore
    'boto3','botocore','botocore.loaders','botocore.regions','botocore.serialize',
    'botocore.parsers','botocore.hooks','botocore.handlers','botocore.endpoint',
    'botocore.session','botocore.config','botocore.credentials','botocore.auth',
    'botocore.awsrequest','botocore.compat','botocore.exceptions','botocore.model',
    'botocore.response','botocore.signers','botocore.utils','botocore.validate',
    # jmespath required by botocore
    'jmespath','jmespath.functions','jmespath.parser','jmespath.lexer',
    # urllib3
    'urllib3','urllib3.util','urllib3.util.ssl_','urllib3.util.retry',
    'urllib3.util.timeout','urllib3.util.url','urllib3.contrib',
    'urllib3.connectionpool','urllib3.connection','urllib3.response','urllib3.poolmanager',
    # s3transfer
    's3transfer','s3transfer.utils','s3transfer.tasks','s3transfer.futures',
    # App routes
    'app.api.main','app.api.routes.scan_routes','app.api.routes.threat_routes',
    'app.api.routes.execute_routes','app.api.routes.rollback_routes',
    'app.api.routes.history_routes','app.api.routes.analytics_routes',
    'app.api.routes.account_routes',
    'app.api.routes.session_routes',
    'app.api.routes.schedule_routes','app.api.routes.drift_routes','app.api.routes.email_routes',
    'app.api.routes.attack_surface_routes','app.api.routes.iam_view_routes',
    # Scanner modules
    'app.modules.scanner.scanner','app.modules.scanner.s3_scanner',
    'app.modules.scanner.ec2_scanner','app.modules.scanner.rds_scanner',
    'app.modules.scanner.cloudwatch_scanner','app.modules.scanner.encryption_scanner',
    'app.modules.scanner.iam_extra_scanner','app.modules.scanner.vpc_scanner',
    'app.modules.scanner.sg_scanner','app.modules.scanner.network_scanner',
    'app.modules.scanner.logging_scanner',
    'app.modules.iam_manager.iam_manager',
    'app.modules.iam_view','app.modules.iam_view.iam_scanner',
    'app.modules.remediation.executor','app.modules.remediation.planner',
    'app.modules.remediation.rollback','app.modules.remediation.safety_guard',
    'app.modules.reporter.html_reporter','app.modules.protection_history.history',
    'app.core.aws_session','app.core.email_service','app.core.monitor_service',
    'app.core.scheduler_service','app.core.policy_engine','app.core.fast_watcher',
    'app.database.models','app.database.db','app.database.base','app.database.init_db',
    'multiprocessing','concurrent.futures','threading','json','zipfile','pathlib',
]

a = Analysis(
    ['backend_entry.py'],
    pathex=['.'],
    binaries=[],
    datas=all_datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    # Exclude Windows-only libs and heavy unneeded packages
    excludes=[
        'tkinter','matplotlib','numpy','pandas','test',
        'psycopg2','psycopg2_binary','PIL',
        'winotify',                   # Windows toast notifications
        'plyer','plyer.platforms',    # Windows plyer platform backend
    ],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='cloudshield-backend',   # No .exe on Linux
    debug=False, strip=False, upx=True,
    console=True,
    # No icon= or windowsHide= on Linux
)
coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=True, upx_exclude=[],
    name='cloudshield-backend',
)
