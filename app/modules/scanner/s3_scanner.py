"""
S3 Security Scanner — per-region clients, pre-phase resolution.

Architecture:
  1. __init__: create one global S3 client (_s3) for list_buckets/get_bucket_location.
  2. get_bucket_tasks() [pre-phase, single thread]:
       a. list_buckets
       b. get_bucket_location for each bucket (parallel, using _s3)
       c. create one boto3 S3 client per unique region SERIALLY (thread-safe,
          no lock needed — single thread, no contention).
       Returns [(bucket_name, region), ...]
  3. scan_bucket(bucket_name, region) [outer pool task]:
       Uses the pre-created regional client → no 307 redirects → fast API calls.
       5 checks run in a tiny 5-worker pool with a 16s hard deadline.

Why serial client creation beats parallel:
  - session.client() is just Python object creation (~100ms each, no network call).
  - 5 regions × 100ms = ~500ms serial — negligible.
  - Parallel creation from multiple threads violates boto3.Session thread-safety.
"""
from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed
from botocore.config import Config
import concurrent.futures


_S3_CONFIG = Config(
    connect_timeout=5,
    read_timeout=15,         # generous — allows cross-region API calls to finish
    retries={'max_attempts': 1},
    max_pool_connections=50,
)


class S3Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session
        # Global client for list_buckets + get_bucket_location (pre-phase only).
        self._s3 = aws_session.session.client("s3", config=_S3_CONFIG)
        # Per-region clients are populated in get_bucket_tasks() pre-phase.
        # Keyed by region string. Read-only after pre-phase — no locking needed.
        self._regional = {}

    # ── Bucket region resolution ──────────────────────────────────────────────

    def _get_bucket_region(self, bucket_name: str) -> str:
        """Resolve a bucket's region via get_bucket_location."""
        try:
            loc = self._s3.get_bucket_location(Bucket=bucket_name)
            return loc.get("LocationConstraint") or "us-east-1"
        except Exception:
            return "us-east-1"

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

    def _check_empty(self, s3, bucket_name):
        """Detect S3 buckets with zero objects — candidates for deletion.

        Uses list_objects_v2(MaxKeys=1) — a single fast API call that returns
        immediately once it finds any object. MaxKeys=1 avoids paginating large
        buckets. Reuses the warm SSL keep-alive from prior checks → ~50ms.
        """
        try:
            resp = s3.list_objects_v2(Bucket=bucket_name, MaxKeys=1)
            if resp.get("KeyCount", 1) == 0:
                return [{
                    "id":          f"s3-empty-bucket-{bucket_name}",
                    "type":        "S3_EMPTY_BUCKET",
                    "severity":    "LOW",
                    "resource_id": bucket_name,
                    "region":      "global",
                    "description": (
                        f"S3 bucket '{bucket_name}' contains no objects "
                        "and can be safely deleted to reduce clutter and cost."
                    ),
                }]
        except Exception:
            pass
        return []

    # ── Pre-phase ─────────────────────────────────────────────────────────────

    def get_bucket_tasks(self) -> list:
        """
        Called ONCE before the main outer pool (single thread — no lock needed).

        Steps:
          1. list_buckets via global _s3 client
          2. get_bucket_location for each bucket in parallel (using _s3)
          3. Create one per-region boto3 S3 client SERIALLY for each unique region
             → session.client() is Python object creation only (~100ms each)
             → serial = thread-safe, no boto3.Session race conditions
          4. Populate self._regional dict

        Returns [(bucket_name, region), ...]
        """
        try:
            buckets = self._s3.list_buckets().get("Buckets", [])
        except Exception as e:
            print(f"[S3Scanner] list_buckets failed: {e}")
            return []

        if not buckets:
            return []

        bucket_names = [b["Name"] for b in buckets]
        print(f"[S3Scanner] {len(bucket_names)} buckets — resolving regions in parallel")

        # Step 2: resolve all bucket regions in parallel
        bucket_region: dict = {}
        w = min(len(bucket_names), 20)
        with ThreadPoolExecutor(max_workers=w) as pool:
            futs = {
                pool.submit(self._get_bucket_region, name): name
                for name in bucket_names
            }
            for fut in as_completed(futs):
                name = futs[fut]
                try:
                    bucket_region[name] = fut.result()
                except Exception:
                    bucket_region[name] = "us-east-1"

        # Step 3: create one S3 client per unique region SERIALLY (thread-safe)
        # session.client() = object instantiation only, no network call (~100ms each)
        unique_regions = set(bucket_region.values())
        for region in unique_regions:
            if region not in self._regional:
                self._regional[region] = self.aws_session.session.client(
                    "s3", region_name=region, config=_S3_CONFIG
                )

        return list(bucket_region.items())

    # ── Per-bucket scan (outer pool task) ─────────────────────────────────────

    def scan_bucket(self, bucket_name: str, region: str) -> list:
        """
        Run all 5 security checks for a single bucket SEQUENTIALLY.

        WHY sequential (not parallel):
          Parallel checks open 5 simultaneous SSL connections per bucket.
          With 10 bucket tasks in the outer pool, that's 50 concurrent SSL
          handshakes on Windows Schannel, which serialises them → 15s+.

          Sequential: check 1 pays the SSL handshake (~5s), checks 2-5 reuse
          the warm keep-alive connection (~200ms each). Total per bucket ~6s.
          10 buckets run in parallel across the outer pool → ~6s total for S3.
        """
        s3 = self._regional.get(region, self._s3)   # instant dict read
        check_fns = [
            self._check_acl,
            self._check_encryption,
            self._check_versioning,
            self._check_logging,
            self._check_public_access,
            self._check_empty,          # new: detect empty (deletable) buckets
        ]
        findings = []
        seen     = set()

        for fn in check_fns:
            try:
                for finding in fn(s3, bucket_name):
                    if finding["id"] not in seen:
                        seen.add(finding["id"])
                        findings.append(finding)
            except Exception:
                pass

        return findings

    # ── Legacy entry point ────────────────────────────────────────────────────

    def scan(self, region=None):
        """Legacy entry point — resolves buckets then scans each one."""
        tasks = self.get_bucket_tasks()
        if not tasks:
            return []
        findings = []
        seen     = set()
        for bname, bregion in tasks:
            for f in self.scan_bucket(bname, bregion):
                if f["id"] not in seen:
                    seen.add(f["id"])
                    findings.append(f)
        return findings