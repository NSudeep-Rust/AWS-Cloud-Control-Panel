import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import axios from 'axios'
import {
    Search, ShieldAlert, Play, RotateCcw, History,
    BarChart2, Bell, AlertTriangle, CheckCircle, XCircle,
    Zap, Shield, Activity, ChevronRight, RefreshCw,
    Lock, Globe, Key, Database, Server, Eye
} from 'lucide-react'

const API = 'http://localhost:8000'

const SEV = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.1)', border: 'rgba(209,50,18,0.2)' },
    HIGH: { color: '#e67e22', bg: 'rgba(230,126,34,0.1)', border: 'rgba(230,126,34,0.2)' },
    MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    LOW: { color: '#0972d3', bg: 'rgba(9,114,211,0.1)', border: 'rgba(9,114,211,0.2)' },
}

function findingIcon(type = '') {
    if (type.startsWith('S3')) return <Globe size={11} />
    if (type.startsWith('IAM')) return <Key size={11} />
    if (type.startsWith('EC2') || type.startsWith('EBS')) return <Server size={11} />
    if (type.startsWith('RDS')) return <Database size={11} />
    if (type.startsWith('CLOUDTRAIL') || type.startsWith('VPC_FLOW') || type.startsWith('CLOUDWATCH')) return <Eye size={11} />
    if (type.startsWith('SECURITY_GROUP') || type.startsWith('PUBLIC_SECURITY') || type.startsWith('NACL')) return <Lock size={11} />
    return <Shield size={11} />
}

export default function Overview({ onNav, dark }) {
    const { account } = useAuth()

    const isIam = account?.account_type === 'iam'

    const dbId = isIam
        ? (account?.account_id ?? null)
        : (account?.id ?? null)

    const awsId = isIam
        ? (account?.parent_aws_account_id || '—')
        : (account?.aws_account_id || '—')

    const profile = isIam
        ? (account?.username || 'iam-user')
        : (account?.profile_name || account?.aws_account_id || 'default')

    const region = account?.region || '—'

    const cacheKey = `scan_v3_${account?.account_type}_${awsId}_${dbId}`

    const [riskData, setRiskData] = useState(null)
    const [riskTrend, setRiskTrend] = useState([])
    const [alerts, setAlerts] = useState([])
    const [history, setHistory] = useState(null)
    const [scanLoading, setScanLoading] = useState(false)
    const [scanStatus, setScanStatus] = useState('idle')
    const [scanFindings, setScanFindings] = useState([])
    const [loadingRisk, setLoadingRisk] = useState(true)
    const [loadingAlerts, setLoadingAlerts] = useState(true)
    const [monitorStatus, setMonitorStatus] = useState(null)
    const [time, setTime] = useState(new Date())
    const scanIdRef = useRef(null)

    useEffect(() => {
        const iv = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(iv)
    }, [])

    useEffect(() => {
        Object.keys(sessionStorage).forEach(k => {
            if (k.startsWith('scan_v') && k !== cacheKey) {
                sessionStorage.removeItem(k)
            }
        })
        setScanFindings([])
        setScanStatus('idle')
        setScanLoading(false)
        scanIdRef.current = null
        setRiskData(null)
        setRiskTrend([])
        setHistory(null)
        setAlerts([])
        setMonitorStatus(null)
        setLoadingRisk(true)
        setLoadingAlerts(true)
        fetchAll()
        try {
            const raw = sessionStorage.getItem(cacheKey)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (
                    parsed?.aws_id === awsId &&
                    String(parsed?.db_id) === String(dbId) &&
                    Array.isArray(parsed?.findings)
                ) {
                    setScanFindings(parsed.findings)
                    scanIdRef.current = parsed.scan_id
                    setScanStatus('done')
                } else {
                    sessionStorage.removeItem(cacheKey)
                }
            }
        } catch {
            sessionStorage.removeItem(cacheKey)
        }
    }, [cacheKey])

    function q(url) {
        return dbId != null ? `${url}?account_id=${dbId}` : url
    }

    function fetchAll() {
        fetchRiskScore()
        fetchRiskTrend()
        fetchAlerts()
        fetchHistory()
        fetchMonitorStatus()
    }

    async function fetchRiskScore() {
        setLoadingRisk(true)
        try {
            const r = await axios.get(q(`${API}/api/analytics/risk-score`))
            setRiskData(r.data?.data || r.data)
        } catch { setRiskData(null) }
        finally { setLoadingRisk(false) }
    }

    async function fetchRiskTrend() {
        try {
            const r = await axios.get(q(`${API}/api/analytics/risk-trend`))
            const trend = r.data?.data?.trend || []
            setRiskTrend(trend.slice(-7))
        } catch { setRiskTrend([]) }
    }

    async function fetchAlerts() {
        setLoadingAlerts(true)
        try {
            const r = await axios.get(q(`${API}/api/alerts/`))
            const a = r.data?.data?.alerts || r.data?.alerts || []
            setAlerts(a.slice(0, 8))
        } catch { setAlerts([]) }
        finally { setLoadingAlerts(false) }
    }

    async function fetchHistory() {
        try {
            const r = await axios.get(q(`${API}/api/history/summary`))
            setHistory(r.data?.data || null)
        } catch { setHistory(null) }
    }

    async function fetchMonitorStatus() {
        try {
            const r = await axios.get(`${API}/api/threats/monitor/status`)
            setMonitorStatus(r.data?.data || null)
        } catch { setMonitorStatus(null) }
    }

    async function runQuickScan() {
        if (dbId == null || scanLoading) return
        setScanLoading(true)
        setScanStatus('running')
        setScanFindings([])
        scanIdRef.current = null
        try {
            const r = await axios.post(`${API}/api/scan/`, {
                account_id: dbId,
                mode: 'DRY_RUN',
                regions: [],
            })
            const data = r.data?.data || r.data
            const findings = data?.findings || []
            const scan_id = data?.scan_id
            scanIdRef.current = scan_id
            setScanFindings(findings)
            setScanStatus('done')
            sessionStorage.setItem(cacheKey, JSON.stringify({
                scan_id, findings, aws_id: awsId, db_id: dbId,
            }))
            await fetchRiskScore()
            await fetchRiskTrend()
            await fetchHistory()
        } catch {
            setScanStatus('error')
        } finally {
            setScanLoading(false)
        }
    }

    const criticalCount = scanFindings.filter(f => f.severity === 'CRITICAL').length
    const highCount = scanFindings.filter(f => f.severity === 'HIGH').length
    const mediumCount = scanFindings.filter(f => f.severity === 'MEDIUM').length
    const lowCount = scanFindings.filter(f => f.severity === 'LOW').length
    const totalFindings = scanFindings.length
    const riskScore = riskData?.risk_score ?? null
    const riskLevel = riskData?.risk_level ?? 'UNKNOWN'
    const monitorRunning = monitorStatus?.running === true

    const scoreColor = riskScore === null ? 'var(--text3)'
        : riskScore <= 20 ? '#067340'
            : riskScore <= 50 ? '#f59e0b'
                : riskScore <= 80 ? '#e67e22'
                    : '#d13212'

    function Card({ children, style = {}, onClick }) {
        const [hov, setHov] = useState(false)
        return (
            <div onClick={onClick}
                onMouseEnter={() => onClick && setHov(true)}
                onMouseLeave={() => onClick && setHov(false)}
                style={{
                    background: 'var(--bg2)',
                    border: `1px solid ${hov ? 'rgba(255,153,0,0.3)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '12px 14px',
                    boxShadow: hov ? '0 4px 16px rgba(255,153,0,0.1)' : 'var(--card-shadow)',
                    cursor: onClick ? 'pointer' : 'default',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    ...style,
                }}>
                {children}
            </div>
        )
    }

    function CardLabel({ icon: Icon, label, action }) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {Icon && <Icon size={11} color="#FF9900" />}
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
                </div>
                {action}
            </div>
        )
    }

    function StatTile({ label, value, sub, valueColor = 'var(--text)', icon: Icon, onClick }) {
        const [hov, setHov] = useState(false)
        return (
            <div onClick={onClick}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                style={{
                    background: 'var(--bg2)',
                    border: `1px solid ${hov && onClick ? 'rgba(255,153,0,0.35)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '10px 12px',
                    cursor: onClick ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                    boxShadow: hov && onClick ? '0 4px 16px rgba(255,153,0,0.1)' : 'var(--card-shadow)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    minHeight: 72,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                    {Icon && <Icon size={12} color="var(--text3)" strokeWidth={1.7} />}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: valueColor, fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
                {sub && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
            </div>
        )
    }

    function Sparkline({ data }) {
        if (!data || data.length < 2) return (
            <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>No trend data</span>
            </div>
        )
        const vals = data.map(d => d.risk_score || 0)
        const max = Math.max(...vals, 1)
        const W = 170, H = 28
        const pts = vals.map((v, i) => {
            const x = (i / (vals.length - 1)) * W
            const y = H - (v / max) * (H - 3) - 1
            return `${x},${y}`
        }).join(' ')
        return (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
                <polyline points={pts} fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {vals.map((v, i) => {
                    const x = (i / (vals.length - 1)) * W
                    const y = H - (v / max) * (H - 3) - 1
                    return <circle key={i} cx={x} cy={y} r="2.5" fill="#FF9900" opacity={i === vals.length - 1 ? 1 : 0.3} />
                })}
            </svg>
        )
    }

    function RiskDial({ score, color }) {
        const pct = Math.min(score || 0, 100)
        const r = 30
        const circ = 2 * Math.PI * r
        const dash = (pct / 100) * circ
        return (
            <svg width="78" height="78" viewBox="0 0 78 78" style={{ display: 'block' }}>
                <circle cx="39" cy="39" r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(35,47,62,0.08)'} strokeWidth="8" />
                <circle cx="39" cy="39" r={r} fill="none" stroke={color} strokeWidth="8"
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 39 39)"
                    style={{ transition: 'stroke-dasharray 1s ease' }} />
                <text x="39" y="35" textAnchor="middle" fontSize="14" fontWeight="800" fill={color} fontFamily="monospace">{score ?? '—'}</text>
                <text x="39" y="47" textAnchor="middle" fontSize="7" fill="var(--text3)" fontWeight="600" letterSpacing="0.5">RISK SCORE</text>
            </svg>
        )
    }

    function SevBar({ label, count, color, total }) {
        const pct = total > 0 ? (count / total) * 100 : 0
        return (
            <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: 0.4 }}>{label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{count}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(35,47,62,0.08)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 0.8s ease' }} />
                </div>
            </div>
        )
    }

    function FindingRow({ finding, idx }) {
        const sev = SEV[finding.severity] || SEV.LOW
        const [hov, setHov] = useState(false)
        return (
            <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 7px', borderRadius: 4,
                    background: hov
                        ? (dark ? 'rgba(255,255,255,0.04)' : 'rgba(35,47,62,0.04)')
                        : (idx % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(35,47,62,0.02)')),
                    border: `1px solid ${hov ? 'var(--border)' : 'transparent'}`,
                    transition: 'all 0.1s',
                }}>
                <div style={{ color: sev.color, flexShrink: 0, opacity: 0.85 }}>{findingIcon(finding.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{finding.type}</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{finding.resource_id} · {finding.region}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0 }}>
                    {finding.severity}
                </span>
            </div>
        )
    }

    // ── CHANGED: QuickAction now fills full width (no flex:1) ──────────────
    function QuickAction({ icon: Icon, label, desc, color = '#FF9900', section }) {
        const [hov, setHov] = useState(false)
        return (
            <button onClick={() => onNav(section)}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: hov ? (dark ? 'rgba(255,255,255,0.05)' : 'rgba(35,47,62,0.04)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(35,47,62,0.02)'),
                    border: `1px solid ${hov ? 'rgba(255,153,0,0.3)' : 'var(--border)'}`,
                    borderRadius: 7, padding: '10px 12px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.15s', width: '100%',
                }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={15} color={color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
                </div>
                <ChevronRight size={12} color="var(--text3)" style={{ flexShrink: 0, opacity: 0.5 }} />
            </button>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 64px)', minHeight: 0 }}>

            {/* ── 1. HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Security Overview</h1>
                        {isIam && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#0972d3', background: 'rgba(9,114,211,0.1)', border: '1px solid rgba(9,114,211,0.25)', borderRadius: 4, padding: '2px 7px', letterSpacing: 0.4 }}>
                                IAM USER
                            </span>
                        )}
                        {monitorRunning && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#067340', background: 'rgba(6,115,64,0.1)', border: '1px solid rgba(6,115,64,0.25)', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#067340', display: 'inline-block', animation: 'pulse 1.5s ease infinite' }} />
                                LIVE MONITOR ON
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text2)' }}>{awsId}</span>
                        <span> · {profile} · {region}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace', fontWeight: 600 }}>{time.toLocaleTimeString()}</div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>{time.toLocaleDateString()}</div>
                    </div>
                    <button onClick={runQuickScan} disabled={scanLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, background: scanLoading ? 'rgba(255,153,0,0.55)' : '#FF9900', color: '#232F3E', border: 'none', cursor: scanLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(255,153,0,0.25)', transition: 'background 0.15s' }}
                        onMouseEnter={e => { if (!scanLoading) e.currentTarget.style.background = '#ec8a00' }}
                        onMouseLeave={e => { if (!scanLoading) e.currentTarget.style.background = '#FF9900' }}>
                        {scanLoading
                            ? <><div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid rgba(35,47,62,0.3)', borderTopColor: '#232F3E', animation: 'spin 0.7s linear infinite' }} />Scanning...</>
                            : <><Search size={12} />Run Scan</>
                        }
                    </button>
                </div>
            </div>

            {/* ── 2. STAT TILES — 7-column row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, flexShrink: 0 }}>
                <StatTile label="Total Findings" value={scanStatus === 'done' ? totalFindings : '—'} sub={scanStatus === 'done' ? 'last scan' : 'run a scan'} valueColor="var(--text)" icon={Search} onClick={scanStatus === 'done' ? () => onNav('scanner') : undefined} />
                <StatTile label="Critical" value={scanStatus === 'done' ? criticalCount : '—'} sub="immediate fix" valueColor={criticalCount > 0 ? '#d13212' : 'var(--text)'} icon={AlertTriangle} />
                <StatTile label="High" value={scanStatus === 'done' ? highCount : '—'} sub="need attention" valueColor={highCount > 0 ? '#e67e22' : 'var(--text)'} icon={ShieldAlert} />
                <StatTile label="Alerts" value={loadingAlerts ? '…' : alerts.length} sub="threat monitor" valueColor={alerts.length > 0 ? '#f59e0b' : 'var(--text)'} icon={Bell} onClick={() => onNav('alerts')} />
                <StatTile label="Executed" value={history?.total_executed ?? '—'} sub="remediations" valueColor={history?.total_executed > 0 ? '#067340' : 'var(--text)'} icon={Play} onClick={() => onNav('history')} />
                <StatTile label="Scan Events" value={history?.total_events ?? '—'} sub="history log" valueColor="var(--text)" icon={History} onClick={() => onNav('history')} />
                <StatTile label="High (All)" value={history?.total_high_severity ?? '—'} sub="all scans" valueColor={history?.total_high_severity > 0 ? '#e67e22' : 'var(--text)'} icon={BarChart2} onClick={() => onNav('analytics')} />
            </div>

            {/* ── 3. THREAT MONITOR STRIP ── */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--card-shadow)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: monitorRunning ? '#067340' : 'var(--text3)', animation: monitorRunning ? 'pulse 1.5s ease infinite' : 'none', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Threat Monitor</span>
                    <span style={{ fontSize: 11, color: monitorRunning ? '#067340' : 'var(--text3)' }}>
                        {monitorRunning ? `Active — polls every ${monitorStatus?.interval || 60}s` : 'Inactive — not scanning'}
                    </span>
                </div>
                {scanStatus === 'running' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#0972d3', fontSize: 11 }}>
                        <Activity size={11} color="#0972d3" />
                        <span style={{ fontWeight: 600 }}>Scanning account...</span>
                    </div>
                )}
                {scanStatus === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#d13212', fontSize: 11 }}>
                        <XCircle size={11} color="#d13212" />
                        <span style={{ fontWeight: 600 }}>Scan failed — check backend on :8000</span>
                    </div>
                )}
                {scanStatus === 'done' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#067340', fontSize: 11 }}>
                        <CheckCircle size={11} color="#067340" />
                        <span style={{ fontWeight: 600 }}>Last scan: {totalFindings} findings</span>
                    </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => onNav('threats')}
                        style={{ fontSize: 11, fontWeight: 600, color: monitorRunning ? '#d13212' : '#067340', background: monitorRunning ? 'rgba(209,50,18,0.08)' : 'rgba(6,115,64,0.08)', border: `1px solid ${monitorRunning ? 'rgba(209,50,18,0.2)' : 'rgba(6,115,64,0.2)'}`, borderRadius: 5, padding: '4px 12px', cursor: 'pointer' }}>
                        {monitorRunning ? 'Stop Monitor' : 'Start Monitor'}
                    </button>
                    {scanIdRef.current && (
                        <button onClick={() => onNav('execute')}
                            style={{ fontSize: 11, fontWeight: 600, color: '#FF9900', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.2)', borderRadius: 5, padding: '4px 12px', cursor: 'pointer' }}>
                            Execute Fixes
                        </button>
                    )}
                </div>
            </div>

            {/* ── 4. MAIN CARD ROW ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 310px 250px', gap: 10, flex: 1, minHeight: 0, alignItems: 'stretch' }}>

                {/* ── A. RISK SCORE ── */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Activity} label="Risk Score" action={
                        <button onClick={fetchRiskScore} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}>
                            <RefreshCw size={10} />
                        </button>
                    } />
                    {loadingRisk
                        ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,153,0,0.2)', borderTopColor: '#FF9900', animation: 'spin 0.7s linear infinite' }} />
                        </div>
                        : riskData && riskData.risk_score != null
                            ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
                                <div style={{ marginBottom: 4, marginTop: 4 }}>
                                    <RiskDial score={riskData.risk_score} color={scoreColor} />
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, background: `${scoreColor}18`, border: `1px solid ${scoreColor}28`, borderRadius: 4, padding: '2px 10px', letterSpacing: 0.6 }}>
                                    {riskLevel}
                                </span>
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>
                                    {riskData.active_high_findings ?? 0} active high issues
                                </div>
                                {scanStatus === 'done' && totalFindings > 0 && (
                                    <div style={{ width: '100%', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                                        <SevBar label="CRITICAL" count={criticalCount} color="#d13212" total={totalFindings} />
                                        <SevBar label="HIGH" count={highCount} color="#e67e22" total={totalFindings} />
                                        <SevBar label="MEDIUM" count={mediumCount} color="#f59e0b" total={totalFindings} />
                                        <SevBar label="LOW" count={lowCount} color="#0972d3" total={totalFindings} />
                                    </div>
                                )}
                                {riskTrend.length > 1 && (
                                    <div style={{ width: '100%', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>7-event trend</div>
                                        <Sparkline data={riskTrend} />
                                    </div>
                                )}
                            </div>
                            : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11, textAlign: 'center', padding: '0 8px' }}>
                                Run a scan to see risk score
                            </div>
                    }
                </Card>

                {/* ── B. RECENT FINDINGS ── */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Shield} label="Recent Findings" action={
                        scanStatus === 'done' && (
                            <button onClick={() => onNav('scanner')} style={{ fontSize: 10, fontWeight: 600, color: '#FF9900', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.2)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                                View All
                            </button>
                        )
                    } />
                    {scanStatus === 'idle' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                            <Search size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text2)' }}>No scan data</div>
                            <div style={{ fontSize: 11, marginBottom: 12 }}>Run a scan to see security findings</div>
                            <button onClick={runQuickScan} style={{ fontSize: 12, fontWeight: 700, color: '#232F3E', background: '#FF9900', border: 'none', borderRadius: 5, padding: '7px 18px', cursor: 'pointer' }}>
                                Run Scan Now
                            </button>
                        </div>
                    )}
                    {scanStatus === 'running' && (
                        <div style={{ flex: 1, padding: '2px 0', overflow: 'hidden' }}>
                            {[...Array(10)].map((_, i) => (
                                <div key={i} style={{ height: 30, borderRadius: 4, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(35,47,62,0.04)', marginBottom: 3, animation: `pulse 1.5s ease ${i * 0.1}s infinite` }} />
                            ))}
                        </div>
                    )}
                    {(scanStatus === 'done' || scanStatus === 'error') && (
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            {scanFindings.slice(0, 20).map((f, i) => (
                                <FindingRow key={f.id || i} finding={f} idx={i} />
                            ))}
                            {totalFindings > 20 && (
                                <button onClick={() => onNav('scanner')} style={{ width: '100%', marginTop: 4, padding: '6px', borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>
                                    +{totalFindings - 20} more — view all in Scanner
                                </button>
                            )}
                            {totalFindings === 0 && (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#067340', padding: '20px 0' }}>
                                    <CheckCircle size={22} style={{ margin: '0 auto 6px', display: 'block' }} />
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>No findings! 🎉</div>
                                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Account looks clean</div>
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ── C. QUICK ACTIONS — CHANGED: full-width buttons, account info pinned to bottom ── */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Zap} label="Quick Actions" />

                    {/* Action buttons — full width, vertically stacked, stretch to fill space */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
                        <QuickAction icon={Search} label="Full Scan" desc="Scan all regions" color="#0972d3" section="scanner" />
                        <QuickAction icon={ShieldAlert} label="Threats" desc={monitorRunning ? 'Monitor running' : 'Start live monitoring'} color={monitorRunning ? '#067340' : '#f59e0b'} section="threats" />
                        <QuickAction icon={Play} label="Execute Fixes" desc="Apply remediations" color="#FF9900" section="execute" />
                        <QuickAction icon={RotateCcw} label="Rollback" desc="Revert applied fixes" color="#e67e22" section="rollback" />
                        <QuickAction icon={BarChart2} label="Analytics" desc="Risk score & reports" color="#8B5CF6" section="analytics" />
                        <QuickAction icon={History} label="History" desc="Audit log & events" color="#0972d3" section="history" />
                    </div>

                    {/* Account Info — pinned to bottom with a separator */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Account Info</div>
                        {[
                            { label: 'AWS Account', value: awsId },
                            { label: 'Identity', value: profile },
                            { label: 'Type', value: isIam ? 'IAM User' : 'Root Account' },
                            { label: 'Region', value: region },
                        ].map(row => (
                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: 9, color: 'var(--text3)' }}>{row.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', maxWidth: 145, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* ── D. LATEST ALERTS ── */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Bell} label="Latest Alerts" action={
                        <button onClick={() => onNav('alerts')} style={{ fontSize: 10, color: '#FF9900', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>All →</button>
                    } />
                    {loadingAlerts && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,153,0,0.2)', borderTopColor: '#FF9900', animation: 'spin 0.7s linear infinite' }} />
                        </div>
                    )}
                    {!loadingAlerts && alerts.length === 0 && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11 }}>
                            <CheckCircle size={16} style={{ display: 'block', margin: '0 auto 5px', color: '#067340' }} />
                            No active alerts
                        </div>
                    )}
                    {!loadingAlerts && alerts.length > 0 && (
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            {alerts.map((a, i) => {
                                const sev = SEV[a.severity] || SEV.LOW
                                return (
                                    <div key={a.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 0', borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <AlertTriangle size={10} color={sev.color} style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text3)' }}>{new Date(a.created_at).toLocaleString()}</div>
                                        </div>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>{a.severity}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Card>

            </div>{/* end main row */}
        </div>
    )
}
