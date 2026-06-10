#!/usr/bin/env python3
"""
COMPREHENSIVE Nginx SEO fix for CloudShield
========================================
Problem: Root / redirects to /landing (causes GSC 'Page with redirect')
Fix:     Root / serves landing page directly. /landing redirects to root.

Run as: sudo python3 /root/cloudshield/docs/nginx_seo_fix.py
"""
import sys
import re
import os
import shutil
from datetime import datetime

CONF = "/etc/nginx/sites-enabled/cloudshield"
BACKUP = f"/etc/nginx/sites-enabled/cloudshield.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"

# ── Read current config ───────────────────────────────────────────────────────
with open(CONF, "r") as f:
    original = f.read()

print("=" * 60)
print("CURRENT NGINX CONFIG:")
print("=" * 60)
print(original)
print("=" * 60)

# Backup original
shutil.copy(CONF, BACKUP)
print(f"Backup saved: {BACKUP}")

config = original
changes = []

# ── Fix 1: Remove any 'return 301' redirects pointing to /landing from location / ─
# Matches: return 301 /landing; or return 301 https://cloudshield.me/landing;
redirect_to_landing = re.compile(
    r'(location\s+/\s*\{[^}]*?)return\s+301\s+[^;]*/landing[^;]*;',
    re.DOTALL
)
if redirect_to_landing.search(config):
    config = redirect_to_landing.sub(
        r'\1try_files $uri $uri/ /index.html;',
        config
    )
    changes.append("Fix 1: Removed root redirect to /landing, now serves files directly")

# Also handle simple case: location / { return 301 /landing; } on same line
simple_redirect = re.compile(r'return\s+301\s+["\']?/?landing["\']?\s*;')
if simple_redirect.search(config):
    config = simple_redirect.sub('try_files $uri $uri/ /index.html;', config)
    changes.append("Fix 1b: Replaced simple /landing redirect in root location")

# ── Fix 2: Add /landing redirect (exact match takes priority over prefix match) ─
LANDING_REDIRECT = """
    # SEO Fix: /landing was indexed by Google, redirect it to canonical root
    location = /landing {
        return 301 https://cloudshield.me;
    }
"""

if "location = /landing" not in config:
    # Insert before the last closing brace of the https server block
    last_brace = config.rfind("}")
    if last_brace == -1:
        print("ERROR: No closing brace found in config!")
        sys.exit(1)
    config = config[:last_brace] + LANDING_REDIRECT + "\n" + config[last_brace:]
    changes.append("Fix 2: Added /landing -> https://cloudshield.me redirect")
else:
    changes.append("Fix 2: SKIPPED - /landing redirect already exists")

# ── Fix 3: Add noindex on /panel if missing ──────────────────────────────────
PANEL_NOINDEX = """
    # Stop Google crawling /panel (auth-gated React app)
    location = /panel {
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
"""
if "X-Robots-Tag" not in config:
    last_brace = config.rfind("}")
    config = config[:last_brace] + PANEL_NOINDEX + "\n" + config[last_brace:]
    changes.append("Fix 3: Added noindex header for /panel")

# ── Write new config ──────────────────────────────────────────────────────────
if not changes:
    print("No changes needed - config already correct!")
    sys.exit(0)

with open(CONF, "w") as f:
    f.write(config)

print("\n" + "=" * 60)
print("CHANGES APPLIED:")
print("=" * 60)
for i, c in enumerate(changes, 1):
    print(f"  {i}. {c}")

print("\n" + "=" * 60)
print("NEW NGINX CONFIG:")
print("=" * 60)
print(config)
print("=" * 60)
print("\nAll fixes applied successfully!")
