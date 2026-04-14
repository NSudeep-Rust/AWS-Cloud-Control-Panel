from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database.db import get_db
from app.database.models import Scan, Finding, Execution
from app.api.response_formatter import format_response

router = APIRouter(prefix="/api/attack-surface", tags=["Attack Surface"])

# ---------------------------------------------------------------------------
# Attack surface category definitions
# Each category maps to finding types that represent a public exposure vector
# ---------------------------------------------------------------------------
CATEGORIES = [
    {
        "id":       "PUBLIC_STORAGE",
        "label":    "Public Storage",
        "icon":     "bucket",
        "desc":     "S3 buckets exposed to the internet",
        # PUBLIC_S3_BUCKET removed — not in planner (no auto-fix)
        "types":    {"S3_BLOCK_PUBLIC_ACCESS_DISABLED"},
        "severity": "CRITICAL",
    },
    {
        "id":       "OPEN_NETWORK",
        "label":    "Open Network Ports",
        "icon":     "network",
        "desc":     "Security groups allowing unrestricted inbound traffic",
        # EC2_PUBLIC_ELASTIC_IP removed — action REMOVE_ELASTIC_IP is non-rollbackable
        "types":    {
            "SECURITY_GROUP_UNRESTRICTED_SSH",
            "SECURITY_GROUP_UNRESTRICTED_RDP",
            "PUBLIC_SECURITY_GROUP",
        },
        "severity": "CRITICAL",
    },
    {
        "id":       "PUBLIC_COMPUTE",
        "label":    "Public Compute",
        "icon":     "server",
        "desc":     "EC2 instances directly reachable from the internet",
        "types":    {"PUBLIC_EC2_INSTANCE"},
        "severity": "HIGH",
    },
    {
        "id":       "EXPOSED_DATA",
        "label":    "Exposed Data Stores",
        "icon":     "database",
        "desc":     "Databases and snapshots publicly accessible",
        "types":    {"RDS_PUBLICLY_ACCESSIBLE", "EBS_SNAPSHOT_PUBLIC"},
        "severity": "CRITICAL",
    },
    {
        "id":       "BLIND_SPOTS",
        "label":    "Monitoring Blind Spots",
        "icon":     "eye-off",
        "desc":     "Regions where attacker activity goes unlogged",
        "types":    {"CLOUDTRAIL_DISABLED", "CLOUDTRAIL_NOT_LOGGING"},
        "severity": "HIGH",
    },
    {
        "id":       "IAM_EXPOSURE",
        "label":    "IAM Exposure",
        "icon":     "key",
        "desc":     "Over-privileged identities — all auto-fixable and rollbackable",
        # Removed: IAM_USER_WITHOUT_MFA (MANUAL), IAM_POLICY_FULL_ADMIN (no planner), IAM_ROLE_ADMIN_POLICY (no planner)
        "types":    {
            "IAM_ADMIN_USER",
            "IAM_WILDCARD_POLICY",
            "IAM_INLINE_ADMIN_POLICY",
            "IAM_ROLE_EXTERNAL_TRUST",
        },
        "severity": "CRITICAL",
    },
]

# Fast lookup: type → category id
_TYPE_TO_CAT = {}
for _cat in CATEGORIES:
    for _t in _cat["types"]:
        _TYPE_TO_CAT[_t] = _cat["id"]

ALL_SURFACE_TYPES = set(_TYPE_TO_CAT.keys())


@router.get("/")
def get_attack_surface(
    account_id: Optional[int] = Query(None, description="DB account integer id"),
    db: Session = Depends(get_db),
):
    """
    Returns all attack-surface findings from the most recent scan for an account.
    Findings are grouped into 6 exposure categories.
    """
    # Get latest scan for the account
    q = db.query(Scan)
    if account_id is not None:
        q = q.filter(Scan.account_id == account_id)
    latest_scan = q.order_by(Scan.created_at.desc()).first()

    if not latest_scan:
        return format_response(
            module="attack_surface",
            mode="READ",
            data={
                "last_scanned": None,
                "account_id": account_id,
                "total_exposed": 0,
                "categories": [],
                "no_scan": True,
            }
        )

    # Load all findings for this scan that are attack-surface relevant
    findings = (
        db.query(Finding)
        .filter(
            Finding.scan_id == latest_scan.id,
            Finding.type.in_(list(ALL_SURFACE_TYPES)),
        )
        .all()
    )

    # Build a set of finding IDs already successfully executed (Execution table)
    # Execution.finding_id is stored as String, f.id is Integer — compare as str
    executed_ids = {
        row.finding_id
        for row in db.query(Execution.finding_id)
        .filter(Execution.status == 'EXECUTED')
        .all()
        if row.finding_id is not None
    }

    # Group into categories — skip executed findings
    cat_findings: dict[str, list] = {c["id"]: [] for c in CATEGORIES}
    for f in findings:
        cat_id = _TYPE_TO_CAT.get(f.type)
        if not cat_id:
            continue
        # Exclude if already executed via remediation
        if str(f.id) in executed_ids or (f.status or '').upper() == 'EXECUTED':
            continue
        cat_findings[cat_id].append({
            "id":          f.id,
            "type":        f.type,
            "severity":    f.severity,
            "resource_id": f.resource_id or "",
            "region":      f.region or "global",
            "status":      f.status or "OPEN",
        })

    categories_out = []
    for cat in CATEGORIES:
        items = cat_findings[cat["id"]]
        categories_out.append({
            "id":       cat["id"],
            "label":    cat["label"],
            "icon":     cat["icon"],
            "desc":     cat["desc"],
            "severity": cat["severity"],
            "count":    len(items),
            "findings": items,
        })

    return format_response(
        module="attack_surface",
        mode="READ",
        data={
            "last_scanned": (latest_scan.created_at.isoformat() + "Z") if latest_scan.created_at else None,
            "scan_id":      latest_scan.id,
            "account_id":   account_id,
            "total_exposed": len(findings),
            "categories":   categories_out,
            "no_scan":      False,
        }
    )
