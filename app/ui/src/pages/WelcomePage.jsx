import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FONT_INJECT = `
@font-face { font-family: 'Amazon Ember'; src: local('Amazon Ember'), local('AmazonEmber'); }
* { font-family: 'Amazon Ember', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif !important; }
code, pre, .mono { font-family: 'Courier New', 'Consolas', monospace !important; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

const RADAR_BLIPS = [
    { cx: 62, cy: 38, label: 'IAM', color: '#d13212' },
    { cx: 35, cy: 68, label: 'S3', color: '#FF9900' },
    { cx: 72, cy: 65, label: 'VPC', color: '#d13212' },
]

const MODULE_STATUS = [
    { label: 'Scanner Engine', status: 'READY', color: '#067340' },
    { label: 'IAM Auditor', status: 'READY', color: '#067340' },
    { label: 'Network Probe', status: 'READY', color: '#067340' },
    { label: 'Threat Monitor', status: 'STANDBY', color: '#FF9900' },
]

export default function WelcomePage() {
    const navigate = useNavigate()
    const { account } = useAuth()
    const [lineIndex, setLineIndex] = useState(0)
    const [radarAngle, setRadarAngle] = useState(0)
    const [blipVisible, setBlipVisible] = useState([true, true, false])
    const [modulesDone, setModulesDone] = useState(false)

    const lines = [
        { prompt: '>', text: ' Initializing security modules...' },
        { prompt: '>', text: ' Loading threat intelligence...' },
        { prompt: '>', text: ' AWS SDK connected.' },
        { prompt: '>', text: ' Ready for account setup.' },
    ]

    useEffect(() => { if (account) navigate('/panel') }, [account])

    useEffect(() => {
        if (lineIndex >= lines.length) { setModulesDone(true); return }
        const t = setTimeout(() => setLineIndex(i => i + 1), 700)
        return () => clearTimeout(t)
    }, [lineIndex])

    useEffect(() => {
        const iv = setInterval(() => setRadarAngle(a => (a + 2) % 360), 20)
        return () => clearInterval(iv)
    }, [])

    useEffect(() => {
        const iv = setInterval(() => {
            setBlipVisible(prev => { const n = [...prev]; n[2] = Math.random() > 0.35; return n })
        }, 1800)
        return () => clearInterval(iv)
    }, [])

    const toRad = d => (d * Math.PI) / 180
    const sweepX = 50 + 42 * Math.cos(toRad(radarAngle - 90))
    const sweepY = 50 + 42 * Math.sin(toRad(radarAngle - 90))
    const trailX = 50 + 42 * Math.cos(toRad(radarAngle - 115))
    const trailY = 50 + 42 * Math.sin(toRad(radarAngle - 115))

    const activeBlips = RADAR_BLIPS.filter((_, i) => blipVisible[i])
    const criticalCount = activeBlips.filter(b => b.color === '#d13212').length
    const warnCount = activeBlips.filter(b => b.color === '#FF9900').length

    return (
        <>
            <style>{FONT_INJECT}</style>
            <div style={s.root}>
                <div style={s.blobTL} /><div style={s.blobBR} /><div style={s.blobCenter} />
                <svg style={s.gridSvg} viewBox="0 0 1440 900" preserveAspectRatio="none">
                    {[...Array(15)].map((_, i) => <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="900" stroke="rgba(35,47,62,0.04)" strokeWidth="1" />)}
                    {[...Array(10)].map((_, i) => <line key={`h${i}`} x1="0" y1={i * 100} x2="1440" y2={i * 100} stroke="rgba(35,47,62,0.04)" strokeWidth="1" />)}
                </svg>

                {/* LEFT — Radar */}
                <div style={{ ...s.sideCard, left: 'clamp(20px, 3vw, 60px)', top: '50%', transform: 'translateY(-50%)' }}>
                    <div style={s.cardHeader}>
                        <div style={s.cardDot} />
                        <span style={s.cardLabel}>THREAT RADAR</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#067340', display: 'inline-block', animation: 'blink 1.5s step-end infinite' }} />
                            <span style={{ fontSize: 9, color: '#067340', fontFamily: 'monospace' }}>LIVE</span>
                        </span>
                    </div>
                    <svg viewBox="0 0 100 100" width="140" height="140" style={{ display: 'block', margin: '8px auto' }}>
                        <circle cx="50" cy="50" r="48" fill="#f8f9fa" stroke="rgba(35,47,62,0.1)" strokeWidth="1" />
                        {[42, 30, 18].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,153,0,0.25)" strokeWidth="0.8" strokeDasharray="3 3" />)}
                        <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(35,47,62,0.1)" strokeWidth="0.5" />
                        <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(35,47,62,0.1)" strokeWidth="0.5" />
                        <path d={`M50,50 L${trailX},${trailY} A42,42 0 0,1 ${sweepX},${sweepY} Z`} fill="rgba(255,153,0,0.15)" />
                        <line x1="50" y1="50" x2={sweepX} y2={sweepY} stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
                        {RADAR_BLIPS.map((b, i) => blipVisible[i] && (
                            <g key={i}>
                                <circle cx={b.cx} cy={b.cy} r="3" fill={b.color} opacity="0.85">
                                    <animate attributeName="r" values="3;5;3" dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.85;0.2;0.85" dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>
                                <text x={b.cx + 5} y={b.cy - 3} fontSize="5" fill={b.color} fontFamily="monospace" opacity="0.8">{b.label}</text>
                            </g>
                        ))}
                        <circle cx="50" cy="50" r="3" fill="#FF9900" />
                    </svg>
                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                        {criticalCount > 0 && <span style={{ ...s.pill, background: '#fdf3e7', color: '#d13212', border: '1px solid #f5cba7', display: 'block', marginBottom: 4 }}>⚠ {criticalCount} critical</span>}
                        {warnCount > 0 && <span style={{ ...s.pill, background: '#fef9ec', color: '#996600', border: '1px solid #f5dfa7' }}>● {warnCount} warning</span>}
                        {criticalCount === 0 && warnCount === 0 && <span style={{ ...s.pill, background: '#f2f8f4', color: '#067340', border: '1px solid #c3e6cb' }}>✓ All clear</span>}
                    </div>
                </div>

                {/* RIGHT — Module Status */}
                <div style={{ ...s.sideCard, right: 'clamp(20px, 3vw, 60px)', top: '50%', transform: 'translateY(-50%)' }}>
                    <div style={s.cardHeader}>
                        <div style={{ ...s.cardDot, background: '#067340' }} />
                        <span style={s.cardLabel}>MODULE STATUS</span>
                    </div>
                    <div style={{ textAlign: 'center', margin: '10px 0 8px' }}>
                        <svg viewBox="0 0 80 90" width="50" height="56" style={{ display: 'inline-block' }}>
                            <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#232F3E" stopOpacity="0.9" /><stop offset="100%" stopColor="#16212e" stopOpacity="1" /></linearGradient></defs>
                            <path d="M40 4L72 16V36C72 57 58 72 40 78C22 72 8 57 8 36V16L40 4Z" fill="url(#sg)" stroke="#FF9900" strokeWidth="2" />
                            <text x="40" y="44" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="Arial">aws</text>
                            <path d="M27 51 Q40 59 53 51" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {MODULE_STATUS.map((m, i) => (
                            <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 4, background: modulesDone ? (m.color === '#067340' ? 'rgba(6,115,64,0.06)' : 'rgba(255,153,0,0.06)') : 'rgba(35,47,62,0.04)', border: `1px solid ${modulesDone ? (m.color === '#067340' ? 'rgba(6,115,64,0.18)' : 'rgba(255,153,0,0.18)') : 'rgba(35,47,62,0.08)'}`, transition: 'all 0.4s ease', transitionDelay: `${i * 0.15}s` }}>
                                <span style={{ fontSize: 11, color: '#414d5c', fontWeight: 500 }}>{m.label}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: modulesDone ? m.color : '#aab7b8' }}>{modulesDone ? m.status : '...'}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, background: '#f8f9fa', borderRadius: 4, padding: '8px 6px', border: '1px solid rgba(35,47,62,0.1)' }}>
                        {[{ v: '12+', l: 'SCANNERS', c: '#0972d3' }, { v: '9', l: 'MODULES', c: '#067340' }, { v: 'v0.1', l: 'VERSION', c: '#687078' }].map(st => (
                            <div key={st.l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: st.c }}>{st.v}</span>
                                <span style={{ fontSize: 9, color: '#aab7b8', fontFamily: 'monospace' }}>{st.l}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '5px 10px', background: modulesDone ? '#f2f8f4' : '#f8f9fa', color: modulesDone ? '#067340' : '#aab7b8', border: `1px solid ${modulesDone ? '#c3e6cb' : 'rgba(35,47,62,0.1)'}`, transition: 'all 0.5s ease' }}>
                        {modulesDone ? '✓ Connect an account to scan' : '⟳ Loading modules...'}
                    </div>
                </div>

                {/* CENTER */}
                <div style={s.card}>
                    <div style={s.logoWrap}>
                        <AWSLogo />
                    </div>
                    <div style={s.divider} />
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <h1 style={s.title}>Cloud Security Panel</h1>
                        <p style={s.subtitle}>AWS infrastructure monitoring &amp; remediation</p>
                    </div>
                    <div style={s.terminal}>
                        <div style={s.termHead}>
                            <span style={s.dot} /><span style={{ ...s.dot, background: '#FF9900' }} /><span style={{ ...s.dot, background: '#067340' }} />
                            <span style={{ color: '#687078', fontSize: 11, marginLeft: 8 }}>console output</span>
                        </div>
                        <div style={s.termBody}>
                            {lines.slice(0, lineIndex).map((l, i) => (
                                <div key={i} style={{ marginBottom: 5 }}>
                                    <span style={{ color: '#FF9900' }}>{l.prompt}</span>
                                    <span style={{ color: '#adbac7' }}>{l.text}</span>
                                </div>
                            ))}
                            {lineIndex < lines.length
                                ? <span style={{ color: '#FF9900', animation: 'blink 1s step-end infinite', fontFamily: 'monospace' }}>_</span>
                                : <div style={{ marginBottom: 5 }}><span style={{ color: '#067340' }}>● All systems operational</span></div>
                            }
                        </div>
                    </div>
                    <div style={s.statsRow}>
                        {[{ v: '12+', l: 'SCANNERS', c: '#0972d3' }, { v: '99%', l: 'UPTIME', c: '#0972d3' }, { v: '5ms', l: 'LATENCY', c: '#FF9900' }].map(st => (
                            <div key={st.l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: st.c }}>{st.v}</span>
                                <span style={{ color: '#687078', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{st.l}</span>
                            </div>
                        ))}
                    </div>
                    <button style={s.btn} onClick={() => navigate('/setup')}
                        onMouseEnter={e => { e.currentTarget.style.background = '#ec8a00'; e.currentTarget.style.borderColor = '#ec8a00' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FF9900'; e.currentTarget.style.borderColor = '#FF9900' }}>
                        Initialize Connection
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8H13M9 4L13 8L9 12" stroke="#232F3E" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        {['v0.1.0', 'FastAPI', 'OAS 3.1'].map(b => <span key={b} style={s.badge}>{b}</span>)}
                    </div>
                </div>
            </div>
        </>
    )
}

function AWSLogo() {
    return (
        <svg viewBox="0 0 130 52" width="120" height="48" style={{ display: 'block' }}>
            <text x="65" y="36" textAnchor="middle" fill="#232F3E" fontSize="38" fontWeight="bold" fontFamily="Arial, sans-serif">aws</text>
            <path d="M20 43 Q65 57 110 43" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M105 39 L110 43 L105 47" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

const s = {
    root: { minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f4f0', position: 'relative', overflow: 'hidden' },
    blobTL: { position: 'absolute', top: -100, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,153,0,0.12) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' },
    blobBR: { position: 'absolute', bottom: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,153,0,0.10) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' },
    blobCenter: { position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,153,0,0.05) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' },
    gridSvg: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 },
    sideCard: { position: 'absolute', zIndex: 2, background: '#fff', border: '1px solid rgba(35,47,62,0.12)', borderRadius: 8, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,28,36,0.1)', width: 200 },
    cardHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
    cardDot: { width: 8, height: 8, borderRadius: '50%', background: '#FF9900', flexShrink: 0 },
    cardLabel: { color: '#687078', fontSize: 10, letterSpacing: 1.2, fontFamily: 'monospace', fontWeight: 500 },
    pill: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '4px 10px' },
    card: { position: 'relative', zIndex: 2, background: '#fff', border: '1px solid rgba(35,47,62,0.15)', borderRadius: 8, padding: '36px 42px', maxWidth: 460, width: '90%', boxShadow: '0 4px 24px rgba(0,28,36,0.12)', animation: 'fadeIn 0.4s ease both' },
    logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 18 },
    divider: { height: 1, background: 'rgba(35,47,62,0.1)', marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, color: '#16191f', margin: '0 0 6px' },
    subtitle: { color: '#687078', fontSize: 13, margin: 0, lineHeight: 1.5 },
    terminal: { background: '#232F3E', borderRadius: 6, overflow: 'hidden', marginBottom: 18, border: '1px solid rgba(35,47,62,0.3)' },
    termHead: { background: '#16212e', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: '#d13212', flexShrink: 0 },
    termBody: { padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, minHeight: 86 },
    statsRow: { display: 'flex', justifyContent: 'space-around', background: '#f8f9fa', border: '1px solid rgba(35,47,62,0.1)', borderRadius: 6, padding: '13px 10px', marginBottom: 18 },
    btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 20px', background: '#FF9900', color: '#232F3E', border: '2px solid #FF9900', borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 18, boxShadow: '0 2px 8px rgba(255,153,0,0.25)', transition: 'background 0.15s, border-color 0.15s' },
    badge: { fontSize: 11, fontFamily: 'monospace', color: '#687078', background: '#f8f9fa', border: '1px solid rgba(35,47,62,0.15)', borderRadius: 3, padding: '3px 8px' },
}
