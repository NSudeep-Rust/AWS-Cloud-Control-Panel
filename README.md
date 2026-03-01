# Cloud Security Panel

Cloud Security Panel is a defensive AWS security platform designed to detect
cloud misconfigurations and apply controlled remediation with strict safety
gates.

The system separates detection, planning, and execution to ensure that
no destructive action is taken without explicit approval and auditability.

It follows a Microsoft Defender–style workflow:
Detect → Review → Approve → Fix.


---

## Why This Project Exists

Cloud environments are frequently misconfigured due to human error,
rapid deployments, and lack of continuous review. These misconfigurations
often lead to data exposure, account compromise, or privilege escalation.

Cloud Security Panel focuses on:
- Detecting risky cloud configurations
- Explaining why they are dangerous
- Preventing unsafe automatic changes
- Allowing controlled, auditable remediation

---

## How the System Works

The system is intentionally divided into strict layers:

1. **Scanner**
   - Reads AWS configuration data
   - Detects security risks (e.g. public security groups)

2. **Threat Monitor**
   - Normalizes findings
   - Groups risks by resource and region
   - Attaches remediation recommendations

3. **Remediation Planner**
   - Decides *what* should be done
   - Never performs actions directly

4. **Remediation Executor**
   - Executes actions only when allowed
   - Defaults to DRY-RUN mode
   - Blocks unsafe or unapproved changes

5. **Protection History**
   - Stores every finding and decision
   - Prevents repeated execution
   - Enables auditing and rollback review

---

## Safety-First Design

This project is designed to be safe by default:

- No live remediation runs without explicit approval
- Execution mode must be intentionally switched to LIVE
- All actions are logged before execution
- Repeated executions are blocked automatically

This makes the system suitable for learning, auditing,
and controlled production use.


---

## Setup and Execution Flow

### Prerequisites

- Python 3.9 or later
- An AWS account
- AWS CLI configured on the local machine

The project uses AWS SDK (boto3) and follows AWS best practices
for authentication and authorization.

---

### AWS Authentication Model

Cloud Security Panel does not store AWS credentials.

Authentication is handled through:
- AWS CLI profiles (for local development)
- IAM roles with STS (planned for production use)

All AWS access is read-only by default.

---

### Running the Project

1. Clone the repository
2. Create and activate a Python virtual environment
3. Install dependencies
4. Configure AWS credentials using `aws configure`
5. Run the application:

```bash
python app/main.py

---

## Security Guarantees

Cloud Security Panel is designed with strict safety guarantees to prevent
accidental or unauthorized changes to cloud environments.

The system enforces the following guarantees:

- Live remediation is disabled by default
- Explicit user approval is required for any LIVE execution
- Only allow-listed remediation actions can ever be executed
- IAM-related findings are never auto-remediated
- All remediation actions are tracked in execution history
- Duplicate or repeated executions are automatically blocked
- DRY-RUN previews are available for all supported remediations

These guarantees ensure that the system can be safely used on real AWS
accounts without risk of unintended impact.
