from core.aws_session import AWSSession
from modules.scanner.scanner import Scanner
from modules.threat_monitor.threat_monitor import ThreatMonitor
from modules.firewall.firewall import FirewallManager
from modules.iam_manager.iam_manager import IAMManager
from modules.protection_history.history import ProtectionHistory
EXECUTION_MODE = "DRY_RUN"  # Change to "LIVE" in future
LIVE_EXECUTION_APPROVED = False
from app.database.db import SessionLocal
from app.database.models import Account
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

ui_dist = os.path.join(os.path.dirname(__file__), "../ui/dist")
if os.path.exists(ui_dist):
    app.mount("/", StaticFiles(directory=ui_dist, html=True), name="ui")




def main():
    db = SessionLocal()

    account = db.query(Account).filter(Account.id == 1).first()

    if not account:
        print("❌ No account found in DB. Add one before running.")
        return

    print("USING AWS PROFILE:", account.profile_name)

    aws_session = AWSSession(
        profile_name=account.profile_name,
        region_name=account.region
    )
    aws_session.initialize()

    scanner = Scanner(aws_session)
    regions = scanner.run()
    print(f"Discovered {len(regions)} AWS regions.")

    public_sgs = scanner.find_public_security_groups()
    print(f"Found {len(public_sgs)} public security groups.")

    threat_monitor = ThreatMonitor(
        aws_session=aws_session,
        execution_mode=EXECUTION_MODE,
        live_approved=LIVE_EXECUTION_APPROVED
    )
    monitor_findings = threat_monitor.start()
    summary = {
    "total_findings": 0,
    "planned": 0,
    "executed": 0,
    "skipped": 0
    }

    for finding in monitor_findings.get("public_security_groups", []):
        summary["total_findings"] += 1

        remediation = finding.get("remediation")
        execution = finding.get("execution")

        if remediation and remediation.get("action") != "NO_ACTION":
            summary["planned"] += 1

        if execution:
            if execution.get("status") == "DRY_RUN":
                summary["executed"] += 1
            elif execution.get("status") == "SKIPPED":
                summary["skipped"] += 1



    for finding in monitor_findings["public_security_groups"]:
        print("\n--- SECURITY FINDING ---")
        print(f"Resource: {finding['resource_name']} ({finding['resource_id']})")
        print(f"Region: {finding['region']}")
        print(f"Severity: {finding['severity']}")
        print(f"Protocols: {finding['protocols']}")
        print(f"Ports: {finding['ports']}")

        remediation = finding.get("remediation", {})
        execution = finding.get("execution", {})

        print("Remediation Action:", remediation.get("action"))
        print("Recommended Fix:", remediation.get("recommended_fix"))
        print("Execution Mode:", execution.get("status"))


    print(
      f"Threat monitor detected "
      f"{len(monitor_findings['public_security_groups'])} public security groups."
    )

    firewall = FirewallManager(aws_session)
    iam_manager = IAMManager(aws_session)
    history = ProtectionHistory()
    history_data = history.read_history()
    print(f"History contains {len(history_data)} recorded events.")

    history.record_event(
        event_type="public_security_groups",
        findings=monitor_findings["public_security_groups"]
    )

    print("\n--- EXECUTION SUMMARY ---")
    print(f"Total Findings       : {summary['total_findings']}")
    print(f"Planned Remediations : {summary['planned']}")
    print(f"Executed (DRY-RUN)   : {summary['executed']}")
    print(f"Skipped              : {summary['skipped']}")



    print("Cloud Security Panel bootstrapped.")


if __name__ == "__main__":
    main()
