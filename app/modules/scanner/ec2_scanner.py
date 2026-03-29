from app.config.security_config import SEVERITY_MAP
import boto3


class EC2Scanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):

        session = self.aws_session.session
        ec2 = session.client("ec2")

        findings = []

        response = ec2.describe_instances()
        addresses = ec2.describe_addresses().get("Addresses", [])

        for reservation in response.get("Reservations", []):

            for instance in reservation.get("Instances", []):

                instance_id = instance["InstanceId"]

                public_ip = instance.get("PublicIpAddress")

                if public_ip:

                    findings.append({
                        "id": f"ec2-public-instance-{instance_id}",
                        "type": "PUBLIC_EC2_INSTANCE",
                        "severity": SEVERITY_MAP["PUBLIC_EC2_INSTANCE"],
                        "resource_id": instance_id,
                        "public_ip": public_ip,
                        "description": "EC2 instance has a public IP address"
                    })

                # -------------------------
                # EC2 without IAM role
                # -------------------------
                if "IamInstanceProfile" not in instance:

                    findings.append({
                        "id": f"ec2-no-iam-role-{instance_id}",
                        "type": "EC2_WITHOUT_IAM_ROLE",
                        "severity": SEVERITY_MAP["EC2_WITHOUT_IAM_ROLE"],
                        "resource_id": instance_id,
                        "description": "EC2 instance does not have an IAM role attached"
                    })

                # -------------------------
                # EC2 using default security group
                # -------------------------

                for sg in instance.get("SecurityGroups", []):

                    if sg.get("GroupName") == "default":

                        findings.append({
                            "id": f"ec2-default-sg-{instance_id}",
                            "type": "EC2_DEFAULT_SECURITY_GROUP",
                            "severity": SEVERITY_MAP["EC2_DEFAULT_SECURITY_GROUP"],
                            "resource_id": instance_id,
                            "security_group": sg.get("GroupId"),
                            "description": "EC2 instance is using the default security group"
                        })


                # -------------------------
                # EC2 termination protection disabled
                # -------------------------

                attr = ec2.describe_instance_attribute(
                    InstanceId=instance_id,
                    Attribute="disableApiTermination"
                )

                termination_protection = attr["DisableApiTermination"]["Value"]

                if termination_protection is False:

                    findings.append({
                        "id": f"ec2-termination-protection-disabled-{instance_id}",
                        "type": "EC2_TERMINATION_PROTECTION_DISABLED",
                        "severity": SEVERITY_MAP["EC2_TERMINATION_PROTECTION_DISABLED"],
                        "resource_id": instance_id,
                        "description": "EC2 termination protection is disabled"
                    })

                # -------------------------
                # EBS unencrypted volume
                # -------------------------

                for device in instance.get("BlockDeviceMappings", []):

                    ebs = device.get("Ebs")

                    if not ebs:
                        continue

                    volume_id = ebs.get("VolumeId")

                    volume = ec2.describe_volumes(
                        VolumeIds=[volume_id]
                    )["Volumes"][0]

                    if not volume.get("Encrypted"):

                        findings.append({
                            "id": f"ebs-unencrypted-{volume_id}",
                            "type": "EBS_UNENCRYPTED_VOLUME",
                            "severity": SEVERITY_MAP["EBS_UNENCRYPTED_VOLUME"],
                            "resource_id": volume_id,
                            "instance_id": instance_id,
                            "description": "EBS volume attached to EC2 instance is not encrypted"
                        })
                # -------------------------
                # EC2 Elastic IP exposure
                # -------------------------

                for address in addresses:

                    if address.get("PublicIp") == public_ip:

                        findings.append({
                            "id": f"ec2-elastic-ip-{instance_id}",
                            "type": "EC2_PUBLIC_ELASTIC_IP",
                            "severity": SEVERITY_MAP["EC2_PUBLIC_ELASTIC_IP"],
                            "resource_id": instance_id,
                            "elastic_ip": address.get("PublicIp"),
                            "description": "EC2 instance has an Elastic IP attached"
                        })
        return findings