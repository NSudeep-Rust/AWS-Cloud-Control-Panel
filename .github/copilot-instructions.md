# CloudShield — GitHub Copilot Custom Instructions

This file is automatically loaded by GitHub Copilot Chat to provide project context.
Always refer to this before suggesting any code changes.

---

## 🧠 Project Overview

**CloudShield** is a cloud security scanning and remediation platform for AWS.
It was built as a college final-year project by NSudeep-Rust.

### Three deployment modes:
1. **Production Website** → `https://cloudshield.me` (live on AWS EC2)
2. **Windows EXE** → Standalone installer (Inno Setup + Electron + PyInstaller)
3. **Linux .deb** → Debian package (built via GitHub Actions)

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** + **Uvicorn** (Python 3.11)
- **SQLAlchemy** ORM
- **PostgreSQL** via **Neon.tech** (cloud database)
- **boto3** for AWS SDK calls
- **apscheduler** for background scan scheduling

### Frontend
- **React** + **Vite** (JSX)
- **CSS** (custom, no Tailwind)
- Hosted as static files served by **Nginx**

### Infrastructure
- **AWS EC2 t3.micro** (eu-north-1, 1GB RAM)
- **Elastic IP**: `13.48.51.34`
- **Domain**: `cloudshield.me` via Namecheap DNS
- **SSL**: Let's Encrypt via Certbot
- **Nginx**: Reverse proxy (ports 80/443 → 8000)
- **systemd**: `cloudshield.service` — auto-starts on boot

### Database
- **Neon.tech** PostgreSQL (free tier, cloud-hosted)
- Connection via `DATABASE_URL` in server `.env`

---

## 📁 Project Structure

```
CloudSecurityPanel/
├── app/
│   ├── api/
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── routes/               # All API route files
│   │   └── response_formatter.py # Standardized API responses
│   ├── modules/
│   │   ├── scanner/              # AWS scanner engines (12+ scanners)
│   │   │   ├── scanner.py        # Main orchestrator
│   │   │   ├── s3_scanner.py
│   │   │   ├── ec2_scanner.py
│   │   │   ├── iam_scanner.py
│   │   │   ├── rds_scanner.py
│   │   │   ├── vpc_scanner.py
│   │   │   ├── network_scanner.py
│   │   │   ├── encryption_scanner.py
│   │   │   └── logging_scanner.py
│   │   ├── remediation/
│   │   │   ├── executor.py       # Applies fixes
│   │   │   ├── planner.py        # Plans remediation steps
│   │   │   └── rollback.py       # Reverts fixes
│   │   ├── iam_view/             # IAM users/roles matrix
│   │   └── threat_monitor/       # Real-time threat detection
│   ├── core/
│   │   ├── aws_session.py        # Centralized boto3 session (AWSSession class)
│   │   └── scheduler_service.py  # Background scan scheduler
│   ├── config/
│   │   ├── security_config.py    # Security rules config
│   │   └── execution_policy.py   # Remediation safety policy
│   └── database/
│       ├── models.py             # SQLAlchemy models
│       ├── db.py                 # Database connection
│       └── base.py
├── app/ui/                       # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── WelcomePage.jsx
│   │   │   ├── WebAuthPage.jsx
│   │   │   ├── AccountSetupPage.jsx
│   │   │   └── PanelPage.jsx     # Main dashboard
│   │   │   └── sections/         # Dashboard sections
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   # Authentication state
│   │   │   └── ScanContext.jsx   # Scan results state
│   │   └── api/
│   │       └── index.js          # API client (reads VITE_API_URL)
│   ├── .env.production           # VITE_API_URL=https://cloudshield.me
│   └── .env.local                # VITE_API_URL=http://127.0.0.1:8000
├── electron/                     # Electron desktop wrapper
├── updater/                      # Auto-updater module
├── installer/                    # Inno Setup Windows installer
├── .github/
│   └── workflows/
│       ├── deploy-website.yml    # CI/CD: push to main → auto deploy to EC2
│       └── build-linux.yml       # Builds Linux .deb (manual trigger)
├── .env                          # Server env (NOT committed) — see below
├── pyrightconfig.json            # Disables Pylance type checking (cosmetic)
└── .vscode/settings.json         # VS Code workspace settings
```

---

## 🔑 Key Architecture Decisions

### API URL Strategy (Tri-Mode)
```javascript
// Frontend always reads from env:
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// .env.local      → http://127.0.0.1:8000   (local dev)
// .env.production → https://cloudshield.me   (production build)
// EXE mode        → bundled with hardcoded localhost
```

### WebSocket URL Strategy
```javascript
// Derived automatically from VITE_API_URL:
// https://cloudshield.me → wss://cloudshield.me
// http://127.0.0.1:8000  → ws://127.0.0.1:8000
```

### Scanner Thread Limits (OOM Prevention)
```python
# scanner.py — controlled via environment variables:
MAX_WORKERS = int(os.getenv("SCAN_MAX_WORKERS", "24"))        # outer threads
INNER_MAX_WORKERS = int(os.getenv("SCAN_INNER_MAX_WORKERS", "12"))  # inner threads

# Production server .env uses:
# SCAN_MAX_WORKERS=4
# SCAN_INNER_MAX_WORKERS=3
# (prevents OOM on 1GB EC2 t3.micro)
```

### AWSSession (aws_session.py)
- Centralized boto3 session management
- Supports profile-based, key-based, and role-based auth
- All scanners use `AWSSession` — never create raw boto3 clients directly

---

## 🗄️ Database Models (models.py)

| Model | Table | Purpose |
|---|---|---|
| `WebUser` | `web_users` | Website login accounts |
| `PasswordResetToken` | `password_reset_tokens` | Email password reset |
| `Account` | `accounts` | AWS account credentials |
| `Scan` | `scans` | Scan runs (UUID primary key) |
| `Finding` | `findings` | Security findings (composite PK: scan_id + id) |
| `Execution` | `executions` | Remediation actions applied |
| `Rollback` | `rollbacks` | Rollback records |
| `FindingChange` | `finding_changes` | Drift detection deltas |
| `IamUser` | `iam_users` | IAM sub-users per account |
| `ScheduleConfig` | `schedule_configs` | Automated scan schedules |
| `EmailConfig` | `email_configs` | SMTP alert config |

---

## 🚀 CI/CD Pipeline

**File**: `.github/workflows/deploy-website.yml`

**Trigger**: Push to `main` branch (when `app/` files change) OR manual dispatch

**Steps**:
1. Checkout source
2. Setup SSH key from `EC2_SSH_KEY` secret
3. Node.js 18 → `npm ci` → `npm run build` (with `VITE_API_URL=https://cloudshield.me`)
4. `tar` all files → single `cloudshield-deploy.tar.gz`
5. `scp` tar to EC2 `/tmp/`
6. SSH → extract → `cp` to `/root/cloudshield/` → `systemctl restart cloudshield`
7. Verify service is active

**GitHub Secrets required**:
- `EC2_HOST`: `13.48.51.34`
- `EC2_SSH_KEY`: Contents of `Host.pem`

---

## 🖥️ Production Server Setup

```
Server: Ubuntu 22.04 on EC2 t3.micro
IP: 13.48.51.34 (Elastic IP — permanent)
Domain: cloudshield.me
Project path: /root/cloudshield/
Service: systemd cloudshield.service
Python: /root/cloudshield/venv/bin/python3
```

### Useful server commands:
```bash
sudo systemctl status cloudshield       # check if running
sudo systemctl restart cloudshield      # restart after code changes
sudo journalctl -u cloudshield -f       # live logs
sudo systemctl status nginx             # check web server
```

### Server .env (at /root/cloudshield/.env):
```
DATABASE_URL=postgresql://...@neon.tech/...
SECRET_KEY=...
SCAN_MAX_WORKERS=4
SCAN_INNER_MAX_WORKERS=3
AWS_DEFAULT_REGION=eu-north-1
MODE=WEB
```

---

## ⚙️ Development Setup (Local)

```bash
# Backend
cd P:\CloudSecurityPanel
.\venv\Scripts\activate
uvicorn app.api.main:app --reload --port 8000

# Frontend
cd app\ui
npm run dev
```

**Local .env.local**:
```
VITE_API_URL=http://127.0.0.1:8000
```

---

## 🛡️ Features

1. **Scanner** — 12+ AWS service scanners across 9 regions, ~18 second scan time
2. **Remediation** — Auto-fix findings with approval workflow
3. **Rollback** — Revert any applied fix
4. **Threat Monitor** — Real-time threat detection with WebSocket
5. **IAM View** — IAM users/roles matrix with permissions
6. **Attack Surface** — Publicly exposed resources dashboard
7. **Drift Detection** — Compare scans to find new/resolved/persistent findings
8. **Analytics** — Historical scan trends
9. **Email Alerts** — SMTP notifications for critical findings
10. **AI Analysis** — Local LLM via Ollama (qwen2.5:3b model)

---

## ⚠️ Important Rules for Copilot

1. **Never hardcode `http://127.0.0.1:8000`** — always use `import.meta.env.VITE_API_URL`
2. **Never bypass `AWSSession`** — always get boto3 clients through it
3. **Don't increase thread counts** on production — OOM risk on 1GB EC2
4. **Finding primary key is composite**: `(scan_id, id)` — not just `id`
5. **`Execution` model exists in models.py** — don't recreate it
6. **WebSocket URLs** must be derived from `VITE_API_URL`, not hardcoded
7. **DB mode detection**: check `os.getenv("MODE")` == "WEB" for web vs desktop

---

## 💰 AWS Cost (for reference)
- EC2 t3.micro: ~$8.21/month
- Elastic IP: ~$3.60/month
- Total: ~$12.72/month (covered by $120 AWS credits until Nov 2026)
