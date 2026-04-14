"""
S3 Security Scanner — optimised with per-region clients.

ROOT CAUSE of slowness: using a single us-east-1 S3 client for all buckets.
Every cross-region call gets a 301 redirect → 2× TLS handshakes → ~4-5s per call.

FIX:
  1. get_bucket_location for all buckets (1 call each, all parallel → ~500ms)
  2. Create per-region S3 clients (cached, no duplicates)
  3. Run ALL checks using the CORRECT regional client → no redirects → ~200ms per call
  4. Flat pool of 50 workers for all tasks simultaneously
Expected: 10 buckets × 5 checks × ~300ms = ~300ms total (all parallel)
"""
from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed
from botocore.config import Config
import threading

# Apply fast timeouts — S3 scanners use session.client() directly which
# does NOT inherit the _FAST_CONFIG from aws_session.py.
# Default boto3 read_timeout=60s → that's why S3 was blocking for 60s!
_S3_CONFIG = Config(
    connect_timeout=5,
    read_timeout=10,         # S3 metadata calls never take >3s in practice
    retries={'max_attempts': 1},
    max_pool_connections=50, # allow 50 concurrent S3 API calls
)


class S3Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session
        self._client_cache: dict = {}   # region → boto3 s3 client
        self._client_lock = threading.Lock()

    def _get_client(self, region: str):
        """Return a cached per-region S3 client with fast config (thread-safe)."""
        with self._client_lock:
            if region not in self._client_cache:
                self._client_cache[region] = (
                    self.aws_session.session.client(
                        "s3", region_name=region, config=_S3_CONFIG
                    )
                )
            return self._client_cache[region]

    # ── Bucket location (needed once per bucket to pick correct client) ───────
    def _get_bucket_region(self, s3_global, bucket_name: str) -> str:
        """Return the AWS region of a bucket. us-east-1 returns None from API → normalise."""
        try:
            loc = s3_global.get_bucket_location(Bucket=bucket_name)
            return loc.get("LocationConstraint") or "us-east-1"
        except Exception:
            return "us-east-1"   # fallback — us-east-1 is the S3 default

    # ── Per-bucket check functions ────────────────────────────────────────────

    def _check_acl(self, s3, bucket_name):
        try:
            acl = s3.get_bucket_acl(Bucket=bucket_name)
            for grant in acl.get("Grants", []):
                uri = grant.get("Grantee", {}).get("URI", "")
                if "AllUsers" in uri or "AuthenticatedUsers" in uri:
                    return [{
                        "id":          f"s3-public-acl-{bucket_name}",
                        "type":        "S3_PUBLIC_ACL",
                        "severity":    "CRITICAL",
                        "resource_id": bucket_name,
                        "region":      "global",
                        "description": "S3 bucket is publicly accessible via ACL",
                    }]
        except Exception:
            pass
        return []

    def _check_encryption(self, s3, bucket_name):
        try:
            s3.get_bucket_encryption(Bucket=bucket_name)
        except Exception as e:
            code = getattr(e, "response", {}).get("Error", {}).get("Code", "")
            if code == "ServerSideEncryptionConfigurationNotFoundError":
                return [{
                    "id":          f"s3-no-encryption-{bucket_name}",
                    "type":        "S3_NO_ENCRYPTION",
                    "severity":    SEVERITY_MAP["S3_NO_ENCRYPTION"],
                    "resource_id": bucket_name,
                    "region":      "global",
                    "description": "S3 bucket does not have default encryption enabled",
                }]
        return []

    def _check_versioning(self, s3, bucket_name):
        try:
            status = s3.get_bucket_versioning(Bucket=bucket_name).get("Status")
            if status != "Enabled":
                return [{
                    "id":          f"s3-versioning-disabled-{bucket_name}",
                    "type":        "S3_VERSIONING_DISABLED",
                    "severity":    SEVERITY_MAP["S3_VERSIONING_DISABLED"],
                    "resource_id": bucket_name,
                    "region":      "global",
                    "description": "S3 bucket does not have versioning enabled",
                }]
        except Exception:
            pass
        return []

    def _check_logging(self, s3, bucket_name):
        try:
            resp = s3.get_bucket_logging(Bucket=bucket_name)
            if "LoggingEnabled" not in resp:
                return [{
                    "id":          f"s3-access-logging-disabled-{bucket_name}",
                    "type":        "S3_ACCESS_LOGGING_DISABLED",
                    "severity":    "MEDIUM",
                    "resource_id": bucket_name,
                    "region":      "global",
                    "description": "S3 bucket does not have access logging enabled",
                }]
        except Exception:
            pass
        return []

    def _check_public_access(self, s3, bucket_name):
        try:
            cfg = s3.get_public_access_block(Bucket=bucket_name)["PublicAccessBlockConfiguration"]
            if not all(cfg.values()):
                return [{
                    "id":          f"s3-public-access-block-disabled-{bucket_name}",
                    "type":        "S3_BLOCK_PUBLIC_ACCESS_DISABLED",
                    "severity":    SEVERITY_MAP["S3_BLOCK_PUBLIC_ACCESS_DISABLED"],
                    "resource_id": bucket_name,
                    "region":      "global",
                    "description": "S3 bucket does not have full block public access enabled",
                }]
        except Exception:
            pass
        return []

    # ── Main scan ─────────────────────────────────────────────────────────────
    def scan(self, region=None):
        session   = self.aws_session.session
        s3_global = session.client("s3", config=_S3_CONFIG)  # fast config — NOT default 60s timeout

        try:
            buckets = s3_global.list_buckets().get("Buckets", [])
        except Exception as e:
            print(f"[S3Scanner] list_buckets failed: {e}")
            return []

        if not buckets:
            return []

        bucket_names = [b["Name"] for b in buckets]
        print(f"[S3Scanner] {len(bucket_names)} buckets — resolving regions in parallel")

        # ── Step 1: resolve region for every bucket (all parallel) ────────────
        bucket_region: dict = {}
        w = min(len(bucket_names), 20)
        with ThreadPoolExecutor(max_workers=w) as pool:
            futs = {
                pool.submit(self._get_bucket_region, s3_global, name): name
                for name in bucket_names
            }
            for fut in as_completed(futs):
                name = futs[fut]
                try:
                    bucket_region[name] = fut.result()
                except Exception:
                    bucket_region[name] = "us-east-1"

        # ── Step 2: build flat task list using per-region clients ─────────────
        check_fns = [
            self._check_acl,
            self._check_encryption,
            self._check_versioning,
            self._check_logging,
            self._check_public_access,
        ]
        # Each task: (check_fn, per-region-s3-client, bucket_name)
        tasks = [
            (fn, self._get_client(bucket_region[name]), name)
            for name in bucket_names
            for fn in check_fns
        ]

        print(f"[S3Scanner] {len(tasks)} check tasks across {len(set(bucket_region.values()))} regions")

        # ── Step 3: run ALL tasks in ONE flat pool, no nesting ────────────────
        max_w   = min(len(tasks), 50)
        seen    = set()
        results = []
        lock    = threading.Lock()

        def run_task(item):
            fn, s3_client, bname = item
            return fn(s3_client, bname)

        with ThreadPoolExecutor(max_workers=max_w) as pool:
            futures = {pool.submit(run_task, t): t for t in tasks}
            for fut in as_completed(futures):
                try:
                    for f in fut.result():
                        with lock:
                            if f["id"] not in seen:
                                seen.add(f["id"])
                                results.append(f)
                except Exception as e:
                    _, _, bname = futures[fut]
                    print(f"[S3Scanner] check error ({bname}): {e}")

        return results