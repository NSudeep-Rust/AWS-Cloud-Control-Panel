"""
email_service.py — CloudShield Email Notification Engine

Sends styled HTML alert emails via SMTP (Gmail/Outlook/custom).
Reads config from the EmailConfig database table.

Public API:
    EmailService.send_critical_alert(findings, account_name, db)
    EmailService.send_scan_summary(scan_stats, account_name, db)
    EmailService.send_drift_alert(drift_data, account_name, db)
    EmailService.send_test(cfg)          → (ok: bool, error: str|None)
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional

DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:5173")



def _base_html(title: str, body_html: str, subtitle: str = "") -> str:
    """Wraps content in the CloudShield email frame."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>{title}</title>
<style>
  body   {{ margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',Arial,sans-serif; }}
  .wrap  {{ max-width:620px; margin:32px auto; background:#fff; border-radius:14px; overflow:hidden;
            box-shadow:0 4px 24px rgba(0,0,0,0.10); }}
  .hdr   {{ background:linear-gradient(135deg,#0f1111 0%,#1a2232 100%);
            padding:28px 32px; text-align:center; }}
  .hdr h1 {{ color:#FF9900; margin:0; font-size:22px; letter-spacing:-0.5px; }}
  .hdr p  {{ color:rgba(255,255,255,0.65); margin:6px 0 0; font-size:13px; }}
  .body  {{ padding:28px 32px; }}
  .badge {{ display:inline-block; padding:3px 10px; border-radius:5px;
            font-size:11px; font-weight:700; letter-spacing:0.5px; }}
  .crit  {{ background:#fde8e4; color:#d13212; border:1px solid rgba(209,50,18,0.3); }}
  .high  {{ background:#fef3e0; color:#c8960c; border:1px solid rgba(200,150,12,0.3); }}
  .med   {{ background:#e8f1fb; color:#0972d3; border:1px solid rgba(9,114,211,0.3); }}
  .low   {{ background:#e6f4ea; color:#067340; border:1px solid rgba(6,115,64,0.3); }}
  .card  {{ background:#f8f8f8; border:1px solid #e5e8ed; border-radius:10px;
            padding:16px 18px; margin:12px 0; }}
  .stat  {{ display:inline-block; text-align:center; min-width:90px;
            padding:14px; border-radius:9px; margin:4px; }}
  table  {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
  th     {{ background:#f0f0f0; padding:9px 12px; text-align:left;
            font-size:11px; color:#565959; text-transform:uppercase; letter-spacing:0.8px; }}
  td     {{ padding:10px 12px; border-bottom:1px solid #f0f0f0; color:#0f1111; }}
  .ftr   {{ background:#f8f8f8; border-top:1px solid #e5e8ed; padding:16px 32px;
            text-align:center; font-size:11px; color:#8d9191; }}
  .btn   {{ display:inline-block; padding:12px 28px; background:#FF9900;
            color:#0f1111; border-radius:8px; font-weight:700; font-size:13px;
            text-decoration:none; margin:16px 0; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>🛡️ CloudShield</h1>
      <p>{subtitle or "AWS Cloud Security Panel"}</p>
    </div>
    <div class="body">
      {body_html}
    </div>
    <div class="ftr">
      CloudShield Security &nbsp;·&nbsp; {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
      <br/>This is an automated notification from your CloudShield dashboard.
    </div>
  </div>
</body>
</html>"""


def _sev_badge(sev: str) -> str:
    css = {"CRITICAL": "crit", "HIGH": "high", "MEDIUM": "med", "LOW": "low"}.get(sev, "low")
    icon = {"CRITICAL": "🚨", "HIGH": "⚠️", "MEDIUM": "🔵", "LOW": "🟢"}.get(sev, "•")
    return f'<span class="badge {css}">{icon} {sev}</span>'


def _critical_alert_html(findings: list, account_name: str) -> str:
    rows = ""
    for f in findings[:20]:  # cap at 20 rows
        rows += f"""<tr>
          <td>{_sev_badge(f.get('severity','HIGH'))}</td>
          <td style="font-family:monospace;font-size:11px;">{f.get('type','—')}</td>
          <td style="font-family:monospace;font-size:11px;max-width:200px;overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap;">{f.get('resource_id','—')}</td>
          <td style="font-size:11px;color:#565959;">{f.get('region','—')}</td>
        </tr>"""
    count = len(findings)
    crit  = sum(1 for f in findings if f.get("severity") == "CRITICAL")
    high  = sum(1 for f in findings if f.get("severity") == "HIGH")
    body  = f"""
      <h2 style="color:#d13212;margin-top:0;">🚨 Critical Security Alerts Detected</h2>
      <p style="color:#565959;font-size:13.5px;line-height:1.6;">
        CloudShield detected <strong>{count} high-priority finding(s)</strong>
        on AWS account <strong>{account_name}</strong>.
        Immediate action may be required.
      </p>
      <div style="display:flex;gap:12px;margin:18px 0;flex-wrap:wrap;">
        <div class="stat" style="background:#fde8e4;border:1.5px solid rgba(209,50,18,0.25);">
          <div style="font-size:28px;font-weight:900;color:#d13212;">{crit}</div>
          <div style="font-size:11px;color:#d13212;font-weight:700;">CRITICAL</div>
        </div>
        <div class="stat" style="background:#fef3e0;border:1.5px solid rgba(200,150,12,0.25);">
          <div style="font-size:28px;font-weight:900;color:#c8960c;">{high}</div>
          <div style="font-size:11px;color:#c8960c;font-weight:700;">HIGH</div>
        </div>
        <div class="stat" style="background:#f0f0f0;border:1.5px solid #e5e8ed;">
          <div style="font-size:28px;font-weight:900;color:#0f1111;">{count}</div>
          <div style="font-size:11px;color:#8d9191;font-weight:700;">TOTAL</div>
        </div>
      </div>
      <div class="card">
        <table>
          <thead><tr>
            <th>Severity</th><th>Finding Type</th><th>Resource</th><th>Region</th>
          </tr></thead>
          <tbody>{rows}</tbody>
        </table>
        {"<p style='font-size:11px;color:#8d9191;margin:8px 0 0;'>Showing first 20 findings.</p>" if count > 20 else ""}
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="{DASHBOARD_URL}/panel" class="btn">Open CloudShield Dashboard →</a>
      </div>
      <p style="font-size:11.5px;color:#8d9191;margin-top:20px;">
        Navigate to <strong>Remediation</strong> in the dashboard to apply automatic fixes.
      </p>"""
    return _base_html("CloudShield — Critical Alert", body, "🚨 Security Alert")


def _scan_summary_html(stats: dict, account_name: str, report_url: str = "") -> str:
    risk   = stats.get("risk_score", 0)
    level  = stats.get("risk_level", "LOW")
    total  = stats.get("total_findings", 0)
    crit   = stats.get("critical", 0)
    high   = stats.get("high", 0)
    medium = stats.get("medium", 0)
    low    = stats.get("low", 0)
    scan_at = stats.get("scan_at", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    lev_c  = {"CRITICAL": "#d13212", "HIGH": "#c8960c", "MEDIUM": "#0972d3", "LOW": "#067340"}.get(level, "#0f1111")

    report_btn = ""
    if report_url:
        report_btn = f"""
        <a href="{report_url}" style="display:inline-block;padding:12px 22px;
            background:#0972d3;color:#fff;border-radius:8px;font-weight:700;
            font-size:13px;text-decoration:none;margin:8px 6px;">
          📄 View Full Report (No App Needed)
        </a>"""

    body = f"""
      <h2 style="color:#0f1111;margin-top:0;">&#x1F4CA; Scan Complete &mdash; Security Summary</h2>
      <p style="color:#565959;font-size:13.5px;line-height:1.6;">
        A security scan has completed for <strong>{account_name}</strong>.
      </p>
      <div class="card">
        <div style="display:flex;align-items:center;gap:18px;margin-bottom:16px;">
          <div style="text-align:center;background:{lev_c}18;border:2px solid {lev_c}44;
              border-radius:50%;width:72px;height:72px;line-height:72px;flex-shrink:0;">
            <span style="font-size:22px;font-weight:900;color:{lev_c};">{risk}</span>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#0f1111;">Risk Score: {risk}/100</div>
            <div style="font-size:12px;color:{lev_c};font-weight:700;margin-top:2px;">Level: {level}</div>
            <div style="font-size:11px;color:#8d9191;margin-top:2px;">Scanned at {scan_at}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Severity</th><th>Count</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>{_sev_badge('CRITICAL')}</td><td><strong>{crit}</strong></td>
                <td style="color:#d13212;font-size:11px;">{'&#x26A0;&#xFE0F; Requires immediate action' if crit > 0 else '&#x2705; None'}</td></tr>
            <tr><td>{_sev_badge('HIGH')}</td><td><strong>{high}</strong></td>
                <td style="color:#c8960c;font-size:11px;">{'&#x26A0;&#xFE0F; Urgent attention needed' if high > 0 else '&#x2705; None'}</td></tr>
            <tr><td>{_sev_badge('MEDIUM')}</td><td><strong>{medium}</strong></td>
                <td style="font-size:11px;">{'Review recommended' if medium > 0 else '&#x2705; None'}</td></tr>
            <tr><td>{_sev_badge('LOW')}</td><td><strong>{low}</strong></td>
                <td style="font-size:11px;color:#8d9191;">{'Low priority' if low > 0 else '&#x2705; None'}</td></tr>
          </tbody>
        </table>
      </div>
      <div style="text-align:center;margin-top:20px;">
        {report_btn}
        <a href="{DASHBOARD_URL}/panel" class="btn" style="margin:8px 6px;">&#x1F6E1;&#xFE0F; Open CloudShield Panel &rarr;</a>
      </div>
      {f'<p style="font-size:11px;color:#8d9191;text-align:center;margin-top:8px;">The report link opens directly in your browser &mdash; no app or login required.</p>' if report_url else ''}"""
    return _base_html("CloudShield \u2014 Scan Summary", body, "&#x1F4CA; Scan Completed")


def _drift_alert_html(drift: dict, account_name: str) -> str:
    new_c  = drift.get("summary", {}).get("new", 0)
    res_c  = drift.get("summary", {}).get("resolved", 0)
    net    = drift.get("summary", {}).get("net_change", 0)
    new_sev = drift.get("new_by_severity", {})
    rows = "".join(
        f'<tr><td>{_sev_badge(s)}</td><td style="font-weight:700;color:#d13212;">+{new_sev[s]}</td></tr>'
        for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        if new_sev.get(s, 0) > 0
    )
    body = f"""
      <h2 style="color:#0f1111;margin-top:0;">🔄 Security Drift Detected</h2>
      <p style="color:#565959;font-size:13.5px;line-height:1.6;">
        A new scan for <strong>{account_name}</strong> found
        <strong style="color:#d13212;">{new_c} new security finding(s)</strong>
        compared to the previous scan.
      </p>
      <div style="display:flex;gap:12px;margin:18px 0;flex-wrap:wrap;">
        <div class="stat" style="background:#fde8e4;border:1.5px solid rgba(209,50,18,0.25);">
          <div style="font-size:24px;font-weight:900;color:#d13212;">+{new_c}</div>
          <div style="font-size:10px;color:#d13212;font-weight:700;">NEW</div>
        </div>
        <div class="stat" style="background:#e6f4ea;border:1.5px solid rgba(6,115,64,0.25);">
          <div style="font-size:24px;font-weight:900;color:#1d8102;">-{res_c}</div>
          <div style="font-size:10px;color:#1d8102;font-weight:700;">RESOLVED</div>
        </div>
        <div class="stat" style="background:#f0f0f0;border:1.5px solid #e5e8ed;">
          <div style="font-size:24px;font-weight:900;color:{'#d13212' if net>0 else '#1d8102'};">
            {'+' if net > 0 else ''}{net}
          </div>
          <div style="font-size:10px;color:#8d9191;font-weight:700;">NET CHANGE</div>
        </div>
      </div>
      {f'<div class="card"><table><thead><tr><th>Severity</th><th>New Count</th></tr></thead><tbody>{rows}</tbody></table></div>' if rows else ""}
      <div style="text-align:center;margin-top:20px;">
        <a href="{DASHBOARD_URL}/panel" class="btn">View Drift Details →</a>
      </div>"""
    return _base_html("CloudShield — Drift Alert", body, "🔄 Security Drift")


def _test_html() -> str:
    body = """
      <h2 style="color:#1d8102;margin-top:0;">✅ Email Notifications Configured!</h2>
      <p style="color:#565959;font-size:13.5px;line-height:1.6;">
        Your CloudShield email notifications are working correctly.
        You will receive alerts for:
      </p>
      <div class="card">
        <ul style="margin:0;padding:0 0 0 20px;color:#0f1111;font-size:13px;line-height:2;">
          <li>🚨 <strong>Critical/High findings</strong> from the live threat monitor</li>
          <li>📊 <strong>Scan summary</strong> after each security scan completes</li>
          <li>🔄 <strong>Drift alerts</strong> when new findings appear since the last scan</li>
        </ul>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="{DASHBOARD_URL}/panel" class="btn">Open Dashboard →</a>
      </div>"""
    return _base_html("CloudShield — Test Email", body, "Configuration Verified")



class EmailService:

    @staticmethod
    def _send(cfg, subject: str, html: str) -> tuple[bool, Optional[str]]:
        """Core SMTP send — supports port 465 (SSL) and port 587/25 (STARTTLS).
        Returns (success, error_message)."""
        if not cfg.smtp_username or not cfg.smtp_password or not cfg.recipient_email:
            return False, "Incomplete config — username, password, and recipient are all required."
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[CloudShield] {subject}"
            msg["From"]    = f"{cfg.sender_name} <{cfg.smtp_username}>"
            msg["To"]      = cfg.recipient_email
            msg.attach(MIMEText(html, "html"))

            context = ssl.create_default_context()
            port    = int(cfg.smtp_port)

            if port == 465:
                with smtplib.SMTP_SSL(cfg.smtp_host, port, context=context, timeout=20) as server:
                    server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.smtp_username, cfg.recipient_email, msg.as_string())
            else:
                with smtplib.SMTP(cfg.smtp_host, port, timeout=20) as server:
                    server.ehlo()
                    server.starttls(context=context)
                    server.ehlo()
                    server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.smtp_username, cfg.recipient_email, msg.as_string())

            return True, None

        except smtplib.SMTPAuthenticationError as e:
            hint = ""
            if "gmail" in (cfg.smtp_host or "").lower():
                hint = " For Gmail: use a 16-char App Password (not your login password). 2FA must be enabled."
            elif "yahoo" in (cfg.smtp_host or "").lower():
                hint = " For Yahoo: go to login.yahoo.com/account/security and generate an App Password."
            return False, f"Authentication failed — wrong username or app-password.{hint}"

        except smtplib.SMTPConnectError:
            return False, f"Cannot connect to {cfg.smtp_host}:{cfg.smtp_port}. Check the SMTP host and port."

        except smtplib.SMTPServerDisconnected:
            return False, f"Server disconnected. The port may be wrong (try 587 for STARTTLS or 465 for SSL)."

        except smtplib.SMTPRecipientsRefused:
            return False, f"Recipient address '{cfg.recipient_email}' was rejected by the server."

        except smtplib.SMTPException as e:
            return False, f"SMTP error: {e}"

        except TimeoutError:
            return False, f"Connection timed out connecting to {cfg.smtp_host}:{cfg.smtp_port}."

        except Exception as e:
            return False, f"Unexpected error: {type(e).__name__}: {e}"

    @classmethod
    def send_test(cls, cfg) -> tuple[bool, Optional[str]]:
        return cls._send(cfg, "Test Email — Configuration Verified", _test_html())

    @classmethod
    def send_critical_alert(cls, findings: list, account_name: str, cfg) -> tuple[bool, Optional[str]]:
        if not cfg or not cfg.enabled or not cfg.notify_on_critical:
            return False, "Notifications disabled or critical alerts off."
        html = _critical_alert_html(findings, account_name)
        return cls._send(cfg, f"🚨 Critical Alert — {len(findings)} finding(s) on {account_name}", html)

    @classmethod
    def send_scan_summary(cls, stats: dict, account_name: str, cfg,
                          report_url: str = "") -> tuple[bool, Optional[str]]:
        if not cfg or not cfg.enabled or not cfg.notify_on_scan_complete:
            return False, "Scan-complete notifications disabled."
        html = _scan_summary_html(stats, account_name, report_url=report_url)
        return cls._send(cfg, f"&#x1F4CA; Scan Complete \u2014 {stats.get('risk_level','?')} Risk on {account_name}", html)

    @classmethod
    def send_drift_alert(cls, drift: dict, account_name: str, cfg) -> tuple[bool, Optional[str]]:
        if not cfg or not cfg.enabled or not cfg.notify_on_drift:
            return False, "Drift notifications disabled."
        new_c = drift.get("summary", {}).get("new", 0)
        if new_c == 0:
            return False, "No new findings — drift email skipped."
        html = _drift_alert_html(drift, account_name)
        return cls._send(cfg, f"🔄 Drift Alert — {new_c} new finding(s) on {account_name}", html)

    @staticmethod
    def get_config(account_id: Optional[int], db):
        """Fetch EmailConfig for a given account (or global config if not found)."""
        from app.database.models import EmailConfig
        cfg = None
        if account_id:
            cfg = db.query(EmailConfig).filter(EmailConfig.account_id == account_id).first()
        if not cfg:
            cfg = db.query(EmailConfig).filter(EmailConfig.account_id.is_(None)).first()
        return cfg
