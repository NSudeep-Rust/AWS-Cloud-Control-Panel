import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'
import { Wrench, CheckCircle, AlertTriangle, Clock, Info, Play, Zap, ChevronDown, ChevronRight, Shield } from 'lucide-react'

const API = 'http://localhost:8000'

const SEV = {
    CRITICAL: { border: '#d13212', bg: 'rgba(209,50,18,0.05)', badge: '#d13212', badgeBg: 'rgba(209,50,18,0.1)' },
    HIGH:     { border: '#e07b00', bg: 'rgba(224,123,0,0.05)',  badge: '#e07b00', badgeBg: 'rgba(224,123,0,0.08)' },
    MEDIUM:   { border: '#d4a017', bg: 'rgba(212,160,23,0.05)', badge: '#9a7009', badgeBg: 'rgba(212,160,23,0.1)' },
    LOW:      { border: '#3ea97c', bg: 'rgba(62,169,124,0.05)', badge: '#1d6a4a', badgeBg: 'rgba(62,169,124,0.1)' },
    INFO:     { border: '#5b9bd5', bg: 'rgba(91,155,213,0.05)', badge: '#1a6296', badgeBg: 'rgba(91,155,213,0.1)' },
}
const sevOr = s => SEV[s?.toUpperCase()] || SEV.INFO

function fmtType(t) { return (t || 'Unknown').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }
function fmtAction(a) { return (a || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function fmtTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const REMEDY_CARDS = [
    { icon: '🔑', title: 'IAM Policy',      sub: 'Detach admin policies',         color: '#e07b00' },
    { icon: '📦', title: 'S3 Bucket',       sub: 'Block public access',           color: '#5b9bd5' },
    { icon: '🌐', title: 'VPC Flow Logs',   sub: 'Enable network logging',        color: '#3ea97c' },
    { icon: '🛡️', title: 'Security Group',  sub: 'Restrict open rules',           color: '#e07b00' },
    { icon: '📋', title: 'CloudTrail',      sub: 'Enable audit trail',            color: '#5b9bd5' },
    { icon: '🔒', title: 'KMS Keys',        sub: 'Enable key rotation',           color: '#3ea97c' },
    { icon: '💻', title: 'EC2 IMDSv2',      sub: 'Enforce metadata v2',           color: '#e07b00' },
    { icon: '🗄️', title: 'RDS Access',      sub: 'Disable public exposure',       color: '#5b9bd5' },
    { icon: '🔑', title: 'Access Keys',     sub: 'Disable stale keys',            color: '#3ea97c' },
    { icon: '🔥', title: 'Firewall Rules',  sub: 'Restrict NACL inbound',         color: '#e07b00' },
]

// ── Remediation empty state — Fix Pipeline ───────────────────────────────────
function RemediationEmptyState() {
    const STEPS = [
        { icon: '🔍', label: 'DETECT',  sub: 'Scan findings',    color: '#e07b00' },
        { icon: '📋', label: 'PLAN',    sub: 'Generate fix plan', color: '#FF9900' },
        { icon: '⚡', label: 'EXECUTE', sub: 'Apply to AWS',      color: '#1d8102' },
        { icon: '✅', label: 'FIXED',   sub: 'Mark resolved',     color: '#0972d3' },
    ]
    const MODULES = [
        { icon: '🔑', name: 'IAM',        color: '#e07b00' },
        { icon: '📦', name: 'S3',         color: '#0972d3' },
        { icon: '🌐', name: 'VPC',        color: '#1d8102' },
        { icon: '💻', name: 'EC2',        color: '#e07b00' },
        { icon: '🗄️', name: 'RDS',        color: '#0972d3' },
        { icon: '🔒', name: 'KMS',        color: '#1d8102' },
        { icon: '📋', name: 'CloudTrail', color: '#e07b00' },
        { icon: '🛡️', name: 'Firewall',   color: '#0972d3' },
    ]

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid rgba(255,153,0,0.2)',
            borderTop: '4px solid #FF9900',
            borderRadius: 14,
            padding: '48px 48px 52px',
            boxShadow: '0 4px 24px rgba(255,153,0,0.10), 0 1px 6px rgba(0,0,0,0.07)',
            display: 'flex', flexDirection: 'column', gap: 0,
            minHeight: 'calc(100vh - 190px)',
            justifyContent: 'space-between',
        }}>
            <style>{`
                @keyframes dotFlow {
                    0%   { left: -12px; opacity: 0 }
                    15%  { opacity: 1 }
                    85%  { opacity: 1 }
                    100% { left: calc(100% + 12px); opacity: 0 }
                }
                @keyframes stageActive {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,153,0,0) }
                    50%      { transform: scale(1.05); box-shadow: 0 0 18px rgba(255,153,0,0.35) }
                }
                @keyframes remBlink { 0%,100% { opacity:1 } 50% { opacity:0.15 } }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 44 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#FF9900', letterSpacing: 1.6, textTransform: 'uppercase' }}>
                    ⚡ Auto-Remediation Pipeline
                </div>
                <div style={{ flex: 1, height: 1.5, background: 'rgba(255,153,0,0.18)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#8d9191' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d8102', display: 'inline-block', animation: 'remBlink 1.2s ease infinite' }} />
                    37 actions ready · 8 service engines online
                </div>
            </div>

            {/* Pipeline steps */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 0, flex: 1 }}>
                {STEPS.map((step, i) => (
                    <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1, height: '100%' }}>
                        {/* Step box */}
                        <div style={{
                            flex: 1, textAlign: 'center', padding: '48px 16px',
                            background: `${step.color}07`,
                            border: `1px solid ${step.color}35`,
                            borderRadius: 14,
                            animation: `stageActive 3s ease ${i * 0.75}s infinite`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <div style={{ fontSize: 44, marginBottom: 14 }}>{step.icon}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: step.color, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' }}>{step.label}</div>
                            <div style={{ fontSize: 11, color: '#8d9191', lineHeight: 1.5 }}>{step.sub}</div>
                        </div>

                        {/* Connector with flowing dot */}
                        {i < STEPS.length - 1 && (
                            <div style={{ width: 44, flexShrink: 0, position: 'relative', height: 2.5, background: 'linear-gradient(90deg, rgba(255,153,0,0.22), rgba(255,153,0,0.08))' }}>
                                <div style={{
                                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: STEPS[i + 1].color,
                                    boxShadow: `0 0 8px ${STEPS[i + 1].color}`,
                                    animation: `dotFlow 2.8s ease ${i * 0.7}s infinite`,
                                }} />
                                <div style={{
                                    position: 'absolute', right: -1, top: '50%', transform: 'translateY(-50%)',
                                    width: 0, height: 0,
                                    borderTop: '5px solid transparent', borderBottom: '5px solid transparent',
                                    borderLeft: '6px solid rgba(255,153,0,0.35)',
                                }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Module pills + CTA */}
            <div style={{ borderTop: '1px solid rgba(35,47,62,0.07)', paddingTop: 28, marginTop: 44 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 14 }}>
                    Service Engines
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                    {MODULES.map(m => (
                        <div key={m.name} style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '7px 14px', borderRadius: 20,
                            background: `${m.color}0d`,
                            border: `1px solid ${m.color}35`,
                            fontSize: 12, fontWeight: 600, color: m.color,
                        }}>
                            <span>{m.icon}</span> {m.name}
                        </div>
                    ))}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 20,
                        background: 'rgba(35,47,62,0.04)', border: '1px solid rgba(35,47,62,0.1)',
                        fontSize: 12, color: '#8d9191',
                    }}>
                        +5 more
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#8d9191' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FF990015', border: '1px solid #FF990030', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🔍</div>
                    Run a security scan from the <strong style={{ color: '#e07b00', cursor: 'pointer', fontSize: 12 }}>Scanner</strong> to auto-load fixable findings into this pipeline.
                </div>
            </div>
        </div>
    )
}

// ── Severity badge ───────────────────────────────────────────────────────────
function SevBadge({ severity }) {
    const s = sevOr(severity)
    return (
        <span style={{
            fontSize: 9, fontWeight: 800, color: s.badge,
            background: s.badgeBg, borderRadius: 4, padding: '2px 6px',
            letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 0,
        }}>{severity || 'INFO'}</span>
    )
}

// ── Service icon mapping ─────────────────────────────────────────────────────
const SERVICE_ICONS = {
    IAM: '🔑', S3: '📦', EC2: '💻', VPC: '🌐', RDS: '🗄️',
    KMS: '🔒', CLOUDTRAIL: '📋', EBS: '💾', NACL: '🔥', SECURITY_GROUP: '🛡️',
    SG: '🛡️', IMD: '📡', ACCESS: '🗝️', DEFAULT: '⚡',
}
function getServiceIcon(type) {
    if (!type) return SERVICE_ICONS.DEFAULT
    const t = type.toUpperCase()
    for (const [k, v] of Object.entries(SERVICE_ICONS)) {
        if (t.includes(k)) return v
    }
    return SERVICE_ICONS.DEFAULT
}

// ── Single finding card (auto-fix) ─────────────────────────────────────────
function FindingCard({ finding, scanId, onExecuted, dark }) {
    const s = sevOr(finding.severity)
    const [phase, setPhase] = useState('idle')
    const [plan, setPlan] = useState(null)
    const [execResult, setExecResult] = useState(null)
    const [countdown, setCountdown] = useState(300)
    const [approvalToken, setApprovalToken] = useState(null)
    const [expanded, setExpanded] = useState(false)
    const [hovered, setHovered] = useState(false)
    const countRef = useRef(null)
    const pollRef = useRef(null)

    const isOpen = expanded || ['planning','planned','executing','approval','error'].includes(phase)

    function startCountdown() {
        setCountdown(300)
        clearInterval(countRef.current)
        countRef.current = setInterval(() => {
            setCountdown(c => { if (c <= 1) { clearInterval(countRef.current); return 0 } return c - 1 })
        }, 1000)
    }

    useEffect(() => () => { clearInterval(countRef.current); clearInterval(pollRef.current) }, [])

    async function handleDryRun() {
        setExpanded(true)
        setPhase('planning')
        try {
            const r = await axios.post(`${API}/api/execute/`, { scan_id: scanId, finding_ids: [finding.id], mode: 'DRY_RUN' })
            const plans = r.data?.data?.plans || []
            setPlan(plans[0] || null)
            setPhase('planned')
        } catch { setPhase('error') }
    }

    async function handleExecute(token = null, confirm = false) {
        setPhase('executing')
        try {
            await axios.post(`${API}/api/execute/`, {
                scan_id: scanId, finding_ids: [finding.id], mode: 'LIVE',
                ...(token ? { approval_token: token, confirm } : {}),
            })
            pollRef.current = setInterval(async () => {
                try {
                    const r = await axios.get(`${API}/api/execute/executions?scan_id=${scanId}`)
                    const mine = (r.data?.data?.executions || []).find(e => e.finding_id === finding.id)
                    if (mine) {
                        clearInterval(pollRef.current)
                        if (mine.status === 'EXECUTED') {
                            setExecResult(mine); setPhase('done')
                            setTimeout(() => onExecuted(finding.id), 1800)
                        } else if (['BLOCKED_BY_POLICY', 'REQUIRE_APPROVAL'].includes(mine.status)) {
                            setApprovalToken(mine.approval_token); setPhase('approval'); startCountdown()
                        } else if (mine.status === 'MANUAL_REQUIRED') {
                            setPhase('manual')
                        } else { setExecResult(mine); setPhase('error') }
                    }
                } catch { clearInterval(pollRef.current) }
            }, 2000)
        } catch { setPhase('error') }
    }

    const accentMap = {
        CRITICAL: { glow: 'rgba(209,50,18,0.14)', stripe: '#d13212', light: 'rgba(209,50,18,0.06)', tag: '#d13212' },
        HIGH:     { glow: 'rgba(224,123,0,0.12)',  stripe: '#e07b00', light: 'rgba(255,153,0,0.07)', tag: '#e07b00' },
        MEDIUM:   { glow: 'rgba(212,160,23,0.10)', stripe: '#c8960c', light: 'rgba(212,160,23,0.06)', tag: '#c8960c' },
        LOW:      { glow: 'rgba(62,169,124,0.09)', stripe: '#3ea97c', light: 'rgba(62,169,124,0.06)', tag: '#3ea97c' },
    }
    const accent = accentMap[finding.severity] || accentMap.LOW
    const icon = getServiceIcon(finding.type)

    if (phase === 'done') return null

    return (
        <div
            style={{
                position: 'relative',
                borderRadius: isOpen ? '14px 14px 0 0' : 14,
                transition: 'all 0.28s cubic-bezier(0.34,1.3,0.64,1)',
                transform: hovered && !isOpen ? 'translateY(-3px)' : 'none',
                zIndex: isOpen ? 10 : hovered ? 3 : 1,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => !isOpen && setHovered(false)}
        >
            <style>{`
                @keyframes fcPopIn  { 0%{opacity:0;transform:translateY(-6px) scaleY(0.96)} 100%{opacity:1;transform:none} }
                @keyframes fcSpin   { to{transform:rotate(360deg)} }
                @keyframes fcSlide  { 0%{opacity:0;transform:translateX(-8px)} 100%{opacity:1;transform:none} }
                @keyframes fcDone   { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.25)} 100%{transform:scale(1);opacity:1} }
                @keyframes fcShine  { 0%{left:-80px} 100%{left:calc(100% + 80px)} }
            `}</style>

            {/* ── MAIN CARD ── */}
            <div
                onClick={() => setExpanded(x => !x)}
                style={{
                    background: dark ? '#1a2133' : '#ffffff',
                    border: `1.5px solid ${isOpen || hovered ? accent.stripe + 'aa' : accent.stripe + '30'}`,
                    borderRadius: isOpen ? '14px 14px 0 0' : 14,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: isOpen
                        ? `0 0 0 2px ${accent.stripe}22, 0 8px 32px ${accent.glow}`
                        : hovered
                            ? `0 8px 28px ${accent.glow}, 0 2px 8px rgba(0,0,0,0.08)`
                            : '0 2px 8px rgba(15,17,17,0.06)',
                    transition: 'all 0.22s ease',
                    userSelect: 'none',
                }}
            >
                {/* Severity color bar across the top */}
                <div style={{
                    height: 4,
                    background: `linear-gradient(90deg, ${accent.stripe}, ${accent.stripe}88)`,
                    position: 'relative', overflow: 'hidden',
                }}>
                    {/* Shine sweep on hover */}
                    {hovered && <div style={{
                        position: 'absolute', top: 0, width: 80, height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                        animation: 'fcShine 0.7s ease forwards',
                    }} />}
                </div>

                {/* Card body */}
                <div style={{ padding: '14px 18px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* Service icon box */}
                    <div style={{
                        width: 46, height: 46, borderRadius: 10, flexShrink: 0,
                        background: accent.light,
                        border: `1.5px solid ${accent.stripe}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22,
                        boxShadow: `0 2px 8px ${accent.glow}`,
                        transition: 'transform 0.2s ease',
                        transform: hovered ? 'scale(1.07)' : 'none',
                    }}>
                        {icon}
                    </div>

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Top row: title + badges + status */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 700,
                                    color: dark ? '#e6edf3' : '#0f1111',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    marginBottom: 2,
                                }}>
                                    {fmtType(finding.type)}
                                </div>
                                <div style={{
                                    fontSize: 10.5, color: dark ? '#8b949e' : '#565959',
                                    fontFamily: 'monospace',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {finding.resource_id}{finding.region ? ` · ${finding.region}` : ''}
                                </div>
                            </div>

                            {/* Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                <span style={{
                                    fontSize: 9, fontWeight: 800, color: accent.tag,
                                    background: `${accent.tag}18`, borderRadius: 4,
                                    padding: '3px 7px', letterSpacing: 0.7, textTransform: 'uppercase',
                                    border: `1px solid ${accent.tag}30`,
                                }}>
                                    {finding.severity || 'INFO'}
                                </span>
                                <span style={{
                                    fontSize: 9, fontWeight: 700, color: '#0972d3',
                                    background: 'rgba(9,114,211,0.1)', borderRadius: 4,
                                    padding: '3px 7px', border: '1px solid rgba(9,114,211,0.2)',
                                }}>
                                    {finding.remediation_type || 'AUTO'}
                                </span>
                            </div>

                            {/* Phase status pill */}
                            <div style={{ flexShrink: 0 }}>
                                {phase === 'idle' && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 10, fontWeight: 600,
                                        color: hovered || isOpen ? accent.stripe : '#8d9191',
                                        transition: 'color 0.15s',
                                    }}>
                                        <Play size={9} /> Fix It
                                        <span style={{ opacity: 0.4, fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span>
                                    </div>
                                )}
                                {phase === 'planning' && (
                                    <div style={{ width: 13, height: 13, border: `2px solid ${accent.stripe}`,
                                        borderTopColor: 'transparent', borderRadius: '50%', animation: 'fcSpin 0.7s linear infinite' }} />
                                )}
                                {phase === 'planned' && (
                                    <span style={{ fontSize: 10, color: '#FF9900', fontWeight: 700, whiteSpace: 'nowrap' }}>⚡ Ready</span>
                                )}
                                {phase === 'executing' && (
                                    <div style={{ width: 13, height: 13, border: '2px solid #FF9900',
                                        borderTopColor: 'transparent', borderRadius: '50%', animation: 'fcSpin 0.7s linear infinite' }} />
                                )}
                                {phase === 'done' && (
                                    <CheckCircle size={16} color="#1d8102" style={{ animation: 'fcDone 0.4s ease' }} />
                                )}
                                {phase === 'approval' && (
                                    <span style={{ fontSize: 10, color: '#d13212', fontWeight: 700 }}>
                                        🔐 {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,'0')}
                                    </span>
                                )}
                                {phase === 'error' && (
                                    <span style={{ fontSize: 10, color: '#d13212', fontWeight: 700 }}>✕ Failed</span>
                                )}
                            </div>
                        </div>

                        {/* Description — always visible */}
                        {finding.recommended_fix && (
                            <div style={{
                                fontSize: 11.5, color: dark ? '#a0b0c0' : '#3d4f60',
                                lineHeight: 1.65,
                                padding: '8px 11px',
                                background: dark ? 'rgba(255,255,255,0.04)' : accent.light,
                                border: `1px solid ${accent.stripe}20`,
                                borderRadius: 7,
                                marginTop: 8,
                            }}>
                                <span style={{ fontSize: 12, marginRight: 6, opacity: 0.85 }}>💡</span>
                                {finding.recommended_fix}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom action bar — always visible */}
                <div style={{
                    padding: '9px 18px',
                    borderTop: `1px solid ${accent.stripe}18`,
                    background: dark ? 'rgba(255,255,255,0.02)' : `${accent.stripe}05`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ fontSize: 10, color: dark ? '#555f6b' : '#8d9191', fontFamily: 'monospace' }}>
                        {finding.type?.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 10, color: accent.stripe, fontWeight: 700 }}>
                        {isOpen ? '▲ Collapse' : '▼ Expand & Fix'}
                    </div>
                </div>
            </div>

            {/* ── EXPANDING ACTION DRAWER ── */}
            {isOpen && (
                <div style={{
                    background: dark ? '#111827' : '#fffcf5',
                    border: `1.5px solid ${accent.stripe}aa`,
                    borderTop: `2px dashed ${accent.stripe}44`,
                    borderRadius: '0 0 14px 14px',
                    padding: '18px 20px 20px',
                    boxShadow: `0 18px 48px ${accent.glow}, 0 4px 16px rgba(0,0,0,0.09)`,
                    animation: 'fcPopIn 0.24s cubic-bezier(0.34,1.3,0.64,1)',
                }}>
                    {/* Phase: idle — Dry Run CTA */}
                    {phase === 'idle' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, animation: 'fcSlide 0.18s ease' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDryRun() }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 22px', borderRadius: 9, border: 'none',
                                    background: `linear-gradient(135deg, ${accent.stripe}, ${accent.stripe}cc)`,
                                    color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                                    boxShadow: `0 4px 18px ${accent.stripe}44`,
                                    transition: 'all 0.18s',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 7px 24px ${accent.stripe}60` }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 18px ${accent.stripe}44` }}
                            >
                                <Play size={13} fill="#fff" /> Run Dry Run
                            </button>
                            <div style={{ fontSize: 11, color: dark ? '#8b949e' : '#687078', lineHeight: 1.6 }}>
                                <strong style={{ color: dark ? '#cdd5e0' : '#3d4f60', display: 'block', marginBottom: 2 }}>
                                    Safe preview mode
                                </strong>
                                Simulates the fix — no changes made to AWS until you approve
                            </div>
                        </div>
                    )}

                    {/* Phase: planning */}
                    {phase === 'planning' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 18, height: 18, border: `2.5px solid ${accent.stripe}`,
                                borderTopColor: 'transparent', borderRadius: '50%', animation: 'fcSpin 0.7s linear infinite', flexShrink: 0 }} />
                            <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: dark ? '#e6edf3' : '#0f1111' }}>Generating fix plan...</div>
                                <div style={{ fontSize: 10, color: '#8d9191', marginTop: 2 }}>Analyzing {finding.resource_id}</div>
                            </div>
                        </div>
                    )}

                    {/* Phase: planned — Show plan + Execute button */}
                    {plan && phase === 'planned' && (
                        <div style={{ animation: 'fcPopIn 0.25s ease' }}>
                            {/* Plan box */}
                            <div style={{
                                padding: '13px 16px', borderRadius: 10,
                                background: dark ? 'rgba(255,153,0,0.07)' : '#fffbef',
                                border: '1.5px solid rgba(224,123,0,0.28)',
                                marginBottom: 14,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#c07000',
                                        textTransform: 'uppercase', letterSpacing: 1.1 }}>📋 Dry Run Plan</span>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(192,112,0,0.2)' }} />
                                    <span style={{ fontSize: 9, color: '#8d9191', background: 'rgba(0,0,0,0.04)',
                                        padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.08)' }}>PREVIEW</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 11.5 }}>
                                    <span style={{ color: dark ? '#8b949e' : '#687078', fontWeight: 600 }}>Action</span>
                                    <span style={{ color: dark ? '#ffd19e' : '#7a4b00', fontWeight: 700 }}>{fmtAction(plan.action)}</span>
                                    <span style={{ color: dark ? '#8b949e' : '#687078', fontWeight: 600 }}>Reason</span>
                                    <span style={{ color: dark ? '#b0bec5' : '#3d4f60', lineHeight: 1.6 }}>{plan.reason}</span>
                                </div>
                            </div>
                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleExecute() }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '10px 22px', borderRadius: 9, border: 'none',
                                        background: 'linear-gradient(135deg, #FF9900, #ec8a00)',
                                        color: '#0f1111', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                                        boxShadow: '0 4px 16px rgba(255,153,0,0.45)',
                                        transition: 'all 0.16s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 7px 24px rgba(255,153,0,0.6)' }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,153,0,0.45)' }}
                                >
                                    <Zap size={13} />⚡ Apply Fix to AWS
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setPhase('idle'); setExpanded(false) }}
                                    style={{
                                        padding: '10px 16px', borderRadius: 9,
                                        border: '1px solid rgba(35,47,62,0.15)',
                                        background: 'transparent',
                                        color: dark ? '#8b949e' : '#565959',
                                        fontSize: 11.5, cursor: 'pointer',
                                    }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Phase: executing */}
                    {phase === 'executing' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, animation: 'fcSlide 0.2s ease' }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                border: '3px solid rgba(255,153,0,0.15)',
                                borderTopColor: '#FF9900',
                                animation: 'fcSpin 0.75s linear infinite',
                                boxShadow: '0 0 12px rgba(255,153,0,0.25)',
                            }} />
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: dark ? '#e6edf3' : '#0f1111', marginBottom: 3 }}>
                                    Applying fix to AWS...
                                </div>
                                <div style={{ fontSize: 10.5, color: '#8d9191' }}>
                                    Making live changes to <strong style={{ fontFamily: 'monospace' }}>{finding.resource_id}</strong>
                                </div>
                                <div style={{ fontSize: 10, color: '#d13212', marginTop: 4, fontWeight: 600 }}>
                                    ⚠ Do not close — changes are being applied
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Phase: approval */}
                    {phase === 'approval' && (
                        <div style={{
                            padding: '14px 16px', borderRadius: 10,
                            background: dark ? 'rgba(209,50,18,0.07)' : '#fff8f5',
                            border: '1.5px solid rgba(209,50,18,0.28)',
                            animation: 'fcPopIn 0.25s ease',
                        }}>
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#d13212',
                                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                🔐 Approval Required
                            </div>
                            <div style={{ fontSize: 12, color: dark ? '#8b949e' : '#565959', marginBottom: 14, lineHeight: 1.7 }}>
                                Blocked by safety policy. Approval token expires in{' '}
                                <strong style={{ color: countdown < 60 ? '#d13212' : '#e07b00', fontFamily: 'monospace', fontSize: 14 }}>
                                    {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                                </strong>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleExecute(approvalToken, true) }}
                                disabled={countdown === 0}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 22px', borderRadius: 9, border: 'none',
                                    background: countdown > 0 ? '#d13212' : '#8d9191',
                                    color: '#fff', fontSize: 12.5, fontWeight: 800,
                                    cursor: countdown > 0 ? 'pointer' : 'not-allowed',
                                    boxShadow: countdown > 0 ? '0 4px 14px rgba(209,50,18,0.38)' : 'none',
                                }}
                            >
                                <Clock size={13} /> ✅ Confirm & Execute
                            </button>
                        </div>
                    )}

                    {/* Phase: error */}
                    {phase === 'error' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <AlertTriangle size={20} color="#d13212" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#d13212', marginBottom: 2 }}>Execution Failed</div>
                                <div style={{ fontSize: 11, color: dark ? '#8b949e' : '#687078' }}>Check backend logs for details</div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setPhase('idle') }}
                                style={{ fontSize: 11, fontWeight: 700, color: accent.stripe, background: `${accent.stripe}12`,
                                    border: `1px solid ${accent.stripe}30`, borderRadius: 7,
                                    padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Retry
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Manual finding card (advisory only) — matches FindingCard style ──────────
function ManualCard({ finding, dark }) {
    const s = sevOr(finding.severity)
    const [hovered, setHovered] = useState(false)

    const accentMap = {
        CRITICAL: { stripe: '#d13212', light: 'rgba(209,50,18,0.06)',  glow: 'rgba(209,50,18,0.12)',  tag: '#d13212' },
        HIGH:     { stripe: '#e07b00', light: 'rgba(255,153,0,0.07)',  glow: 'rgba(224,123,0,0.10)',  tag: '#e07b00' },
        MEDIUM:   { stripe: '#c8960c', light: 'rgba(212,160,23,0.06)', glow: 'rgba(212,160,23,0.09)', tag: '#c8960c' },
        LOW:      { stripe: '#3ea97c', light: 'rgba(62,169,124,0.06)', glow: 'rgba(62,169,124,0.08)', tag: '#3ea97c' },
    }
    const accent = accentMap[finding.severity] || { stripe: '#5b9bd5', light: 'rgba(91,155,213,0.06)', glow: 'rgba(91,155,213,0.09)', tag: '#5b9bd5' }
    const icon = getServiceIcon(finding.type)

    // Generate simple step-by-step instructions from recommended_fix
    const steps = finding.recommended_fix
        ? [finding.recommended_fix]
        : ['Review the resource configuration manually in the AWS Console.',
           'Apply the recommended security hardening based on AWS best practices.',
           'Re-run a scan to verify the issue is resolved.']

    return (
        <div
            style={{
                borderRadius: 14, overflow: 'hidden',
                background: dark ? '#1a2133' : '#ffffff',
                border: `1.5px solid ${hovered ? accent.stripe + 'aa' : accent.stripe + '30'}`,
                boxShadow: hovered
                    ? `0 8px 28px ${accent.glow}, 0 2px 8px rgba(0,0,0,0.08)`
                    : '0 2px 8px rgba(15,17,17,0.06)',
                transform: hovered ? 'translateY(-2px)' : 'none',
                transition: 'all 0.22s ease',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{`@keyframes mcShine { 0%{left:-80px} 100%{left:calc(100% + 80px)} }`}</style>

            {/* Severity top bar */}
            <div style={{ height: 4, background: `linear-gradient(90deg, ${accent.stripe}, ${accent.stripe}66)`, position: 'relative', overflow: 'hidden' }}>
                {hovered && <div style={{ position: 'absolute', top: 0, width: 80, height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)', animation: 'mcShine 0.65s ease forwards' }} />}
            </div>

            {/* Card body */}
            <div style={{ padding: '14px 18px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {/* Service icon */}
                <div style={{
                    width: 46, height: 46, borderRadius: 10, flexShrink: 0,
                    background: accent.light, border: `1.5px solid ${accent.stripe}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    transition: 'transform 0.2s', transform: hovered ? 'scale(1.07)' : 'none',
                }}>
                    {icon}
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#e6edf3' : '#0f1111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                                {fmtType(finding.type)}
                            </div>
                            <div style={{ fontSize: 10.5, color: dark ? '#8b949e' : '#565959', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {finding.resource_id}{finding.region ? ` · ${finding.region}` : ''}
                            </div>
                        </div>
                        {/* Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: accent.tag, background: `${accent.tag}18`, borderRadius: 4, padding: '3px 7px', letterSpacing: 0.7, textTransform: 'uppercase', border: `1px solid ${accent.tag}30` }}>
                                {finding.severity || 'INFO'}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#5b9bd5', background: 'rgba(91,155,213,0.1)', borderRadius: 4, padding: '3px 7px', border: '1px solid rgba(91,155,213,0.2)' }}>
                                MANUAL
                            </span>
                        </div>
                    </div>

                    {/* Steps to fix — always visible */}
                    <div style={{
                        marginTop: 8,
                        background: dark ? 'rgba(91,155,213,0.07)' : '#f0f7ff',
                        border: '1px solid rgba(91,155,213,0.22)',
                        borderRadius: 9, padding: '11px 14px',
                    }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#1a6296', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                            📋 Manual Steps Required
                        </div>
                        {steps.map((step, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < steps.length - 1 ? 8 : 0, alignItems: 'flex-start' }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                    background: 'rgba(91,155,213,0.15)', border: '1px solid rgba(91,155,213,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 800, color: '#1a6296',
                                }}>{i + 1}</div>
                                <div style={{ fontSize: 11.5, color: dark ? '#a0b0c0' : '#3d4f60', lineHeight: 1.65, paddingTop: 1 }}>
                                    {step}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{
                padding: '9px 18px',
                borderTop: `1px solid ${accent.stripe}18`,
                background: dark ? 'rgba(255,255,255,0.02)' : `${accent.stripe}05`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ fontSize: 10, color: dark ? '#555f6b' : '#8d9191', fontFamily: 'monospace' }}>
                    {finding.type?.replace(/_/g, ' ').toUpperCase()}
                </div>
                <div style={{ fontSize: 10, color: '#5b9bd5', fontWeight: 700 }}>
                    🔧 Requires manual intervention
                </div>
            </div>
        </div>
    )
}

// ── Main section ─────────────────────────────────────────────────────────────
export default function RemediationSection({ dark, onNav }) {
    const { account } = useAuth()
    const { scanId: ctxScanId, findings: ctxFindings } = useScan()

    const [scanId, setScanId] = useState(null)
    const [findings, setFindings] = useState([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('auto')
    const [executedIds, setExecutedIds] = useState(new Set())
    const [filterSev, setFilterSev] = useState('ALL')
    const [filterService, setFilterService] = useState('ALL')
    const [searchQ, setSearchQ] = useState('')

    // Load scan + findings
    useEffect(() => {
        async function load() {
            setLoading(true)
            let sid = ctxScanId

            // Fallback: fetch latest scan from history
            if (!sid) {
                try {
                    const r = await axios.get(`${API}/api/scan/history`)
                    sid = r.data?.data?.scan_id || r.data?.data?.scans?.[0]?.scan_id
                } catch { /* ignore */ }
            }

            if (!sid) { setLoading(false); return }
            setScanId(sid)

            try {
                const r = await axios.get(`${API}/api/execute/findings?scan_id=${sid}`)
                setFindings(r.data?.data?.findings || [])
            } catch { setFindings([]) }
            setLoading(false)
        }
        load()
    }, [ctxScanId])

    const handleExecuted = useCallback((id) => {
        setExecutedIds(s => new Set([...s, id]))
    }, [])

    const hasScan = !!scanId
    const autoFindings = findings.filter(f => f.remediation_type === 'AUTO' && !executedIds.has(f.id))
    const manualFindings = findings.filter(f => f.remediation_type === 'MANUAL')

    // ── Compute available services from current tab's findings ──
    const activeBase = tab === 'auto' ? autoFindings : manualFindings
    const uniqueServices = [...new Set(activeBase.map(f => {
        const t = (f.type || '').toUpperCase()
        if (t.includes('IAM')) return 'IAM'
        if (t.includes('S3')) return 'S3'
        if (t.includes('EC2')) return 'EC2'
        if (t.includes('EBS')) return 'EBS'
        if (t.includes('VPC')) return 'VPC'
        if (t.includes('RDS')) return 'RDS'
        if (t.includes('KMS')) return 'KMS'
        if (t.includes('CLOUDTRAIL')) return 'CloudTrail'
        if (t.includes('SG') || t.includes('SECURITY_GROUP')) return 'SecGroup'
        return 'Other'
    }))]

    function applyFilters(list) {
        return list.filter(f => {
            const sev = (f.severity || '').toUpperCase()
            if (filterSev !== 'ALL' && sev !== filterSev) return false
            if (filterService !== 'ALL') {
                const t = (f.type || '').toUpperCase()
                const svc = filterService.toUpperCase()
                if (!t.includes(svc === 'SECGROUP' ? 'SG' : svc)) return false
            }
            if (searchQ.trim()) {
                const q = searchQ.toLowerCase()
                const inTitle = (f.type || '').toLowerCase().replace(/_/g,' ').includes(q)
                const inRes   = (f.resource_id || '').toLowerCase().includes(q)
                if (!inTitle && !inRes) return false
            }
            return true
        })
    }

    const filteredAuto   = applyFilters(autoFindings)
    const filteredManual = applyFilters(manualFindings)

    const text = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#565959'
    const border = dark ? 'rgba(255,255,255,0.08)' : '#e5e8ed'

    return (
        <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'linear-gradient(135deg, #1d6a4a, #3ea97c)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Wrench size={16} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 800, color: text, margin: 0 }}>Remediation</h1>
                        <div style={{ fontSize: 11, color: text2 }}>Auto-fix & manual advisory for security findings</div>
                    </div>
                </div>
                {hasScan && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#1d8102', background: 'rgba(29,128,2,0.1)', border: '1px solid rgba(29,128,2,0.2)', borderRadius: 4, padding: '3px 8px', fontWeight: 600 }}>
                            ● {autoFindings.length} auto-fixable
                        </span>
                        <span style={{ fontSize: 10, color: '#5b9bd5', background: 'rgba(91,155,213,0.1)', border: '1px solid rgba(91,155,213,0.2)', borderRadius: 4, padding: '3px 8px', fontWeight: 600 }}>
                            {manualFindings.length} manual
                        </span>
                    </div>
                )}
            </div>

            {/* ── Loading ── */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 80, color: text2, gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 18, height: 18, border: '2.5px solid #FF9900', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    Loading findings...
                </div>
            )}

            {/* ── No scan ── */}
            {!loading && !hasScan && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
                    <div style={{ width: '100%' }}><RemediationEmptyState /></div>
                </div>
            )}

            {/* ── Has scan ── */}
            {!loading && hasScan && (
                <>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${border}`, paddingBottom: 0 }}>
                        {[
                            { key: 'auto', label: `⚡ Auto-Fix (${autoFindings.length})` },
                            { key: 'manual', label: `📋 Manual (${manualFindings.length})` },
                        ].map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)} style={{
                                padding: '8px 14px', border: 'none', background: 'transparent',
                                cursor: 'pointer', fontSize: 12.5, fontWeight: tab === t.key ? 700 : 400,
                                color: tab === t.key ? '#FF9900' : text2,
                                borderBottom: tab === t.key ? '2.5px solid #FF9900' : '2.5px solid transparent',
                                marginBottom: -1, transition: 'all 0.12s',
                            }}>{t.label}</button>
                        ))}
                    </div>

                    {/* ── Filter Bar ── */}
                    {(autoFindings.length > 0 || manualFindings.length > 0) && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
                            padding: '12px 16px', marginBottom: 16,
                            background: dark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                            border: `1px solid ${border}`,
                            borderRadius: 10,
                        }}>
                            {/* Search input */}
                            <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
                                <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: text2, pointerEvents: 'none' }}>🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search name or resource..."
                                    value={searchQ}
                                    onChange={e => setSearchQ(e.target.value)}
                                    style={{
                                        paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                                        border: `1px solid ${border}`, borderRadius: 7,
                                        background: dark ? '#1c2330' : '#fff',
                                        color: text, fontSize: 11.5, width: '100%',
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            {/* Severity pills */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(sev => {
                                    const colors = { CRITICAL: '#d13212', HIGH: '#e07b00', MEDIUM: '#c8960c', LOW: '#3ea97c' }
                                    const c = colors[sev] || '#8d9191'
                                    const active = filterSev === sev
                                    return (
                                        <button key={sev} onClick={() => setFilterSev(sev)} style={{
                                            padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? c : border}`,
                                            background: active ? (sev === 'ALL' ? '#FF990020' : `${c}18`) : 'transparent',
                                            color: active ? (sev === 'ALL' ? '#e07b00' : c) : text2,
                                            fontSize: 10.5, fontWeight: active ? 700 : 500,
                                            cursor: 'pointer', transition: 'all 0.12s',
                                        }}>
                                            {sev === 'ALL' ? 'All Severity' : sev.charAt(0) + sev.slice(1).toLowerCase()}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Service dropdown */}
                            <select
                                value={filterService}
                                onChange={e => setFilterService(e.target.value)}
                                style={{
                                    padding: '5px 10px', borderRadius: 7,
                                    border: `1px solid ${filterService !== 'ALL' ? '#FF9900' : border}`,
                                    background: dark ? '#1c2330' : '#fff',
                                    color: filterService !== 'ALL' ? '#e07b00' : text,
                                    fontSize: 11.5, cursor: 'pointer', fontWeight: filterService !== 'ALL' ? 700 : 400,
                                    outline: 'none',
                                }}
                            >
                                <option value="ALL">All Services</option>
                                {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            {/* Clear filters */}
                            {(filterSev !== 'ALL' || filterService !== 'ALL' || searchQ) && (
                                <button onClick={() => { setFilterSev('ALL'); setFilterService('ALL'); setSearchQ('') }} style={{
                                    padding: '4px 10px', borderRadius: 7, border: `1px solid rgba(209,50,18,0.3)`,
                                    background: 'rgba(209,50,18,0.07)', color: '#d13212',
                                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                                }}>
                                    ✕ Clear
                                </button>
                            )}

                            {/* Result count */}
                            <div style={{ fontSize: 10, color: text2, marginLeft: 'auto' }}>
                                {tab === 'auto' ? filteredAuto.length : filteredManual.length} of{' '}
                                {tab === 'auto' ? autoFindings.length : manualFindings.length} shown
                            </div>
                        </div>
                    )}

                    {/* Auto tab */}
                    {tab === 'auto' && (
                        filteredAuto.length === 0
                            ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: text2 }}>
                                    {autoFindings.length === 0
                                        ? <><CheckCircle size={36} color="#1d8102" style={{ marginBottom: 12 }} />
                                            <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 6 }}>All auto-fixes applied!</div>
                                            <div style={{ fontSize: 12 }}>Go to Rollback to review or undo executed fixes.</div></>
                                        : <><div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>No matches</div>
                                            <div style={{ fontSize: 12 }}>Try adjusting your filters</div>
                                            <button onClick={() => { setFilterSev('ALL'); setFilterService('ALL'); setSearchQ('') }}
                                                style={{ marginTop: 12, padding: '6px 14px', borderRadius: 7, border: `1px solid ${border}`,
                                                    background: 'transparent', color: '#FF9900', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                                                Clear Filters
                                            </button></>
                                    }
                                </div>
                            )
                            : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {filteredAuto.map(f => (
                                        <FindingCard key={f.id} finding={f} scanId={scanId} onExecuted={handleExecuted} dark={dark} />
                                    ))}
                                </div>
                            )
                    )}

                    {/* Manual tab */}
                    {tab === 'manual' && (
                        filteredManual.length === 0
                            ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: text2 }}>
                                    {manualFindings.length === 0
                                        ? <><CheckCircle size={36} color="#5b9bd5" style={{ marginBottom: 12 }} />
                                            <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 6 }}>No manual findings</div>
                                            <div style={{ fontSize: 12 }}>All findings are handled automatically.</div></>
                                        : <><div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>No matches</div>
                                            <div style={{ fontSize: 12 }}>Try adjusting your filters</div></>
                                    }
                                </div>
                            )
                            : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {filteredManual.map(f => (
                                        <ManualCard key={f.id} finding={f} dark={dark} />
                                    ))}
                                </div>
                            )
                    )}
                </>
            )}
        </div>
    )
}
