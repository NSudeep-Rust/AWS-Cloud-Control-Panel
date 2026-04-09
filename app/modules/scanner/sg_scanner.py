from app.config.security_config import SEVERITY_MAP


class SGScanner:
    """
    Scans for specific Security Group port exposures (SSH, RDP)
    and EC2 IMDSv1 enabled.
    These are more specific than the generic PUBLIC_SECURITY_GROUP finding.
    """

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):
        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        try:
            security_groups = ec2.describe_security_groups()["SecurityGroups"]

            for sg in security_groups:
                sg_id = sg["GroupId"]

                for permission in sg.get("IpPermissions", []):
                    from_port = permission.get("FromPort", 0)
                    to_port = permission.get("ToPort", 65535)
                    protocol = permission.get("IpProtocol", "")

                    for ip_range in permission.get("IpRanges", []):
                        cidr = ip_range.get("CidrIp", "")

                        if cidr == "0.0.0.0/0":

                            if protocol in ["-1", "tcp"] and from_port <= 22 <= to_port:
                                finding_id = f"sg-unrestricted-ssh-{sg_id}"
                                if finding_id not in seen_ids:
                                    seen_ids.add(finding_id)
                                    findings.append({
                                        "id": finding_id,
                                        "type": "SECURITY_GROUP_UNRESTRICTED_SSH",
                                        "severity": SEVERITY_MAP.get("SECURITY_GROUP_UNRESTRICTED_SSH", "CRITICAL"),
                                        "resource_id": sg_id,
                                        "region": region,
                                        "port": 22,
                                        "cidr": cidr,
                                        "description": f"Security group '{sg_id}' allows unrestricted SSH (port 22) from 0.0.0.0/0"
                                    })

                            if protocol in ["-1", "tcp"] and from_port <= 3389 <= to_port:
                                finding_id = f"sg-unrestricted-rdp-{sg_id}"
                                if finding_id not in seen_ids:
                                    seen_ids.add(finding_id)
                                    findings.append({
                                        "id": finding_id,
                                        "type": "SECURITY_GROUP_UNRESTRICTED_RDP",
                                        "severity": SEVERITY_MAP.get("SECURITY_GROUP_UNRESTRICTED_RDP", "CRITICAL"),
                                        "resource_id": sg_id,
                                        "region": region,
                                        "port": 3389,
                                        "cidr": cidr,
                                        "description": f"Security group '{sg_id}' allows unrestricted RDP (port 3389) from 0.0.0.0/0"
                                    })

        except Exception as e:
            print(f"SG port scan error ({region}):", str(e))

        try:
            response = ec2.describe_instances()
            for reservation in response.get("Reservations", []):
                for instance in reservation.get("Instances", []):
                    instance_id = instance["InstanceId"]
                    metadata_options = instance.get("MetadataOptions", {})
                    http_tokens = metadata_options.get("HttpTokens", "optional")

                    if http_tokens == "optional":
                        finding_id = f"ec2-imdsv1-enabled-{instance_id}"
                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "EC2_IMDSV1_ENABLED",
                                "severity": SEVERITY_MAP.get("EC2_IMDSV1_ENABLED", "MEDIUM"),
                                "resource_id": instance_id,
                                "region": region,
                                "description": f"EC2 instance '{instance_id}' allows IMDSv1 (insecure metadata service)"
                            })

        except Exception as e:
            print(f"IMDSv1 scan error ({region}):", str(e))

        try:
            snapshots = ec2.describe_snapshots(OwnerIds=["self"])["Snapshots"]

            for snapshot in snapshots:
                snapshot_id = snapshot["SnapshotId"]

                try:
                    perm = ec2.describe_snapshot_attribute(
                        SnapshotId=snapshot_id,
                        Attribute="createVolumePermission"
                    )
                    perms = perm.get("CreateVolumePermissions", [])

                    for p in perms:
                        if p.get("Group") == "all":
                            finding_id = f"ebs-snapshot-public-{snapshot_id}"
                            if finding_id not in seen_ids:
                                seen_ids.add(finding_id)
                                findings.append({
                                    "id": finding_id,
                                    "type": "EBS_SNAPSHOT_PUBLIC",
                                    "severity": SEVERITY_MAP.get("EBS_SNAPSHOT_PUBLIC", "CRITICAL"),
                                    "resource_id": snapshot_id,
                                    "region": region,
                                    "description": f"EBS snapshot '{snapshot_id}' is publicly accessible"
                                })
                            break

                except Exception as e:
                    print(f"Snapshot permission error ({snapshot_id}):", str(e))

        except Exception as e:
            print(f"EBS snapshot public scan error ({region}):", str(e))

        return findings
