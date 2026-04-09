/**
 * Canonical finding-type → module/service group mapping.
 * Single source of truth used by ScannerSection, ThreatsSection, RemediationSection.
 *
 * Every new finding type added to the backend MUST be mapped here.
 */

/**
 * Returns the module/group name for a given finding type.
 * Used for: module dropdown filter in Scanner & Threats sections.
 *
 * Categories: IAM | S3 | EC2 | RDS | CloudTrail | CloudWatch | KMS | VPC | Firewall | Network | Other
 */
export function getModuleGroup(type = '') {
    const t = String(type).toUpperCase()

    if (t.startsWith('IAM'))                                      return 'IAM'
    if (t.startsWith('S3'))                                       return 'S3'
    if (t.startsWith('EC2') || t.startsWith('EBS') || t.startsWith('PUBLIC_EC2')) return 'EC2'
    if (t.startsWith('RDS'))                                      return 'RDS'
    if (t.startsWith('CLOUDTRAIL'))                               return 'CloudTrail'
    if (t.startsWith('CLOUDWATCH'))                               return 'CloudWatch'
    if (t.startsWith('KMS'))                                      return 'KMS'
    // VPC family — MUST come before SECURITY_GROUP/NACL/ROUTE so VPC_FLOW is caught here
    if (
        t.startsWith('VPC') ||
        t.startsWith('INTERNET_GATEWAY') ||
        t.startsWith('PUBLIC_SUBNET') ||
        t === 'DEFAULT_VPC_EXISTS'
    ) return 'VPC'
    // Firewall: Security Groups + NACLs + unused SGs
    if (
        t.startsWith('SECURITY_GROUP') ||
        t.startsWith('PUBLIC_SECURITY') ||
        t.startsWith('NACL') ||
        t === 'UNUSED_SECURITY_GROUP'
    ) return 'Firewall'
    // Network: Route tables
    if (t.startsWith('ROUTE'))                                    return 'Network'

    return 'Other'
}


/**
 * Returns the service tag for a given finding type.
 * Used for: service dropdown filter in RemediationSection.
 * Same mapping as getModuleGroup — aliases it for semantic clarity.
 */
export const getServiceTag = getModuleGroup
