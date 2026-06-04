#!/usr/bin/env python3
"""
SEO Fix: Add /landing -> / redirect to Nginx config.
Prevents Google Search Console "Page with redirect" on cloudshield.me.
Run as: sudo python3 /root/cloudshield/docs/nginx_seo_fix.py
"""
import sys

CONF = "/etc/nginx/sites-enabled/cloudshield"

with open(CONF, "r") as f:
    config = f.read()

if "location = /landing" in config:
    print("OK: /landing redirect already exists - no changes needed")
    sys.exit(0)

REDIRECT_BLOCK = """
    # SEO fix: redirect /landing -> root (prevents GSC 'Page with redirect')
    # Canonical URL is https://cloudshield.me not /landing
    location = /landing {
        return 301 https://cloudshield.me;
    }

    # Stop Google indexing /panel (auth-gated React app)
    location = /panel {
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
"""

last_brace = config.rfind("}")
if last_brace == -1:
    print("ERROR: Could not find closing brace in Nginx config!")
    sys.exit(1)

new_config = config[:last_brace] + REDIRECT_BLOCK + "\n" + config[last_brace:]

with open(CONF, "w") as f:
    f.write(new_config)

print("DONE: Injected /landing redirect into Nginx config")
