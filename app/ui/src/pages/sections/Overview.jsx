import { useState, useEffect, useRef, memo } from 'react'

import { useAuth } from '@/context/AuthContext'

import axios from 'axios'

import { useMemo } from 'react'

import { useScan } from '@/context/ScanContext'

import {
    Search, ShieldAlert, Play, RotateCcw, History,
    BarChart2, AlertTriangle, CheckCircle, XCircle,
    Zap, Shield, Activity, ChevronRight, RefreshCw,
    Lock, Globe, Key, Database, Server, Eye, Square, Users
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const OV_CSS = `
  @keyframes ov-up    { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }
  @keyframes ov-num   { 0%{opacity:0;transform:scale(.85)} 100%{opacity:1;transform:scale(1)} }
  @keyframes ov-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes ov-glow  { 0%,100%{box-shadow:0 0 0 0 rgba(6,115,64,0)} 50%{box-shadow:0 0 14px rgba(6,115,64,.35)} }
  @keyframes ov-scan  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  .ov-stat:hover .ov-bar { width:100% !important; }
  .ov-qa:hover { transform: translateX(3px) !important; }
`

const SEV = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.1)', border: 'rgba(209,50,18,0.2)' },
    HIGH: { color: '#e67e22', bg: 'rgba(230,126,34,0.1)', border: 'rgba(230,126,34,0.2)' },
    MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    LOW: { color: '#0972d3', bg: 'rgba(9,114,211,0.1)', border: 'rgba(9,114,211,0.2)' },
}

const RADAR_FACTS = [
    'Scanning IAM users & roles across 6 regions...',
    'Checking S3 bucket policies & ACLs...',
    'Probing EC2 security groups & NACLs...',
    'Evaluating VPC flow log configurations...',
    'Checking CloudTrail logging status...',
    'Scanning EBS encryption & snapshots...',
    'Analyzing KMS key rotation policies...',
    'Cross-referencing findings by severity...',
]

function findingIcon(type = '') {
    if (type.startsWith('S3')) return <Globe size={11} />
    if (type.startsWith('IAM')) return <Key size={11} />
    if (type.startsWith('EC2') || type.startsWith('EBS')) return <Server size={11} />
    if (type.startsWith('RDS')) return <Database size={11} />
    if (type.startsWith('CLOUDTRAIL') || type.startsWith('VPC_FLOW') || type.startsWith('CLOUDWATCH')) return <Eye size={11} />
    if (type.startsWith('SECURITY_GROUP') || type.startsWith('PUBLIC_SECURITY') || type.startsWith('NACL')) return <Lock size={11} />
    return <Shield size={11} />
}

const FindingItem = memo(function FindingItem({ f, i, dark, onNav, setHighlightFindingId }) {
    const sev = SEV[f.severity] || SEV.LOW

    const baseStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 8px',
        borderRadius: 5,
        cursor: 'pointer',
        background: i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(35,47,62,0.02)'),
        border: '1px solid transparent',
        transition: 'background 0.1s, border-color 0.1s',
        marginBottom: 1,
        userSelect: 'none',
    }

    return (
        <div
            style={baseStyle}
            onMouseEnter={e => {
                e.currentTarget.style.background = sev.bg
                e.currentTarget.style.borderColor = sev.border
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(35,47,62,0.02)')
                e.currentTarget.style.borderColor = 'transparent'
            }}
            onClick={() => {
                if (setHighlightFindingId) setHighlightFindingId(f.id)
                onNav('scanner')
            }}
        >
            <div style={{ color: sev.color, flexShrink: 0, opacity: 0.85 }}>{findingIcon(f.type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.type}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.resource_id} · {f.region}</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0 }}>{f.severity}</span>
            <ChevronRight size={9} color="var(--text3)" style={{ flexShrink: 0, opacity: 0.4 }} />
        </div>
    )
})

function Card({ children, style = {}, onClick, accentColor }) {
    const [hov, setHov] = useState(false)
    const ac = accentColor || null
    return (
        <div onClick={onClick}
            onMouseEnter={() => onClick && setHov(true)}
            onMouseLeave={() => onClick && setHov(false)}
            style={{
                background: 'var(--bg2)',
                border: `1px solid ${hov && onClick ? 'rgba(255,153,0,0.28)' : 'var(--border)'}`,
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: hov && onClick ? '0 6px 20px rgba(255,153,0,0.12)' : 'var(--card-shadow)',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'border-color 0.18s, box-shadow 0.18s',
                position: 'relative',
                ...style
            }}>
            {ac && <div style={{ height: 2, background: `linear-gradient(90deg, ${ac}, ${ac}66)`, flexShrink: 0 }} />}
            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                {children}
            </div>
        </div>
    )
}

function CardLabel({ icon: Icon, label, action }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {Icon && (
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(255,153,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={11} color="#FF9900" />
                    </div>
                )}
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
            </div>
            {action}
        </div>
    )
}

function StatTile({ label, value, sub, valueColor = 'var(--text)', icon: Icon, onClick, accentColor = '#FF9900', animDelay = '0s' }) {
    const [hov, setHov] = useState(false)
    const ac = accentColor
    return (
        <div className="ov-stat" onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
                background: 'var(--bg2)',
                border: `1px solid ${hov && onClick ? `${ac}44` : 'var(--border)'}`,
                borderRadius: 10,
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.18s ease',
                boxShadow: hov && onClick ? `0 6px 18px ${ac}28` : 'var(--card-shadow)',
                transform: hov && onClick ? 'translateY(-2px)' : 'translateY(0)',
                animation: `ov-up 0.4s ease ${animDelay} both`,
            }}>
            {/* Colored top accent bar */}
            <div style={{ height: 3, background: `linear-gradient(90deg,${ac},${ac}55)`, position:'relative' }}>
                <div className="ov-bar" style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,${ac}dd,${ac}22)`, width:'55%', transition:'width .3s ease' }} />
            </div>
            <div style={{ padding: '9px 11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</span>
                    {Icon && (
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${ac}14`, display: 'flex', alignItems: 'center', justifyContent:'center', border:`1px solid ${ac}20` }}>
                            <Icon size={11} color={ac} strokeWidth={1.8} />
                        </div>
                    )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: valueColor, fontFamily: 'monospace', lineHeight: 1, animation: 'ov-num .35s ease both' }}>{value}</div>
                {sub && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
            </div>
        </div>
    )
}

function Sparkline({ data }) {
    if (!data || data.length < 2) return <div style={{ height: 24, display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 10, color: 'var(--text3)' }}>No trend data</span></div>
    const vals = data.map(d => d.risk_score || 0), max = Math.max(...vals, 1), W = 170, H = 28
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * (H - 3) - 1}`).join(' ')
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {vals.map((v, i) => { const x = (i / (vals.length - 1)) * W, y = H - (v / max) * (H - 3) - 1; return <circle key={i} cx={x} cy={y} r="2.5" fill="#FF9900" opacity={i === vals.length - 1 ? 1 : 0.3} /> })}
        </svg>
    )
}

function RiskDial({ score, color, dark }) {
    const r = 30, circ = 2 * Math.PI * r, dash = (Math.min(score || 0, 100) / 100) * circ
    return (
        <svg width="78" height="78" viewBox="0 0 78 78" style={{ display: 'block' }}>
            <circle cx="39" cy="39" r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(35,47,62,0.08)'} strokeWidth="8" />
            <circle cx="39" cy="39" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 39 39)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            <text x="39" y="35" textAnchor="middle" fontSize="14" fontWeight="800" fill={color} fontFamily="monospace">{score ?? '—'}</text>
            <text x="39" y="47" textAnchor="middle" fontSize="7" fill="var(--text3)" fontWeight="600" letterSpacing="0.5">RISK SCORE</text>
        </svg>
    )
}

function SevBar({ label, count, color, total, dark }) {
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

// Stable top-level component — avoids re-mounting on every Overview render tick
const QuickAction = memo(function QuickAction({ icon: Icon, label, desc, color = '#FF9900', section, onNav }) {
    const [hov, setHov] = useState(false)
    return (
        <button
            className="ov-qa"
            onClick={() => onNav(section)}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: hov ? `${color}0d` : 'transparent',
                border: `1px solid ${hov ? `${color}35` : 'transparent'}`,
                borderRadius: 8, padding: '7px 9px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s ease', width: '100%',
            }}>
            <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: hov ? `${color}22` : `${color}14`,
                border: `1px solid ${color}28`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                boxShadow: hov ? `0 2px 8px ${color}30` : 'none',
            }}>
                <Icon size={14} color={color} strokeWidth={1.9} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: hov ? color : 'var(--text)', lineHeight: 1.2, transition: 'color 0.12s' }}>{label}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
            </div>
            <ChevronRight size={11} color={hov ? color : 'var(--text3)'} style={{ flexShrink: 0, opacity: hov ? 0.7 : 0.4, transition: 'all 0.12s' }} />
        </button>
    )
})

const RADAR_REGIONS = [
    { id: 'us-east-1', c: '#FF9900' }, { id: 'us-east-2', c: '#FF9900' }, { id: 'us-west-2', c: '#FF9900' },
    { id: 'eu-west-1', c: '#0972d3' }, { id: 'eu-central-1', c: '#0972d3' }, { id: 'eu-north-1', c: '#0972d3' },
    { id: 'ap-northeast-1', c: '#1d8102' }, { id: 'ap-southeast-1', c: '#1d8102' }, { id: 'ap-south-1', c: '#1d8102' },
]
const RADAR_MSGS = [
    'Initializing AWS session...',
    'Scanning IAM users & roles...',
    'Checking S3 bucket policies...',
    'Probing EC2 security groups...',
    'Evaluating VPC flow logs...',
    'Checking CloudTrail status...',
    'Scanning EBS encryption...',
    'Analyzing KMS rotation...',
    'Cross-referencing findings...',
]
const RADAR_BLIPS = [
    { a: 0.45, r: 0.52, c: '#FF9900' }, { a: 1.1, r: 0.68, c: '#FF9900' },
    { a: 1.8, r: 0.41, c: '#0972d3' }, { a: 2.4, r: 0.75, c: '#0972d3' },
    { a: 3.0, r: 0.58, c: '#1d8102' }, { a: 3.7, r: 0.44, c: '#1d8102' },
    { a: 4.3, r: 0.7,  c: '#FF9900' }, { a: 5.0, r: 0.36, c: '#1d8102' },
    { a: 5.6, r: 0.62, c: '#0972d3' },
]

// CSS-only radar — no canvas, no RAF, zero JS compute per frame.
// Sweep and blips use @keyframes radarSweep / radarBlip (injected globally by PanelPage).
function ScanningDisplay({ elapsed, radarFact }) {
    const BLIPS = [
        { x: 66, y: 34, c: '#FF9900', d: '0s'   },
        { x: 78, y: 65, c: '#0972d3', d: '1.0s'  },
        { x: 36, y: 76, c: '#1d8102', d: '2.0s'  },
        { x: 84, y: 48, c: '#FF9900', d: '3.0s'  },
        { x: 28, y: 44, c: '#d13212', d: '4.0s'  },
        { x: 54, y: 84, c: '#0972d3', d: '5.0s'  },
        { x: 90, y: 75, c: '#1d8102', d: '1.5s'  },
        { x: 44, y: 30, c: '#FF9900', d: '3.5s'  },
        { x: 70, y: 90, c: '#d13212', d: '4.8s'  },
    ]
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 14px', overflow: 'hidden' }}>
            <style>{`@keyframes regionPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }`}</style>

            {/* Pure CSS radar — GPU-composited, silky smooth */}
            <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                {/* Outer ring — border only, no fill */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.2px solid rgba(255,153,0,0.40)' }} />
                {/* Inner rings */}
                <div style={{ position: 'absolute', inset: '25%', borderRadius: '50%', border: '0.7px solid rgba(255,153,0,0.2)' }} />
                <div style={{ position: 'absolute', inset: '50%', borderRadius: '50%', border: '0.7px solid rgba(255,153,0,0.14)' }} />
                {/* Crosshairs */}
                <div style={{ position: 'absolute', top: 'calc(50% - 0.5px)', left: 4, right: 4, height: 1, background: 'rgba(255,153,0,0.12)' }} />
                <div style={{ position: 'absolute', left: 'calc(50% - 0.5px)', top: 4, bottom: 4, width: 1, background: 'rgba(255,153,0,0.12)' }} />
                {/* Sweep cone — bright spot at 84°, needle at 90°; 44° total trail (clockwise-behind) */}
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'conic-gradient(rgba(255,153,0,0) 0deg, rgba(255,153,0,0) 46deg, rgba(255,153,0,0.10) 68deg, rgba(255,153,0,0.22) 84deg, rgba(255,153,0,0) 94deg, rgba(255,153,0,0) 360deg)',
                    animation: 'radarSweep 7s linear infinite',
                    willChange: 'transform',
                }} />
                {/* Sweep needle */}
                <div style={{
                    position: 'absolute', top: 'calc(50% - 1px)', left: '50%', width: '50%', height: 2,
                    background: 'linear-gradient(90deg, rgba(255,153,0,0.5), rgba(255,153,0,0.95))',
                    transformOrigin: 'left center',
                    animation: 'radarSweep 7s linear infinite',
                    willChange: 'transform',
                }} />
                {/* Blips — fade in/out with radarBlip */}
                {BLIPS.map((b, i) => (
                    <div key={i} style={{
                        position: 'absolute', left: b.x, top: b.y, width: 5, height: 5,
                        borderRadius: '50%', background: b.c,
                        boxShadow: `0 0 5px ${b.c}88`,
                        animation: `radarBlip 7s linear ${b.d} infinite`,
                        willChange: 'opacity',
                    }} />
                ))}
                {/* Center dot */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', background: '#FF9900' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Scanning your account...</div>
                <div style={{ fontSize: 9, color: '#FF9900', fontFamily: 'monospace', fontWeight: 600,
                    padding: '2px 8px', background: 'rgba(255,153,0,0.07)', borderRadius: 4,
                    border: '1px solid rgba(255,153,0,0.2)', whiteSpace: 'nowrap' }}>
                    ▶ {RADAR_MSGS[radarFact % RADAR_MSGS.length]}
                </div>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace', fontWeight: 600 }}>
                {elapsed}s elapsed · 9 regions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, width: '100%' }}>
                {RADAR_REGIONS.map((r, i) => (
                    <div key={r.id} style={{
                        fontSize: 7.5, fontFamily: 'monospace', color: r.c,
                        background: `${r.c}0d`, border: `1px solid ${r.c}30`,
                        borderRadius: 3, padding: '2px 3px', textAlign: 'center',
                        animation: `regionPulse 2s ease ${i * 0.22}s infinite`,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.id}</div>
                ))}
            </div>
        </div>
    )
}

export default function Overview({ onNav, dark }) {
    const { account } = useAuth()

    const isIam = account?.account_type === 'iam'
    const dbId = isIam ? (account?.account_id ?? null) : (account?.id ?? null)
    const awsId = isIam ? (account?.parent_aws_account_id || '—') : (account?.aws_account_id || '—')
    const profile = isIam ? (account?.username || 'iam-user') : (account?.profile_name || account?.aws_account_id || 'default')
    const region = account?.region || '—'
    const cacheKey = `scan_v3_${account?.account_type}_${awsId}_${dbId}`

    const { status: scanStatus, findings: scanFindings, elapsed, startScan, stopScan,
            restoreFromCache, hydrateFromHistory, highlightFindingId, setHighlightFindingId,
            refreshToken } = useScan()
    const scanning = scanStatus === 'scanning'

    const [riskData, setRiskData] = useState(null)
    const [riskTrend, setRiskTrend] = useState([])
    const [history, setHistory] = useState(null)
    const [loadingRisk, setLoadingRisk] = useState(true)
    const [monitorStatus, setMonitorStatus] = useState(null)
    const [monitorToggling, setMonitorToggling] = useState(false)
    const [time, setTime] = useState(new Date())
    const [appVersion, setAppVersion] = useState(null)

    const [radarFact, setRadarFact] = useState(0)
    const radarRef = useRef(null)

    useEffect(() => {
        const iv = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(iv)
    }, [])

    useEffect(() => {
        axios.get(`${API}/api/version`).then(r => setAppVersion(r.data?.version)).catch(() => {})
    }, [])

    useEffect(() => {
        if (!scanning) { clearInterval(radarRef.current); return }
        radarRef.current = setInterval(() => setRadarFact(i => (i + 1) % RADAR_FACTS.length), 2200)
        return () => clearInterval(radarRef.current)
    }, [scanning])

    useEffect(() => {
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('scan_v') && k !== cacheKey) localStorage.removeItem(k)
        })
        setRiskData(null); setRiskTrend([]); setHistory(null);
        setMonitorStatus(null)
        setLoadingRisk(true)
        restoreFromCache(cacheKey)           // fast: restore from localStorage if available
        if (dbId) hydrateFromHistory(dbId)   // fresh: load latest scan from DB (fills empty box on startup)
        fetchAll()
    }, [cacheKey])

    useEffect(() => {
        if (scanStatus === 'done') {
            setRiskData(null)
            setLoadingRisk(true)
            const t = setTimeout(() => {
                fetchRiskScore()
                fetchRiskTrend()
                fetchHistory()
            }, 800)
            return () => clearTimeout(t)
        }
    }, [scanStatus])

    useEffect(() => {
        if (refreshToken === 0) return  // skip initial mount
        const t = setTimeout(() => {
            fetchRiskScore()
            fetchRiskTrend()
            fetchHistory()
        }, 1000)
        return () => clearTimeout(t)
    }, [refreshToken])

    function q(url) { return dbId != null ? `${url}?account_id=${dbId}` : url }
    function fetchAll() { fetchRiskScore(); fetchRiskTrend(); fetchHistory(); fetchMonitorStatus() }

    async function fetchRiskScore() {
        setLoadingRisk(true)
        try { const r = await axios.get(q(`${API}/api/analytics/risk-score`)); setRiskData(r.data?.data || r.data) }
        catch { setRiskData(null) } finally { setLoadingRisk(false) }
    }
    async function fetchRiskTrend() {
        try { const r = await axios.get(q(`${API}/api/analytics/risk-trend`)); setRiskTrend((r.data?.data?.trend || []).slice(-7)) }
        catch { setRiskTrend([]) }
    }
    async function fetchHistory() {
        try { const r = await axios.get(q(`${API}/api/history/summary`)); setHistory(r.data?.data || null) }
        catch { setHistory(null) }
    }
    async function fetchMonitorStatus() {
        try { const r = await axios.get(`${API}/api/threats/monitor/status`); setMonitorStatus(r.data?.data || null) }
        catch { setMonitorStatus(null) }
    }

    async function toggleMonitor() {
        if (monitorToggling) return
        setMonitorToggling(true)
        const wasRunning = monitorRunning
        setMonitorStatus(prev => ({ ...(prev || {}), running: !wasRunning }))
        try {
            if (wasRunning) {
                await axios.post(`${API}/api/threats/monitor/stop`)
            } else {
                const awsAccountId = isIam ? account?.parent_aws_account_id : account?.aws_account_id
                await axios.post(`${API}/api/threats/monitor/start`, { account_id: awsAccountId })
            }
            setTimeout(() => { fetchMonitorStatus(); setMonitorToggling(false) }, 500)
        } catch {
            setMonitorStatus(prev => ({ ...(prev || {}), running: wasRunning }))
            setMonitorToggling(false)
        }
    }

    function triggerScan() {
        if (dbId == null || scanning) return
        startScan({ dbId, awsId, cacheKey })
    }

    const totalFindings = scanFindings.length
    const criticalCount = scanFindings.filter(f => f.severity === 'CRITICAL').length
    const highCount = scanFindings.filter(f => f.severity === 'HIGH').length
    const mediumCount = scanFindings.filter(f => f.severity === 'MEDIUM').length
    const lowCount = scanFindings.filter(f => f.severity === 'LOW').length
    const riskScore = riskData?.risk_score ?? null
    const riskLevel = riskData?.risk_level ?? 'UNKNOWN'
    const monitorRunning = monitorStatus?.running === true
    const hasScan = scanStatus === 'done'
    const stableFindings = useRef([])

    if (scanStatus === 'done') {
        stableFindings.current = scanFindings
    }

    const visibleFindings = stableFindings.current.slice(0, 50)

    const scoreColor = riskScore === null ? 'var(--text3)'
        : riskScore <= 20 ? '#067340'
            : riskScore <= 50 ? '#f59e0b'
                : riskScore <= 80 ? '#e67e22'
                    : '#d13212'


    // FindingRow removed (duplicate — FindingItem memo above is used instead)
    // QuickAction removed — now a stable top-level memo component

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 64px)', minHeight: 0 }}>
        <style>{OV_CSS}</style>

            {/* ── 1. HEADER ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                background: 'var(--bg2)', borderRadius: 10, padding: '12px 18px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--card-shadow)',
                animation: 'ov-up 0.3s ease both',
                position: 'relative', overflow: 'hidden',
            }}>
                {/* Subtle accent top line */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#FF9900,#0972d3,#FF9900)', backgroundSize:'200%', animation:'ov-scan 4s ease infinite' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Shield icon */}
                    <div style={{ width:42, height:42, borderRadius:10, background:'rgba(255,153,0,0.1)', border:'1px solid rgba(255,153,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Shield size={22} color="#FF9900" strokeWidth={1.8} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: -0.3 }}>CloudShield Command Center</h1>
                            {isIam && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#0972d3', background: 'rgba(9,114,211,0.1)', border: '1px solid rgba(9,114,211,0.25)', borderRadius: 4, padding: '2px 7px', letterSpacing: 0.5 }}>IAM USER</span>
                            )}
                            {monitorRunning && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#067340', background: 'rgba(6,115,64,0.1)', border: '1px solid rgba(6,115,64,0.25)', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#067340', display: 'inline-block', animation: 'ov-pulse 1.4s ease infinite' }} />
                                    LIVE MONITOR
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text2)', background: 'var(--bg3,rgba(35,47,62,0.06))', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>{awsId}</span>
                            <span style={{ color: 'var(--border2,var(--border))' }}>·</span>
                            <span>{profile}</span>
                            <span style={{ color: 'var(--border2,var(--border))' }}>·</span>
                            <span style={{ color: '#0972d3', fontWeight: 600 }}>{region}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Live clock */}
                    <div style={{ textAlign: 'right', background: 'var(--bg3,rgba(35,47,62,0.05))', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.5 }}>{time.toLocaleTimeString()}</div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace', marginTop: 1 }}>{time.toLocaleDateString()}</div>
                    </div>

                    {scanning && (
                        <button onClick={stopScan}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 14px', borderRadius:7, background:'rgba(209,50,18,0.1)', color:'#d13212', border:'1px solid rgba(209,50,18,0.3)', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background='rgba(209,50,18,0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background='rgba(209,50,18,0.1)'}>
                            <Square size={11} fill="#d13212" /> Stop
                        </button>
                    )}

                    <button onClick={triggerScan} disabled={scanning}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, background: scanning?'rgba(255,153,0,0.55)':'#FF9900', color:'#232F3E', border:'none', cursor: scanning?'not-allowed':'pointer', fontSize:12, fontWeight:800, boxShadow: !scanning?'0 3px 10px rgba(255,153,0,0.35)':'none', transition:'all 0.15s', letterSpacing:0.2 }}
                        onMouseEnter={e => { if (!scanning) { e.currentTarget.style.background='#ec8a00'; e.currentTarget.style.transform='translateY(-1px)' } }}
                        onMouseLeave={e => { if (!scanning) { e.currentTarget.style.background='#FF9900'; e.currentTarget.style.transform='translateY(0)' } }}>
                        {scanning
                            ? <><div style={{ width:11, height:11, borderRadius:'50%', border:'2px solid rgba(35,47,62,0.3)', borderTopColor:'#232F3E', animation:'spin 0.7s linear infinite' }} />Scanning...</>
                            : <><Search size={12} />Run Scan</>
                        }
                    </button>
                </div>
            </div>

            {/* ── 2. STAT TILES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, flexShrink: 0 }}>
                <StatTile label="Total Findings" value={hasScan ? totalFindings : '—'} sub={hasScan ? 'last scan' : 'run a scan'} valueColor="var(--text)" icon={Search} accentColor="#637282" animDelay="0s"
                    onClick={hasScan ? () => onNav('scanner') : undefined} />
                <StatTile label="Critical" value={hasScan ? criticalCount : '—'} sub="immediate fix" valueColor={criticalCount > 0 ? '#d13212' : 'var(--text)'} icon={AlertTriangle} accentColor="#d13212" animDelay=".05s"
                    onClick={hasScan ? () => { setHighlightFindingId('__filter_CRITICAL__'); onNav('scanner') } : undefined} />
                <StatTile label="High" value={hasScan ? highCount : '—'} sub="need attention" valueColor={highCount > 0 ? '#e67e22' : 'var(--text)'} icon={ShieldAlert} accentColor="#e67e22" animDelay=".10s"
                    onClick={hasScan ? () => { setHighlightFindingId('__filter_HIGH__'); onNav('scanner') } : undefined} />
                <StatTile label="Medium" value={hasScan ? mediumCount : '—'} sub="moderate risk" valueColor={mediumCount > 0 ? '#f59e0b' : 'var(--text)'} icon={Activity} accentColor="#f59e0b" animDelay=".15s"
                    onClick={hasScan ? () => { setHighlightFindingId('__filter_MEDIUM__'); onNav('scanner') } : undefined} />
                <StatTile label="Low" value={hasScan ? lowCount : '—'} sub="low priority" valueColor={lowCount > 0 ? '#0972d3' : 'var(--text)'} icon={Shield} accentColor="#0972d3" animDelay=".20s"
                    onClick={hasScan ? () => { setHighlightFindingId('__filter_LOW__'); onNav('scanner') } : undefined} />
                <StatTile label="Attack Surface" value="→" sub="exposure map" valueColor="#d13212" icon={ShieldAlert} accentColor="#d13212" animDelay=".25s" onClick={() => onNav('attack-surface')} />
                <StatTile label="Scan Events" value={history?.total_events ?? '—'} sub="history log" valueColor="var(--text)" icon={History} accentColor="#0a8a6a" animDelay=".30s" onClick={() => onNav('history')} />
            </div>

            {/* ── 3. THREAT MONITOR STRIP ── */}
            <div style={{
                background: 'var(--bg2)',
                border: `1px solid ${monitorRunning ? 'rgba(6,115,64,0.3)' : 'var(--border)'}`,
                borderRadius: 10, padding: '8px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: monitorRunning ? '0 0 0 0 rgba(6,115,64,0)' : 'var(--card-shadow)',
                flexShrink: 0,
                transition: 'border-color 0.4s, box-shadow 0.4s',
                animation: monitorRunning ? 'ov-glow 3s ease infinite' : 'none',
            }}>
                {/* Animated status indicator */}
                <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                    {/* Outer pulse ring — only when active */}
                    {monitorRunning && (
                        <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid rgba(6,115,64,0.3)', animation: 'pulse 2s ease infinite' }} />
                    )}
                    {/* Inner circle */}
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: monitorRunning ? 'rgba(6,115,64,0.12)' : 'rgba(105,112,119,0.1)', border: `2px solid ${monitorRunning ? '#067340' : 'var(--border2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.4s ease' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: monitorRunning ? '#067340' : '#687078', boxShadow: monitorRunning ? '0 0 6px rgba(6,115,64,0.6)' : 'none', transition: 'all 0.4s ease', animation: monitorRunning ? 'pulse 1.8s ease infinite' : 'none' }} />
                    </div>
                </div>

                {/* Label + status text */}
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Threat Monitor</div>
                    <div style={{ fontSize: 10, color: monitorRunning ? '#067340' : '#d13212', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {monitorRunning
                            ? <><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#067340', animation: 'pulse 1.5s ease infinite' }} />Active — real-time protection on</>
                            : <><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#d13212' }} />Inactive — real-time protection off</>
                        }
                    </div>
                </div>

                {/* Scan status inline */}
                {scanning && <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#0972d3', fontSize: 11, flexShrink: 0 }}><Activity size={11} color="#0972d3" /><span style={{ fontWeight: 600 }}>Scanning...</span></div>}
                {scanStatus === 'error' && <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#d13212', fontSize: 11, flexShrink: 0 }}><XCircle size={11} color="#d13212" /><span style={{ fontWeight: 600 }}>Scan failed</span></div>}
                {hasScan && !scanning && <div style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0, fontFamily: 'monospace' }}>Last scan: {totalFindings} findings</div>}

                {/* Execute Fixes shortcut */}
                {hasScan && <button onClick={() => onNav('execute')} style={{ fontSize: 11, fontWeight: 600, color: '#FF9900', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.2)', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', flexShrink: 0 }}>Execute Fixes</button>}

                {/* Windows Defender-style toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => onNav('threats')} style={{ fontSize: 10, color: 'var(--text3)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>View</button>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{monitorToggling ? '…' : monitorRunning ? 'ON' : 'OFF'}</span>
                    <div onClick={toggleMonitor} title={monitorRunning ? 'Stop Monitor' : 'Start Monitor'} style={{
                        width: 44, height: 24, borderRadius: 12, cursor: monitorToggling ? 'wait' : 'pointer',
                        background: monitorToggling ? '#f59e0b' : monitorRunning ? '#067340' : (dark ? '#3d4449' : '#d5dbdb'),
                        position: 'relative', transition: 'background 0.3s ease',
                        border: `1.5px solid ${monitorRunning ? 'rgba(6,115,64,0.4)' : 'rgba(35,47,62,0.15)'}`,
                        boxShadow: monitorRunning ? '0 0 8px rgba(6,115,64,0.3)' : 'none',
                        opacity: monitorToggling ? 0.7 : 1,
                    }}>
                        <div style={{
                            position: 'absolute', top: 2,
                            left: monitorRunning ? 22 : 2,
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                            transition: 'left 0.3s ease',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {monitorRunning && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#067340' }} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 4. MAIN CARD ROW: Risk Score | Recent Findings (wide) | Quick Actions ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 280px', gap: 10, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
                {/* A. RISK SCORE */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Activity} label="Risk Score" action={<button onClick={fetchRiskScore} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}><RefreshCw size={10} /></button>} />
                    {/* Always show spinner while loading — never show stale score */}
                    {loadingRisk
                        ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,153,0,0.2)', borderTopColor: '#FF9900', animation: 'spin 0.7s linear infinite' }} /></div>
                        : (riskData && riskData.risk_score != null)
                            ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
                                <div style={{ marginBottom: 4, marginTop: 4 }}><RiskDial score={riskData.risk_score} color={scoreColor} dark={dark} /></div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, background: `${scoreColor}18`, border: `1px solid ${scoreColor}28`, borderRadius: 4, padding: '2px 10px', letterSpacing: 0.6 }}>{riskLevel}</span>
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>{riskData.active_high_findings ?? 0} active high issues</div>
                                {hasScan && totalFindings > 0 && (
                                    <div style={{ width: '100%', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                                        <SevBar label="CRITICAL" count={criticalCount} color="#d13212" total={totalFindings} dark={dark} />
                                        <SevBar label="HIGH" count={highCount} color="#e67e22" total={totalFindings} dark={dark} />
                                        <SevBar label="MEDIUM" count={mediumCount} color="#f59e0b" total={totalFindings} dark={dark} />
                                        <SevBar label="LOW" count={lowCount} color="#0972d3" total={totalFindings} dark={dark} />
                                    </div>
                                )}
                            </div>
                            : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11, textAlign: 'center', padding: '0 8px' }}>Run a scan to see risk score</div>
                    }
                </Card>

                {/* B. RECENT FINDINGS — radar during scan, findings after */}
                <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardLabel icon={Shield} label="Recent Findings" action={
                        hasScan && !scanning
                            ? <button onClick={() => onNav('scanner')} style={{ fontSize: 10, fontWeight: 600, color: '#FF9900', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.2)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>View All</button>
                            : null
                    } />

                    {/* IDLE — no scan yet */}
                    {scanStatus === 'idle' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                            <Search size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text2)' }}>No scan data</div>
                            <div style={{ fontSize: 11, marginBottom: 12 }}>Run a scan to see security findings</div>
                            <button onClick={triggerScan} style={{ fontSize: 12, fontWeight: 700, color: '#232F3E', background: '#FF9900', border: 'none', borderRadius: 5, padding: '7px 18px', cursor: 'pointer' }}>
                                Run Scan Now
                            </button>
                        </div>
                    )}

                    {/* SCANNING — canvas radar animation */}
                    {scanning && <ScanningDisplay elapsed={elapsed} radarFact={radarFact} />}

                    {/* ERROR */}
                    {scanStatus === 'error' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8 }}>
                            <XCircle size={24} color="#d13212" />
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#d13212' }}>Scan Failed</div>
                            <div style={{ fontSize: 11 }}>Check backend is running on :8000</div>
                            <button onClick={triggerScan} style={{ fontSize: 12, fontWeight: 700, color: '#232F3E', background: '#FF9900', border: 'none', borderRadius: 5, padding: '7px 16px', cursor: 'pointer', marginTop: 4 }}>Retry</button>
                        </div>
                    )}

                    {/* DONE — static scrollable list, click → navigate to scanner with highlight */}
                    {hasScan && !scanning && (
                        <div
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                minHeight: 0,
                                overscrollBehavior: 'contain',
                            }}
                        >
                            {visibleFindings.map((f, i) => (
                                <FindingItem
                                    key={f.id || `finding-${i}`}
                                    f={f}
                                    i={i}
                                    dark={dark}
                                    onNav={onNav}
                                    setHighlightFindingId={setHighlightFindingId}
                                />
                            ))}
                            {totalFindings > 50 && (
                                <button
                                    onClick={() => onNav('scanner')}
                                    style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginTop: 4 }}
                                >
                                    +{totalFindings - 50} more — view all in Scanner
                                </button>
                            )}
                            {totalFindings === 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#067340', padding: '20px 0' }}>
                                    <CheckCircle size={22} style={{ margin: '0 auto 6px', display: 'block' }} />
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>No findings! 🎉</div>
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* C. RIGHT COLUMN: Quick Actions + Premium Account Card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', minHeight: 0 }}>

                    {/* Quick Actions — stable memo, no refresh issues */}
                    <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} accentColor="#FF9900">
                        <CardLabel icon={Zap} label="Quick Actions" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            <QuickAction icon={Search}     label="Full Scan"      desc="Scan all regions"           color="#0972d3" section="scanner"        onNav={onNav} />
                            <QuickAction icon={ShieldAlert} label="Threats"      desc={monitorRunning ? 'Monitor active' : 'Start live monitoring'} color={monitorRunning ? '#067340' : '#f59e0b'} section="threats"       onNav={onNav} />
                            <QuickAction icon={Users}      label="IAM View"       desc="Identity risk matrix"       color="#7953d2" section="iam-view"       onNav={onNav} />
                            <QuickAction icon={Play}       label="Remediation"    desc="Apply remediations"         color="#FF9900" section="execute"        onNav={onNav} />
                            <QuickAction icon={RotateCcw}  label="Rollback"       desc="Revert applied fixes"       color="#6e7f96" section="rollback"       onNav={onNav} />
                            <QuickAction icon={Globe}      label="Attack Surface" desc="Publicly exposed resources" color="#d13212" section="attack-surface"  onNav={onNav} />
                            <QuickAction icon={BarChart2}  label="Analytics"      desc="Risk score & reports"       color="#8B5CF6" section="analytics"       onNav={onNav} />
                            <QuickAction icon={History}    label="History"        desc="Audit log & events"         color="#0a8a6a" section="history"         onNav={onNav} />
                        </div>
                    </Card>

                    {/* Account Info — matches page light/dark theme */}
                    <div style={{
                        flexShrink: 0,
                        background: 'var(--bg2)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--card-shadow)',
                    }}>
                        {/* Orange top accent */}
                        <div style={{ height: 2, background: 'linear-gradient(90deg, #FF9900, #FF990055)', flexShrink: 0 }} />
                        <div style={{ padding: '10px 12px' }}>
                            {/* Header */}
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
                                <div style={{ width:22, height:22, borderRadius:6, background:'rgba(255,153,0,0.1)', border:'1px solid rgba(255,153,0,0.22)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                    <Shield size={11} color="#FF9900" />
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:8, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:1 }}>Connected Account</div>
                                    <div style={{ fontSize:10, fontWeight:700, color:'var(--text)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{awsId}</div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#1d8102', boxShadow:'0 0 5px rgba(29,129,2,0.5)', animation:'ov-pulse 2s ease-in-out infinite' }} />
                                    <span style={{ fontSize:8.5, color:'#1d8102', fontWeight:800, letterSpacing:0.5 }}>LIVE</span>
                                </div>
                            </div>
                            {/* 2×2 info grid */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                                {[
                                    { label:'Identity', value: profile },
                                    { label:'Type',     value: isIam ? 'IAM User' : 'Root', valueColor: isIam ? '#0972d3' : '#FF9900' },
                                    { label:'Region',   value: region,   valueColor: '#0972d3' },
                                    { label:'Version',  value: appVersion ? `v${appVersion}` : '—' },
                                ].map(row => (
                                    <div key={row.label} style={{ background: 'var(--bg3, rgba(35,47,62,0.04))', borderRadius:6, padding:'5px 7px', border:'1px solid var(--border)' }}>
                                        <div style={{ fontSize:7.5, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.7, marginBottom:2 }}>{row.label}</div>
                                        <div style={{ fontSize:9.5, fontWeight:700, color: row.valueColor || 'var(--text)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}