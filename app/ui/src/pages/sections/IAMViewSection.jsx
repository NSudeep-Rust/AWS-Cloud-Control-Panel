import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

// ─── Risk palette ─────────────────────────────────────────────────────────────
const RISK = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.10)', border: 'rgba(209,50,18,0.28)', badge: '#d13212', badgeBg: 'rgba(209,50,18,0.12)', stripe: '#d13212' },
    HIGH: { color: '#e07b00', bg: 'rgba(224,123,0,0.08)', border: 'rgba(224,123,0,0.25)', badge: '#e07b00', badgeBg: 'rgba(224,123,0,0.10)', stripe: '#e07b00' },
    MEDIUM: { color: '#c8960c', bg: 'rgba(200,150,12,0.07)', border: 'rgba(200,150,12,0.22)', badge: '#c8960c', badgeBg: 'rgba(200,150,12,0.10)', stripe: '#c8960c' },
    LOW: { color: '#1d8102', bg: 'rgba(29,129,2,0.07)', border: 'rgba(29,129,2,0.2)', badge: '#1d8102', badgeBg: 'rgba(29,129,2,0.10)', stripe: '#1d8102' },
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
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Single identity card ─────────────────────────────────────────────────────
function IdentityCard({ identity, dark, idx }) {
    const [open, setOpen] = useState(false)
    const [hov, setHov] = useState(false)
    const p = pal(identity.risk_level)

    const text = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#5a6270'
    const card = dark ? '#161b22' : '#ffffff'
    const bg2 = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                borderRadius: 12, overflow: 'hidden',
                background: card,
                border: `1.5px solid ${hov || open ? p.color + '80' : p.border}`,
                boxShadow: hov || open ? `0 6px 24px rgba(0,0,0,0.1), 0 0 0 3px ${p.color}12` : '0 2px 8px rgba(0,0,0,0.05)',
                transition: 'all 0.18s ease',
                transform: hov && !open ? 'translateY(-1px)' : 'none',
                animation: `iamSlideIn 0.3s ease ${idx * 0.045}s both`,
            }}
        >
            {/* Coloured top stripe */}
            <div style={{ height: 3, background: `linear-gradient(90deg,${p.stripe},${p.stripe}55)`, position: 'relative', overflow: 'hidden' }}>
                {hov && <div style={{ position: 'absolute', top: 0, width: 80, height: '100%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)', animation: 'iamShine 0.55s ease forwards' }} />}
            </div>

            {/* Main row */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
            >
                {/* Icon tile */}
                <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: p.bg, border: `1.5px solid ${p.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {typeIcon(identity.type)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name + type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                            {identity.name}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: dark ? '#8b949e' : '#5a6270', background: bg2, border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 4, padding: '2px 6px', letterSpacing: 0.5 }}>
                            {identity.type}
                        </span>
                        {/* Risk badge */}
                        <span style={{ fontSize: 9, fontWeight: 800, color: p.badge, background: p.badgeBg, border: `1px solid ${p.badge}30`, borderRadius: 4, padding: '2px 8px', letterSpacing: 0.7, textTransform: 'uppercase' }}>
                            {riskIcon(identity.risk_level)} {identity.risk_level}
                        </span>
                    </div>
                    {/* Access level + last active */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{identity.access_level}</span>
                        {identity.mfa_enabled !== null && (
                            <span style={{ fontSize: 10, color: identity.mfa_enabled ? '#1d8102' : '#d13212', background: identity.mfa_enabled ? 'rgba(29,129,2,0.08)' : 'rgba(209,50,18,0.08)', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
                                {identity.mfa_enabled ? '🔒 MFA On' : '⚠️ No MFA'}
                            </span>
                        )}
                        {identity.groups?.length > 0 && (
                            <span style={{ fontSize: 10, color: text2 }}>📁 {identity.groups.join(', ')}</span>
                        )}
                        <span style={{ fontSize: 10, color: text2, marginLeft: 'auto' }}>
                            {identity.last_active ? `Active: ${fmtDate(identity.last_active)}` : 'Never signed in'}
                        </span>
                    </div>
                </div>

                {/* Chevron */}
                <div style={{ fontSize: 12, color: text2, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▶</div>
            </div>

            {/* Expanded detail */}
            {open && (
                <div style={{ borderTop: `1px solid ${p.border}`, padding: '14px 16px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', animation: 'iamSlideIn 0.2s ease both' }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

                        {/* Policies */}
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: text2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Attached Policies</div>
                            {identity.policies.length === 0
                                ? <div style={{ fontSize: 11, color: text2, fontStyle: 'italic' }}>No policies attached</div>
                                : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {identity.policies.map(pol => {
                                            const isCrit = pol === 'AdministratorAccess' || pol.includes('Administrator')
                                            const isHigh = pol.includes('FullAccess') || pol.includes('PowerUser')
                                            const chipColor = isCrit ? '#d13212' : isHigh ? '#e07b00' : text2
                                            const chipBg = isCrit ? 'rgba(209,50,18,0.08)' : isHigh ? 'rgba(224,123,0,0.08)' : bg2
                                            return (
                                                <span key={pol} style={{ fontSize: 10, fontWeight: 600, color: chipColor, background: chipBg, border: `1px solid ${chipColor}30`, borderRadius: 5, padding: '3px 9px', fontFamily: 'monospace' }}>
                                                    {pol}
                                                </span>
                                            )
                                        })}
                                    </div>
                                )
                            }
                        </div>

                        {/* Right column */}
                        <div style={{ minWidth: 200 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: text2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Details</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <span style={{ color: text2, minWidth: 80 }}>Created</span>
                                    <span style={{ color: text, fontFamily: 'monospace' }}>{fmtDate(identity.created)}</span>
                                </div>
                                {identity.type === 'ROLE' && identity.trust_principals?.length > 0 && (
                                    <div style={{ color: text2 }}>
                                        <span style={{ display: 'block', marginBottom: 4 }}>Can be assumed by:</span>
                                        {identity.trust_principals.map((tp, i) => (
                                            <div key={i} style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#e07b00', background: 'rgba(224,123,0,0.06)', borderRadius: 4, padding: '2px 6px', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{tp}</div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <span style={{ color: text2, minWidth: 80 }}>ARN</span>
                                    <span style={{ color: text2, fontFamily: 'monospace', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{identity.arn}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Blast radius warning for CRITICAL/HIGH */}
                    {(identity.risk_level === 'CRITICAL' || identity.risk_level === 'HIGH') && (
                        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: `${p.color}09`, border: `1px solid ${p.color}25`, fontSize: 11.5, color: p.color, lineHeight: 1.5 }}>
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

// ─── Scan messages ────────────────────────────────────────────────────────────
const SCAN_MSGS = [
    '🔗 Connecting to AWS IAM...',
    '👥 Fetching all IAM users...',
    '⚙️  Fetching all IAM roles...',
    '📋 Loading attached policies...',
    '🔍 Analysing permissions in parallel...',
    '🛡️  Computing blast-radius scores...',
    '📊 Ranking identities by risk level...',
]

// ─── Scanning Overlay ─────────────────────────────────────────────────────────
function ScanningOverlay({ dark }) {
    const [msgIdx, setMsgIdx] = useState(0)
    const bg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    const card = dark ? '#161b22' : '#ffffff'
    const bdr = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
    const text = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#5a6270'

    useEffect(() => {
        const t = setInterval(() => setMsgIdx(i => (i + 1) % SCAN_MSGS.length), 1400)
        return () => clearInterval(t)
    }, [])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

            {/* ── Animated radar ring ── */}
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, marginTop: 32 }}>
                {/* Outer pulse rings */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(9,114,211,0.5)', animation: 'iamRadar 1.8s ease-out infinite' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(9,114,211,0.35)', animation: 'iamRadar2 1.8s ease-out 0.6s infinite' }} />
                {/* Spinning arc */}
                <div style={{
                    position: 'absolute', inset: 8, borderRadius: '50%',
                    border: '3px solid transparent',
                    borderTopColor: '#0972d3', borderRightColor: 'rgba(9,114,211,0.3)',
                    animation: 'iamSpin 1.1s linear infinite',
                }} />
                {/* Inner spinning arc (opposite) */}
                <div style={{
                    position: 'absolute', inset: 18, borderRadius: '50%',
                    border: '2px solid transparent',
                    borderBottomColor: '#5ba4f5', borderLeftColor: 'rgba(91,164,245,0.3)',
                    animation: 'iamSpin 0.7s linear infinite reverse',
                }} />
                {/* Centre icon */}
                <div style={{ fontSize: 28, zIndex: 1, animation: 'iamPulse 2s ease-in-out infinite' }}>👥</div>
            </div>

            {/* ── Cycling status message ── */}
            <div key={msgIdx} style={{
                fontSize: 13, fontWeight: 600, color: '#0972d3',
                marginBottom: 6, animation: 'iamFadeMsg 1.4s ease both',
                minHeight: 20, textAlign: 'center',
            }}>
                {SCAN_MSGS[msgIdx]}
            </div>
            <div style={{ fontSize: 11, color: text2, marginBottom: 24 }}>
                Running in parallel — usually 12 - 20 seconds
            </div>

            {/* ── Indeterminate progress bar ── */}
            <div style={{ width: '100%', maxWidth: 420, height: 4, borderRadius: 4, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 32 }}>
                <div style={{
                    position: 'relative', height: '100%', width: '100%',
                    background: 'linear-gradient(90deg,transparent,#0972d3,#5ba4f5,#0972d3,transparent)',
                    backgroundSize: '200% 100%',
                    animation: 'iamShimmer 1.4s linear infinite',
                }} />
            </div>

            {/* ── Ghost shimmer cards (show something is happening) ── */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[80, 65, 75, 55].map((w, i) => (
                    <div key={i} style={{
                        borderRadius: 12, background: card,
                        border: `1.5px solid ${bdr}`, overflow: 'hidden',
                        animation: `iamSlideIn 0.35s ease ${i * 0.07}s both`,
                        opacity: 0.85 - i * 0.12,
                    }}>
                        <div style={{
                            height: 3,
                            background: 'linear-gradient(90deg,rgba(9,114,211,0.3),rgba(91,164,245,0.2),rgba(9,114,211,0.3))',
                            backgroundSize: '200% 100%',
                            animation: 'iamShimmer 1.6s linear infinite',
                        }} />
                        <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                                background: 'linear-gradient(90deg,' + bg + ',rgba(9,114,211,0.08),' + bg + ')',
                                backgroundSize: '200% 100%',
                                animation: 'iamShimmer 1.6s linear infinite',
                            }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                                <div style={{
                                    width: w + '%', height: 13, borderRadius: 4,
                                    background: 'linear-gradient(90deg,' + bg + ',rgba(9,114,211,0.06),' + bg + ')',
                                    backgroundSize: '200% 100%',
                                    animation: 'iamShimmer 1.6s linear infinite',
                                }} />
                                <div style={{
                                    width: (w * 0.75) + '%', height: 10, borderRadius: 4,
                                    background: 'linear-gradient(90deg,' + bg + ',rgba(9,114,211,0.06),' + bg + ')',
                                    backgroundSize: '200% 100%',
                                    animation: 'iamShimmer 1.6s linear infinite 0.2s',
                                }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function IAMViewSection({ dark }) {
    const { account } = useAuth()
    const { status: scanStatus } = useScan()           // know when main scan runs
    const mainScanRunning = scanStatus === 'scanning'  // block IAM scan during this

    const [identities, setIdentities] = useState([])
    const [summary, setSummary] = useState(null)
    const [scannedAt, setScannedAt] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [filter, setFilter] = useState('all')   // all | USER | ROLE | CRITICAL | HIGH | MEDIUM | LOW
    const [hasScanned, setHasScanned] = useState(false)

    const bg = dark ? '#0d1117' : '#f0f2f5'
    const card = dark ? '#161b22' : '#ffffff'
    const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
    const text = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#5a6270'
    const text3 = dark ? '#6e7681' : '#8d9191'

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

    // Filter
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
        <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", background: bg, minHeight: '100vh', padding: '0 0 48px' }}>
            <style>{GLOBAL_CSS}</style>

            {/* ── Header ── */}
            <div style={{ padding: '28px 28px 0', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#0050a0,#0972d3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                            👥
                        </div>
                        <div>
                            <h1 style={{ fontSize: 21, fontWeight: 800, color: text, margin: 0 }}>IAM View</h1>
                            <div style={{ fontSize: 11, color: text2 }}>Identity Risk Matrix · Who can do what damage if compromised</div>
                        </div>
                    </div>

                    {/* Scan button */}
                    <button
                        onClick={runScan}
                        disabled={loading || !account?.id || mainScanRunning}
                        title={mainScanRunning ? 'Wait for main scan to finish before running IAM scan' : ''}
                        style={{
                            padding: '10px 22px', borderRadius: 10, border: 'none',
                            cursor: (loading || mainScanRunning) ? 'not-allowed' : 'pointer',
                            background: (loading || mainScanRunning)
                                ? 'rgba(9,114,211,0.35)'
                                : 'linear-gradient(135deg,#0050a0,#0972d3)',
                            color: '#fff', fontSize: 13, fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 9,
                            boxShadow: (loading || mainScanRunning) ? 'none' : '0 4px 16px rgba(9,114,211,0.35)',
                            transition: 'all 0.15s', flexShrink: 0, opacity: mainScanRunning ? 0.6 : 1,
                        }}
                        onMouseEnter={e => { if (!loading && !mainScanRunning) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(9,114,211,0.4)' } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = (loading || mainScanRunning) ? 'none' : '0 4px 16px rgba(9,114,211,0.35)' }}
                    >
                        {loading
                            ? <><div style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'iamSpin 0.7s linear infinite' }} /> Scanning IAM…</>
                            : mainScanRunning
                                ? '⏳ Main Scan Running…'
                                : '🔍 Scan IAM Identities'
                        }
                    </button>
                </div>

                {/* Summary cards — shown after first scan */}
                {summary && (
                    <div style={{ marginTop: 18 }}>
                        {/* Health bar */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: text2 }}>Identity Risk Overview</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: dangerPct > 30 ? '#d13212' : dangerPct > 10 ? '#e07b00' : '#1d8102' }}>
                                    {dangerPct}% at risk
                                </span>
                            </div>
                            <div style={{ height: 6, borderRadius: 6, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${100 - dangerPct}%`, background: 'linear-gradient(90deg,#1d8102,#4caf50)', borderRadius: 6, transition: 'width 0.6s ease' }} />
                            </div>
                        </div>

                        {/* Stat cards */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Total Identities', value: summary.total, color: '#0972d3' },
                                { label: '🔴 Critical', value: summary.critical, color: '#d13212' },
                                { label: '🟠 High', value: summary.high, color: '#e07b00' },
                                { label: '🟡 Medium', value: summary.medium, color: '#c8960c' },
                                { label: '🟢 Low', value: summary.low, color: '#1d8102' },
                            ].map(s => (
                                <div key={s.label} style={{ background: card, border: `1.5px solid ${border}`, borderRadius: 10, padding: '10px 18px', minWidth: 90, textAlign: 'center', flex: '0 0 auto' }}>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: 9.5, color: text2, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                        {scannedAt && (
                            <div style={{ marginTop: 8, fontSize: 10, color: text3 }}>
                                Last scanned: {new Date(scannedAt).toLocaleString()}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <div style={{ padding: '0 28px' }}>

                {/* No account */}
                {!account?.id && (
                    <div style={{ textAlign: 'center', padding: 60, color: text2 }}>
                        Connect an AWS account to use IAM View.
                    </div>
                )}

                {/* Main scan conflict banner */}
                {mainScanRunning && !loading && (
                    <div style={{
                        marginBottom: 14, padding: '10px 16px', borderRadius: 9,
                        background: 'rgba(200,150,12,0.08)', border: '1.5px solid rgba(200,150,12,0.28)',
                        color: '#c8960c', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{ width: 14, height: 14, border: '2px solid rgba(200,150,12,0.5)', borderTopColor: '#c8960c', borderRadius: '50%', animation: 'iamSpin 1s linear infinite', flexShrink: 0 }} />
                        <span>
                            <strong>Main scan in progress.</strong> IAM scan is paused to avoid AWS API rate-limit conflicts.
                            It will be available as soon as the main scan completes.
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 9, background: 'rgba(209,50,18,0.07)', border: '1.5px solid rgba(209,50,18,0.25)', color: '#d13212', fontSize: 12.5 }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Loading */}
                {loading && <ScanningOverlay dark={dark} />}

                {/* Pre-scan state */}
                {!loading && !hasScanned && account?.id && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '80px 20px', animation: 'iamSlideIn 0.4s ease both' }}>
                        <div style={{ fontSize: 64 }}>👥</div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: text, marginBottom: 8 }}>IAM Identity Risk Scan</div>
                            <div style={{ fontSize: 13, color: text2, lineHeight: 1.7, maxWidth: 420 }}>
                                Click <strong>Scan IAM Identities</strong> to analyse all IAM users and roles in your account.<br />
                                We'll calculate a <strong>risk / blast-radius score</strong> for each identity — like Parental Controls for AWS.
                            </div>
                        </div>
                        <button
                            onClick={runScan}
                            style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0050a0,#0972d3)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(9,114,211,0.3)' }}
                        >
                            🔍 Start IAM Scan
                        </button>
                    </div>
                )}

                {/* Results */}
                {!loading && hasScanned && !error && (
                    <>
                        {/* Filter bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, borderBottom: `1px solid ${border}`, paddingBottom: 12, flexWrap: 'wrap' }}>
                            {[
                                { key: 'all', label: `All (${identities.length})` },
                                { key: 'USER', label: `👤 Users (${identities.filter(x => x.type === 'USER').length})` },
                                { key: 'ROLE', label: `⚙️ Roles (${identities.filter(x => x.type === 'ROLE').length})` },
                                { key: 'CRITICAL', label: `🔴 Critical (${summary?.critical || 0})` },
                                { key: 'HIGH', label: `🟠 High (${summary?.high || 0})` },
                                { key: 'MEDIUM', label: `🟡 Medium (${summary?.medium || 0})` },
                                { key: 'LOW', label: `🟢 Low (${summary?.low || 0})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                                    padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11,
                                    fontWeight: filter === f.key ? 700 : 500,
                                    background: filter === f.key ? 'rgba(9,114,211,0.1)' : 'transparent',
                                    color: filter === f.key ? '#0972d3' : text2,
                                    borderBottom: filter === f.key ? '2.5px solid #0972d3' : '2.5px solid transparent',
                                    transition: 'all 0.12s',
                                }}>
                                    {f.label}
                                </button>
                            ))}

                            {/* Re-scan */}
                            <button onClick={runScan} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 7, border: `1px solid ${border}`, background: 'transparent', color: text2, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                ↺ Re-scan
                            </button>
                        </div>

                        {filtered.length === 0
                            ? (
                                <div style={{ textAlign: 'center', padding: '48px 20px', color: text2, fontSize: 13 }}>
                                    No identities match this filter.
                                </div>
                            )
                            : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {filtered.map((id, i) => (
                                        <IdentityCard key={id.id} identity={id} dark={dark} idx={i} />
                                    ))}
                                </div>
                            )
                        }
                    </>
                )}
            </div>
        </div>
    )
}
