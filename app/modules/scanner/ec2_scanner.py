from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


class EC2Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()
        lock = threading.Lock()

        def _add(f):
            fid = f.get("id")
            if not fid:
                return
            with lock:
                if fid not in seen_ids:
                    seen_ids.add(fid)
                    findings.append(f)

        # ── Pre-fetch instances + volumes + EIPs concurrently ────────────────
        instances_data = []
        volumes_map    = {}   # volume_id -> encrypted bool
        eip_list       = []

        def _fetch_instances():
            try:
                resp = ec2.describe_instances()
                for res in resp.get("Reservations", []):
                    instances_data.extend(res.get("Instances", []))
            except Exception as e:
                print("EC2 describe error:", e)

        def _fetch_all_volumes():
            # One bulk call instead of one call per volume — massive speedup
            try:
                paginator = ec2.get_paginator("describe_volumes")
                for page in paginator.paginate():
                    for vol in page.get("Volumes", []):
                        volumes_map[vol["VolumeId"]] = vol.get("Encrypted", False)
            except Exception as e:
                print("EBS volumes describe error:", e)

        def _fetch_eips():
            try:
                eip_list.extend(ec2.describe_addresses().get("Addresses", []))
            except Exception as e:
                print("EIP describe error:", e)

        with ThreadPoolExecutor(max_workers=3) as pre:
            futs = [
                pre.submit(_fetch_instances),
                pre.submit(_fetch_all_volumes),
                pre.submit(_fetch_eips),
            ]
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception as e:
                    print(f"[EC2Scanner] pre-fetch error in {region}:", e)

        # ── Per-instance checks (termination-protection in parallel pool) ─────
        def _check_instance(instance):
            instance_id = instance["InstanceId"]
            public_ip   = instance.get("PublicIpAddress")
            state       = instance.get("State", {}).get("Name")

            if state == "terminated":
                return

            if state == "running":
                _add({
                    "id":          f"ec2-running-{instance_id}",
                    "type":        "EC2_INSTANCE_RUNNING",
                    "severity":    "LOW",
                    "resource_id": instance_id,
                    "region":      region,
                    "state":       state,
                    "description": "EC2 instance is running (cost optimization: stop it to reduce spend)",
                })
                _add({
                    "id":          f"ec2-running-force-terminate-{instance_id}",
                    "type":        "EC2_INSTANCE_RUNNING_UNMONITORED",
                    "severity":    "HIGH",
                    "resource_id": instance_id,
                    "region":      region,
                    "state":       state,
                    "description": (
                        f"EC2 instance {instance_id} is running and flagged for direct termination. "
                        "Use this to terminate a running instance immediately without stopping it first. "
                        "This is irreversible — the instance cannot be restarted once terminated."
                    ),
                })

            if state == "stopped":
                _add({
                    "id":          f"ec2-stopped-{instance_id}",
                    "type":        "EC2_INSTANCE_STOPPED",
                    "severity":    "LOW",
                    "resource_id": instance_id,
                    "region":      region,
                    "state":       state,
                    "description": "EC2 instance is stopped (cleanup opportunity)",
                })

            if public_ip:
                _add({
                    "id":          f"ec2-public-instance-{instance_id}",
                    "type":        "PUBLIC_EC2_INSTANCE",
                    "severity":    SEVERITY_MAP["PUBLIC_EC2_INSTANCE"],
                    "resource_id": instance_id,
                    "region":      region,
                    "public_ip":   public_ip,
                    "description": "EC2 instance has a public IP address",
                })

            if "IamInstanceProfile" not in instance:
                _add({
                    "id":          f"ec2-no-iam-role-{instance_id}",
                    "type":        "EC2_WITHOUT_IAM_ROLE",
                    "severity":    SEVERITY_MAP["EC2_WITHOUT_IAM_ROLE"],
                    "resource_id": instance_id,
                    "region":      region,
                    "description": "EC2 instance does not have an IAM role attached",
                })

            for sg in instance.get("SecurityGroups", []):
                if sg.get("GroupName") == "default":
                    _add({
                        "id":             f"ec2-default-sg-{instance_id}",
                        "type":           "EC2_DEFAULT_SECURITY_GROUP",
                        "severity":       SEVERITY_MAP["EC2_DEFAULT_SECURITY_GROUP"],
                        "resource_id":    instance_id,
                        "region":         region,
                        "security_group": sg.get("GroupId"),
                        "description":    "EC2 instance is using the default security group",
                    })

            # Termination protection — was sequential per instance, now concurrent
            try:
                attr = ec2.describe_instance_attribute(
                    InstanceId=instance_id,
                    Attribute="disableApiTermination",
                )
                if not attr["DisableApiTermination"]["Value"]:
                    _add({
                        "id":          f"ec2-termination-protection-disabled-{instance_id}",
                        "type":        "EC2_TERMINATION_PROTECTION_DISABLED",
                        "severity":    SEVERITY_MAP["EC2_TERMINATION_PROTECTION_DISABLED"],
                        "resource_id": instance_id,
                        "region":      region,
                        "description": "EC2 termination protection is disabled",
                    })
            except Exception as e:
                print(f"Termination protection error ({instance_id}):", e)

            # EBS volumes — lookup from pre-fetched map, zero extra API calls
            for device in instance.get("BlockDeviceMappings", []):
                ebs = device.get("Ebs")
                if not ebs:
                    continue
                volume_id = ebs.get("VolumeId")
                if volume_id and not volumes_map.get(volume_id, True):
                    _add({
                        "id":          f"ebs-unencrypted-{volume_id}",
                        "type":        "EBS_UNENCRYPTED_VOLUME",
                        "severity":    SEVERITY_MAP["EBS_UNENCRYPTED_VOLUME"],
                        "resource_id": volume_id,
                        "region":      region,
                        "instance_id": instance_id,
                        "description": "EBS volume attached to EC2 instance is not encrypted",
                    })

        if instances_data:
            workers = min(len(instances_data), 20)
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futs = [pool.submit(_check_instance, inst) for inst in instances_data]
                for fut in as_completed(futs):
                    try:
                        fut.result()
                    except Exception as e:
                        print(f"[EC2Scanner] instance check error in {region}:", e)

        # ── EIPs (already fetched, just iterate) ─────────────────────────────
        for addr in eip_list:
            if not addr.get("AssociationId"):
                alloc_id = addr.get("AllocationId")
                _add({
                    "id":          f"ec2-unused-eip-{alloc_id}",
                    "type":        "EC2_PUBLIC_ELASTIC_IP",
                    "severity":    SEVERITY_MAP.get("EC2_PUBLIC_ELASTIC_IP", "MEDIUM"),
                    "resource_id": alloc_id,
                    "region":      region,
                    "public_ip":   addr.get("PublicIp"),
                    "description": "Elastic IP is allocated but NOT attached to any resource",
                })

        return findings