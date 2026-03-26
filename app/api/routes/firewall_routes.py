import uuid
import time

# Temporary in-memory execution token store
EXECUTION_TOKENS = {}
TOKEN_EXPIRY_SECONDS = 300  # 5 minutes

from fastapi import APIRouter
from app.api.schemas import FirewallPreviewRequest
from app.api.response_formatter import format_response
from app.api.logger import logger
from app.config import security_config
from app.core.aws_session import AWSSession
from app.api.schemas import FirewallExecuteRequest
from app.modules.threat_monitor.threat_monitor import ThreatMonitor
from app.modules.remediation.rollback import RollbackEngine
from app.modules.remediation.rollback import RollbackEngine
from app.modules.remediation.executor import RemediationExecutor
from app.api.schemas import FirewallRollbackRequest



router = APIRouter(
    prefix="/api/firewall",
    tags=["Firewall"]
)


@router.post("/preview")
def firewall_preview(request: FirewallPreviewRequest):

    effective_mode = request.mode

    if not (
        security_config.LIVE_EXECUTION_ENABLED
        and security_config.LIVE_EXECUTION_APPROVED_BY_USER
    ):
        effective_mode = security_config.DEFAULT_EXECUTION_MODE

    logger.info(
        f"Module=FirewallPreview | SG={request.security_group_id} | "
        f"Region={request.region} | Mode={effective_mode}"
    )

    try:
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

        ec2 = aws_session.session.client("ec2", region_name=request.region)

        response = ec2.describe_security_groups(
            GroupIds=[request.security_group_id]
        )

        sg = response["SecurityGroups"][0]

        inbound_rules = []

        for permission in sg.get("IpPermissions", []):
            protocol = permission.get("IpProtocol")
            from_port = permission.get("FromPort")
            to_port = permission.get("ToPort")

            port_range = (
                f"{from_port}-{to_port}"
                if from_port is not None and to_port is not None
                else "ALL"
            )

            for ip_range in permission.get("IpRanges", []):
                cidr = ip_range.get("CidrIp")

                risk = "LOW"
                reason = None

                if cidr == "0.0.0.0/0":
                    risk = "HIGH"
                    reason = "Public exposure"

                inbound_rules.append({
                    "protocol": protocol,
                    "port_range": port_range,
                    "cidr": cidr,
                    "risk": risk,
                    "reason": reason
                })

        return format_response(
            module="firewall_preview",
            mode=effective_mode,
            data={
                "resource_id": request.security_group_id,
                "region": request.region,
                "inbound_rules": inbound_rules,
                "recommended_action": "RESTRICT_SECURITY_GROUP",
                "would_execute": False
            }
        )

    except Exception as e:
        logger.error(f"Firewall preview failed: {str(e)}")

        return format_response(
            module="firewall_preview",
            mode=effective_mode,
            errors=[str(e)]
        )

@router.post("/execute")
def firewall_execute(request: FirewallExecuteRequest):

    effective_mode = request.mode

    # Global execution safety gate
    if not (
        security_config.LIVE_EXECUTION_ENABLED
        and security_config.LIVE_EXECUTION_APPROVED_BY_USER
    ):
        effective_mode = security_config.DEFAULT_EXECUTION_MODE

    logger.info(
        f"Module=FirewallExecute | Account={request.account_id} | Mode={effective_mode}"
    )

    try:
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

        # =====================================================
        # CASE 1 — DRY RUN (Generate Execution Plan)
        # =====================================================
        if effective_mode == "DRY_RUN":

            monitor = ThreatMonitor(
                aws_session=aws_session,
                execution_mode="DRY_RUN",
                live_approved=False
            )

            results = monitor.start()

            executions = []
            summary = {
                "total": 0,
                "executed": 0,
                "skipped": 0,
                "failed": 0
            }

            for finding in results.get("public_security_groups", []):
                if finding.get("severity") != "HIGH":
                    continue

                summary["total"] += 1

                execution = finding.get("execution", {})
                status = execution.get("status")

                if status in ["EXECUTED", "DRY_RUN"]:
                    summary["executed"] += 1
                elif status == "SKIPPED":
                    summary["skipped"] += 1
                else:
                    summary["failed"] += 1

                executions.append({
                    "resource_id": finding.get("resource_id"),
                    "region": finding.get("region"),
                    "action": finding.get("remediation", {}).get("action"),
                    "details": execution
                })

            token = str(uuid.uuid4())

            EXECUTION_TOKENS[token] = {
                "timestamp": time.time(),
                "execution_plan": executions
            }

            return format_response(
                module="firewall_execute",
                mode="DRY_RUN",
                data={
                    "executions": executions,
                    "summary": summary,
                    "execution_token": token,
                    "expires_in_seconds": TOKEN_EXPIRY_SECONDS
                }
            )

        # =====================================================
        # CASE 2 — LIVE EXECUTION (Execute Stored Plan)
        # =====================================================
        if effective_mode == "LIVE":

            if not request.confirm:
                return format_response(
                    module="firewall_execute",
                    mode="LIVE",
                    errors=["LIVE execution requires confirm=true"]
                )

            if not request.execution_token:
                return format_response(
                    module="firewall_execute",
                    mode="LIVE",
                    errors=["execution_token required for LIVE mode"]
                )

            token_data = EXECUTION_TOKENS.get(request.execution_token)

            if not token_data:
                return format_response(
                    module="firewall_execute",
                    mode="LIVE",
                    errors=["Invalid or expired execution_token"]
                )

            if time.time() - token_data["timestamp"] > TOKEN_EXPIRY_SECONDS:
                del EXECUTION_TOKENS[request.execution_token]
                return format_response(
                    module="firewall_execute",
                    mode="LIVE",
                    errors=["execution_token expired"]
                )

            execution_plan = token_data["execution_plan"]

            # One-time use token
            del EXECUTION_TOKENS[request.execution_token]

          

            executor = RemediationExecutor(
                aws_session=aws_session,
                history=history,
                execution_mode="LIVE"
            )

            live_results = []
            summary = {
                "total": 0,
                "executed": 0,
                "skipped": 0,
                "failed": 0
            }

            for item in execution_plan:
                summary["total"] += 1

                result = executor.execute({
                    "resource_id": item["resource_id"],
                    "region": item["region"],
                    "remediation": {
                        "action": item["action"],
                        "recommended_fix": item["details"].get("recommended_fix")
                    }
                })

                status = result.get("status")

                if status == "EXECUTED":
                    summary["executed"] += 1
                elif status == "SKIPPED":
                    summary["skipped"] += 1
                else:
                    summary["failed"] += 1

                live_results.append(result)

            return format_response(
                module="firewall_execute",
                mode="LIVE",
                data={
                    "executions": live_results,
                    "summary": summary
                }
            )

    except Exception as e:
        logger.error(f"Firewall execution failed: {str(e)}")

        return format_response(
            module="firewall_execute",
            mode=effective_mode,
            errors=[str(e)]
        )



@router.post("/rollback")
def firewall_rollback(request: FirewallRollbackRequest):

    try:
        aws_session = AWSSession(profile_name="default")
        aws_session.initialize()

    
        print(RollbackEngine.__init__.__code__.co_varnames)


        rollback_engine = RollbackEngine(aws_session)

        result = rollback_engine.rollback(request.execution_id)

        return format_response(
            module="firewall_rollback",
            mode="LIVE",
            data=result
        )

    except Exception as e:
        logger.error(f"Rollback failed: {str(e)}")

        return format_response(
            module="firewall_rollback",
            mode="LIVE",
            errors=[str(e)]
        )