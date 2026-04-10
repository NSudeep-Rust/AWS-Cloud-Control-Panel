from app.config.security_config import SEVERITY_MAP


class EC2Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self, region=None):

        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        try:
            response = ec2.describe_instances()
            
        except Exception as e:
            print("EC2 describe error:", str(e))
            return findings

        for reservation in response.get("Reservations", []):
            for instance in reservation.get("Instances", []):

                instance_id = instance["InstanceId"]
                public_ip = instance.get("PublicIpAddress")

                state = instance.get("State", {}).get("Name")

                # Skip terminated instances — they no longer exist; reporting them is a false-positive.
                if state == "terminated":
                    continue

                if state == "running":
                    finding_id = f"ec2-running-{instance_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)

                        findings.append({
                            "id": finding_id,
                            "type": "EC2_INSTANCE_RUNNING",
                            "severity": "LOW",
                            "resource_id": instance_id,
                            "region": region,
                            "state": state,
                            "description": "EC2 instance is running (cost optimization: stop it to reduce spend)"
                        })

                    force_finding_id = f"ec2-running-force-terminate-{instance_id}"
                    if force_finding_id not in seen_ids:
                        seen_ids.add(force_finding_id)
                        findings.append({
                            "id": force_finding_id,
                            "type": "EC2_INSTANCE_RUNNING_UNMONITORED",
                            "severity": "HIGH",
                            "resource_id": instance_id,
                            "region": region,
                            "state": state,
                            "description": (
                                f"EC2 instance {instance_id} is running and flagged for direct termination. "
                                "Use this to terminate a running instance immediately without stopping it first. "
                                "This is irreversible — the instance cannot be restarted once terminated."
                            )
                        })


                if state == "stopped":
                    finding_id = f"ec2-stopped-{instance_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)

                        findings.append({
                            "id": finding_id,
                            "type": "EC2_INSTANCE_STOPPED",
                            "severity": "LOW",
                            "resource_id": instance_id,
                            "region": region,
                            "state": state,
                            "description": "EC2 instance is stopped (cleanup opportunity)"
                        })

                if public_ip:
                    finding_id = f"ec2-public-instance-{instance_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "PUBLIC_EC2_INSTANCE",
                            "severity": SEVERITY_MAP["PUBLIC_EC2_INSTANCE"],
                            "resource_id": instance_id,
                            "region": region,
                            "public_ip": public_ip,
                            "description": "EC2 instance has a public IP address"
                        })

                if "IamInstanceProfile" not in instance:
                    finding_id = f"ec2-no-iam-role-{instance_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "EC2_WITHOUT_IAM_ROLE",
                            "severity": SEVERITY_MAP["EC2_WITHOUT_IAM_ROLE"],
                            "resource_id": instance_id,
                            "region": region,
                            "description": "EC2 instance does not have an IAM role attached"
                        })

                for sg in instance.get("SecurityGroups", []):
                    if sg.get("GroupName") == "default":
                        finding_id = f"ec2-default-sg-{instance_id}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "EC2_DEFAULT_SECURITY_GROUP",
                                "severity": SEVERITY_MAP["EC2_DEFAULT_SECURITY_GROUP"],
                                "resource_id": instance_id,
                                "region": region,
                                "security_group": sg.get("GroupId"),
                                "description": "EC2 instance is using the default security group"
                            })

                try:
                    attr = ec2.describe_instance_attribute(
                        InstanceId=instance_id,
                        Attribute="disableApiTermination"
                    )

                    termination_protection = attr["DisableApiTermination"]["Value"]

                    if termination_protection is False:
                        finding_id = f"ec2-termination-protection-disabled-{instance_id}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "EC2_TERMINATION_PROTECTION_DISABLED",
                                "severity": SEVERITY_MAP["EC2_TERMINATION_PROTECTION_DISABLED"],
                                "resource_id": instance_id,
                                "region": region,
                                "description": "EC2 termination protection is disabled"
                            })

                except Exception as e:
                    print(f"Termination protection error ({instance_id}):", str(e))

                for device in instance.get("BlockDeviceMappings", []):
                    ebs = device.get("Ebs")

                    if not ebs:
                        continue

                    volume_id = ebs.get("VolumeId")

                    try:
                        volume = ec2.describe_volumes(
                            VolumeIds=[volume_id]
                        )["Volumes"][0]

                        if not volume.get("Encrypted"):
                            finding_id = f"ebs-unencrypted-{volume_id}"

                            if finding_id not in seen_ids:
                                seen_ids.add(finding_id)
                                findings.append({
                                    "id": finding_id,
                                    "type": "EBS_UNENCRYPTED_VOLUME",
                                    "severity": SEVERITY_MAP["EBS_UNENCRYPTED_VOLUME"],
                                    "resource_id": volume_id,
                                    "region": region,
                                    "instance_id": instance_id,
                                    "description": "EBS volume attached to EC2 instance is not encrypted"
                                })

                    except Exception as e:
                        print(f"EBS error ({volume_id}):", str(e))
        
        try:
            eip_addresses = ec2.describe_addresses().get("Addresses", [])

            for addr in eip_addresses:

                allocation_id = addr.get("AllocationId")
                public_ip = addr.get("PublicIp")

                if not addr.get("AssociationId"):

                    finding_id = f"ec2-unused-eip-{allocation_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)

                        findings.append({
                            "id": finding_id,
                            "type": "EC2_PUBLIC_ELASTIC_IP",
                            "severity": SEVERITY_MAP.get("EC2_PUBLIC_ELASTIC_IP", "MEDIUM"),
                            "resource_id": allocation_id,
                            "region": region,
                            "public_ip": public_ip,
                            "description": "Elastic IP is allocated but NOT attached to any resource"
                        })

        except Exception as e:
            print(f"EIP scan error ({region}):", str(e))

        
        

        return findings