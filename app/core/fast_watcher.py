
import sys as _sys
import time
import uuid
import threading
from datetime import datetime

import os as _os
# Resolve icon path that works in both dev and PyInstaller bundle
if getattr(_sys, 'frozen', False):
    _ASSET_BASE = _os.path.join(_sys._MEIPASS, "app", "assets")
else:
    _ASSET_BASE = _os.path.normpath(
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "assets")
    )
_ICON_PATH = _os.path.join(_ASSET_BASE, "aws_cloudshield.ico")  # ICO = sharp on Windows
try:
    from winotify import Notification as _WiNotif
    _NOTIF_BACKEND = "winotify"
except ImportError:
    try:
        from plyer import notification as _desktop_notif
        _NOTIF_BACKEND = "plyer"
    except ImportError:
        _NOTIF_BACKEND = None

def _fire_windows_toast(severity: str, title_text: str, body: str):
    """Fire a branded Windows OS toast showing 'AWS CloudShield' (not 'Python')."""
    sev_icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}
    title = f"{sev_icon.get(severity, '⚠️')} AWS Security Alert — {severity}"
    if _NOTIF_BACKEND == "winotify":
        try:
            toast = _WiNotif(
                app_id="AWS CloudShield",
                title=title,
                msg=body[:200],
                icon=_ICON_PATH if _os.path.exists(_ICON_PATH) else "",
                duration="short",
            )
            toast.show()
        except Exception as e:
            print(f"⚡ winotify toast error: {e}")
    elif _NOTIF_BACKEND == "plyer":
        try:
            _desktop_notif.notify(title=title, message=body[:200], app_name="AWS CloudShield", timeout=12)
        except Exception as e:
            print(f"⚡ plyer toast error: {e}")


CRITICAL_CHECKS = {
    "iam_admin_users":           ("New admin IAM user detected",          "CRITICAL"),
    "iam_admin_policies":        ("Admin policy attached to IAM entity",    "CRITICAL"),
    "open_ssh_sg":               ("Security group with unrestricted SSH",   "CRITICAL"),
    "open_rdp_sg":               ("Security group with unrestricted RDP",   "CRITICAL"),
    "public_s3":                 ("S3 bucket with public access enabled",   "CRITICAL"),
    "public_rds":                ("RDS instance publicly accessible",       "HIGH"),
    "cloudtrail_disabled":       ("CloudTrail logging is disabled",         "CRITICAL"),
}


def _list_admin_iam_users(iam):
    """Return set of (username, policy_arn) tuples for users with admin access."""
    result = set()
    try:
        users = iam.list_users().get("Users", [])
        for u in users:
            attached = iam.list_attached_user_policies(UserName=u["UserName"])
            for p in attached.get("AttachedPolicies", []):
                if "AdministratorAccess" in p["PolicyArn"] or "FullAccess" in p["PolicyName"]:
                    result.add((u["UserName"], p["PolicyArn"]))
    except Exception:
        pass
    return result


def _list_admin_iam_roles(iam):
    """Return set of (rolename, policy_arn) for roles with admin policies."""
    result = set()
    try:
        roles = iam.list_roles().get("Roles", [])
        for r in roles:
            attached = iam.list_attached_role_policies(RoleName=r["RoleName"])
            for p in attached.get("AttachedPolicies", []):
                if "AdministratorAccess" in p["PolicyArn"]:
                    result.add((r["RoleName"], p["PolicyArn"]))
    except Exception:
        pass
    return result


def _list_open_ssh_sgs(ec2):
    """Return set of SG IDs that have 0.0.0.0/0 on port 22."""
    result = set()
    try:
        sgs = ec2.describe_security_groups().get("SecurityGroups", [])
        for sg in sgs:
            for perm in sg.get("IpPermissions", []):
                from_port = perm.get("FromPort", -1)
                to_port   = perm.get("ToPort", -1)
                if from_port <= 22 <= to_port or from_port == 22:
                    for ip in perm.get("IpRanges", []):
                        if ip.get("CidrIp") in ("0.0.0.0/0", "::/0"):
                            result.add(sg["GroupId"])
    except Exception:
        pass
    return result


def _list_open_rdp_sgs(ec2):
    """Return set of SG IDs that have 0.0.0.0/0 on port 3389."""
    result = set()
    try:
        sgs = ec2.describe_security_groups().get("SecurityGroups", [])
        for sg in sgs:
            for perm in sg.get("IpPermissions", []):
                from_port = perm.get("FromPort", -1)
                to_port   = perm.get("ToPort", -1)
                if from_port <= 3389 <= to_port or from_port == 3389:
                    for ip in perm.get("IpRanges", []):
                        if ip.get("CidrIp") in ("0.0.0.0/0", "::/0"):
                            result.add(sg["GroupId"])
    except Exception:
        pass
    return result


def _list_public_s3_buckets(s3):
    """Return set of bucket names with public access."""
    result = set()
    try:
        buckets = s3.list_buckets().get("Buckets", [])
        for b in buckets:
            name = b["Name"]
            try:
                config = s3.get_public_access_block(Bucket=name)
                blk = config.get("PublicAccessBlockConfiguration", {})
                if not all([
                    blk.get("BlockPublicAcls", False),
                    blk.get("BlockPublicPolicy", False),
                    blk.get("IgnorePublicAcls", False),
                    blk.get("RestrictPublicBuckets", False),
                ]):
                    result.add(name)
            except Exception:
                result.add(name)  # no block config = publicly accessible
    except Exception:
        pass
    return result


def _list_public_rds(rds):
    result = set()
    try:
        dbs = rds.describe_db_instances().get("DBInstances", [])
        for db in dbs:
            if db.get("PubliclyAccessible"):
                result.add(db["DBInstanceIdentifier"])
    except Exception:
        pass
    return result


def _cloudtrail_enabled(cloudtrail):
    try:
        trails = cloudtrail.describe_trails().get("trailList", [])
        for t in trails:
            status = cloudtrail.get_trail_status(Name=t["TrailARN"])
            if status.get("IsLogging"):
                return True
    except Exception:
        pass
    return False


class FastWatcher:
    """
    Polls 6 critical AWS check types every `interval` seconds.
    On change detected → calls broadcast_fn with alert payload
    AND saves to DB.
    """

    INTERVAL = 8   # seconds — tune to your network speed

    def __init__(self, aws_session, broadcast_fn=None, db_fn=None):
        self.aws_session  = aws_session
        self.broadcast_fn = broadcast_fn   # callable(payload_dict) or None
        self.db_fn        = db_fn          # callable() -> SQLAlchemy session or None
        self._running     = False
        self._thread      = None
        self._prev = {
            "iam_admin_users":   None,
            "open_ssh_sg":       None,
            "open_rdp_sg":       None,
            "public_s3":         None,
            "public_rds":        None,
            "cloudtrail_ok":     None,
        }

    def _snapshot(self):
        """Take a lightweight snapshot of critical state."""
        sess = self.aws_session
        try:
            boto_session = sess.session
            if boto_session is None:
                print("⚡ FastWatcher: AWS session not initialized yet, skipping snapshot")
                return None
            iam        = boto_session.client("iam")
            ec2        = boto_session.client("ec2")
            s3         = boto_session.client("s3")
            rds        = boto_session.client("rds")
            ct         = boto_session.client("cloudtrail")
        except Exception as e:
            print(f"⚡ FastWatcher: session error — {e}")
            return None

        return {
            "iam_admin_users": _list_admin_iam_users(iam),
            "open_ssh_sg":     _list_open_ssh_sgs(ec2),
            "open_rdp_sg":     _list_open_rdp_sgs(ec2),
            "public_s3":       _list_public_s3_buckets(s3),
            "public_rds":      _list_public_rds(rds),
            "cloudtrail_ok":   _cloudtrail_enabled(ct),
        }

    def _fire(self, check_key, resource_id, message, severity):
        """Fire an alert: broadcast via WS and persist to DB."""
        print(f"⚡ FastWatcher ALERT [{severity}] {check_key}: {resource_id}")

        payload = {
            "event":       "new_alert",
            "id":          str(uuid.uuid4()),
            "finding_id":  resource_id,
            "type":        check_key.upper(),
            "resource_id": resource_id,
            "message":     message,
            "severity":    severity,
            "timestamp":   datetime.utcnow().isoformat(),
        }

        _fire_windows_toast(
            severity=severity,
            title_text=f"{check_key}: {resource_id}",
            body=message,
        )

        if self.broadcast_fn:
            try:
                self.broadcast_fn(payload)
            except Exception as e:
                print(f"⚡ WS broadcast error: {e}")

        if self.db_fn:
            try:
                from app.database.models import Alert
                db = next(self.db_fn())
                db.add(Alert(
                    id=payload["id"],
                    finding_id=resource_id,
                    message=message,
                    severity=severity,
                ))
                db.commit()
                db.close()
            except Exception as e:
                print(f"⚡ DB persist error: {e}")

    def _diff(self, current):
        prev = self._prev

        if prev["iam_admin_users"] is not None:
            new_admins = current["iam_admin_users"] - prev["iam_admin_users"]
            for (uname, policy) in new_admins:
                self._fire("IAM_ADMIN_USER", uname,
                           f"Admin policy attached to user '{uname}'", "CRITICAL")

        if prev["open_ssh_sg"] is not None:
            new_ssh = current["open_ssh_sg"] - prev["open_ssh_sg"]
            for sg_id in new_ssh:
                self._fire("SECURITY_GROUP_UNRESTRICTED_SSH", sg_id,
                           f"Security group {sg_id} now allows unrestricted SSH (0.0.0.0/0:22)", "CRITICAL")

        if prev["open_rdp_sg"] is not None:
            new_rdp = current["open_rdp_sg"] - prev["open_rdp_sg"]
            for sg_id in new_rdp:
                self._fire("SECURITY_GROUP_UNRESTRICTED_RDP", sg_id,
                           f"Security group {sg_id} now allows unrestricted RDP (0.0.0.0/0:3389)", "CRITICAL")

        if prev["public_s3"] is not None:
            new_public = current["public_s3"] - prev["public_s3"]
            for bucket in new_public:
                self._fire("S3_BLOCK_PUBLIC_ACCESS_DISABLED", bucket,
                           f"S3 bucket '{bucket}' has public access enabled", "CRITICAL")

        if prev["public_rds"] is not None:
            new_public_rds = current["public_rds"] - prev["public_rds"]
            for db_id in new_public_rds:
                self._fire("RDS_PUBLICLY_ACCESSIBLE", db_id,
                           f"RDS instance '{db_id}' is now publicly accessible", "HIGH")

        if prev["cloudtrail_ok"] is True and current["cloudtrail_ok"] is False:
            self._fire("CLOUDTRAIL_DISABLED", "cloudtrail",
                       "CloudTrail logging has been DISABLED — audit trail gap!", "CRITICAL")

    def _loop(self):
        print(f"⚡ FastWatcher started — polling every {self.INTERVAL}s")
        while self._running:
            try:
                snap = self._snapshot()
                if snap is not None:
                    self._diff(snap)
                    for k in self._prev:
                        if k in snap:
                            self._prev[k] = snap[k]
            except Exception as e:
                print(f"⚡ FastWatcher error: {e}")
            time.sleep(self.INTERVAL)

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("⚡ FastWatcher thread started")

    def stop(self):
        self._running = False
        print("⚡ FastWatcher stopped")
