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

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

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

// ── Enhanced Threat Radar ──────────────────────────────────────────────
function ThreatRadar({ running, dark }) {
    const [angle, setAngle] = useState(0)
    const blips = [
        { cx: 36, cy: 26, c: '#d13212', r: 2.8 },
        { cx: 64, cy: 54, c: '#e67e22', r: 2.2 },
        { cx: 26, cy: 60, c: '#d13212', r: 2.0 },
        { cx: 72, cy: 33, c: '#f59e0b', r: 1.8 },
        { cx: 50, cy: 74, c: '#e67e22', r: 2.4 },
        { cx: 41, cy: 43, c: '#d13212', r: 2.6 },
    ]
    useEffect(() => {
        if (!running) return
        const iv = setInterval(() => setAngle(a => (a + 2) % 360), 20)
        return () => clearInterval(iv)
    }, [running])

    const toR = d => (d * Math.PI) / 180
    const sweepDeg = 38
    const sx = 50 + 44 * Math.cos(toR(angle - 90))
    const sy = 50 + 44 * Math.sin(toR(angle - 90))
    const tx = 50 + 44 * Math.cos(toR(angle - 90 - sweepDeg))
    const ty = 50 + 44 * Math.sin(toR(angle - 90 - sweepDeg))

    const gc = 'rgba(6,115,64,0.14)'
    const lc = 'rgba(6,115,64,0.28)'

    return (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }}>
            {/* Background */}
            <circle cx="50" cy="50" r="48" fill={dark ? 'rgba(6,115,64,0.04)' : 'rgba(6,115,64,0.03)'} />

            {/* 5 concentric rings */}
            {[8, 16, 24, 32, 40].map(r => (
                <circle key={r} cx="50" cy="50" r={r} fill="none"
                    stroke={r === 40 ? lc : gc}
                    strokeWidth={r === 40 ? 0.8 : 0.5}
                    strokeDasharray={r < 40 ? '2.5 3' : undefined}
                />
            ))}

            {/* 8 spokes (cardinal + diagonal) */}
            {[0, 45, 90, 135].map(deg => {
                const c = Math.cos(toR(deg)), s = Math.sin(toR(deg))
                return (
                    <line key={deg}
                        x1={50 - 44 * c} y1={50 - 44 * s}
                        x2={50 + 44 * c} y2={50 + 44 * s}
                        stroke={deg % 90 === 0 ? lc : gc}
                        strokeWidth={deg % 90 === 0 ? 0.55 : 0.3}
                    />
                )
            })}

            {/* Outer border ring */}
            <circle cx="50" cy="50" r="47" fill="none" stroke={lc} strokeWidth="0.6" />

            {/* Tick marks every 15° */}
            {Array.from({ length: 24 }, (_, i) => {
                const a = i * 15
                const cc = Math.cos(toR(a - 90)), ss = Math.sin(toR(a - 90))
                const inner = i % 6 === 0 ? 40 : 43.5
                return (
                    <line key={i}
                        x1={50 + inner * cc} y1={50 + inner * ss}
                        x2={50 + 46.5 * cc} y2={50 + 46.5 * ss}
                        stroke={lc} strokeWidth={i % 6 === 0 ? 0.9 : 0.4}
                    />
                )
            })}

            {/* Sweep */}
            {running && (
                <>
                    <path d={`M50,50 L${tx},${ty} A44,44 0 0,1 ${sx},${sy} Z`}
                        fill="rgba(6,115,64,0.18)" />
                    {/* Fading ghost arc */}
                    <path d={`M50,50 L${50 + 44 * Math.cos(toR(angle - 90 - sweepDeg * 0.6))},${50 + 44 * Math.sin(toR(angle - 90 - sweepDeg * 0.6))} A44,44 0 0,1 ${tx},${ty} Z`}
                        fill="rgba(6,115,64,0.07)" />
                    {/* Sweep arm */}
                    <line x1="50" y1="50" x2={sx} y2={sy}
                        stroke="#067340" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
                    {/* Tip glow */}
                    <circle cx={sx} cy={sy} r="2.2" fill="#3fb950" opacity="0.85">
                        <animate attributeName="opacity" values="0.85;0.3;0.85" dur="0.6s" repeatCount="indefinite" />
                    </circle>
                </>
            )}

            {/* Blips */}
            {running && blips.map((b, i) => (
                <g key={i}>
                    <circle cx={b.cx} cy={b.cy} r={b.r * 2.2} fill={b.c} opacity="0">
                        <animate attributeName="r" values={`${b.r};${b.r * 3.5};${b.r}`} dur={`${1.8 + i * 0.25}s`} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.45;0;0.45" dur={`${1.8 + i * 0.25}s`} repeatCount="indefinite" />
                    </circle>
                    <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.c} opacity="0.9">
                        <animate attributeName="opacity" values="0.9;0.4;0.9" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                    </circle>
                </g>
            ))}

            {/* Static standby dots (not running) */}
            {!running && [
                { cx: 36, cy: 26 }, { cx: 64, cy: 54 }, { cx: 26, cy: 60 },
                { cx: 72, cy: 33 }, { cx: 50, cy: 74 },
            ].map((b, i) => (
                <circle key={i} cx={b.cx} cy={b.cy} r="1.5" fill="#687078" opacity="0.35" />
            ))}

            {/* Center */}
            <circle cx="50" cy="50" r="3" fill={running ? '#067340' : '#687078'} />
            <circle cx="50" cy="50" r="1.2" fill={running ? '#3fb950' : '#8d9191'} />
        </svg>
    )
}

// ── Finding Card (unchanged) ───────────────────────────────────────────
const FindingCard = memo(function FindingCard({ f, dark }) {
    const [expanded, setExpanded] = useState(false)
    const sev = SEV[f.severity] || SEV.LOW
    const hasAutoFix = f.execution?.status === 'PLANNED'

    return (
        <div style={{
            background: 'var(--bg2)', border: `1px solid ${sev.border}`,
            borderRadius: 8, overflow: 'hidden',
            boxShadow: 'var(--card-shadow)', transition: 'box-shadow 0.15s',
        }}>
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

// ── Filter Bar (unchanged) ─────────────────────────────────────────────
function FilterBar({ active, onChange, counts, modules, activeModule, onModule }) {
    const filters = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'AUTO-FIX', 'MANUAL']
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Module</span>
                <select value={activeModule} onChange={e => onModule(e.target.value)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', outline: 'none', minWidth: 140 }}>
                    {modules.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m}</option>)}
                </select>
            </div>
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

// ── Main Component ─────────────────────────────────────────────────────
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
        const sev = (f.severity || '').toUpperCase()
        if (filter === 'ALL') return true
        if (filter === 'AUTO-FIX') return f.execution?.status === 'PLANNED'
        if (filter === 'MANUAL') return f.execution?.status === 'INFO'
        return sev === filter
    })
    const modOk = f => moduleFilter === 'ALL' || getModule(f.type) === moduleFilter
    const counts = {
        ALL:        allFindings.filter(f => modOk(f)).length,
        CRITICAL:   allFindings.filter(f => modOk(f) && (f.severity||'').toUpperCase() === 'CRITICAL').length,
        HIGH:       allFindings.filter(f => modOk(f) && (f.severity||'').toUpperCase() === 'HIGH').length,
        MEDIUM:     allFindings.filter(f => modOk(f) && (f.severity||'').toUpperCase() === 'MEDIUM').length,
        LOW:        allFindings.filter(f => modOk(f) && (f.severity||'').toUpperCase() === 'LOW').length,
        'AUTO-FIX': allFindings.filter(f => modOk(f) && f.execution?.status === 'PLANNED').length,
        'MANUAL':   allFindings.filter(f => modOk(f) && f.execution?.status === 'INFO').length,
    }
    const hasScan = !!(activeScanId)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <style>{`
                @keyframes shimmer      { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                @keyframes threatMarq   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
                @keyframes socPulse     { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.7);opacity:0} }
                @keyframes socBlink     { 0%,100%{opacity:1} 50%{opacity:0} }
                @keyframes socGlow      { 0%,100%{box-shadow:0 0 14px rgba(6,115,64,0.25)} 50%{box-shadow:0 0 28px rgba(6,115,64,0.5)} }
                @keyframes socScan      { 0%{width:0%} 70%,100%{width:100%} }
                @keyframes fadeSlideUp  { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
                @keyframes tickerFade   { 0%,100%{opacity:0} 15%,85%{opacity:1} }
            `}</style>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Threat Monitor</h1>
                        {/* Live / Offline badge */}
                        <span style={{
                            fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '3px 10px',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            color: monitorRunning ? '#067340' : '#687078',
                            background: monitorRunning ? 'rgba(6,115,64,0.1)' : 'rgba(105,112,119,0.08)',
                            border: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.3)' : 'rgba(105,112,119,0.2)'}`,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: monitorRunning ? '#067340' : '#687078', display: 'inline-block', animation: monitorRunning ? 'pulse 1.5s ease infinite' : 'none' }} />
                            {monitorRunning ? 'LIVE' : 'OFFLINE'}
                        </span>
                        {threats && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#FF9900', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.22)', borderRadius: 4, padding: '2px 8px' }}>
                                {threats.total_findings} threats analyzed
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
                        {awsId} · Continuous AWS Security Monitoring
                    </div>
                </div>
                {hasScan && (
                    <button onClick={() => runThreatAnalysis(activeScanId)} disabled={loadingThreats} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                        borderRadius: 7, background: 'var(--bg2)', color: 'var(--text2)',
                        border: '1px solid var(--border)', cursor: loadingThreats ? 'not-allowed' : 'pointer',
                        fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
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
                borderRadius: 12,
                boxShadow: monitorRunning ? '0 0 32px rgba(6,115,64,0.08), var(--card-shadow)' : 'var(--card-shadow)',
                transition: 'border-color 0.4s, box-shadow 0.4s',
                overflow: 'hidden',
            }}>
                {/* Colored top bar */}
                <div style={{ height: 2, background: monitorRunning ? 'linear-gradient(90deg, #067340, #1d8102, #067340)' : 'var(--border)', backgroundSize: '200%', animation: monitorRunning ? 'shimmer 3s linear infinite' : 'none', transition: 'background 0.5s' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', minHeight: 210 }}>
                    {/* LEFT — Radar panel */}
                    <div style={{
                        background: monitorRunning ? 'rgba(6,115,64,0.04)' : 'rgba(35,47,62,0.02)',
                        borderRight: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.18)' : 'var(--border)'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '20px 16px', gap: 10, transition: 'background 0.4s',
                    }}>
                        {/* Radar with pulse rings */}
                        <div style={{ position: 'relative', width: 148, height: 148 }}>
                            {monitorRunning && [0, 1, 2].map(i => (
                                <div key={i} style={{
                                    position: 'absolute', inset: -i * 9 - 5,
                                    borderRadius: '50%',
                                    border: `1.5px solid rgba(6,115,64,${0.38 - i * 0.11})`,
                                    animation: `overviewPulseRing ${2.2 + i * 0.4}s ease-out ${i * 0.55}s infinite`,
                                }} />
                            ))}
                            <ThreatRadar running={monitorRunning} dark={dark} />
                        </div>
                        {/* Status label */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2,
                                color: monitorRunning ? '#067340' : 'var(--text3)',
                            }}>
                                {monitorRunning ? '⬤ Monitoring' : '◯ Standby'}
                            </div>
                            {monitorStatus?.interval && (
                                <div style={{ fontSize: 8.5, color: 'var(--text3)', marginTop: 2, fontFamily: 'monospace' }}>
                                    Scan every {monitorStatus.interval}s
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT — Control panel */}
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
                        {/* Title + description */}
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                                Real-Time Threat Detection
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 520 }}>
                                Continuously monitors your AWS environment for new and resolved security findings.
                                Detects <strong style={{ color: '#d13212' }}>CRITICAL</strong> and <strong style={{ color: '#e67e22' }}>HIGH</strong> severity threats — alerts delivered via live desktop notifications.
                            </div>
                            {/* Live ticker */}
                            {monitorRunning && (
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(6,115,64,0.06)', border: '1px solid rgba(6,115,64,0.18)', borderRadius: 7, animation: 'fadeSlideUp 0.3s ease' }}>
                                    <Activity size={11} color="#067340" style={{ animation: 'pulse 1s ease infinite', flexShrink: 0 }} />
                                    <span style={{ fontSize: 10.5, color: '#067340', fontFamily: 'monospace', fontWeight: 600 }}>{MONITOR_MSGS[msgIdx]}</span>
                                </div>
                            )}
                            {!monitorRunning && !toggling && (
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', background: 'rgba(105,112,119,0.05)', border: '1px solid var(--border)', borderRadius: 7 }}>
                                    <ShieldAlert size={11} color="var(--text3)" />
                                    <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>Protection is currently <strong>OFF</strong> — start the monitor to enable continuous scanning</span>
                                </div>
                            )}
                        </div>

                        {/* Stats row — running state */}
                        {monitorRunning && monitorStatus && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                {[
                                    { label: 'Status',   val: 'Running',                                                                         color: '#067340' },
                                    { label: 'Interval', val: `${monitorStatus.interval || 60}s`,                                                 color: '#0972d3' },
                                    { label: 'Last Run', val: monitorStatus.last_run ? new Date(monitorStatus.last_run).toLocaleTimeString() : '—', color: '#FF9900' },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--bg3, rgba(35,47,62,0.04))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                        <div style={{ height: 2, background: `linear-gradient(90deg, ${s.color}, ${s.color}55)` }} />
                                        <div style={{ padding: '8px 10px' }}>
                                            <div style={{ fontSize: 8.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3, fontWeight: 700 }}>{s.label}</div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.val}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Start / Stop */}
                        <div>
                            <button onClick={toggle} disabled={toggling} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
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

                {/* AWS Fact ticker */}
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,153,0,0.02)' }}>
                    <Zap size={10} color="#FF9900" />
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', flex: 1, key: factIdx, animation: 'tickerFade 5s ease' }}>
                        <strong style={{ color: '#FF9900', fontStyle: 'normal' }}>AWS Fact:</strong> {AWS_FACTS[factIdx]}
                    </span>
                </div>
            </div>

            {/* ── THREAT ANALYSIS ── */}
            <div style={{ minHeight: 380 }}>
                {/* Section title */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <AlertTriangle size={12} color="#FF9900" />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Threat Analysis</span>
                        {threats && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', fontFamily: 'monospace' }}>· {threats.total_findings} findings</span>}
                    </div>
                    {threats && (
                        <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                            <span style={{ background: 'rgba(6,115,64,0.08)', border: '1px solid rgba(6,115,64,0.2)', borderRadius: 4, padding: '2px 8px', color: '#067340', fontWeight: 700 }}>✓ {counts['AUTO-FIX']} auto-fixable</span>
                            <span style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '2px 8px', color: '#f59e0b', fontWeight: 700 }}>⚠ {counts['MANUAL']} manual</span>
                        </div>
                    )}
                </div>

                {/* ── NO-SCAN EMPTY STATE ── */}
                {!hasScan && !loadingThreats && !threats && (() => {
                    const MODULES = [
                        { icon: '🔑', title: 'IAM',        color: '#d13212', delay: '.00s' },
                        { icon: '🌐', title: 'VPC / SG',   color: '#0972d3', delay: '.05s' },
                        { icon: '📦', title: 'S3',          color: '#FF9900', delay: '.10s' },
                        { icon: '💻', title: 'EC2 / EBS',  color: '#0972d3', delay: '.15s' },
                        { icon: '📋', title: 'CloudTrail', color: '#1d8102', delay: '.20s' },
                        { icon: '🔒', title: 'KMS',        color: '#8B5CF6', delay: '.25s' },
                        { icon: '🗄️', title: 'RDS',        color: '#0972d3', delay: '.30s' },
                        { icon: '🛡️', title: 'Firewall',   color: '#1d8102', delay: '.35s' },
                    ]
                    const TICKER = [
                        { icon: '🔑', title: 'IAM Security',    sub: 'Admin policies & privilege paths' },
                        { icon: '🌐', title: 'VPC Network',     sub: 'Security groups & flow logs' },
                        { icon: '📦', title: 'S3 Storage',      sub: 'Public buckets & encryption gaps' },
                        { icon: '💻', title: 'EC2 Compute',     sub: 'Instance roles & EBS status' },
                        { icon: '📋', title: 'CloudTrail',      sub: 'Audit trail & logging gaps' },
                        { icon: '🔥', title: 'Threat Intel',    sub: 'AWS threat signature matching' },
                        { icon: '🛡️', title: 'Firewall',        sub: 'NACL & security group rules' },
                        { icon: '🗄️', title: 'RDS Databases',   sub: 'Encryption & public access' },
                        { icon: '🔒', title: 'KMS Keys',        sub: 'Rotation & secret exposure' },
                        { icon: '🚨', title: 'Alert Engine',    sub: 'CRITICAL & HIGH severity watch' },
                    ]
                    return (
                        <div style={{
                            background: 'var(--bg2)', border: '1px solid var(--border)',
                            borderRadius: 12, overflow: 'hidden',
                            boxShadow: 'var(--card-shadow)',
                        }}>
                            {/* Top accent */}
                            <div style={{ height: 2, background: 'linear-gradient(90deg,#FF9900,rgba(255,153,0,0.3),transparent)' }} />

                            {/* Body: 2-column */}
                            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 200 }}>
                                {/* LEFT — Radar */}
                                <div style={{ background: 'rgba(6,115,64,0.03)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 }}>
                                    <div style={{ position: 'relative', width: 150, height: 150 }}>
                                        {[0, 1].map(i => (
                                            <div key={i} style={{ position: 'absolute', inset: -i * 9 - 4, borderRadius: '50%', border: `1.5px solid rgba(255,153,0,${0.25 - i * 0.1})`, animation: `socPulse ${2.2 + i * 0.5}s ease-out ${i * 0.6}s infinite` }} />
                                        ))}
                                        <ThreatRadar running={false} dark={dark} />
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: '#FF9900', textTransform: 'uppercase', letterSpacing: 1.5 }}>THREAT ENGINE</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 4 }}>
                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF9900', display: 'inline-block', animation: 'socBlink 1.2s ease infinite' }} />
                                            <span style={{ fontSize: 8.5, color: 'var(--text3)', fontFamily: 'monospace' }}>STANDBY</span>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT — Module grid + status */}
                                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {/* Module status */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                            <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Activity size={9} color="#FF9900" />
                                            </div>
                                            <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Module Status</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                                            {MODULES.map((m, i) => (
                                                <div key={m.title} style={{ background: `${m.color}08`, border: `1px solid ${m.color}1e`, borderRadius: 7, padding: '7px 8px', animation: `socScan 1.4s ease ${m.delay} both` }}>
                                                    <div style={{ fontSize: 14, marginBottom: 3 }}>{m.icon}</div>
                                                    <div style={{ fontSize: 9, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                                                    <div style={{ fontSize: 7.5, color: '#1d8102', fontWeight: 700, fontFamily: 'monospace', marginTop: 2 }}>READY</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'rgba(29,129,2,0.05)', border: '1px solid rgba(29,129,2,0.18)', borderRadius: 7 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d8102', display: 'inline-block', animation: 'socBlink 1.2s ease infinite' }} />
                                        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>All engines online · Run a scan from <strong style={{ color: 'var(--text2)' }}>Overview</strong> or <strong style={{ color: 'var(--text2)' }}>Scanner</strong> to begin threat analysis</span>
                                    </div>
                                </div>
                            </div>

                            {/* Scrolling module cards */}
                            <div style={{ borderTop: '1px solid var(--border)', overflow: 'hidden', padding: '10px 0' }}>
                                <div style={{ display: 'flex', gap: 10, paddingLeft: 16, width: 'max-content', animation: 'threatMarq 28s linear infinite', willChange: 'transform' }}>
                                    {[...TICKER, ...TICKER].map((b, i) => (
                                        <div key={i} style={{ flexShrink: 0, width: 150, background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: '3px solid #FF9900', borderRadius: 7, padding: '9px 11px' }}>
                                            <div style={{ fontSize: 14, marginBottom: 3 }}>{b.icon}</div>
                                            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#FF9900', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{b.title}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.4 }}>{b.sub}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                })()}

                {/* Loading */}
                {loadingThreats && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', boxShadow: 'var(--card-shadow)' }}>
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
                        {/* Severity summary tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
                                const cfg = SEV[sev]
                                const n = counts[sev]
                                const active = filter === sev
                                return (
                                    <div key={sev} onClick={() => setFilter(f => f === sev ? 'ALL' : sev)}
                                        style={{ background: active ? cfg.bg : 'var(--bg2)', border: `1.5px solid ${active ? cfg.color : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ fontSize: 22, fontWeight: 900, color: cfg.color, fontFamily: 'monospace', lineHeight: 1 }}>{n}</div>
                                        <div>
                                            <div style={{ fontSize: 9.5, fontWeight: 800, color: cfg.color, letterSpacing: 0.5 }}>{sev}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>findings</div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

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
