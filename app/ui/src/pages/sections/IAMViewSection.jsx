import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'
import { Key, Shield, Users, Settings, Lock, AlertTriangle, CheckCircle, Activity, Globe, Eye, RefreshCw } from 'lucide-react'

const API = 'http://127.0.0.1:8000'

// ─── Risk palette ──────────────────────────────────────────────────────────────
const RISK = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.08)', border: 'rgba(209,50,18,0.28)', badge: '#d13212', badgeBg: 'rgba(209,50,18,0.12)', stripe: '#d13212' },
    HIGH:     { color: '#e07b00', bg: 'rgba(224,123,0,0.08)',  border: 'rgba(224,123,0,0.25)',  badge: '#e07b00', badgeBg: 'rgba(224,123,0,0.10)',  stripe: '#e07b00' },
    MEDIUM:   { color: '#c8960c', bg: 'rgba(200,150,12,0.07)', border: 'rgba(200,150,12,0.22)', badge: '#c8960c', badgeBg: 'rgba(200,150,12,0.10)', stripe: '#c8960c' },
    LOW:      { color: '#1d8102', bg: 'rgba(29,129,2,0.07)',   border: 'rgba(29,129,2,0.2)',    badge: '#1d8102', badgeBg: 'rgba(29,129,2,0.10)',   stripe: '#1d8102' },
}
const pal = r => RISK[r] || RISK.MEDIUM

const GLOBAL_CSS = `
@keyframes iamSlideIn  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
@keyframes iamSpin     { to{transform:rotate(360deg)} }
@keyframes iamShine    { 0%{left:-80px} 100%{left:calc(100%+80px)} }
@keyframes iamPulse    { 0%,100%{opacity:1} 50%{opacity:0.4} }
@keyframes iamGrow     { from{width:0%} to{width:var(--bar-w)} }
@keyframes iamShimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@keyframes iamRadar    { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.2);opacity:0} }
@keyframes iamRadar2   { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(2.8);opacity:0} }
@keyframes iamBarBounce{ 0%{left:-40%;width:40%} 60%{width:60%} 100%{left:110%;width:40%} }
@keyframes iamFadeMsg  { 0%{opacity:0;transform:translateY(6px)} 15%,85%{opacity:1;transform:none} 100%{opacity:0;transform:translateY(-4px)} }
@keyframes iamOrbit    { to{ transform:rotate(360deg) } }
@keyframes iamOrbitRev { to{ transform:rotate(-360deg) } }
@keyframes iamFloat    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes iamNodePop  { 0%{opacity:0;transform:scale(0.85)} 100%{opacity:1;transform:scale(1)} }
@keyframes iamShimmerH { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
`

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function riskIcon(r) {
    return { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }[r] || '⚪'
}

function typeIcon(t) { return t === 'USER' ? '👤' : '⚙️' }

// ─── Scan messages ─────────────────────────────────────────────────────────────
const SCAN_MSGS = [
    '🔗 Connecting to AWS IAM...',
    '👥 Fetching all IAM users...',
    '⚙️  Fetching all IAM roles...',
    '📋 Loading attached policies...',
    '🔍 Analysing permissions in parallel...',
    '🛡️  Computing blast-radius scores...',
    '📊 Ranking identities by risk level...',
]

// ─── Landscape Identity Card ───────────────────────────────────────────────────
function IdentityCard({ identity, dark, idx }) {
    const [open, setOpen] = useState(false)
    const [hov, setHov] = useState(false)
    const p = pal(identity.risk_level)

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                borderRadius: 10, overflow: 'hidden',
                background: 'var(--bg2)',
                border: `1.5px solid ${hov || open ? p.color + '70' : 'var(--border)'}`,
                boxShadow: hov || open ? `0 4px 20px ${p.color}18, var(--card-shadow)` : 'var(--card-shadow)',
                transition: 'all 0.18s ease',
                transform: hov && !open ? 'translateY(-1px)' : 'none',
                animation: `iamSlideIn 0.28s ease ${idx * 0.04}s both`,
            }}
        >
            {/* Main landscape row */}
            <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '4px 56px 1fr auto', cursor: 'pointer', userSelect: 'none' }}>

                {/* Left accent stripe */}
                <div style={{ background: `linear-gradient(180deg, ${p.stripe}, ${p.stripe}88)`, position: 'relative', overflow: 'hidden' }}>
                    {hov && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent,rgba(255,255,255,0.35),transparent)', animation: 'iamShine 0.55s ease forwards' }} />}
                </div>

                {/* Icon tile */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.bg, borderRight: '1px solid var(--border)', minHeight: 72 }}>
                    <div style={{ fontSize: 22 }}>{typeIcon(identity.type)}</div>
                </div>

                {/* Main content */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 0 }}>
                    {/* Name row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                            {identity.name}
                        </span>
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg3, rgba(35,47,62,0.06))', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.5 }}>
                            {identity.type}
                        </span>
                        <span style={{ fontSize: 8.5, fontWeight: 800, color: p.badge, background: p.badgeBg, border: `1px solid ${p.badge}28`, borderRadius: 4, padding: '2px 7px', letterSpacing: 0.7, textTransform: 'uppercase' }}>
                            {riskIcon(identity.risk_level)} {identity.risk_level}
                        </span>
                    </div>
                    {/* Detail row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{identity.access_level}</span>
                        {identity.mfa_enabled !== null && (
                            <span style={{ fontSize: 10, color: identity.mfa_enabled ? '#1d8102' : '#d13212', background: identity.mfa_enabled ? 'rgba(29,129,2,0.08)' : 'rgba(209,50,18,0.08)', borderRadius: 4, padding: '2px 7px', fontWeight: 600, border: `1px solid ${identity.mfa_enabled ? 'rgba(29,129,2,0.2)' : 'rgba(209,50,18,0.2)'}` }}>
                                {identity.mfa_enabled ? '🔒 MFA On' : '⚠️ No MFA'}
                            </span>
                        )}
                        {identity.policies?.length > 0 && (
                            <span style={{ fontSize: 9.5, color: 'var(--text3)', background: 'var(--bg3, rgba(35,47,62,0.04))', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>
                                {identity.policies.length} {identity.policies.length === 1 ? 'policy' : 'policies'}
                            </span>
                        )}
                        {identity.groups?.length > 0 && (
                            <span style={{ fontSize: 9.5, color: 'var(--text3)' }}>📁 {identity.groups.join(', ')}</span>
                        )}
                    </div>
                </div>

                {/* Right meta */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 4, borderLeft: '1px solid var(--border)', minWidth: 140 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>Last Active</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: identity.last_active ? 'var(--text2)' : 'var(--text3)', fontFamily: 'monospace', textAlign: 'right' }}>
                        {identity.last_active ? fmtDate(identity.last_active) : 'Never signed in'}
                    </div>
                    {identity.created && (
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>Created {fmtDate(identity.created)}</div>
                    )}
                    <div style={{ fontSize: 9, color: open ? p.color : 'var(--text3)', marginTop: 4, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s, color 0.2s', fontWeight: 700 }}>▶</div>
                </div>
            </div>

            {/* Expanded detail */}
            {open && (
                <div style={{ borderTop: `1px solid ${p.border}`, padding: '14px 16px', background: 'rgba(35,47,62,0.02)', animation: 'iamSlideIn 0.18s ease both' }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

                        {/* Policies */}
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Attached Policies</div>
                            {identity.policies.length === 0
                                ? <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No policies attached</div>
                                : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {identity.policies.map(pol => {
                                            const isCrit = pol === 'AdministratorAccess' || pol.includes('Administrator')
                                            const isHigh = pol.includes('FullAccess') || pol.includes('PowerUser')
                                            const chipColor = isCrit ? '#d13212' : isHigh ? '#e07b00' : 'var(--text3)'
                                            const chipBg = isCrit ? 'rgba(209,50,18,0.08)' : isHigh ? 'rgba(224,123,0,0.08)' : 'var(--bg3, rgba(35,47,62,0.04))'
                                            return (
                                                <span key={pol} style={{ fontSize: 10, fontWeight: 600, color: chipColor, background: chipBg, border: `1px solid ${chipColor}28`, borderRadius: 5, padding: '3px 9px', fontFamily: 'monospace' }}>
                                                    {pol}
                                                </span>
                                            )
                                        })}
                                    </div>
                                )
                            }
                        </div>

                        {/* Details */}
                        <div style={{ minWidth: 200 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Details</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <span style={{ color: 'var(--text3)', minWidth: 80 }}>Created</span>
                                    <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{fmtDate(identity.created)}</span>
                                </div>
                                {identity.type === 'ROLE' && identity.trust_principals?.length > 0 && (
                                    <div style={{ color: 'var(--text3)' }}>
                                        <span style={{ display: 'block', marginBottom: 4 }}>Can be assumed by:</span>
                                        {identity.trust_principals.map((tp, i) => (
                                            <div key={i} style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#e07b00', background: 'rgba(224,123,0,0.06)', borderRadius: 4, padding: '2px 6px', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{tp}</div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <span style={{ color: 'var(--text3)', minWidth: 80 }}>ARN</span>
                                    <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{identity.arn}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Blast radius warning */}
                    {(identity.risk_level === 'CRITICAL' || identity.risk_level === 'HIGH') && (
                        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: `${p.color}07`, border: `1px solid ${p.color}22`, fontSize: 11.5, color: p.color, lineHeight: 1.6 }}>
                            ⚠️ {identity.risk_level === 'CRITICAL'
                                ? `If "${identity.name}" is compromised, an attacker has FULL ADMIN access to your AWS account — they can create users, delete resources, access all data, and run up massive charges.`
                                : `If "${identity.name}" is compromised, an attacker has broad access to one or more AWS services and could read, modify, or delete significant resources.`
                            }
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Scanning Overlay ──────────────────────────────────────────────────────────
function ScanningOverlay({ dark }) {
    const [msgIdx, setMsgIdx] = useState(0)

    useEffect(() => {
        const t = setInterval(() => setMsgIdx(i => (i + 1) % SCAN_MSGS.length), 1400)
        return () => clearInterval(t)
    }, [])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {/* Animated radar ring */}
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, marginTop: 32 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(9,114,211,0.5)', animation: 'iamRadar 1.8s ease-out infinite' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(9,114,211,0.35)', animation: 'iamRadar2 1.8s ease-out 0.6s infinite' }} />
                <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#0972d3', borderRightColor: 'rgba(9,114,211,0.3)', animation: 'iamSpin 1.1s linear infinite' }} />
                <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: '#5ba4f5', borderLeftColor: 'rgba(91,164,245,0.3)', animation: 'iamSpin 0.7s linear infinite reverse' }} />
                <div style={{ fontSize: 28, zIndex: 1, animation: 'iamPulse 2s ease-in-out infinite' }}>👥</div>
            </div>

            <div key={msgIdx} style={{ fontSize: 13, fontWeight: 600, color: '#0972d3', marginBottom: 6, animation: 'iamFadeMsg 1.4s ease both', minHeight: 20, textAlign: 'center' }}>
                {SCAN_MSGS[msgIdx]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 24 }}>Running in parallel — usually 12 - 20 seconds</div>

            {/* Progress bar */}
            <div style={{ width: '100%', maxWidth: 420, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', marginBottom: 32 }}>
                <div style={{ position: 'relative', height: '100%', width: '100%', background: 'linear-gradient(90deg,transparent,#0972d3,#5ba4f5,#0972d3,transparent)', backgroundSize: '200% 100%', animation: 'iamShimmer 1.4s linear infinite' }} />
            </div>

            {/* Ghost shimmer cards */}
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[80, 65, 75, 55].map((w, i) => (
                    <div key={i} style={{ borderRadius: 10, background: 'var(--bg2)', border: '1.5px solid var(--border)', overflow: 'hidden', animation: `iamSlideIn 0.35s ease ${i * 0.07}s both`, opacity: 0.85 - i * 0.1 }}>
                        <div style={{ height: 3, background: 'linear-gradient(90deg,rgba(9,114,211,0.2),rgba(91,164,245,0.15),rgba(9,114,211,0.2))', backgroundSize: '200% 100%', animation: 'iamShimmer 1.6s linear infinite' }} />
                        <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '44px 1fr', gap: 12 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 8, background: 'linear-gradient(90deg,var(--border),rgba(9,114,211,0.07),var(--border))', backgroundSize: '200% 100%', animation: 'iamShimmer 1.6s linear infinite' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}>
                                <div style={{ width: w + '%', height: 12, borderRadius: 3, background: 'linear-gradient(90deg,var(--border),rgba(9,114,211,0.06),var(--border))', backgroundSize: '200% 100%', animation: 'iamShimmer 1.6s linear infinite' }} />
                                <div style={{ width: (w * 0.7) + '%', height: 9, borderRadius: 3, background: 'linear-gradient(90deg,var(--border),rgba(9,114,211,0.06),var(--border))', backgroundSize: '200% 100%', animation: 'iamShimmer 1.6s linear infinite 0.2s' }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── IAM Orbital Idle Visual ───────────────────────────────────────────────────
function IAMOrbitalVisual() {
    return (
        <div style={{ position: 'relative', width: 170, height: 170, animation: 'iamFloat 4s ease infinite', flexShrink: 0 }}>
            {/* Outer ring */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(9,114,211,0.18)', animation: 'iamOrbit 10s linear infinite' }}>
                {[0, 120, 240].map((deg, i) => (
                    <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: i === 0 ? 11 : 8, height: i === 0 ? 11 : 8, borderRadius: '50%', background: i === 0 ? '#d13212' : i === 1 ? '#e07b00' : '#1d8102', boxShadow: `0 0 ${i === 0 ? 10 : 6}px ${i === 0 ? '#d1321288' : i === 1 ? '#e07b0088' : '#1d810288'}`, transform: `translate(-50%,-50%) rotate(${deg}deg) translateX(82px)` }} />
                ))}
            </div>
            {/* Middle ring */}
            <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', border: '1px dashed rgba(9,114,211,0.2)', animation: 'iamOrbitRev 14s linear infinite' }}>
                {[60, 180, 300].map((deg, i) => (
                    <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: 5, height: 5, borderRadius: '50%', background: 'rgba(9,114,211,0.5)', transform: `translate(-50%,-50%) rotate(${deg}deg) translateX(55px)` }} />
                ))}
            </div>
            {/* Inner ring */}
            <div style={{ position: 'absolute', inset: 44, borderRadius: '50%', border: '1px solid rgba(9,114,211,0.1)' }} />
            {/* Center */}
            <div style={{ position: 'absolute', inset: 54, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(9,114,211,0.15),rgba(9,114,211,0.06))', border: '2px solid rgba(9,114,211,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'iamPulse 3s ease infinite' }}>
                <Key size={26} color="#0972d3" strokeWidth={1.5} />
            </div>
        </div>
    )
}

// ─── Main Section ──────────────────────────────────────────────────────────────
export default function IAMViewSection({ dark }) {
    const { account } = useAuth()
    const { status: scanStatus } = useScan()
    const mainScanRunning = scanStatus === 'scanning'

    const [identities, setIdentities] = useState([])
    const [summary, setSummary] = useState(null)
    const [scannedAt, setScannedAt] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [filter, setFilter] = useState('all')
    const [hasScanned, setHasScanned] = useState(false)

    async function runScan() {
        if (!account?.id || mainScanRunning) return
        setLoading(true)
        setError(null)
        try {
            const r = await axios.get(`${API}/api/iam-view/scan`, {
                params: { account_id: account.id },
                timeout: 60000,
            })
            const d = r.data?.data || {}
            setIdentities(d.identities || [])
            setSummary(d.summary || null)
            setScannedAt(d.scanned_at || null)
            setHasScanned(true)
        } catch {
            setError('Could not reach backend. Is it running?')
        } finally {
            setLoading(false)
        }
    }

    const filtered = identities.filter(id => {
        if (filter === 'all') return true
        if (filter === 'USER') return id.type === 'USER'
        if (filter === 'ROLE') return id.type === 'ROLE'
        return id.risk_level === filter
    })

    const dangerPct = summary
        ? Math.round(((summary.critical + summary.high) / Math.max(summary.total, 1)) * 100)
        : 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'Inter',-apple-system,sans-serif" }}>
            <style>{GLOBAL_CSS}</style>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>IAM View</h1>
                        {hasScanned && summary && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: dangerPct > 30 ? '#d13212' : '#1d8102', background: dangerPct > 30 ? 'rgba(209,50,18,0.08)' : 'rgba(29,129,2,0.08)', border: `1px solid ${dangerPct > 30 ? 'rgba(209,50,18,0.25)' : 'rgba(29,129,2,0.25)'}`, borderRadius: 4, padding: '2px 8px' }}>
                                {dangerPct}% at risk
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Identity Risk Matrix · Who can do what damage if compromised</div>
                </div>

                <button
                    onClick={runScan}
                    disabled={loading || !account?.id || mainScanRunning}
                    title={mainScanRunning ? 'Wait for main scan to finish before running IAM scan' : ''}
                    style={{
                        padding: '9px 20px', borderRadius: 8, border: 'none',
                        cursor: (loading || mainScanRunning) ? 'not-allowed' : 'pointer',
                        background: (loading || mainScanRunning) ? 'rgba(9,114,211,0.35)' : 'linear-gradient(135deg,#0050a0,#0972d3)',
                        color: '#fff', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 9,
                        boxShadow: (loading || mainScanRunning) ? 'none' : '0 4px 16px rgba(9,114,211,0.32)',
                        transition: 'all 0.15s', flexShrink: 0, opacity: mainScanRunning ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!loading && !mainScanRunning) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(9,114,211,0.4)' } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = (loading || mainScanRunning) ? 'none' : '0 4px 16px rgba(9,114,211,0.32)' }}
                >
                    {loading
                        ? <><div style={{ width: 14, height: 14, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'iamSpin 0.7s linear infinite' }} />Scanning IAM…</>
                        : mainScanRunning ? '⏳ Main Scan Running…'
                        : hasScanned ? <><RefreshCw size={13} />Re-scan</>
                        : <><Key size={13} />Scan IAM Identities</>
                    }
                </button>
            </div>

            {/* Main scan conflict banner */}
            {mainScanRunning && !loading && (
                <div style={{ padding: '10px 16px', borderRadius: 9, background: 'rgba(200,150,12,0.08)', border: '1.5px solid rgba(200,150,12,0.28)', color: '#c8960c', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(200,150,12,0.5)', borderTopColor: '#c8960c', borderRadius: '50%', animation: 'iamSpin 1s linear infinite', flexShrink: 0 }} />
                    <span><strong>Main scan in progress.</strong> IAM scan is paused to avoid AWS API rate-limit conflicts. It will be available as soon as the main scan completes.</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ padding: '12px 16px', borderRadius: 9, background: 'rgba(209,50,18,0.07)', border: '1.5px solid rgba(209,50,18,0.25)', color: '#d13212', fontSize: 12.5 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Scanning overlay */}
            {loading && <ScanningOverlay dark={dark} />}

            {/* ── PRE-SCAN IDLE STATE (two-column premium) ── */}
            {!loading && !hasScanned && account?.id && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14, minHeight: 0 }}>

                    {/* LEFT — orbital hero + CTA */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 20px', overflow: 'hidden', position: 'relative', boxShadow: 'var(--card-shadow)' }}>
                        {/* Animated shimmer bar */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#0972d3,#5ba4f5,#0972d3)', backgroundSize: '200%', animation: 'iamShimmerH 3s linear infinite' }} />
                        <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(9,114,211,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

                        <IAMOrbitalVisual />

                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 21, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, marginBottom: 7 }}>Identity Risk Matrix</div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.65, maxWidth: 300 }}>
                                Analyse every IAM <strong style={{ color: 'var(--text2)' }}>user&nbsp;&amp;&nbsp;role</strong> in your account.
                                Calculates a <strong style={{ color: 'var(--text2)' }}>blast-radius score</strong> — who could cause the most damage if compromised.
                            </div>
                        </div>

                        {/* Stats 2x2 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, width: '100%' }}>
                            {[
                                { val: 'Users',    label: 'All IAM users',       color: '#0972d3' },
                                { val: 'Roles',    label: 'All IAM roles',        color: '#8B5CF6' },
                                { val: 'Policies', label: 'Attached policies',    color: '#FF9900' },
                                { val: 'Score',    label: 'Blast-radius scoring', color: '#d13212' },
                            ].map(s => (
                                <div key={s.label} style={{ background: `${s.color}08`, border: `1px solid ${s.color}20`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 14, fontWeight: 900, color: s.color, marginBottom: 2 }}>{s.val}</div>
                                    <div style={{ fontSize: 8.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <button onClick={runScan} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderRadius: 10, background: 'linear-gradient(135deg,#0050a0,#0972d3)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: 0.3, boxShadow: '0 6px 22px rgba(9,114,211,0.38)', transition: 'all 0.18s', width: '100%', justifyContent: 'center' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(9,114,211,0.52)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(9,114,211,0.38)' }}>
                            <Key size={15} /> Start IAM Scan
                        </button>
                    </div>

                    {/* RIGHT — What we check */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(9,114,211,0.1)', border: '1px solid rgba(9,114,211,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Shield size={10} color="#0972d3" />
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Security Checks</span>
                                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#0972d3', background: 'rgba(9,114,211,0.08)', border: '1px solid rgba(9,114,211,0.2)', borderRadius: 10, padding: '1px 8px' }}>9 checks</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                {[
                                    { icon: '🔐', title: 'Admin Privilege',        sub: 'AdministratorAccess detection',  color: '#d13212', delay: '.02s' },
                                    { icon: '🔒', title: 'MFA Enforcement',        sub: 'Missing MFA identification',     color: '#e07b00', delay: '.04s' },
                                    { icon: '💥', title: 'Blast Radius',           sub: 'Damage potential scoring',       color: '#d13212', delay: '.06s' },
                                    { icon: '📋', title: 'Policy Analysis',        sub: 'Attached policy risk rating',    color: '#0972d3', delay: '.08s' },
                                    { icon: '⏰', title: 'Dormant Accounts',       sub: 'Unused identity detection',      color: '#c8960c', delay: '.10s' },
                                    { icon: '🔑', title: 'Access Keys',           sub: 'Programmatic access audit',      color: '#e07b00', delay: '.12s' },
                                    { icon: '🌐', title: 'Cross-Account Trust',   sub: 'External principal detection',   color: '#8B5CF6', delay: '.14s' },
                                    { icon: '👥', title: 'Group Membership',      sub: 'Group-attached policy risks',    color: '#0972d3', delay: '.16s' },
                                    { icon: '⚡', title: 'Privilege Escalation',  sub: 'Permission escalation paths',    color: '#d13212', delay: '.18s' },
                                ].map(c => (
                                    <div key={c.title} style={{ background: `${c.color}07`, border: `1px solid ${c.color}18`, borderRadius: 8, padding: '10px 10px 8px', animation: `iamNodePop 0.3s ease ${c.delay} both`, transition: 'border-color 0.15s, background 0.15s', cursor: 'default' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = `${c.color}12`; e.currentTarget.style.borderColor = `${c.color}36` }}
                                        onMouseLeave={e => { e.currentTarget.style.background = `${c.color}07`; e.currentTarget.style.borderColor = `${c.color}18` }}>
                                        <div style={{ fontSize: 15, marginBottom: 4 }}>{c.icon}</div>
                                        <div style={{ fontSize: 9.5, fontWeight: 800, color: c.color, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                                        <div style={{ fontSize: 8.5, color: 'var(--text3)', lineHeight: 1.3 }}>{c.sub}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Risk levels legend */}
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', flexShrink: 0, boxShadow: 'var(--card-shadow)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <AlertTriangle size={10} color="#FF9900" />
                                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Risk Levels</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                                {[
                                    { level: 'CRITICAL', icon: '🔴', desc: 'Full Admin — total account takeover possible', color: '#d13212' },
                                    { level: 'HIGH',     icon: '🟠', desc: 'FullAccess — broad service damage possible',    color: '#e07b00' },
                                    { level: 'MEDIUM',   icon: '🟡', desc: 'Partial access — limited damage potential',     color: '#c8960c' },
                                    { level: 'LOW',      icon: '🟢', desc: 'Read-only or minimal permissions',             color: '#1d8102' },
                                ].map(r => (
                                    <div key={r.level} style={{ background: RISK[r.level].bg, border: `1px solid ${RISK[r.level].border}`, borderRadius: 7, padding: '7px 8px' }}>
                                        <div style={{ fontSize: 14, marginBottom: 3 }}>{r.icon}</div>
                                        <div style={{ fontSize: 8.5, fontWeight: 800, color: r.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{r.level}</div>
                                        <div style={{ fontSize: 8, color: 'var(--text3)', lineHeight: 1.35 }}>{r.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* No account */}
            {!account?.id && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                    Connect an AWS account to use IAM View.
                </div>
            )}

            {/* ── RESULTS ── */}
            {!loading && hasScanned && !error && (
                <>
                    {/* Summary stat tiles */}
                    {summary && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Risk progress bar */}
                            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', boxShadow: 'var(--card-shadow)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Identity Risk Overview</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: dangerPct > 30 ? '#d13212' : dangerPct > 10 ? '#e07b00' : '#1d8102' }}>
                                        {dangerPct}% at risk
                                    </span>
                                </div>
                                {/* Bar shows SAFE portion in green, rest in warning colors */}
                                <div style={{ height: 7, borderRadius: 6, background: 'var(--border)', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, #1d8102 ${100 - dangerPct}%, #d13212 ${100 - dangerPct}%)`, borderRadius: 6, transition: 'all 0.6s ease' }} />
                                </div>
                                {scannedAt && (
                                    <div style={{ marginTop: 6, fontSize: 9.5, color: 'var(--text3)', fontFamily: 'monospace' }}>Last scanned: {new Date(scannedAt).toLocaleString()}</div>
                                )}
                            </div>

                            {/* Stat tiles */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                {[
                                    { label: 'Total Identities', value: summary.total,    color: '#0972d3' },
                                    { label: 'Critical',         value: summary.critical,  color: '#d13212' },
                                    { label: 'High',             value: summary.high,      color: '#e07b00' },
                                    { label: 'Medium',           value: summary.medium,    color: '#c8960c' },
                                    { label: 'Low',              value: summary.low,       color: '#1d8102' },
                                ].map(s => (
                                    <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
                                        <div style={{ height: 2, background: `linear-gradient(90deg,${s.color},${s.color}55)` }} />
                                        <div style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Filter bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                        {[
                            { key: 'all',      label: `All`,                          count: identities.length,                              color: '#0972d3' },
                            { key: 'USER',     label: `👤 Users`,                     count: identities.filter(x => x.type === 'USER').length, color: '#0972d3' },
                            { key: 'ROLE',     label: `⚙️ Roles`,                     count: identities.filter(x => x.type === 'ROLE').length, color: '#8B5CF6' },
                            { key: 'CRITICAL', label: `🔴 Critical`,                  count: summary?.critical || 0,                          color: '#d13212' },
                            { key: 'HIGH',     label: `🟠 High`,                      count: summary?.high || 0,                              color: '#e07b00' },
                            { key: 'MEDIUM',   label: `🟡 Medium`,                    count: summary?.medium || 0,                            color: '#c8960c' },
                            { key: 'LOW',      label: `🟢 Low`,                       count: summary?.low || 0,                               color: '#1d8102' },
                        ].map(f => {
                            const active = filter === f.key
                            return (
                                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500, transition: 'all 0.12s',
                                    border: `1.5px solid ${active ? f.color : 'var(--border)'}`,
                                    background: active ? `${f.color}0d` : 'transparent',
                                    color: active ? f.color : 'var(--text3)',
                                }}>
                                    {f.label}
                                    <span style={{ fontSize: 9.5, fontWeight: 700, background: active ? f.color : 'var(--border)', color: active ? '#fff' : 'var(--text3)', borderRadius: 8, padding: '0 5px', minWidth: 16, textAlign: 'center' }}>{f.count}</span>
                                </button>
                            )
                        })}
                        <button onClick={runScan} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <RefreshCw size={10} /> Re-scan
                        </button>
                    </div>

                    {/* Identity grid — landscape 2-column */}
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 13 }}>
                            No identities match this filter.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
                            {filtered.map((id, i) => (
                                <IdentityCard key={id.id} identity={id} dark={dark} idx={i} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
