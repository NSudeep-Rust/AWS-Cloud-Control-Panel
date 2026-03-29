from app.config.security_config import SEVERITY_MAP

class NetworkScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session
        self.region = aws_session.session.region_name

    def scan(self, region=None):

        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        # -------------------------
        # PUBLIC SUBNET DETECTED
        # -------------------------
        try:
            route_tables = ec2.describe_route_tables()["RouteTables"]

            for rt in route_tables:
                for route in rt.get("Routes", []):
                    if route.get("DestinationCidrBlock") == "0.0.0.0/0":
                        gateway = route.get("GatewayId", "")

                        if gateway.startswith("igw"):
                            for association in rt.get("Associations", []):
                                subnet_id = association.get("SubnetId")

                                if subnet_id:
                                    finding_id = f"public-subnet-{subnet_id}"

                                    if finding_id not in seen_ids:
                                        seen_ids.add(finding_id)
                                        findings.append({
                                            "id": finding_id,
                                            "type": "PUBLIC_SUBNET_DETECTED",
                                            "severity": SEVERITY_MAP["PUBLIC_SUBNET_DETECTED"],
                                            "resource_id": subnet_id,
                                            "region": region,
                                            "description": "Subnet routes traffic to an Internet Gateway"
                                        })

        except Exception as e:
            print("Public subnet error:", str(e))

        # -------------------------
        # ROUTE TABLE PUBLIC ROUTE
        # -------------------------
        try:
            route_tables = ec2.describe_route_tables()["RouteTables"]

            for rt in route_tables:
                route_table_id = rt["RouteTableId"]

                for route in rt.get("Routes", []):
                    if route.get("DestinationCidrBlock") == "0.0.0.0/0":
                        gateway = route.get("GatewayId", "")

                        if gateway.startswith("igw"):
                            finding_id = f"route-table-public-{route_table_id}"

                            if finding_id not in seen_ids:
                                seen_ids.add(finding_id)
                                findings.append({
                                    "id": finding_id,
                                    "type": "ROUTE_TABLE_PUBLIC_ROUTE",
                                    "severity": SEVERITY_MAP["ROUTE_TABLE_PUBLIC_ROUTE"],
                                    "resource_id": route_table_id,
                                    "region": region,
                                    "description": "Route table sends internet traffic to an Internet Gateway"
                                })

        except Exception as e:
            print("Route table error:", str(e))

        # -------------------------
        # NACL ALLOW ALL INBOUND
        # -------------------------
        try:
            nacls = ec2.describe_network_acls()["NetworkAcls"]

            for nacl in nacls:

                # 🔥 ADD THIS
                if nacl.get("IsDefault"):
                    continue

                nacl_id = nacl["NetworkAclId"]

                for entry in nacl["Entries"]:
                    if entry.get("Egress") is False:
                        if entry.get("RuleAction") == "allow":
                            cidr = entry.get("CidrBlock")

                            if cidr == "0.0.0.0/0":
                                finding_id = f"nacl-allow-all-inbound-{nacl_id}"

                                if finding_id not in seen_ids:
                                    seen_ids.add(finding_id)
                                    findings.append({
                                        "id": finding_id,
                                        "type": "NACL_ALLOW_ALL_INBOUND",
                                        "severity": SEVERITY_MAP["NACL_ALLOW_ALL_INBOUND"],
                                        "resource_id": nacl_id,
                                        "region": region,
                                        "description": "Network ACL allows inbound traffic from 0.0.0.0/0"
                                    })

        except Exception as e:
            print("NACL inbound error:", str(e))

        # -------------------------
        # NACL ALLOW ALL OUTBOUND
        # -------------------------
        try:
            nacls = ec2.describe_network_acls()["NetworkAcls"]

            for nacl in nacls:

                # 🔥 ADD THIS
                if nacl.get("IsDefault"):
                    continue

                nacl_id = nacl["NetworkAclId"]

                for entry in nacl["Entries"]:
                    if entry.get("Egress") is True:
                        if entry.get("RuleAction") == "allow":
                            cidr = entry.get("CidrBlock")

                            if cidr == "0.0.0.0/0":
                                finding_id = f"nacl-allow-all-outbound-{nacl_id}"

                                if finding_id not in seen_ids:
                                    seen_ids.add(finding_id)
                                    findings.append({
                                        "id": finding_id,
                                        "type": "NACL_ALLOW_ALL_OUTBOUND",
                                        "severity": SEVERITY_MAP["NACL_ALLOW_ALL_OUTBOUND"],
                                        "resource_id": nacl_id,
                                        "region": region,
                                        "description": "Network ACL allows outbound traffic to 0.0.0.0/0"
                                    })

        except Exception as e:
            print("NACL outbound error:", str(e))

        # -------------------------
        # INTERNET GATEWAY ATTACHED
        # -------------------------
        try:
            igws = ec2.describe_internet_gateways()["InternetGateways"]

            for igw in igws:
                igw_id = igw["InternetGatewayId"]

                for attachment in igw.get("Attachments", []):
                    vpc_id = attachment.get("VpcId")

                    if vpc_id:
                        finding_id = f"internet-gateway-attached-{igw_id}"

                        if finding_id not in seen_ids:
                            seen_ids.add(finding_id)
                            findings.append({
                                "id": finding_id,
                                "type": "INTERNET_GATEWAY_ATTACHED",
                                "severity": SEVERITY_MAP["INTERNET_GATEWAY_ATTACHED"],
                                "resource_id": igw_id,
                                "region": region,
                                "description": f"Internet Gateway attached to VPC {vpc_id}"
                            })

        except Exception as e:
            print("IGW error:", str(e))

        # -------------------------
        # UNUSED SECURITY GROUP
        # -------------------------
        try:
            security_groups = ec2.describe_security_groups()["SecurityGroups"]
            network_interfaces = ec2.describe_network_interfaces()["NetworkInterfaces"]

            used_sgs = set()

            for eni in network_interfaces:
                for sg in eni.get("Groups", []):
                    used_sgs.add(sg["GroupId"])

            for sg in security_groups:
                sg_id = sg["GroupId"]

                if sg_id not in used_sgs and sg["GroupName"] != "default":
                    finding_id = f"unused-security-group-{sg_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "UNUSED_SECURITY_GROUP",
                            "severity": SEVERITY_MAP["UNUSED_SECURITY_GROUP"],
                            "resource_id": sg_id,
                            "region": region,
                            "description": "Security group is not attached to any resource"
                        })

        except Exception as e:
            print("Unused SG error:", str(e))

        # -------------------------
        # VPC WITHOUT NAT GATEWAY
        # -------------------------
        try:
            vpcs = ec2.describe_vpcs()["Vpcs"]
            nat_gateways = ec2.describe_nat_gateways()["NatGateways"]

            vpcs_with_nat = set()

            for nat in nat_gateways:
                if nat["State"] == "available":
                    vpcs_with_nat.add(nat["VpcId"])

            for vpc in vpcs:
                vpc_id = vpc["VpcId"]

                if vpc_id not in vpcs_with_nat:
                    finding_id = f"vpc-without-nat-{vpc_id}"

                    if finding_id not in seen_ids:
                        seen_ids.add(finding_id)
                        findings.append({
                            "id": finding_id,
                            "type": "VPC_WITHOUT_NAT_GATEWAY",
                            "severity": SEVERITY_MAP["VPC_WITHOUT_NAT_GATEWAY"],
                            "resource_id": vpc_id,
                            "region": region,
                            "description": "VPC does not have a NAT Gateway configured"
                        })

        except Exception as e:
            print("VPC NAT error:", str(e))

        return findings