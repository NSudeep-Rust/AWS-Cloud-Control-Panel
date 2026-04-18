# CloudShield — AWS Cloud Security Panel
## Complete Project Reference for Claude AI

**Owner:** NSudeep  
**Version:** 1.0.1  
**Repo:** https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel  
**License:** Proprietary — NSudeep. All rights reserved.  
**Stack:** Python 3.11 + FastAPI backend · React 18 + Vite frontend · Electron 33 desktop shell  
**Platform:** Windows (primary) · Linux Debian/Ubuntu (secondary)

---

## Architecture Overview

```
CloudShield Desktop App
├── Electron shell (electron/)         ← wraps everything as a desktop app
│   ├── main.js                        ← Windows entry: spawns backend, creates window/tray
│   └── main-linux.js                  ← Linux entry: XDG paths, pkill, .png icon
│
├── Python FastAPI backend (app/)      ← REST API on http://127.0.0.1:8000
│   ├── api/                           ← Route handlers
│   ├── core/                          ← AWS session, monitor service, scheduler
│   ├── config/                        ← Security config, execution policy
│   ├── database/                      ← SQLite via SQLAlchemy
│   ├── modules/                       ← All business logic
│   └── utils/                        ← Shared utilities
│
├── React frontend (app/ui/)           ← Vite SPA served from electron
│   ├── src/pages/                     ← All UI pages/sections
│   ├── src/components/               ← Sidebar, Toast, UI primitives
│   └── src/context/                  ← AuthContext, ScanContext (global state)
│
└── PyInstaller bundle + Electron builder → .exe (Windows) / .deb (Linux)
```

---

## Root Directory Files

| File | Purpose |
|---|---|
| `backend_entry.py` | Python entry point — sets up UTF-8, starts FastAPI via uvicorn on port 8000 |
| `cloudshield.spec` | PyInstaller spec for Windows ELF binary |
| `cloudshield-linux.spec` | PyInstaller spec for Linux binary (excludes winotify/plyer/psycopg2) |
| `requirements.txt` | Python deps for Windows |
| `requirements-linux.txt` | Python deps for Linux (no winotify, no psycopg2) |
| `VERSION` | Single-line version string e.g. `1.0.1` |
| `LICENSE` | Proprietary license — NSudeep |
| `README.md` | Full project documentation with screenshots |
| `PROJECT_STATE.md` | Development state tracker |
| `START.bat` | Windows dev launcher |
| `START.ps1` | PowerShell dev launcher |
| `run_b10.bat` | Production build script (PyInstaller + electron-builder) |
| `debug_guardian.py` | Crash/debug helper |
| `cloudshield_sandbox.wsb` | Windows Sandbox config for testing installer |
| `CLAUDE.md` | This file — project reference for Claude AI |

---

## Backend — `app/`

### `app/api/` — FastAPI Routes

| File | Route prefix | What it handles |
|---|---|---|
| `main.py` | — | FastAPI app init, CORS, router registration, WebSocket |
| `routes/scan_routes.py` | `/api/scan` | Trigger scan, get findings, filter findings |
| `routes/remediation_routes.py` | `/api/execute` | Execute remediation, list executions |
| `routes/rollback_routes.py` | `/api/rollback` | Rollback an execution |
| `routes/history_routes.py` | `/api/history` | Scan history records |
| `routes/alerts_routes.py` | `/api/alerts` | Real-time alerts from FastWatcher |
| `routes/analytics_routes.py` | `/api/analytics` | Risk score, compliance metrics |
| `routes/account_routes.py` | `/api/accounts` | AWS account CRUD |
| `routes/iam_view_routes.py` | `/api/iam` | IAM user/role/policy viewer |
| `routes/report_routes.py` | `/api/report` | HTML/PDF report export |
| `routes/drift_routes.py` | `/api/drift` | Config drift detection |
| `routes/attack_surface_routes.py` | `/api/attack-surface` | Attack surface analysis |
| `routes/scheduler_routes.py` | `/api/scheduler` | Scheduled scan config |
| `routes/update_routes.py` | `/api/update` | Updater check/trigger |
| `websocket_manager.py` | `/ws` | WebSocket broadcast manager for real-time alerts |

### `app/config/`

| File | Purpose |
|---|---|
| `security_config.py` | `SEVERITY_MAP` (all finding types → severity), `ALLOWED_LIVE_ACTIONS` set, `ENFORCEMENT_MAP`, `RISK_WEIGHTS`, `ALERT_SEVERITIES` |
| `execution_policy.py` | Per-action execution policy (DRY_RUN vs LIVE override) |

### `app/core/`

| File | Purpose |
|---|---|
| `aws_session.py` | `AWSSession` class — wraps boto3 session, stores credentials, has `get_account_id()` |
| `fast_watcher.py` | `FastWatcher` — polls 8 critical AWS checks every 3s, fires OS toast + WebSocket alert on change. Checks: IAM admin users, open SSH/RDP SGs, public S3, public RDS, CloudTrail disabled, users without MFA, public snapshots, public EC2 |
| `monitor_service.py` | `MonitorService` — wraps FastWatcher, manages start/stop lifecycle |
| `scheduler_service.py` | `SchedulerService` — runs scheduled scans at configured intervals |

### `app/database/`

| File | Purpose |
|---|---|
| `db.py` | SQLite engine setup, `get_db()` dependency, `SessionLocal` |
| `models.py` | SQLAlchemy models: `Account`, `ScanResult`, `Finding`, `Execution`, `Rollback`, `AlertRecord`, `ScanHistory` |

### `app/modules/scanner/`

All scanners follow the same pattern: class with `scan(region=None)` method, returns list of finding dicts with fields: `id`, `type`, `severity`, `resource_id`, `region`, `description`.

| File | Scanner class | AWS services | Finding types |
|---|---|---|---|
| `scanner.py` | `Scanner` | orchestrates all | runs all scanners in parallel thread pool |
| `s3_scanner.py` | `S3Scanner` | S3 | `S3_PUBLIC_ACL`, `S3_NO_ENCRYPTION`, `S3_VERSIONING_DISABLED`, `S3_ACCESS_LOGGING_DISABLED`, `S3_BLOCK_PUBLIC_ACCESS_DISABLED`, `S3_EMPTY_BUCKET` |
| `ec2_scanner.py` | `EC2Scanner` | EC2, EBS | `EC2_IMDSV1_ENABLED`, `EBS_SNAPSHOT_PUBLIC`, `PUBLIC_EC2_INSTANCE`, `EC2_WITHOUT_IAM_ROLE`, `EC2_DEFAULT_SECURITY_GROUP`, `EC2_TERMINATION_PROTECTION_DISABLED`, `EBS_UNENCRYPTED_VOLUME`, `EC2_PUBLIC_ELASTIC_IP`, `EC2_INSTANCE_RUNNING`, `EC2_INSTANCE_STOPPED`, `EC2_INSTANCE_RUNNING_UNMONITORED` |
| `sg_scanner.py` | `SGScanner` | EC2 | `PUBLIC_SECURITY_GROUP`, `SECURITY_GROUP_UNRESTRICTED_SSH`, `SECURITY_GROUP_UNRESTRICTED_RDP`, `UNUSED_SECURITY_GROUP` |
| `iam_extra_scanner.py` | `IAMExtraScanner` | IAM | `IAM_ADMIN_USER`, `IAM_INLINE_ADMIN_POLICY`, `IAM_WILDCARD_POLICY`, `IAM_UNUSED_USER`, `IAM_USER_WITHOUT_MFA`, `IAM_ACCESS_KEY_NOT_ROTATED`, `IAM_ACCESS_KEY_UNUSED`, `IAM_ACCESS_KEY_OLD_INACTIVE`, `IAM_ROLE_EXTERNAL_TRUST` |
| `vpc_scanner.py` | `VPCScanner` | EC2/VPC | `VPC_FLOW_LOGS_DISABLED`, `NACL_ALLOW_ALL_INBOUND`, `NACL_ALLOW_ALL_OUTBOUND`, `ROUTE_TABLE_PUBLIC_ROUTE`, `DEFAULT_VPC_EXISTS` |
| `rds_scanner.py` | `RDSScanner` | RDS | `RDS_PUBLICLY_ACCESSIBLE`, `RDS_BACKUP_DISABLED`, `RDS_DELETION_PROTECTION_DISABLED` |
| `network_scanner.py` | `NetworkScanner` | EC2 | network-level checks |
| `logging_scanner.py` | `LoggingScanner` | CloudTrail, CloudWatch | `CLOUDTRAIL_DISABLED`, `CLOUDTRAIL_NOT_LOGGING`, `CLOUDWATCH_LOG_GROUP_NO_RETENTION` |
| `encryption_scanner.py` | `EncryptionScanner` | KMS, EBS, RDS | `KMS_KEY_ROTATION_DISABLED`, `EBS_DEFAULT_ENCRYPTION_DISABLED` |
| `cloudwatch_scanner.py` | `CloudWatchScanner` | CloudWatch | CloudWatch-specific checks |

**S3Scanner architecture note:** Uses a 2-phase approach:
1. `get_bucket_tasks()` — list_buckets + parallel region resolution + serial per-region client creation
2. `scan_bucket(name, region)` — runs 6 checks sequentially (reuses warm SSL keep-alive): `_check_acl`, `_check_encryption`, `_check_versioning`, `_check_logging`, `_check_public_access`, `_check_empty`

### `app/modules/remediation/`

| File | Class | Purpose |
|---|---|---|
| `planner.py` | `RemediationPlanner` | `plan(finding)` → returns `{action, reason, recommended_fix, severity}` for every finding type |
| `executor.py` | `RemediationExecutor` | `execute(finding, plan)` — dispatches to action handler. Supports `DRY_RUN` and `LIVE` modes. 40+ handlers |
| `rollback.py` | `RollbackEngine` | `rollback(execution_id)` — reverses an execution using stored metadata. Uses `_success()`, `_fail()`, `_not_recoverable()` |
| `safety_guard.py` | `RemediationSafetyGuard` | Guards against dangerous operations |

**Executor action handlers (complete list):**
`ENABLE_S3_VERSIONING`, `ENABLE_BLOCK_PUBLIC_ACCESS`, `REMOVE_PUBLIC_S3_ACL`, `ENABLE_S3_ACCESS_LOGGING`, `DELETE_EMPTY_S3_BUCKET`, `DETACH_ADMIN_POLICY`, `REMOVE_INLINE_POLICY`, `REMOVE_INLINE_WILDCARD_POLICY`, `DELETE_UNUSED_IAM_USER`, `ENABLE_MFA`, `DISABLE_ACCESS_KEY`, `DELETE_ACCESS_KEY`, `DISABLE_STALE_ACCESS_KEY`, `RESTRICT_SECURITY_GROUP`, `REVOKE_UNRESTRICTED_SSH`, `REVOKE_UNRESTRICTED_RDP`, `DELETE_UNUSED_SECURITY_GROUP`, `RESTRICT_NACL_INBOUND`, `RESTRICT_NACL_OUTBOUND`, `REMOVE_PUBLIC_ROUTE`, `ENABLE_VPC_FLOW_LOGS`, `ENABLE_CLOUDTRAIL`, `START_CLOUDTRAIL_LOGGING`, `SET_LOG_GROUP_RETENTION`, `ENFORCE_IMDSV2`, `MAKE_SNAPSHOT_PRIVATE`, `ENABLE_TERMINATION_PROTECTION`, `ENCRYPT_EBS_VOLUME`, `ATTACH_IAM_ROLE_TO_INSTANCE`, `REPLACE_SECURITY_GROUP`, `REMOVE_ELASTIC_IP`, `STOP_EC2_INSTANCE`, `TERMINATE_EC2_INSTANCE`, `FORCE_TERMINATE_EC2_INSTANCE`, `DISABLE_RDS_PUBLIC_ACCESS`, `ENABLE_RDS_BACKUP`, `ENABLE_RDS_DELETION_PROTECTION`, `RESTRICT_ROLE_EXTERNAL_TRUST`, `ENABLE_KMS_KEY_ROTATION`, `DELETE_DEFAULT_VPC`

**NOT_RECOVERABLE actions** (rollback returns NOT_RECOVERABLE, no Recover button in UI):
`DELETE_EMPTY_S3_BUCKET`, `TERMINATE_EC2_INSTANCE`, `FORCE_TERMINATE_EC2_INSTANCE`, `REMOVE_ELASTIC_IP`, `DELETE_DEFAULT_VPC`, `DELETE_UNUSED_IAM_USER`, `DELETE_ACCESS_KEY`

### `app/modules/` — Other Modules

| Directory | Purpose |
|---|---|
| `iam_manager/` | IAM user/role/policy management helpers |
| `iam_view/iam_scanner.py` | IAM viewer — lists all users, roles, policies for the IAM View section |
| `policy_engine/` | Policy evaluation engine |
| `protection_history/history.py` | Scan history recorder |
| `reporter/html_reporter.py` | Generates HTML security reports |
| `threat_monitor/threat_monitor.py` | Threat monitoring service |

### `app/utils/`

| File | Purpose |
|---|---|
| `iam_policy_utils.py` | `has_wildcard()`, `normalize_statements()` for IAM policy inspection |
| `json_utils.py` | `make_json_safe()`, `extract_metadata()` — serialize SQLAlchemy rows to JSON-safe dicts |

### `app/scripts/`
| File | Purpose |
|---|---|
| `create_account.py` | CLI script to create initial AWS account entry in the database |

---

## Frontend — `app/ui/src/`

**Framework:** React 18 + Vite + CSS-in-JS (inline styles everywhere — no Tailwind)  
**API client:** axios to `http://127.0.0.1:8000`  
**State:** AuthContext (account/credentials) + ScanContext (scan results, findings)

### Entry Points

| File | Purpose |
|---|---|
| `main.jsx` | React root, renders `<App />` |
| `App.jsx` | Router — shows WelcomePage or PanelPage based on auth state |
| `index.css` | Global CSS variables (light/dark theme tokens: `--bg`, `--text`, `--border`, etc.) |

### `src/context/`

| File | State it holds |
|---|---|
| `AuthContext.jsx` | `account` (selected AWS account), `credentials`, login/logout |
| `ScanContext.jsx` | `scanId`, `findings`, `scanStatus`, `lastScanTime`, `triggerScan()` |

### `src/components/`

| File | Purpose |
|---|---|
| `Sidebar.jsx` | Left nav — links to all sections, shows severity badge counts, dark/light toggle |
| `ToastSystem.jsx` | Global toast notification system (success/error/warning/info) |
| `UI.jsx` | Shared primitive components (Button, Card, Badge, etc.) |

### `src/pages/`

| File | Route/Section | Description |
|---|---|---|
| `WelcomePage.jsx` | `/` (no auth) | Landing page — logo, account connect form |
| `AccountSetupPage.jsx` | Account setup | AWS credentials entry form |
| `PanelPage.jsx` | Main shell | Sidebar + section router |

### `src/pages/sections/` — All Dashboard Sections

| File | Section | Key features |
|---|---|---|
| `Overview.jsx` | Overview | Risk score dial, finding summary cards, top threats |
| `ScannerSection.jsx` | Scanner | Scan trigger, progress, findings table, filter by severity/type/service |
| `ThreatsSection.jsx` | Threats | Critical/High threats grouped view |
| `RemediationSection.jsx` | Remediation/Execute | Plan + execute fixes, DRY_RUN/LIVE toggle, execution result cards |
| `RollbackSection.jsx` | Rollback | Execution history, Recoverable vs Permanent tabs, rollback with confirm modal |
| `HistorySection.jsx` | History | Scan history timeline |
| `AnalyticsSection.jsx` | Analytics | Charts — finding trends, risk over time, severity distribution |
| `AttackSurfaceSection.jsx` | Attack Surface | External exposure analysis |
| `IAMViewSection.jsx` | IAM View | All IAM users/roles/policies viewer |
| `Operations.jsx` | Operations | Scheduled scan config, on-demand actions |
| `DataSections.jsx` | Data | Raw findings data tables |

### `src/api/index.js`
Central axios API client — all API calls go through here.

### `src/utils/getModuleGroup.js`
Maps finding types to service groups (S3, EC2, IAM, VPC, etc.) for UI grouping/filtering.

---

## Electron Shell — `electron/`

| File | Purpose |
|---|---|
| `main.js` | Windows entry — spawns `cloudshield-backend.exe`, creates BrowserWindow, system tray with ICO, handles app lifecycle |
| `main-linux.js` | Linux entry — spawns ELF backend, XDG-compliant log paths (`~/.local/share/cloudshield`), `pkill` for cleanup, PNG tray icon |
| `preload.js` | Electron preload script — exposes safe IPC APIs to renderer |
| `splash.html` | Loading splash screen shown while backend starts |
| `package.json` | Electron app config + electron-builder config for Windows (.exe) and Linux (.deb) |

### electron/package.json build config summary:
- **Windows:** NSIS installer → `CloudShield-Setup-v1.0.1.exe`
- **Linux:** `.deb` (amd64), maintainer: `NSudeep <sudeepn1011@gmail.com>`, `executableName: cloudshield`
- **Linux deb deps:** `libgtk-3-0`, `libnotify4`, `libnss3`, `libxss1`, `libxtst6`, `xdg-utils`, `libatspi2.0-0`, `libdrm2`, `libgbm1`, `libasound2`
- **extraResources:** `dist/cloudshield-backend` → `cloudshield-backend/`, icon, React build

---

## Installer — `installer/`

| File | Purpose |
|---|---|
| `setup.iss` | Inno Setup script — creates Windows NSIS installer |
| `license.txt` | Proprietary license for installer dialog |
| `linux/postinst` | Debian post-install script — creates `/usr/local/bin/cloudshield` symlink, sets permissions |
| `linux/prerm` | Debian pre-remove script — kills cloudshield processes, removes symlink |
| `images/` | `icon.ico`, `icon.png`, `banner.bmp`, `banner.png`, `header.bmp`, `tray_icon.ico` |

---

## Updater — `updater/`

| File | Purpose |
|---|---|
| `updater.py` | Checks GitHub releases for newer version, downloads update zip, replaces binary |
| `updater_entry.py` | Entry point for standalone updater binary |
| `updater.spec` | PyInstaller spec for updater → `CloudShield-Updater.exe` |

---

## CI/CD — `.github/workflows/`

| File | Trigger | What it builds |
|---|---|---|
| `build-linux.yml` | `workflow_dispatch` (manual) | Ubuntu 22.04 → PyInstaller Linux ELF + electron-builder .deb → uploads to GitHub Release |

**Linux build pipeline steps:**
1. Checkout → Python 3.11 → `pip install certifi pyinstaller -r requirements-linux.txt`
2. Node 18 → `npm ci` → `npm run build` (React)
3. `python -m PyInstaller cloudshield-linux.spec --noconfirm`
4. Verify binary → Install fakeroot/dpkg → `npm run build-linux` (electron-builder deb)
5. Create update zip → Rename .deb → Upload artifacts + GitHub Release

---

## Database Schema (SQLite: `cloudshield.db`)

| Table | Key columns |
|---|---|
| `accounts` | `id`, `name`, `aws_access_key`, `aws_secret_key`, `region`, `aws_account_id` |
| `scan_results` | `id`, `scan_id`, `account_id`, `started_at`, `completed_at`, `status` |
| `findings` | `id`, `scan_id`, `type`, `severity`, `resource_id`, `region`, `description` |
| `executions` | `execution_id`, `action`, `resource_name`, `finding_id`, `finding_type`, `finding_severity`, `status`, `meta` (JSON), `created_at` |
| `rollbacks` | `id`, `execution_id`, `status`, `created_at` |
| `alert_records` | `id`, `type`, `resource_id`, `severity`, `message`, `timestamp` |
| `scan_history` | `id`, `scan_id`, `account_id`, `findings_count`, `critical_count`, `high_count`, `timestamp` |

---

## Key Conventions & Patterns

### Finding dict structure (always):
```python
{
    "id": "unique-string-per-resource",    # e.g. "s3-empty-bucket-mybucket"
    "type": "FINDING_TYPE_IN_CAPS",        # e.g. "S3_EMPTY_BUCKET"
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "resource_id": "resource-name-or-id",
    "region": "us-east-1",                 # or "global" for S3/IAM
    "description": "Human readable text"
}
```

### Execution result structure (always):
```python
{
    "status": "EXECUTED|DRY_RUN|SKIPPED|FAILED|NOT_RECOVERABLE|MANUAL_REQUIRED",
    "execution_id": "uuid",
    "action": "ACTION_NAME",
    "metadata": { ... }   # used by rollback to restore previous state
}
```

### Adding a new finding type (complete checklist):
1. **`app/config/security_config.py`** — add to `SEVERITY_MAP` (and `ALLOWED_LIVE_ACTIONS` if remediatable)
2. **Scanner file** — add `_check_xxx()` method, add to check list
3. **`planner.py`** — add `if finding_type == "..."` block returning action dict
4. **`executor.py`** — add handler method + register in `self.action_handlers` dict
5. **`rollback.py`** — add rollback handler (or `_not_recoverable()` if irreversible)
6. **`RollbackSection.jsx`** — if NOT_RECOVERABLE, add action to `NON_ROLLBACKABLE_ACTIONS` set
7. **`app/ui/src/utils/getModuleGroup.js`** — add finding type to correct service group

### Scan time target: ~40 seconds
All scanners run in parallel in a thread pool. S3 `_check_empty` uses `list_objects_v2(MaxKeys=1)` for O(1) speed.

---

## Development Setup

### Start (Windows dev mode):
```powershell
# Terminal 1 — backend
.\venv\Scripts\activate
python backend_entry.py

# Terminal 2 — React dev server
cd app\ui
npm run dev

# Terminal 3 — Electron
cd electron
npm start
```

### Or use START.ps1 / START.bat (does all of the above)

### Build production (Windows):
```bat
run_b10.bat
```

### Build Linux .deb:
Trigger GitHub Actions → "Build Linux .deb" workflow → Run workflow → version 1.0.1

---

## Finding Type → Severity Reference (SEVERITY_MAP)

| Type | Severity | Scanner |
|---|---|---|
| `SECURITY_GROUP_UNRESTRICTED_SSH` | CRITICAL | sg_scanner |
| `SECURITY_GROUP_UNRESTRICTED_RDP` | CRITICAL | sg_scanner |
| `EBS_SNAPSHOT_PUBLIC` | CRITICAL | ec2_scanner |
| `PUBLIC_S3_BUCKET` | CRITICAL | s3_scanner |
| `IAM_ADMIN_USER` | CRITICAL | iam_extra_scanner |
| `IAM_POLICY_FULL_ADMIN` | CRITICAL | iam_extra_scanner |
| `IAM_ROLE_EXTERNAL_TRUST` | CRITICAL | iam_extra_scanner |
| `S3_BLOCK_PUBLIC_ACCESS_DISABLED` | HIGH | s3_scanner |
| `S3_NO_ENCRYPTION` | HIGH | s3_scanner |
| `PUBLIC_SECURITY_GROUP` | HIGH | sg_scanner |
| `EBS_DEFAULT_ENCRYPTION_DISABLED` | HIGH | encryption_scanner |
| `EBS_UNENCRYPTED_VOLUME` | HIGH | ec2_scanner |
| `PUBLIC_EC2_INSTANCE` | HIGH | ec2_scanner |
| `EC2_PUBLIC_ELASTIC_IP` | HIGH | ec2_scanner |
| `IAM_USER_WITHOUT_MFA` | HIGH | iam_extra_scanner |
| `IAM_UNUSED_USER` | HIGH | iam_extra_scanner |
| `IAM_ACCESS_KEY_NOT_ROTATED` | HIGH | iam_extra_scanner |
| `IAM_PASSWORD_POLICY_MISSING` | HIGH | iam_extra_scanner |
| `IAM_MULTIPLE_ACCESS_KEYS` | HIGH | iam_extra_scanner |
| `CLOUDTRAIL_DISABLED` | HIGH | logging_scanner |
| `CLOUDTRAIL_NOT_LOGGING` | HIGH | logging_scanner |
| `NACL_ALLOW_ALL_INBOUND` | HIGH | vpc_scanner |
| `RDS_PUBLICLY_ACCESSIBLE` | HIGH | rds_scanner |
| `EC2_IMDSV1_ENABLED` | MEDIUM | ec2_scanner |
| `S3_VERSIONING_DISABLED` | MEDIUM | s3_scanner |
| `S3_ACCESS_LOGGING_DISABLED` | MEDIUM | s3_scanner |
| `KMS_KEY_ROTATION_DISABLED` | MEDIUM | encryption_scanner |
| `VPC_FLOW_LOGS_DISABLED` | MEDIUM | vpc_scanner |
| `NACL_ALLOW_ALL_OUTBOUND` | MEDIUM | vpc_scanner |
| `ROUTE_TABLE_PUBLIC_ROUTE` | MEDIUM | vpc_scanner |
| `DEFAULT_VPC_EXISTS` | MEDIUM | vpc_scanner |
| `UNUSED_SECURITY_GROUP` | MEDIUM | sg_scanner |
| `EC2_WITHOUT_IAM_ROLE` | MEDIUM | ec2_scanner |
| `EC2_DEFAULT_SECURITY_GROUP` | MEDIUM | ec2_scanner |
| `EC2_TERMINATION_PROTECTION_DISABLED` | MEDIUM | ec2_scanner |
| `IAM_WILDCARD_POLICY` | MEDIUM | iam_extra_scanner |
| `IAM_ACCESS_KEY_UNUSED` | MEDIUM | iam_extra_scanner |
| `IAM_ACCESS_KEY_OLD_INACTIVE` | MEDIUM | iam_extra_scanner |
| `IAM_PASSWORD_NEVER_EXPIRES` | MEDIUM | iam_extra_scanner |
| `RDS_BACKUP_DISABLED` | MEDIUM | rds_scanner |
| `RDS_DELETION_PROTECTION_DISABLED` | MEDIUM | rds_scanner |
| `CLOUDWATCH_LOG_GROUP_NO_RETENTION` | LOW | logging_scanner |
| `INTERNET_GATEWAY_ATTACHED` | LOW | vpc_scanner |
| `VPC_WITHOUT_NAT_GATEWAY` | LOW | vpc_scanner |
| `S3_EMPTY_BUCKET` | LOW | s3_scanner |

---

## GitHub Info

- **Repo:** `NSudeep-Rust/AWS-Cloud-Control-Panel`  
- **Default branch:** `main`  
- **Releases:** `v1.0.1` — includes `CloudShield-Setup-v1.0.1.exe` (Windows) + `CloudShield-Setup-v1.0.1-linux-amd64.deb` (Linux)
- **Author email:** `sudeepn1011@gmail.com`
