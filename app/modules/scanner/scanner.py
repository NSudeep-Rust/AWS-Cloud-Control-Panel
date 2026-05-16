from app.modules.scanner.s3_scanner import S3Scanner
from app.modules.scanner.ec2_scanner import EC2Scanner
from app.modules.scanner.logging_scanner import LoggingScanner
from app.modules.scanner.encryption_scanner import EncryptionScanner
from app.modules.scanner.network_scanner import NetworkScanner
from app.modules.scanner.rds_scanner import RDSScanner
from app.modules.scanner.sg_scanner import SGScanner
from app.modules.scanner.cloudwatch_scanner import CloudWatchScanner
from app.modules.scanner.iam_extra_scanner import IAMExtraScanner
from app.modules.scanner.vpc_scanner import VPCScanner
from app.modules.iam_manager.iam_manager import IAMManager
from app.config.security_config import SEVERITY_MAP
import boto3
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed


import os

# Worker counts are tuned per-environment via env vars.
# Server (1GB RAM t3.micro) → low values to prevent OOM kills.
# Local dev / EXE (developer machine with 8GB+) → high values for speed.
# Set SCAN_MAX_WORKERS / SCAN_INNER_MAX_WORKERS in .env to override.
MAX_WORKERS       = int(os.getenv("SCAN_MAX_WORKERS",       "24"))  # outer pool
INNER_MAX_WORKERS = int(os.getenv("SCAN_INNER_MAX_WORKERS", "12"))  # per-region inner pool


class Scanner:
    """
    Main Orchestrator for all security scanners.
    All region-based scanners now run CONCURRENTLY using ThreadPoolExecutor,
    cutting typical scan time from ~200s down to ~30-60s.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

        self.s3_scanner          = S3Scanner(aws_session)
        self.ec2_scanner         = EC2Scanner(aws_session)
        self.logging_scanner     = LoggingScanner(aws_session)
        self.encryption_scanner  = EncryptionScanner(aws_session)
        self.network_scanner     = NetworkScanner(aws_session)
        self.rds_scanner         = RDSScanner(aws_session)
        self.sg_scanner          = SGScanner(aws_session)
        self.cloudwatch_scanner  = CloudWatchScanner(aws_session)
        self.iam_extra_scanner   = IAMExtraScanner(aws_session)
        self.vpc_scanner         = VPCScanner(aws_session)

        self.regions    = self.get_all_regions()
        sts             = self.aws_session.session.client("sts")
        self.account_id = sts.get_caller_identity()["Account"]
        self.iam_manager = IAMManager(aws_session)

    def get_all_regions(self):
        return self.aws_session.get_all_regions()

    def _scan_public_security_groups_region(self, region):
        """Return PUBLIC_SECURITY_GROUP findings for a single region."""
        results = []
        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)
        try:
            response = ec2.describe_security_groups()
        except Exception:
            return results

        for sg in response["SecurityGroups"]:
            for permission in sg.get("IpPermissions", []):
                for ip_range in permission.get("IpRanges", []):
                    if ip_range.get("CidrIp") == "0.0.0.0/0":
                        from_port = permission.get("FromPort")
                        to_port   = permission.get("ToPort")
                        protocol  = permission.get("IpProtocol")
                        port_range = (
                            f"{from_port}-{to_port}"
                            if from_port is not None and to_port is not None
                            else "ALL"
                        )
                        results.append({
                            "id":            f"PUBLIC_SECURITY_GROUP-{sg['GroupId']}-{region}",
                            "type":          "PUBLIC_SECURITY_GROUP",
                            "severity":      SEVERITY_MAP["PUBLIC_SECURITY_GROUP"],
                            "region":        region,
                            "resource_id":   sg["GroupId"],
                            "resource_name": sg["GroupName"],
                            "protocol":      protocol,
                            "port_range":    port_range,
                            "description":   "Security group allows inbound traffic from 0.0.0.0/0"
                        })
        return results

    def _scan_region(self, region):
        """Run ALL region-scoped scanners for one region and return findings."""
        findings = []
        scanner_map = {
            "EC2":         lambda: self.ec2_scanner.scan(region),
            "Logging":     lambda: self.logging_scanner.scan(region),
            "Encryption":  lambda: self.encryption_scanner.scan(region),
            "RDS":         lambda: self.rds_scanner.scan(region),
            "SG":          lambda: self.sg_scanner.scan(region),
            "CloudWatch":  lambda: self.cloudwatch_scanner.scan(region),
            "Network":     lambda r=region: [
                {**f, "region": r}
                for f in self.network_scanner.scan(region=r)
            ],
            "PublicSG":    lambda: self._scan_public_security_groups_region(region),
            "VPC":         lambda: self.vpc_scanner.scan(region=region),
        }

        with ThreadPoolExecutor(max_workers=INNER_MAX_WORKERS) as inner:
            futures = {inner.submit(fn): name for name, fn in scanner_map.items()}
            for fut in as_completed(futures):
                name = futures[fut]
                try:
                    findings.extend(fut.result())
                except Exception as e:
                    print(f"[ERROR] {name} scan failed in {region}: {e}")

        return findings

    def scan(self, region=None):
        """
        Run FULL AWS security scan (all modules) concurrently.
        Architecture:
          PRE-PHASE : list S3 buckets + resolve regions (~1-2s, sequential)
          MAIN POOL : IAM + IAMExtra + per-bucket tasks + all regional tasks

        Key improvement: S3 runs as N flat per-bucket tasks, NOT one monolithic
        task that spawns 70 nested threads (which caused Windows thread
        scheduling overhead and pushed S3 time from ~40s to ~88s).
        """
        import time
        scan_start = time.time()
        all_findings = []

        # ── PRE-PHASE: resolve S3 bucket regions ──────────────────────────────
        # Fast: list_buckets (~300ms) + parallel get_bucket_location (~500ms).
        # We do this BEFORE the main pool so we can submit one task per bucket.
        s3_bucket_map = self.s3_scanner.get_bucket_tasks()  # [(name, region), ...]
        pre_elapsed   = round(time.time() - scan_start, 1)
        print(f"[S3Scanner] {len(s3_bucket_map)} buckets resolved in {pre_elapsed}s — submitting {len(s3_bucket_map)} per-bucket tasks")

        # ── BUILD FLAT TASK MAP ───────────────────────────────────────────────
        tasks = {}

        tasks["IAM"]      = lambda: self.iam_manager.audit()
        tasks["IAMExtra"] = lambda: self.iam_extra_scanner.scan()

        # One outer task per bucket — 5 checks run inside scan_bucket() only
        for bname, bregion in s3_bucket_map:
            tasks[f"s3:{bname}"] = (
                lambda n=bname, r=bregion: [
                    {**f, "region": r or "global"}
                    for f in self.s3_scanner.scan_bucket(n, r)
                ]
            )

        for r in self.regions:
            tasks[f"region:{r}"] = (lambda _r=r: self._scan_region(_r))

        # Cap at MAX_WORKERS — do NOT scale with S3 bucket count (causes OOM on small servers)
        max_w = min(len(tasks), MAX_WORKERS)

        with ThreadPoolExecutor(max_workers=max_w) as outer:
            futures = {outer.submit(fn): name for name, fn in tasks.items()}
            try:
                for fut in as_completed(futures, timeout=90):
                    name = futures[fut]
                    try:
                        result = fut.result()
                        all_findings.extend(result)
                        elapsed = round(time.time() - scan_start, 1)
                        print(f"   [OK] [{elapsed}s] {name}: {len(result)} findings")
                    except Exception as e:
                        elapsed = round(time.time() - scan_start, 1)
                        print(f"[ERROR][{elapsed}s] Task '{name}' failed: {e}")
            except Exception:
                # timeout hit — collect whatever finished
                for fut, name in futures.items():
                    if fut.done() and not fut.exception():
                        try: all_findings.extend(fut.result())
                        except Exception: pass

        for f in all_findings:
            if not f.get("region"):
                f["region"] = "global"
            f["account_id"] = self.account_id

        unique = {}
        for f in all_findings:
            key = f.get("id")
            if key:
                unique[key] = f

        return list(unique.values())


def run_full_scan(aws_session, source="UNKNOWN"):
    scanner  = Scanner(aws_session)
    findings = scanner.scan()
    total    = len(findings)

    if source == "API":
        print(f"📊 [API] TOTAL FINDINGS: {total}")
    elif source == "MONITOR":
        print(f"📊 [MONITOR] TOTAL FINDINGS: {total}")

    return findings
