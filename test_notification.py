"""
test_notification.py
Run this directly from YOUR terminal to test the notification icon:
    python test_notification.py
"""
import os, sys, time

# ── Ensure we can import from the project
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PNG = os.path.join(os.path.dirname(__file__), "app", "assets", "aws_cloudshield.png")

if not os.path.exists(PNG):
    print("❌ PNG not found — run: python create_icon.py first")
    sys.exit(1)

print(f"✅ Icon: {PNG}  ({round(os.path.getsize(PNG)/1024,1)} KB)")

from winotify import Notification

# ── Test 1: Critical Alert
t1 = Notification(
    app_id  = "AWS CloudShield",
    title   = "🔴 CRITICAL — AWS Security Alert",
    msg     = "New admin IAM user detected in us-east-1! Open CloudShield to remediate.",
    icon    = PNG,
    duration= "long",
)
t1.show()
print("📢 Notification 1 sent — check bottom-right of your screen")

time.sleep(4)

# ── Test 2: Scan complete
t2 = Notification(
    app_id  = "AWS CloudShield",
    title   = "✅ Scheduled Scan Complete",
    msg     = "14 findings detected — 3 CRITICAL, 5 HIGH. Click to view dashboard.",
    icon    = PNG,
    duration= "long",
)
t2.show()
print("📢 Notification 2 sent")
