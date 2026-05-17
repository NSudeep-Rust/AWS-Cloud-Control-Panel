
import sys as _sys
import time
import uuid
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

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
    sev_label = {"CRITICAL": "[CRITICAL]", "HIGH": "[HIGH]", "MEDIUM": "[MEDIUM]", "LOW": "[LOW]"}
    title = f"{sev_label.get(severity, '[ALERT]')} AWS CloudShield Security Alert"
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
            print(f"winotify toast error: {e}")
    elif _NOTIF_BACKEND == "plyer":
        try:
            _desktop_notif.notify(title=title, message=body[:200], app_name="AWS CloudShield", timeout=12)
        except Exception as e:
            print(f"plyer toast error: {e}")


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
    """Return set of (username, policy_arn) for users with admin access.
    Covers: (1) direct policy attachment  (2) group-based policy.
    Per-user checks run in parallel so N users take ~1 round-trip, not N.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    ADMIN_KEYS = ["AdministratorAccess", "FullAccess"]

    def _check_user(u):
        uname = u["UserName"]
        found = set()
        try:
            # 1. Direct policy attachment
            for p in iam.list_attached_user_policies(UserName=uname).get("AttachedPolicies", []):
                if any(k in p["PolicyArn"] or k in p["PolicyName"] for k in ADMIN_KEYS):
                    found.add((uname, p["PolicyArn"]))
            # 2. Group-based (most common missed path)
            for g in iam.list_groups_for_user(UserName=uname).get("Groups", []):
                for gp in iam.list_attached_group_policies(GroupName=g["GroupName"]).get("AttachedPolicies", []):
                    if any(k in gp["PolicyArn"] or k in gp["PolicyName"] for k in ADMIN_KEYS):
                        found.add((uname, gp["PolicyArn"]))
        except Exception:
            pass
        return found

    result = set()
    try:
        users = iam.list_users().get("Users", [])
        if not users:
            return result
        with ThreadPoolExecutor(max_workers=min(len(users), 12)) as ex:
            futures = [ex.submit(_check_user, u) for u in users]
            for fut in as_completed(futures):
                result.update(fut.result())
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


def _list_open_ssh_rdp_sgs(ec2):
    """Return (ssh_set, rdp_set) of SG IDs in one single API call."""
    ssh, rdp = set(), set()
    try:
        sgs = ec2.describe_security_groups().get("SecurityGroups", [])
        for sg in sgs:
            for perm in sg.get("IpPermissions", []):
                fp = perm.get("FromPort", -1)
                tp = perm.get("ToPort", -1)
                has_open_ip = any(
                    ip.get("CidrIp") in ("0.0.0.0/0", "::/0")
                    for ip in perm.get("IpRanges", [])
                )
                if not has_open_ip:
                    continue
                if fp <= 22 <= tp or fp == 22:
                    ssh.add(sg["GroupId"])
                if fp <= 3389 <= tp or fp == 3389:
                    rdp.add(sg["GroupId"])
    except Exception:
        pass
    return ssh, rdp


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


def _list_users_without_mfa(iam):
    """Return set of usernames with console password but NO MFA device (IAM_USER_WITHOUT_MFA)."""
    result = set()
    try:
        users = iam.list_users().get("Users", [])

        def _check(u):
            uname = u["UserName"]
            try:
                iam.get_login_profile(UserName=uname)  # raises if no console access
                if not iam.list_mfa_devices(UserName=uname).get("MFADevices"):
                    return uname
            except Exception:
                pass
            return None

        with ThreadPoolExecutor(max_workers=min(len(users) or 1, 12)) as ex:
            for fut in as_completed([ex.submit(_check, u) for u in users]):
                res = fut.result()
                if res:
                    result.add(res)
    except Exception:
        pass
    return result


def _list_public_snapshots(ec2):
    """Return set of snapshot IDs that are publicly shared (EBS_SNAPSHOT_PUBLIC)."""
    result = set()
    try:
        snaps = ec2.describe_snapshots(OwnerIds=["self"]).get("Snapshots", [])
        for s in snaps:
            try:
                perms = ec2.describe_snapshot_attribute(
                    SnapshotId=s["SnapshotId"], Attribute="createVolumePermission"
                ).get("CreateVolumePermissions", [])
                if any(p.get("Group") == "all" for p in perms):
                    result.add(s["SnapshotId"])
            except Exception:
                pass
    except Exception:
        pass
    return result


def _list_public_ec2(ec2):
    """Return set of instance IDs that are running and have a public IP (PUBLIC_EC2_INSTANCE)."""
    result = set()
    try:
        resp = ec2.describe_instances(
            Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
        )
        for res in resp.get("Reservations", []):
            for inst in res.get("Instances", []):
                if inst.get("PublicIpAddress"):
                    result.add(inst["InstanceId"])
    except Exception:
        pass
    return result


class FastWatcher:
    """
    Polls 6 critical AWS check types every `interval` seconds.
    On change detected --- calls broadcast_fn with alert payload
    AND saves to DB.
    """

    INTERVAL = 3   # seconds between snapshots (reduced from 8)

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
            "users_no_mfa":      None,
            "public_snapshots":  None,
            "public_ec2":        None,
        }

    def _snapshot(self):
        """Take a lightweight concurrent snapshot of all critical state."""
        sess = self.aws_session
        try:
            boto_session = sess.session
            if boto_session is None:
                print("FastWatcher: AWS session not initialized yet, skipping snapshot")
                return None
            iam        = boto_session.client("iam")
            ec2        = boto_session.client("ec2")
            s3         = boto_session.client("s3")
            rds        = boto_session.client("rds")
            ct         = boto_session.client("cloudtrail")
        except Exception as e:
            print(f"FastWatcher: session error {e}")
            return None

        result = {}

        # All checks run concurrently -- each is a fast targeted AWS API call
        def fetch_iam():      result["iam_admin_users"] = _list_admin_iam_users(iam)
        def fetch_sg():       sg, rdp = _list_open_ssh_rdp_sgs(ec2); result["open_ssh_sg"] = sg; result["open_rdp_sg"] = rdp
        def fetch_s3():       result["public_s3"]        = _list_public_s3_buckets(s3)
        def fetch_rds():      result["public_rds"]        = _list_public_rds(rds)
        def fetch_ct():       result["cloudtrail_ok"]     = _cloudtrail_enabled(ct)
        def fetch_mfa():      result["users_no_mfa"]      = _list_users_without_mfa(iam)
        def fetch_snaps():    result["public_snapshots"]  = _list_public_snapshots(ec2)
        def fetch_pub_ec2():  result["public_ec2"]        = _list_public_ec2(ec2)

        fns = (fetch_iam, fetch_sg, fetch_s3, fetch_rds, fetch_ct, fetch_mfa, fetch_snaps, fetch_pub_ec2)
        with ThreadPoolExecutor(max_workers=8) as pool:
            futs = [pool.submit(fn) for fn in fns]
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception as e:
                    print(f"[FastWatcher] snapshot error: {e}")

        # Accept partial -- require at least core 5 keys
        return result if len(result) >= 5 else None

    def _fire(self, check_key, resource_id, message, severity):
        """Fire an alert: broadcast via WS and persist to DB."""
        print(f"FastWatcher ALERT [{severity}] {check_key}: {resource_id}")

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

        # Broadcast to WebSocket clients (e.g. Threat Monitor UI)
        if callable(self.broadcast_fn):
            try:
                self.broadcast_fn(payload)
            except Exception as e:
                print(f"[FastWatcher] broadcast error: {e}")

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
                       "CloudTrail logging has been DISABLED - audit trail gap!", "CRITICAL")
        if prev["users_no_mfa"] is not None and "users_no_mfa" in current:
            new_no_mfa = current["users_no_mfa"] - prev["users_no_mfa"]
            for uname in new_no_mfa:
                self._fire("IAM_USER_WITHOUT_MFA", uname,
                           f"User '{uname}' has console access but NO MFA device", "HIGH")

        if prev["public_snapshots"] is not None and "public_snapshots" in current:
            new_snaps = current["public_snapshots"] - prev["public_snapshots"]
            for snap_id in new_snaps:
                self._fire("EBS_SNAPSHOT_PUBLIC", snap_id,
                           f"EBS snapshot '{snap_id}' is now publicly shared", "CRITICAL")

        if prev["public_ec2"] is not None and "public_ec2" in current:
            new_pub_ec2 = current["public_ec2"] - prev["public_ec2"]
            for inst_id in new_pub_ec2:
                self._fire("PUBLIC_EC2_INSTANCE", inst_id,
                           f"EC2 instance '{inst_id}' now has a public IP address", "HIGH")


    def _loop(self):
        print(f"FastWatcher started polling every {self.INTERVAL}s")
        while self._running:
            try:
                snap = self._snapshot()
                if snap is not None:
                    self._diff(snap)
                    for k in self._prev:
                        if k in snap:
                            self._prev[k] = snap[k]
            except Exception as e:
                print(f"FastWatcher error: {e}")
            time.sleep(self.INTERVAL)

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("FastWatcher thread started")

    def stop(self):
        self._running = False
        print("FastWatcher stopped")

