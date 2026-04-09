import { useState, useEffect, useRef, memo } from 'react'
import axios from 'axios'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import {
    ShieldAlert, Play, Square, RefreshCw, AlertTriangle,
    CheckCircle, XCircle, Info, Globe, Key, Server,
    Database, Eye, Lock, Shield, Zap, Activity, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getModuleGroup } from '@/utils/getModuleGroup'

const API = 'http://localhost:8000'

const SEV = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.08)', border: 'rgba(209,50,18,0.22)', label: 'CRITICAL' },
    HIGH:     { color: '#e67e22', bg: 'rgba(230,126,34,0.08)', border: 'rgba(230,126,34,0.22)', label: 'HIGH' },
    MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)', label: 'MEDIUM' },
    LOW:      { color: '#0972d3', bg: 'rgba(9,114,211,0.08)',  border: 'rgba(9,114,211,0.22)',  label: 'LOW' },
}

const AWS_FACTS = [
    'AWS Shield Advanced protects against the largest DDoS attacks ever recorded.',
    'Amazon GuardDuty analyzes billions of events per day using machine learning.',
    'S3 Block Public Access can be enforced at the organization level via SCPs.',
    'IAM Access Analyzer continuously monitors resource policies for external access.',
    'AWS CloudTrail logs every API call across your entire AWS organization.',
    'VPC Flow Logs capture IP traffic at the network interface level — not just firewall hits.',
    'KMS key rotation never changes the key ID — only the backing key material rotates.',
    'Security Hub aggregates findings from 60+ AWS and partner security services.',
    'AWS Config can auto-remediate non-compliant resources via Systems Manager Automation.',
    'Macie uses ML to discover sensitive data in S3 — including PII, credentials, and secrets.',
    'Inspector v2 continuously scans EC2 and container images for CVEs.',
    'Secrets Manager automatically rotates RDS credentials without any downtime.',
]

const MONITOR_MSGS = [
    'Scanning IAM roles and trust policies...',
    'Checking S3 bucket public access settings...',
    'Probing EC2 security group inbound rules...',
    'Evaluating VPC flow log configurations...',
    'Detecting CloudTrail logging gaps...',
    'Scanning EBS encryption compliance...',
    'Analyzing KMS key rotation status...',
    'Checking NACL allow-all rules...',
    'Detecting unused Elastic IPs...',
    'Cross-referencing findings by severity...',
]

function findingIcon(type = '') {
    if (type.startsWith('S3')) return <Globe size={13} />
    if (type.startsWith('IAM')) return <Key size={13} />
    if (type.startsWith('EC2') || type.startsWith('EBS')) return <Server size={13} />
    if (type.startsWith('RDS')) return <Database size={13} />
    if (type.startsWith('CLOUDTRAIL') || type.startsWith('VPC_FLOW') || type.startsWith('CLOUDWATCH')) return <Eye size={13} />
    if (type.startsWith('SECURITY_GROUP') || type.startsWith('PUBLIC_SECURITY') || type.startsWith('NACL')) return <Lock size={13} />
    return <Shield size={13} />
}

const getModule = getModuleGroup


const SCAN_BANNERS = [
    { icon: '🔑', title: 'IAM Security', sub: 'Analyzing admin policies & privilege escalation paths' },
    { icon: '🌐', title: 'VPC Network', sub: 'Scanning security groups & flow log configurations' },
    { icon: '🔒', title: 'Key Management', sub: 'Checking KMS rotation & secret exposure patterns' },
    { icon: '📦', title: 'S3 Storage', sub: 'Detecting public buckets & missing encryption' },
    { icon: '💻', title: 'EC2 Compute', sub: 'Reviewing instance roles & EBS encryption status' },
    { icon: '📋', title: 'CloudTrail', sub: 'Verifying audit trail completeness & logging gaps' },
    { icon: '🔥', title: 'Threat Intel', sub: 'Cross-referencing against AWS threat signatures' },
    { icon: '🚨', title: 'Alert Engine', sub: 'Monitoring CRITICAL & HIGH severity changes live' },
    { icon: '🛡️', title: 'Firewall Rules', sub: 'Detecting over-permissive NACL & security groups' },
    { icon: '🗄️', title: 'RDS Databases', sub: 'Checking encryption, public access & backup policies' },
]


function ThreatRadar({ running, dark }) {
    const [angle, setAngle] = useState(0)
    const blips = [
        { cx: 38, cy: 28, c: '#d13212' }, { cx: 62, cy: 52, c: '#e67e22' },
        { cx: 28, cy: 58, c: '#d13212' }, { cx: 70, cy: 35, c: '#f59e0b' },
        { cx: 50, cy: 72, c: '#e67e22' },
    ]
    useEffect(() => {
        if (!running) return
        const iv = setInterval(() => setAngle(a => (a + 3) % 360), 25)
        return () => clearInterval(iv)
    }, [running])

    const toR = d => (d * Math.PI) / 180
    const sx = 50 + 44 * Math.cos(toR(angle - 90))
    const sy = 50 + 44 * Math.sin(toR(angle - 90))
    const tx = 50 + 44 * Math.cos(toR(angle - 125))
    const ty = 50 + 44 * Math.sin(toR(angle - 125))

    return (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }}>
            {/* Rings */}
            <circle cx="50" cy="50" r="48" fill={dark ? 'rgba(255,255,255,0.02)' : 'rgba(6,115,64,0.04)'} stroke={dark ? 'rgba(6,115,64,0.3)' : 'rgba(6,115,64,0.2)'} strokeWidth="0.8" />
            {[36, 24, 12].map(r => (
                <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={dark ? 'rgba(6,115,64,0.2)' : 'rgba(6,115,64,0.15)'} strokeWidth="0.6" strokeDasharray="3 3" />
            ))}
            <line x1="6" y1="50" x2="94" y2="50" stroke={dark ? 'rgba(6,115,64,0.2)' : 'rgba(6,115,64,0.15)'} strokeWidth="0.5" />
            <line x1="50" y1="6" x2="50" y2="94" stroke={dark ? 'rgba(6,115,64,0.2)' : 'rgba(6,115,64,0.15)'} strokeWidth="0.5" />
            {/* Sweep */}
            {running && (
                <>
                    <path d={`M50,50 L${tx},${ty} A44,44 0 0,1 ${sx},${sy} Z`} fill="rgba(6,115,64,0.18)" />
                    <line x1="50" y1="50" x2={sx} y2={sy} stroke="#067340" strokeWidth="2" strokeLinecap="round" />
                </>
            )}
            {/* Blips */}
            {running && blips.map((b, i) => (
                <circle key={i} cx={b.cx} cy={b.cy} r="2.5" fill={b.c} opacity="0.9">
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite" />
                    <animate attributeName="r" values="2.5;4;2.5" dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite" />
                </circle>
            ))}
            {/* Center dot */}
            <circle cx="50" cy="50" r="3" fill={running ? '#067340' : '#687078'} />
        </svg>
    )
}

const FindingCard = memo(function FindingCard({ f, dark }) {
    const [expanded, setExpanded] = useState(false)
    const sev = SEV[f.severity] || SEV.LOW
    const hasAutoFix = f.execution?.status === 'PLANNED'
    const isManual = f.execution?.status === 'INFO'

    return (
        <div style={{
            background: 'var(--bg2)', border: `1px solid ${sev.border}`,
            borderRadius: 8, overflow: 'hidden',
            boxShadow: 'var(--card-shadow)', transition: 'box-shadow 0.15s',
        }}>
            {/* Header */}
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${sev.border}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <div style={{ color: sev.color, flexShrink: 0, marginTop: 1 }}>{findingIcon(f.type)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{f.type}</div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{f.resource_id} · {f.region}</div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 3, padding: '2px 6px', fontFamily: 'monospace', flexShrink: 0 }}>{f.severity}</span>
                </div>
            </div>

            {/* Remediation strip */}
            <div style={{ padding: '8px 12px', background: hasAutoFix ? 'rgba(6,115,64,0.04)' : 'rgba(245,158,11,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {hasAutoFix
                        ? <><CheckCircle size={10} color="#067340" /><span style={{ fontSize: 10, fontWeight: 700, color: '#067340' }}>Auto-Fix Available</span></>
                        : <><Info size={10} color="#f59e0b" /><span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>Manual Review Required</span></>
                    }
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text3)', marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>
                        {f.execution?.action}
                    </span>
                </div>
                {f.remediation?.recommended_fix && (
                    <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5 }}>{f.remediation.recommended_fix}</div>
                )}
                {!f.remediation?.recommended_fix && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>{f.execution?.message}</div>
                )}

                {/* Expand for reason */}
                {f.remediation?.reason && (
                    <button onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 9, color: 'var(--text3)', fontWeight: 600 }}>
                        {expanded ? <><ChevronUp size={9} />Hide reason</> : <><ChevronDown size={9} />Why?</>}
                    </button>
                )}
                {expanded && f.remediation?.reason && (
                    <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text3)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 4 }}>{f.remediation.reason}</div>
                )}
            </div>
        </div>
    )
})

function FilterBar({ active, onChange, counts, modules, activeModule, onModule }) {
    const filters = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'AUTO-FIX', 'MANUAL']
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Module dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Module</span>
                <select
                    value={activeModule}
                    onChange={e => onModule(e.target.value)}
                    style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 10px',
                        borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--bg2)', color: 'var(--text)',
                        cursor: 'pointer', outline: 'none', minWidth: 140,
                    }}
                >
                    {modules.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m}</option>)}
                </select>
            </div>

            {/* Severity filter pills */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {filters.map(f => {
                    const count = counts[f] ?? 0
                    const isActive = active === f
                    const sev = SEV[f]
                    return (
                        <button key={f} onClick={() => onChange(f)} style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                            border: `1px solid ${isActive ? (sev?.color || '#FF9900') : 'var(--border)'}`,
                            background: isActive ? (sev ? sev.bg : 'rgba(255,153,0,0.1)') : 'transparent',
                            color: isActive ? (sev?.color || '#FF9900') : 'var(--text3)',
                            cursor: 'pointer', transition: 'all 0.12s',
                        }}>
                            {f} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}


export default function ThreatsSection({ dark }) {
    const { account } = useAuth()
    const { scanId, status: scanStatus, findings: scanFindings } = useScan()

    const isIam = account?.account_type === 'iam'
    const awsId = isIam ? (account?.parent_aws_account_id || '—') : (account?.aws_account_id || '—')
    const dbId  = isIam ? account?.account_id : account?.id

    const [monitorStatus, setMonitorStatus] = useState(null)
    const [toggling, setToggling] = useState(false)
    const monitorRunning = monitorStatus?.running === true

    const [threats, setThreats] = useState(null)
    const [loadingThreats, setLoadingThreats] = useState(false)
    const [threatError, setThreatError] = useState(null)
    const [activeScanId, setActiveScanId] = useState(scanId || null)

    const [filter, setFilter] = useState('ALL')
    const [moduleFilter, setModuleFilter] = useState('ALL')
    const [msgIdx, setMsgIdx] = useState(0)
    const [factIdx, setFactIdx] = useState(0)
    const msgRef = useRef(null)
    const factRef = useRef(null)

    useEffect(() => {
        fetchStatus()
        const iv = setInterval(fetchStatus, 8000)
        return () => clearInterval(iv)
    }, [])

    useEffect(() => {
        if (!monitorRunning) { clearInterval(msgRef.current); return }
        msgRef.current = setInterval(() => setMsgIdx(i => (i + 1) % MONITOR_MSGS.length), 2500)
        return () => clearInterval(msgRef.current)
    }, [monitorRunning])

    useEffect(() => {
        factRef.current = setInterval(() => setFactIdx(i => (i + 1) % AWS_FACTS.length), 5000)
        return () => clearInterval(factRef.current)
    }, [])

    useEffect(() => {
        if (scanId && scanStatus === 'done') {
            setActiveScanId(scanId)
            runThreatAnalysis(scanId)
        }
    }, [scanId, scanStatus])

    useEffect(() => {
        if (!scanId && dbId) fetchLatestScan()
    }, [scanId, dbId])

    async function fetchLatestScan() {
        try {
            const r = await axios.get(`${API}/api/scan/history?account_id=${dbId}&limit=1`)
            const scans = r.data?.data?.scans || []
            if (scans.length > 0) {
                const latest = scans[0]
                setActiveScanId(latest.scan_id)
                runThreatAnalysis(latest.scan_id)
            }
        } catch { /* silent */ }
    }

    async function fetchStatus() {
        try {
            const r = await axios.get(`${API}/api/threats/monitor/status`)
            setMonitorStatus(r.data?.data || null)
        } catch { setMonitorStatus(null) }
    }

    async function toggle() {
        if (toggling) return
        setToggling(true)
        const wasRunning = monitorRunning
        setMonitorStatus(prev => ({ ...(prev || {}), running: !wasRunning }))
        try {
            if (wasRunning) {
                await axios.post(`${API}/api/threats/monitor/stop`)
            } else {
                await axios.post(`${API}/api/threats/monitor/start`, { account_id: awsId })
            }
            setTimeout(() => { fetchStatus(); setToggling(false) }, 500)
        } catch {
            setMonitorStatus(prev => ({ ...(prev || {}), running: wasRunning }))
            setToggling(false)
        }
    }

    async function runThreatAnalysis(sid) {
        if (!sid) return
        setLoadingThreats(true)
        setThreatError(null)
        try {
            const r = await axios.post(`${API}/api/threats/`, { scan_id: sid })
            const data = r.data?.data || null
            if (data) setThreats(data)
            else setThreatError('No threat data returned.')
        } catch (e) {
            setThreatError(e.response?.data?.detail || 'Failed to load threat analysis.')
        } finally { setLoadingThreats(false) }
    }

    const allFindings = threats?.findings || []

    const moduleList = ['ALL', ...Array.from(new Set(allFindings.map(f => getModule(f.type)))).sort()]

    const filtered = allFindings.filter(f => {
        const modOk = moduleFilter === 'ALL' || getModule(f.type) === moduleFilter
        if (!modOk) return false
        if (filter === 'ALL') return true
        if (filter === 'AUTO-FIX') return f.execution?.status === 'PLANNED'
        if (filter === 'MANUAL') return f.execution?.status === 'INFO'
        return f.severity === filter
    })
    const counts = {
        ALL: allFindings.filter(f => moduleFilter === 'ALL' || getModule(f.type) === moduleFilter).length,
        CRITICAL: allFindings.filter(f => f.severity === 'CRITICAL' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
        HIGH: allFindings.filter(f => f.severity === 'HIGH' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
        MEDIUM: allFindings.filter(f => f.severity === 'MEDIUM' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
        LOW: allFindings.filter(f => f.severity === 'LOW' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
        'AUTO-FIX': allFindings.filter(f => f.execution?.status === 'PLANNED' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
        'MANUAL': allFindings.filter(f => f.execution?.status === 'INFO' && (moduleFilter === 'ALL' || getModule(f.type) === moduleFilter)).length,
    }

    const hasScan = !!(activeScanId)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Threat Monitor</h1>
                        <span style={{
                            fontSize: 9, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: monitorRunning ? '#067340' : '#687078',
                            background: monitorRunning ? 'rgba(6,115,64,0.1)' : 'rgba(105,112,119,0.1)',
                            border: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.25)' : 'rgba(105,112,119,0.2)'}`,
                        }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: monitorRunning ? '#067340' : '#687078', display: 'inline-block', animation: monitorRunning ? 'pulse 1.5s ease infinite' : 'none' }} />
                            {monitorRunning ? 'LIVE' : 'OFFLINE'}
                        </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text2)' }}>{awsId}</span>
                        {threats && <span> · {threats.total_findings} threats analyzed</span>}
                    </div>
                </div>
                {hasScan && (
                    <button onClick={() => runThreatAnalysis(activeScanId)} disabled={loadingThreats} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                        borderRadius: 6, background: 'var(--bg2)', color: 'var(--text2)',
                        border: '1px solid var(--border)', cursor: loadingThreats ? 'not-allowed' : 'pointer',
                        fontSize: 11, fontWeight: 600,
                    }}>
                        <RefreshCw size={11} style={{ animation: loadingThreats ? 'spin 0.7s linear infinite' : 'none' }} />
                        Re-analyze
                    </button>
                )}
            </div>

            {/* ── MONITOR CONTROL CARD ── */}
            <div style={{
                background: 'var(--bg2)',
                border: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.3)' : 'var(--border)'}`,
                borderRadius: 12, overflow: 'hidden',
                boxShadow: monitorRunning ? '0 0 32px rgba(6,115,64,0.08)' : 'var(--card-shadow)',
                transition: 'border-color 0.4s, box-shadow 0.4s',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 200 }}>

                    {/* Radar panel */}
                    <div style={{
                        background: monitorRunning
                            ? (dark ? 'rgba(6,115,64,0.08)' : 'rgba(6,115,64,0.05)')
                            : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(35,47,62,0.02)'),
                        borderRight: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.2)' : 'var(--border)'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: 20, gap: 10, transition: 'background 0.4s',
                    }}>
                        <div style={{ width: 130, height: 130, position: 'relative' }}>
                            {/* Pulse rings when running */}
                            {monitorRunning && [0, 1, 2].map(i => (
                                <div key={i} style={{
                                    position: 'absolute', inset: -i * 8 - 4,
                                    borderRadius: '50%',
                                    border: `1.5px solid rgba(6,115,64,${0.35 - i * 0.1})`,
                                    animation: `overviewPulseRing ${2 + i * 0.4}s ease-out ${i * 0.5}s infinite`,
                                }} />
                            ))}
                            <ThreatRadar running={monitorRunning} dark={dark} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: monitorRunning ? '#067340' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                {monitorRunning ? 'Monitoring' : 'Standby'}
                            </div>
                            {monitorStatus?.interval && (
                                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>Every {monitorStatus.interval}s</div>
                            )}
                        </div>
                    </div>

                    {/* Control panel */}
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Real-Time Threat Detection</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 480 }}>
                                Continuously scans your AWS environment for new and resolved security findings. Detects CRITICAL and HIGH severity threats and generates instant alerts.
                            </div>

                            {/* Running status ticker */}
                            {monitorRunning && (
                                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#067340', fontFamily: 'monospace', fontWeight: 600 }}>
                                    <Activity size={10} color="#067340" style={{ animation: 'pulse 1s ease infinite' }} />
                                    {MONITOR_MSGS[msgIdx]}
                                </div>
                            )}

                            {/* Stopped state hint */}
                            {!monitorRunning && !toggling && (
                                <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ShieldAlert size={10} color="var(--text3)" />
                                    Real-time protection is currently OFF. Start the monitor to enable continuous scanning.
                                </div>
                            )}
                        </div>

                        {/* Stats row when running */}
                        {monitorRunning && monitorStatus && (
                            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                                {[
                                    { label: 'Status', value: monitorStatus.running ? 'Running' : 'Stopped', color: '#067340' },
                                    { label: 'Interval', value: `${monitorStatus.interval || 60}s`, color: 'var(--text)' },
                                    { label: 'Last Run', value: monitorStatus.last_run ? new Date(monitorStatus.last_run).toLocaleTimeString() : '—', color: 'var(--text)' },
                                ].map(s => (
                                    <div key={s.label}>
                                        <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Start / Stop button */}
                        <div style={{ marginTop: 16 }}>
                            <button onClick={toggle} disabled={toggling} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                cursor: toggling ? 'wait' : 'pointer', border: 'none',
                                transition: 'all 0.2s',
                                ...(monitorRunning
                                    ? { background: 'rgba(209,50,18,0.1)', color: '#d13212', border: '1.5px solid rgba(209,50,18,0.3)' }
                                    : { background: '#067340', color: '#fff', boxShadow: '0 4px 14px rgba(6,115,64,0.35)' }
                                ),
                                opacity: toggling ? 0.7 : 1,
                            }}
                                onMouseEnter={e => { if (!toggling && !monitorRunning) e.currentTarget.style.background = '#055c34' }}
                                onMouseLeave={e => { if (!toggling && !monitorRunning) e.currentTarget.style.background = '#067340' }}
                            >
                                {toggling
                                    ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${monitorRunning ? 'rgba(209,50,18,0.3)' : 'rgba(255,255,255,0.3)'}`, borderTopColor: monitorRunning ? '#d13212' : '#fff', animation: 'spin 0.7s linear infinite' }} />Updating...</>
                                    : monitorRunning
                                        ? <><Square size={13} fill="#d13212" />Stop Monitor</>
                                        : <><Play size={13} fill="#fff" />Start Monitor</>
                                }
                            </button>
                        </div>
                    </div>
                </div>

                {/* AWS Fact ticker at bottom */}
                <div style={{
                    borderTop: `1px solid var(--border)`, padding: '8px 20px',
                    background: dark ? 'rgba(255,255,255,0.015)' : 'rgba(35,47,62,0.02)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <Zap size={10} color="#FF9900" />
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>
                        <strong style={{ color: '#FF9900', fontStyle: 'normal' }}>AWS Fact:</strong> {AWS_FACTS[factIdx]}
                    </span>
                </div>
            </div>

            {/* ── THREAT ANALYSIS SECTION ── */}
            <div style={{ minHeight: 380 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <AlertTriangle size={13} color="#FF9900" />
                        Threat Analysis
                        {threats && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', fontFamily: 'monospace' }}>· {threats.total_findings} findings</span>}
                    </div>
                    {threats && (
                        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text3)' }}>
                            <span style={{ color: '#067340', fontWeight: 700 }}>{counts['AUTO-FIX']} auto-fixable</span>
                            <span>·</span>
                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{counts['MANUAL']} manual</span>
                        </div>
                    )}
                </div>

                {/* No scan yet — full SOC animated empty state */}
                {!hasScan && !loadingThreats && !threats && (() => {
                    const ORG  = { color: '#FF9900',  glow: 'rgba(255,153,0,0.2)'   }  // AWS orange — primary
                    const BLU  = { color: '#5b9bd5',  glow: 'rgba(91,155,213,0.2)'  }  // AWS steel blue — infra/network
                    const GRN  = { color: '#3ea97c',  glow: 'rgba(62,169,124,0.2)'  }  // AWS teal-green — compliance
                    const MODULE_CARDS = [
                        { icon: '🔑', title: 'IAM Security',    sub: 'Admin policies & privilege paths',   ...ORG },
                        { icon: '🌐', title: 'VPC Network',     sub: 'Security groups & flow logs',        ...BLU },
                        { icon: '📦', title: 'S3 Storage',      sub: 'Public buckets & encryption gaps',   ...ORG },
                        { icon: '💻', title: 'EC2 Compute',     sub: 'Instance roles & EBS status',        ...BLU },
                        { icon: '📋', title: 'CloudTrail',      sub: 'Audit trail & logging gaps',         ...GRN },
                        { icon: '🔥', title: 'Threat Intel',    sub: 'AWS threat signature matching',      ...ORG },
                        { icon: '🛡️', title: 'Firewall',        sub: 'NACL & security group rules',        ...GRN },
                        { icon: '🗄️', title: 'RDS Databases',   sub: 'Encryption & public access',         ...BLU },
                        { icon: '🔒', title: 'KMS Keys',        sub: 'Rotation & secret exposure',         ...GRN },
                        { icon: '🚨', title: 'Alert Engine',    sub: 'CRITICAL & HIGH severity watch',     ...ORG },
                    ]
                    return (
                    <div style={{
                        background: 'linear-gradient(160deg, #fffcf5 0%, #fff8ec 60%, #fffcf5 100%)',
                        border: '1px solid rgba(232,154,0,0.28)',
                        borderRadius: 14, overflow: 'hidden',
                        boxShadow: '0 1px 8px rgba(255,153,0,0.08), 0 2px 16px rgba(15,17,17,0.06)',
                        marginBottom: 60,
                    }}>
                        <style>{`
                            @keyframes threatMarquee {
                                0%   { transform: translateX(0) }
                                100% { transform: translateX(-50%) }
                            }
                            @keyframes socPulse {
                                0%, 100% { transform: scale(1); opacity: 0.6 }
                                50%       { transform: scale(1.65); opacity: 0 }
                            }
                            @keyframes socBlink {
                                0%, 100% { opacity: 1 } 50% { opacity: 0 }
                            }
                            @keyframes socGlow {
                                0%, 100% { box-shadow: 0 0 14px rgba(255,153,0,0.25) }
                                50%       { box-shadow: 0 0 28px rgba(255,153,0,0.45) }
                            }
                            @keyframes socScan {
                                0%   { width: 0% }
                                70%  { width: 100% }
                                100% { width: 100% }
                            }
                        `}</style>

                        {/* Compact single-row layout */}
                        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', gap: 24 }}>

                            {/* Shield */}
                            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <div style={{ position: 'relative', width: 72, height: 72 }}>
                                    {[0,1].map(i => (
                                        <div key={i} style={{
                                            position: 'absolute',
                                            inset: -i * 10 - 3,
                                            borderRadius: '50%',
                                            border: `1.5px solid rgba(232,154,0,${0.45 - i * 0.18})`,
                                            animation: `socPulse ${2 + i * 0.6}s ease-out ${i * 0.7}s infinite`,
                                        }} />
                                    ))}
                                    <div style={{
                                        width: 72, height: 72, borderRadius: '50%',
                                        background: '#fff9ee',
                                        border: '2px solid rgba(232,154,0,0.45)',
                                        boxShadow: 'inset 0 0 24px rgba(255,153,0,0.12)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 28, animation: 'socGlow 2.5s ease infinite',
                                    }}>🛡️</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#c07000', fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>THREAT ENGINE</div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 3 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF9900', display: 'inline-block', animation: 'socBlink 1s ease infinite' }} />
                                        <span style={{ fontSize: 8.5, color: '#8d9191', fontFamily: 'monospace' }}>STANDBY</span>
                                    </div>
                                </div>
                            </div>

                            {/* Divider */}
                            <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(232,154,0,0.2)', flexShrink: 0 }} />

                            {/* Module bars — 2 columns */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#c07000', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                                    MODULE STATUS
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 20px' }}>
                                    {[
                                        { name: 'IAM',        color: '#e07b00' },
                                        { name: 'EC2 / EBS',  color: '#5b9bd5' },
                                        { name: 'S3',         color: '#e07b00' },
                                        { name: 'VPC',        color: '#5b9bd5' },
                                        { name: 'CloudTrail', color: '#3ea97c' },
                                        { name: 'Firewall',   color: '#3ea97c' },
                                    ].map((m, i) => (
                                        <div key={m.name}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                <span style={{ fontSize: 9.5, color: '#3d4f60', fontWeight: 600 }}>{m.name}</span>
                                                <span style={{ fontSize: 8.5, color: m.color, fontWeight: 700, fontFamily: 'monospace' }}>READY</span>
                                            </div>
                                            <div style={{ height: 3, background: 'rgba(35,47,62,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 3,
                                                    background: `linear-gradient(90deg, ${m.color}, ${m.color}99)`,
                                                    width: '100%',
                                                    animation: `socScan 1.6s ease ${i * 0.12}s both`,
                                                }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: '#8d9191', fontFamily: 'monospace' }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1d8102', display: 'inline-block', animation: 'socBlink 1.2s ease infinite' }} />
                                    All engines online · Run a scan from Overview or Scanner to begin threat analysis
                                </div>
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(232,154,0,0.25), transparent)' }} />

                        {/* Scrolling module cards */}
                        <div style={{ overflow: 'hidden', padding: '12px 0' }}>
                            <div style={{
                                display: 'flex', gap: 10, paddingLeft: 16,
                                width: 'max-content',
                                animation: 'threatMarquee 30s linear infinite',
                                willChange: 'transform',
                            }}>
                                {[...MODULE_CARDS, ...MODULE_CARDS].map((b, i) => (
                                    <div key={i} style={{
                                        flexShrink: 0, width: 148,
                                        background: '#ffffff',
                                        border: `1px solid ${b.color}33`,
                                        borderLeft: `3px solid ${b.color}`,
                                        borderRadius: 8, padding: '10px 12px',
                                        boxShadow: '0 1px 4px rgba(15,17,17,0.07)',
                                        position: 'relative', overflow: 'hidden',
                                    }}>
                                        <div style={{ position: 'absolute', top: -8, right: -8, fontSize: 30, opacity: 0.05 }}>{b.icon}</div>
                                        <div style={{ fontSize: 16, marginBottom: 5, position: 'relative' }}>{b.icon}</div>
                                        <div style={{ fontSize: 9.5, fontWeight: 800, color: b.color, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3, position: 'relative' }}>{b.title}</div>
                                        <div style={{ fontSize: 9, color: '#565959', lineHeight: 1.4, position: 'relative' }}>{b.sub}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    )
                })()}



                {/* Loading */}
                {loadingThreats && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '48px 24px', textAlign: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(255,153,0,0.2)', borderTopColor: '#FF9900', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Analyzing threats and building remediation plan...</div>
                    </div>
                )}

                {/* Error */}
                {threatError && !loadingThreats && (
                    <div style={{ background: 'rgba(209,50,18,0.06)', border: '1px solid rgba(209,50,18,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <XCircle size={13} color="#d13212" />
                        <span style={{ fontSize: 11, color: '#d13212', fontWeight: 600 }}>{threatError}</span>
                    </div>
                )}

                {/* Findings grid */}
                {threats && !loadingThreats && (
                    <>
                        {/* Filter bar */}
                        <div style={{ marginBottom: 10 }}>
                            <FilterBar
                                active={filter} onChange={f => { setFilter(f) }}
                                counts={counts}
                                modules={moduleList}
                                activeModule={moduleFilter}
                                onModule={m => { setModuleFilter(m); setFilter('ALL') }}
                            />
                        </div>

                        {filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: 12 }}>
                                <CheckCircle size={24} color="#067340" style={{ display: 'block', margin: '0 auto 8px' }} />
                                No findings match this filter.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                {filtered.map(f => (
                                    <FindingCard key={f.id} f={f} dark={dark} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
