"""
html_reporter.py — CloudShield Standalone HTML Report Generator

Generates a fully self-contained HTML report (no server required) after
every scan and saves it to the user's AppData folder.

Usage:
    from app.modules.reporter.html_reporter import HTMLReporter
    url = HTMLReporter.generate(scan_id, findings, stats, account_name)
"""

import os
import json
from datetime import datetime, timezone
from pathlib import Path



def _reports_dir() -> Path:
    """Returns (and creates) the reports directory in AppData on Windows,
    falling back to the project-local reports/ folder on other OS."""
    appdata = os.environ.get("APPDATA")        # Windows: C:\Users\<u>\AppData\Roaming
    if appdata:
        base = Path(appdata) / "CloudSecurityPanel" / "reports"
    else:
        base = Path.home() / ".cloudshield" / "reports"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _file_url(path: Path) -> str:
    """Convert a Path to a file:// URL that any browser can open."""
    return path.as_uri()            # e.g.  file:///C:/Users/.../report_xxx.html



_SEV_COLOR = {
    "CRITICAL": ("#d13212", "#fde8e4"),
    "HIGH":     ("#c8960c", "#fef3e0"),
    "MEDIUM":   ("#0972d3", "#e8f1fb"),
    "LOW":      ("#067340", "#e6f4ea"),
}

def _sev_badge(sev: str) -> str:
    icon = {"CRITICAL": "🚨", "HIGH": "⚠️", "MEDIUM": "🔵", "LOW": "🟢"}.get(sev, "•")
    fg, bg = _SEV_COLOR.get(sev, ("#333", "#f0f0f0"))
    return (
        f'<span style="display:inline-block;padding:3px 9px;border-radius:5px;'
        f'font-size:11px;font-weight:700;letter-spacing:.4px;'
        f'background:{bg};color:{fg};border:1px solid {fg}44;">{icon} {sev}</span>'
    )



def _build_html(scan_id: str, findings: list, stats: dict, account_name: str) -> str:
    total   = stats.get("total_findings", len(findings))
    crit    = stats.get("critical", 0)
    high    = stats.get("high", 0)
    medium  = stats.get("medium", 0)
    low     = stats.get("low", 0)
    score   = stats.get("risk_score", 0)
    level   = stats.get("risk_level", "LOW")
    scan_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    level_color, _ = _SEV_COLOR.get(level, ("#333", "#f0f0f0"))

    rows_html = ""
    for i, f in enumerate(findings):
        sev  = f.get("severity", "LOW")
        bg   = "#fffef8" if i % 2 == 0 else "#ffffff"
        rows_html += f"""
        <tr style="background:{bg};border-bottom:1px solid #eee;">
          <td style="padding:10px 12px;">{_sev_badge(sev)}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#0f1111;">
            {f.get('type','—')}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#565959;
              max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {f.get('resource_id','—')}</td>
          <td style="padding:10px 12px;font-size:12px;color:#565959;">{f.get('region','global')}</td>
          <td style="padding:10px 12px;font-size:11.5px;color:#333;max-width:280px;">
            {f.get('description','—')}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CloudShield Security Report — {account_name}</title>
<style>
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:'Segoe UI',Arial,sans-serif; background:#f4f4f4; color:#0f1111; }}
  .page {{ max-width:1100px; margin:32px auto; background:#fff; border-radius:14px;
           box-shadow:0 4px 24px rgba(0,0,0,.10); overflow:hidden; }}
  .hdr  {{ background:linear-gradient(135deg,#0f1111 0%,#1a2232 100%);
           padding:32px 40px; display:flex; align-items:center; gap:20px; }}
  .hdr h1 {{ color:#FF9900; font-size:24px; }}
  .hdr p  {{ color:rgba(255,255,255,.65); font-size:13px; margin-top:4px; }}
  .body   {{ padding:32px 40px; }}
  .stats  {{ display:flex; gap:16px; margin:24px 0; flex-wrap:wrap; }}
  .stat   {{ flex:1; min-width:110px; text-align:center; padding:18px 12px;
             border-radius:10px; border:1.5px solid #e5e8ed; }}
  .tbl    {{ width:100%; border-collapse:collapse; font-size:13px; margin-top:24px; }}
  .tbl th {{ background:#f7f7f7; padding:10px 12px; text-align:left; font-size:11px;
             color:#565959; text-transform:uppercase; letter-spacing:.8px;
             border-bottom:2px solid #e5e8ed; position:sticky; top:0; }}
  .ftr    {{ background:#f8f8f8; border-top:1px solid #e5e8ed; padding:16px 40px;
             text-align:center; font-size:11px; color:#8d9191; }}
  .badge  {{ font-size:12px; display:inline-block; padding:4px 10px; border-radius:6px;
             background:{level_color}18; color:{level_color}; border:1.5px solid {level_color}44;
             font-weight:700; }}
  @media (max-width:700px) {{
    .hdr {{ padding:20px; }}
    .body {{ padding:20px; }}
    td,th {{ font-size:11px !important; }}
  }}
</style>
</head>
<body>
<div class="page">

  <div class="hdr">
    <div>
      <div style="font-size:30px;">🛡️</div>
    </div>
    <div>
      <h1>CloudShield Security Report</h1>
      <p>Account: <strong style="color:#fff;">{account_name}</strong>
         &nbsp;·&nbsp; Scan ID: <code style="color:#FF9900;font-size:11px;">{scan_id}</code>
         &nbsp;·&nbsp; {scan_at}
      </p>
    </div>
  </div>

  <div class="body">

    <div style="display:flex;align-items:center;gap:20px;background:#f8f8f8;
        border:1.5px solid #e5e8ed; border-radius:12px;padding:20px 24px; margin-bottom:8px;">
      <div style="text-align:center;background:{level_color}18;border:3px solid {level_color}44;
          border-radius:50%;width:80px;height:80px;line-height:80px;flex-shrink:0;">
        <span style="font-size:26px;font-weight:900;color:{level_color};">{score}</span>
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;">Risk Score: {score}/100</div>
        <div class="badge" style="margin-top:6px;">{level}</div>
        <div style="font-size:12px;color:#8d9191;margin-top:4px;"> {total} total findings detected</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat" style="background:#fde8e4;border-color:#d1321244;">
        <div style="font-size:30px;font-weight:900;color:#d13212;">{crit}</div>
        <div style="font-size:11px;color:#d13212;font-weight:700;margin-top:4px;">CRITICAL</div>
      </div>
      <div class="stat" style="background:#fef3e0;border-color:#c8960c44;">
        <div style="font-size:30px;font-weight:900;color:#c8960c;">{high}</div>
        <div style="font-size:11px;color:#c8960c;font-weight:700;margin-top:4px;">HIGH</div>
      </div>
      <div class="stat" style="background:#e8f1fb;border-color:#0972d344;">
        <div style="font-size:30px;font-weight:900;color:#0972d3;">{medium}</div>
        <div style="font-size:11px;color:#0972d3;font-weight:700;margin-top:4px;">MEDIUM</div>
      </div>
      <div class="stat" style="background:#e6f4ea;border-color:#06734044;">
        <div style="font-size:30px;font-weight:900;color:#067340;">{low}</div>
        <div style="font-size:11px;color:#067340;font-weight:700;margin-top:4px;">LOW</div>
      </div>
    </div>

    <h3 style="margin-top:28px;font-size:15px;color:#0f1111;">
      📋 All Findings ({total})
    </h3>
    <div style="overflow-x:auto;">
      <table class="tbl">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Finding Type</th>
            <th>Resource ID</th>
            <th>Region</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows_html if rows_html else '<tr><td colspan="5" style="text-align:center;padding:40px;color:#8d9191;">No findings detected ✅</td></tr>'}
        </tbody>
      </table>
    </div>

  </div>

  <div class="ftr">
    Generated by CloudShield Security Panel &nbsp;·&nbsp; {scan_at}<br/>
    This report is a point-in-time snapshot. Open CloudShield to apply automated fixes.
  </div>
</div>
</body>
</html>"""



class HTMLReporter:

    @staticmethod
    def generate(scan_id: str, findings: list, stats: dict, account_name: str) -> str:
        """
        Generate and save a self-contained HTML report.
        Returns the file:// URL string (safe to embed in an email href).
        Returns empty string on failure so email still sends without it.
        """
        try:
            reports_dir = _reports_dir()
            filename    = f"report_{scan_id}.html"
            filepath    = reports_dir / filename
            html        = _build_html(scan_id, findings, stats, account_name)
            filepath.write_text(html, encoding="utf-8")
            url = _file_url(filepath)
            print(f"[HTMLReporter] Report saved → {filepath}")
            return url
        except Exception as e:
            print(f"[HTMLReporter] Failed to generate report: {e}")
            return ""

    @staticmethod
    def get_path(scan_id: str) -> Path | None:
        """Return the Path of an existing report, or None if not found."""
        try:
            p = _reports_dir() / f"report_{scan_id}.html"
            return p if p.exists() else None
        except Exception:
            return None
