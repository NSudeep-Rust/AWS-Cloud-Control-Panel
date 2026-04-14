from app.config.security_config import SEVERITY_MAP
from concurrent.futures import ThreadPoolExecutor, as_completed


class NetworkScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session
        self.region = aws_session.session.region_name

    def scan(self, region=None):
        session = self.aws_session.session
        ec2 = session.client("ec2", region_name=region)

        findings = []
        seen_ids = set()

        def _add(f):
            fid = f.get("id")
            if fid and fid not in seen_ids:
                seen_ids.add(fid)
                findings.append(f)

        # ── Fetch ALL needed data concurrently (was 10 sequential calls, 2 duplicated) ──
        fetch_map = {
            "route_tables":       lambda: ec2.describe_route_tables()["RouteTables"],
            "nacls":              lambda: ec2.describe_network_acls()["NetworkAcls"],
            "igws":               lambda: ec2.describe_internet_gateways()["InternetGateways"],
            "security_groups":    lambda: ec2.describe_security_groups()["SecurityGroups"],
            "network_interfaces": lambda: ec2.describe_network_interfaces()["NetworkInterfaces"],
            "vpcs":               lambda: ec2.describe_vpcs()["Vpcs"],
            "nat_gateways":       lambda: ec2.describe_nat_gateways()["NatGateways"],
        }
        data = {}
        with ThreadPoolExecutor(max_workers=len(fetch_map)) as pool:
            futs = {pool.submit(fn): key for key, fn in fetch_map.items()}
            for fut in as_completed(futs):
                key = futs[fut]
                try:
                    data[key] = fut.result()
                except Exception as e:
                    data[key] = []
                    print(f"[NetworkScanner] '{key}' failed in {region}: {e}")

        route_tables       = data.get("route_tables", [])
        nacls              = data.get("nacls", [])
        igws               = data.get("igws", [])
        security_groups    = data.get("security_groups", [])
        network_interfaces = data.get("network_interfaces", [])
        vpcs               = data.get("vpcs", [])
        nat_gateways       = data.get("nat_gateways", [])

        # ── Check 1: Public subnets ──────────────────────────────────────────
        for rt in route_tables:
            for route in rt.get("Routes", []):
                if (route.get("DestinationCidrBlock") == "0.0.0.0/0"
                        and route.get("GatewayId", "").startswith("igw")):
                    for assoc in rt.get("Associations", []):
                        subnet_id = assoc.get("SubnetId")
                        if subnet_id:
                            _add({
                                "id":          f"public-subnet-{subnet_id}",
                                "type":        "PUBLIC_SUBNET_DETECTED",
                                "severity":    SEVERITY_MAP["PUBLIC_SUBNET_DETECTED"],
                                "resource_id": subnet_id,
                                "region":      region,
                                "description": "Subnet routes traffic to an Internet Gateway",
                            })

        # ── Check 2: Route tables with public routes ─────────────────────────
        for rt in route_tables:
            rt_id = rt["RouteTableId"]
            for route in rt.get("Routes", []):
                if (route.get("DestinationCidrBlock") == "0.0.0.0/0"
                        and route.get("GatewayId", "").startswith("igw")):
                    _add({
                        "id":          f"route-table-public-{rt_id}",
                        "type":        "ROUTE_TABLE_PUBLIC_ROUTE",
                        "severity":    SEVERITY_MAP["ROUTE_TABLE_PUBLIC_ROUTE"],
                        "resource_id": rt_id,
                        "region":      region,
                        "description": "Route table sends internet traffic to an Internet Gateway",
                    })

        # ── Check 3: NACL allow all inbound ──────────────────────────────────
        for nacl in nacls:
            if nacl.get("IsDefault"):
                continue
            nacl_id = nacl["NetworkAclId"]
            for entry in nacl.get("Entries", []):
                if (entry.get("Egress") is False
                        and entry.get("RuleAction") == "allow"
                        and entry.get("CidrBlock") == "0.0.0.0/0"):
                    _add({
                        "id":          f"nacl-allow-all-inbound-{nacl_id}",
                        "type":        "NACL_ALLOW_ALL_INBOUND",
                        "severity":    SEVERITY_MAP["NACL_ALLOW_ALL_INBOUND"],
                        "resource_id": nacl_id,
                        "region":      region,
                        "description": "Network ACL allows inbound traffic from 0.0.0.0/0",
                    })

        # ── Check 4: NACL allow all outbound ─────────────────────────────────
        for nacl in nacls:
            if nacl.get("IsDefault"):
                continue
            nacl_id = nacl["NetworkAclId"]
            for entry in nacl.get("Entries", []):
                if (entry.get("Egress") is True
                        and entry.get("RuleAction") == "allow"
                        and entry.get("CidrBlock") == "0.0.0.0/0"):
                    _add({
                        "id":          f"nacl-allow-all-outbound-{nacl_id}",
                        "type":        "NACL_ALLOW_ALL_OUTBOUND",
                        "severity":    SEVERITY_MAP["NACL_ALLOW_ALL_OUTBOUND"],
                        "resource_id": nacl_id,
                        "region":      region,
                        "description": "Network ACL allows outbound traffic to 0.0.0.0/0",
                    })

        # ── Check 5: Internet gateways attached to VPCs ───────────────────────
        for igw in igws:
            igw_id = igw["InternetGatewayId"]
            for attachment in igw.get("Attachments", []):
                vpc_id = attachment.get("VpcId")
                if vpc_id:
                    _add({
                        "id":          f"internet-gateway-attached-{igw_id}",
                        "type":        "INTERNET_GATEWAY_ATTACHED",
                        "severity":    SEVERITY_MAP["INTERNET_GATEWAY_ATTACHED"],
                        "resource_id": igw_id,
                        "region":      region,
                        "description": f"Internet Gateway attached to VPC {vpc_id}",
                    })

        # ── Check 6: Unused security groups ──────────────────────────────────
        used_sgs = {
            sg["GroupId"]
            for eni in network_interfaces
            for sg in eni.get("Groups", [])
        }
        for sg in security_groups:
            sg_id = sg["GroupId"]
            if sg_id not in used_sgs and sg["GroupName"] != "default":
                _add({
                    "id":          f"unused-security-group-{sg_id}",
                    "type":        "UNUSED_SECURITY_GROUP",
                    "severity":    SEVERITY_MAP["UNUSED_SECURITY_GROUP"],
                    "resource_id": sg_id,
                    "region":      region,
                    "description": "Security group is not attached to any resource",
                })

        # ── Check 7: VPCs without NAT gateway ────────────────────────────────
        vpcs_with_nat = {
            nat["VpcId"] for nat in nat_gateways if nat.get("State") == "available"
        }
        for vpc in vpcs:
            vpc_id = vpc["VpcId"]
            if vpc_id not in vpcs_with_nat:
                _add({
                    "id":          f"vpc-without-nat-{vpc_id}",
                    "type":        "VPC_WITHOUT_NAT_GATEWAY",
                    "severity":    SEVERITY_MAP["VPC_WITHOUT_NAT_GATEWAY"],
                    "resource_id": vpc_id,
                    "region":      region,
                    "description": "VPC does not have a NAT Gateway configured",
                })

        return findings