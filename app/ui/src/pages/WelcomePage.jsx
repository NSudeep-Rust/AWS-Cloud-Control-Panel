import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function WelcomePage() {
    const navigate = useNavigate()
    const { account } = useAuth()
    const [lineIndex, setLineIndex] = useState(0)
    const [radarAngle, setRadarAngle] = useState(0)

    const lines = [
        { prompt: '>', text: ' Initializing security modules...' },
        { prompt: '>', text: ' Loading threat intelligence...' },
        { prompt: '>', text: ' AWS SDK connected.' },
        { prompt: '>', text: ' Ready for account setup.' },
    ]

    useEffect(() => { if (account) navigate('/panel') }, [account])

    useEffect(() => {
        if (lineIndex >= lines.length) return
        const t = setTimeout(() => setLineIndex(i => i + 1), 700)
        return () => clearTimeout(t)
    }, [lineIndex])

    useEffect(() => {
        const iv = setInterval(() => setRadarAngle(a => (a + 2) % 360), 20)
        return () => clearInterval(iv)
    }, [])

    const toRad = deg => (deg * Math.PI) / 180
    const sweepX = 50 + 42 * Math.cos(toRad(radarAngle - 90))
    const sweepY = 50 + 42 * Math.sin(toRad(radarAngle - 90))
    const trailX = 50 + 42 * Math.cos(toRad(radarAngle - 90 - 55))
    const trailY = 50 + 42 * Math.sin(toRad(radarAngle - 90 - 55))

    return (
        <div style={s.root}>
            {/* AWS-style warm cream background with blobs */}
            <div style={s.blobTL} />
            <div style={s.blobBR} />
            <div style={s.blobCenter} />

            {/* Subtle grid */}
            <svg style={s.gridSvg} viewBox="0 0 1440 900" preserveAspectRatio="none">
                {[...Array(15)].map((_, i) => (
                    <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="900"
                        stroke="rgba(35,47,62,0.04)" strokeWidth="1" />
                ))}
                {[...Array(10)].map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={i * 100} x2="1440" y2={i * 100}
                        stroke="rgba(35,47,62,0.04)" strokeWidth="1" />
                ))}
            </svg>

            {/* LEFT — Radar card */}
            <div style={{ ...s.sideCard, left: 60, top: '50%', transform: 'translateY(-50%)' }}>
                <div style={s.cardHeader}>
                    <div style={s.cardDot} />
                    <span style={s.cardLabel}>THREAT RADAR</span>
                </div>
                <svg viewBox="0 0 100 100" width="140" height="140" style={{ display: 'block', margin: '8px auto' }}>
                    <circle cx="50" cy="50" r="48" fill="#f8f9fa" stroke="rgba(35,47,62,0.1)" strokeWidth="1" />
                    {[42, 30, 18].map(r => (
                        <circle key={r} cx="50" cy="50" r={r} fill="none"
                            stroke="rgba(255,153,0,0.25)" strokeWidth="0.8" strokeDasharray="3 3" />
                    ))}
                    <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(35,47,62,0.1)" strokeWidth="0.5" />
                    <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(35,47,62,0.1)" strokeWidth="0.5" />
                    <path d={`M50,50 L${trailX},${trailY} A42,42 0 0,1 ${sweepX},${sweepY} Z`}
                        fill="rgba(255,153,0,0.15)" />
                    <line x1="50" y1="50" x2={sweepX} y2={sweepY}
                        stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
                    {[{ cx: 62, cy: 38 }, { cx: 35, cy: 68 }, { cx: 72, cy: 65 }].map((b, i) => (
                        <circle key={i} cx={b.cx} cy={b.cy} r="3" fill="#d13212" opacity="0.8">
                            <animate attributeName="opacity" values="0.8;0.2;0.8" dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                            <animate attributeName="r" values="3;5;3" dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                        </circle>
                    ))}
                    <circle cx="50" cy="50" r="3" fill="#FF9900" />
                </svg>
                <div style={s.radarFooter}>
                    <span style={{ ...s.statusPill, background: '#fdf3e7', color: '#d13212', border: '1px solid #f5cba7' }}>
                        ⚠ 3 anomalies
                    </span>
                </div>
            </div>

            {/* RIGHT — Security status */}
            <div style={{ ...s.sideCard, right: 60, top: '50%', transform: 'translateY(-50%)' }}>
                <div style={s.cardHeader}>
                    <div style={{ ...s.cardDot, background: '#067340' }} />
                    <span style={s.cardLabel}>SECURITY STATUS</span>
                </div>

                {/* AWS Shield logo */}
                <div style={{ textAlign: 'center', margin: '12px 0' }}>
                    <svg viewBox="0 0 80 90" width="64" height="72" style={{ display: 'inline-block' }}>
                        <defs>
                            <linearGradient id="rsg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#232F3E" stopOpacity="0.9" />
                                <stop offset="100%" stopColor="#16212e" stopOpacity="1" />
                            </linearGradient>
                        </defs>
                        <path d="M40 4L72 16V36C72 57 58 72 40 78C22 72 8 57 8 36V16L40 4Z"
                            fill="url(#rsg)" stroke="#FF9900" strokeWidth="2" />
                        <path d="M40 18L62 27V38C62 52 52 63 40 67C28 63 18 52 18 38V27L40 18Z"
                            fill="rgba(255,153,0,0.08)" stroke="rgba(255,153,0,0.3)" strokeWidth="1" />
                        <text x="40" y="44" textAnchor="middle" fill="white"
                            fontSize="12" fontWeight="bold" fontFamily="Arial">aws</text>
                        <path d="M27 51 Q40 59 53 51" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M50 48 L53 51 L50 54" fill="none" stroke="#FF9900" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                {[
                    { label: 'EC2', pct: 92, color: '#067340' },
                    { label: 'S3', pct: 78, color: '#FF9900' },
                    { label: 'IAM', pct: 65, color: '#d13212' },
                    { label: 'VPC', pct: 88, color: '#067340' },
                ].map(item => (
                    <div key={item.label} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ color: '#414d5c', fontSize: 12, fontWeight: 500 }}>{item.label}</span>
                            <span style={{ color: item.color, fontSize: 12, fontWeight: 700 }}>{item.pct}%</span>
                        </div>
                        <div style={{ background: 'rgba(35,47,62,0.08)', borderRadius: 3, height: 4 }}>
                            <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                        </div>
                    </div>
                ))}

                <div style={{ ...s.statusPill, background: '#f2f8f4', color: '#067340', border: '1px solid #c3e6cb', marginTop: 4 }}>
                    ✓ Shield Active
                </div>
            </div>

            {/* CENTER CARD — AWS console style */}
            <div style={s.card}>
                {/* AWS Logo */}
                <div style={s.logoWrap}>
                    <svg viewBox="0 0 120 50" width="120" height="50">
                        <text x="60" y="34" textAnchor="middle" fill="#232F3E"
                            fontSize="36" fontWeight="bold" fontFamily="Arial, sans-serif">aws</text>
                        <path d="M18 40 Q60 54 102 40" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round" />
                        <path d="M97 36 L102 40 L97 44" fill="none" stroke="#FF9900" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                {/* Divider */}
                <div style={s.dividerLine} />

                <div style={s.titleBlock}>
                    <h1 style={s.title}>Cloud Security Panel</h1>
                    <p style={s.subtitle}>Enterprise-grade infrastructure monitoring & remediation</p>
                </div>

                {/* Terminal — styled as AWS console output */}
                <div style={s.terminal}>
                    <div style={s.termHeader}>
                        <span style={s.termDot} />
                        <span style={{ ...s.termDot, background: '#FF9900' }} />
                        <span style={{ ...s.termDot, background: '#067340' }} />
                        <span style={{ color: '#687078', fontSize: 11, marginLeft: 8 }}>console output</span>
                    </div>
                    <div style={s.termBody}>
                        {lines.slice(0, lineIndex).map((line, i) => (
                            <div key={i} style={s.termLine}>
                                <span style={s.termPrompt}>{line.prompt}</span>
                                <span style={s.termText}>{line.text}</span>
                            </div>
                        ))}
                        {lineIndex < lines.length
                            ? <span style={s.cursor}>_</span>
                            : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    <span style={{ color: '#067340', fontSize: 11 }}>●</span>
                                    <span style={{ color: '#067340', fontSize: 12, fontFamily: 'Space Mono, monospace' }}>
                                        All systems operational
                                    </span>
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Stats — AWS console style */}
                <div style={s.statsRow}>
                    {[
                        { value: '12+', label: 'Scanners', color: '#0073bb' },
                        { value: '99%', label: 'Uptime', color: '#067340' },
                        { value: '5ms', label: 'Latency', color: '#FF9900' },
                    ].map(stat => (
                        <div key={stat.label} style={s.statItem}>
                            <span style={{ ...s.statValue, color: stat.color }}>{stat.value}</span>
                            <span style={s.statLabel}>{stat.label}</span>
                        </div>
                    ))}
                </div>

                {/* CTA — AWS orange button style */}
                <button style={s.btn}
                    onClick={() => navigate('/setup')}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ec8a00'; e.currentTarget.style.borderColor = '#ec8a00' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#FF9900'; e.currentTarget.style.borderColor = '#FF9900' }}
                >
                    Initialize Connection
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8H13M9 4L13 8L9 12" stroke="#232F3E" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>

                {/* Footer badges */}
                <div style={s.footerBadges}>
                    {['v0.1.0', 'FastAPI', 'OAS 3.1'].map(b => (
                        <span key={b} style={s.badge}>{b}</span>
                    ))}
                </div>
            </div>
        </div>
    )
}

const s = {
    root: {
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8f4f0',
        position: 'relative', overflow: 'hidden',
        fontFamily: 'DM Sans, sans-serif',
    },
    blobTL: {
        position: 'absolute', top: -100, left: -100,
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,153,0,0.12) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none',
    },
    blobBR: {
        position: 'absolute', bottom: -100, right: -100,
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,153,0,0.10) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none',
    },
    blobCenter: {
        position: 'absolute', top: '30%', left: '50%',
        transform: 'translateX(-50%)',
        width: 800, height: 400, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(255,153,0,0.05) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none',
    },
    gridSvg: {
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
    },
    sideCard: {
        position: 'absolute', zIndex: 2,
        background: '#ffffff',
        border: '1px solid rgba(35,47,62,0.12)',
        borderRadius: 8,
        padding: '16px 18px',
        boxShadow: '0 2px 12px rgba(0,28,36,0.1)',
        width: 190,
    },
    cardHeader: {
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
    },
    cardDot: {
        width: 8, height: 8, borderRadius: '50%', background: '#FF9900', flexShrink: 0,
    },
    cardLabel: {
        color: '#687078', fontSize: 10, letterSpacing: 1.2,
        fontFamily: 'Space Mono, monospace', fontWeight: 500,
    },
    radarFooter: {
        marginTop: 8, textAlign: 'center',
    },
    statusPill: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 600,
        borderRadius: 20, padding: '4px 10px',
        fontFamily: 'DM Sans, sans-serif',
    },
    card: {
        position: 'relative', zIndex: 2,
        background: '#ffffff',
        border: '1px solid rgba(35,47,62,0.15)',
        borderRadius: 8,
        padding: '40px 44px',
        maxWidth: 460, width: '90%',
        boxShadow: '0 4px 24px rgba(0,28,36,0.12)',
        animation: 'fadeIn 0.4s ease both',
    },
    logoWrap: {
        display: 'flex', justifyContent: 'center', marginBottom: 20,
    },
    dividerLine: {
        height: 1, background: 'rgba(35,47,62,0.1)', marginBottom: 24,
    },
    titleBlock: {
        textAlign: 'center', marginBottom: 24,
    },
    title: {
        fontSize: 22, fontWeight: 700, color: '#16191f', margin: '0 0 6px',
    },
    subtitle: {
        color: '#687078', fontSize: 13, margin: 0, lineHeight: 1.5,
    },
    terminal: {
        background: '#232F3E',
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 20,
        border: '1px solid rgba(35,47,62,0.3)',
    },
    termHeader: {
        background: '#16212e',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 6,
    },
    termDot: {
        width: 10, height: 10, borderRadius: '50%', background: '#d13212', flexShrink: 0,
    },
    termBody: {
        padding: '12px 16px',
        fontFamily: 'Space Mono, monospace',
        fontSize: 12, minHeight: 90,
    },
    termLine: { marginBottom: 5 },
    termPrompt: { color: '#FF9900' },
    termText: { color: '#adbac7' },
    cursor: {
        color: '#FF9900', animation: 'blink 1s step-end infinite',
        fontFamily: 'Space Mono, monospace',
    },
    statsRow: {
        display: 'flex', justifyContent: 'space-around',
        background: '#f8f9fa',
        border: '1px solid rgba(35,47,62,0.1)',
        borderRadius: 6, padding: '14px 10px', marginBottom: 20,
    },
    statItem: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    },
    statValue: {
        fontSize: 22, fontWeight: 700, fontFamily: 'Space Mono, monospace',
    },
    statLabel: {
        color: '#687078', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    btn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: '12px 20px',
        background: '#FF9900', color: '#232F3E',
        border: '2px solid #FF9900', borderRadius: 4,
        fontSize: 15, fontWeight: 700,
        cursor: 'pointer', marginBottom: 20,
        boxShadow: '0 2px 8px rgba(255,153,0,0.25)',
        transition: 'background 0.15s, border-color 0.15s',
        fontFamily: 'DM Sans, sans-serif',
    },
    footerBadges: {
        display: 'flex', gap: 8, justifyContent: 'center',
    },
    badge: {
        fontSize: 11, fontFamily: 'Space Mono, monospace',
        color: '#687078', background: '#f8f9fa',
        border: '1px solid rgba(35,47,62,0.15)',
        borderRadius: 3, padding: '3px 8px',
    },
}
