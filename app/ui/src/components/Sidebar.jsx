import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Search, ShieldAlert, Wrench, RotateCcw,
    History, BarChart2, LogOut, Sun, Moon,
    Globe, Users, ChevronLeft, ChevronRight, RefreshCcw
} from 'lucide-react'
import { useState } from 'react'

// ── Nav structure ────────────────────────────────────────────────────────────
const NAV_GROUPS = [
    {
        label: null,
        items: [
            { id: 'overview',       label: 'Overview',       icon: LayoutDashboard, color: '#0972d3', desc: 'Risk score & finding summary'   },
        ]
    },
    {
        label: 'Security',
        items: [
            { id: 'scanner',        label: 'Scanner',        icon: Search,          color: '#e07b00', desc: 'Scan AWS for misconfigs'         },
            { id: 'threats',        label: 'Threat Monitor', icon: ShieldAlert,     color: '#d13212', desc: 'Critical & high threats'         },
            { id: 'iam-view',       label: 'IAM View',       icon: Users,           color: '#7953d2', desc: 'Users, roles & policies'         },
            { id: 'execute',        label: 'Remediation',    icon: Wrench,          color: '#1d8102', desc: 'Execute & plan fixes'            },
            { id: 'rollback',       label: 'Rollback',       icon: RotateCcw,       color: '#6e7f96', desc: 'Undo executed actions'           },
            { id: 'attack-surface', label: 'Attack Surface', icon: Globe,           color: '#d13212', desc: 'External exposure analysis'      },
        ]
    },
    {
        label: 'Reports',
        items: [
            { id: 'history',        label: 'History',        icon: History,         color: '#0a8a6a', desc: 'Scan history & audit trail'      },
            { id: 'analytics',      label: 'Analytics',      icon: BarChart2,       color: '#0972d3', desc: 'Charts, trends & metrics'        },
        ]
    },
]

const SIDEBAR_CSS = `
  @keyframes sb-pulse  { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.2);opacity:0} }
  @keyframes sb-dot    { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes sb-card   { 0%{opacity:0;transform:translateX(-8px)} 100%{opacity:1;transform:translateX(0)} }
  @keyframes sb-scan   { 0%{top:-2px;opacity:0} 8%{opacity:.5} 92%{opacity:.5} 100%{top:100%;opacity:0} }
`

export default function Sidebar({ active, onNav, dark, onToggleDark }) {
    const { account, disconnect } = useAuth()
    const navigate = useNavigate()

    const [collapsed,  setCollapsed]  = useState(() => localStorage.getItem('sb_col') === '1')
    const [hoverId,    setHoverId]    = useState(null)
    const [hoverY,     setHoverY]     = useState(0)
    const [showModal,  setShowModal]  = useState(false)
    const [clearData,  setClearData]  = useState(false)
    const [clearing,   setClearing]   = useState(false)

    function toggleCollapse() {
        const next = !collapsed
        setCollapsed(next)
        localStorage.setItem('sb_col', next ? '1' : '0')
    }

    // ── Disconnect logic (fully preserved) ───────────────────────────────────
    function openDisconnect()   { setShowModal(true); setClearData(false) }
    function cancelDisconnect() { setShowModal(false) }

    async function confirmDisconnect() {
        setClearing(true)
        try {
            if (clearData) {
                const API = 'http://127.0.0.1:8000'
                const awsId = account?.aws_account_id || account?.account_id
                if (awsId) {
                    await fetch(
                        `${API}/api/session/wipe?account_id=${encodeURIComponent(awsId)}`,
                        { method: 'DELETE' }
                    ).catch(() => {})
                }
                localStorage.removeItem('seen_alert_ids')
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('scan_v')) localStorage.removeItem(k)
                })
            }
        } catch { /* ignore */ } finally {
            setClearing(false)
            setShowModal(false)
            disconnect()
            navigate('/setup')
        }
    }

    function handleSwitch() { navigate('/setup') }

    // ── Account info ─────────────────────────────────────────────────────────
    const accountId   = account?.aws_account_id || account?.account_id || '—'
    const region      = account?.region || 'us-east-1'
    const profile     = account?.profile_name || account?.username || 'default'
    const isIam       = account?.account_type === 'iam'
    const avatarColor = isIam ? '#0972d3' : '#e07b00'
    const initials    = isIam ? 'IAM' : 'RT'

    // ── Active color ─────────────────────────────────────────────────────────
    const activeItem  = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === active)
    const activeColor = activeItem?.color || '#0972d3'

    // ── Theme ────────────────────────────────────────────────────────────────
    const bg      = dark ? '#0d1117'                 : '#ffffff'
    const bg2     = dark ? '#161b22'                 : '#f8f9fb'
    const border  = dark ? 'rgba(255,255,255,0.08)'  : 'rgba(35,47,62,0.1)'
    const text    = dark ? '#e6edf3'                 : '#0f1111'
    const text2   = dark ? '#8b949e'                 : '#565959'
    const text3   = dark ? '#484f58'                 : '#9299a1'
    const hoverBg = dark ? 'rgba(255,255,255,0.05)'  : 'rgba(35,47,62,0.04)'

    const W = collapsed ? 64 : 210

    // ── Hover card (collapsed only) ──────────────────────────────────────────
    function handleEnter(e, id) {
        const r = e.currentTarget.getBoundingClientRect()
        setHoverY(r.top + r.height / 2)
        setHoverId(id)
    }
    const hoverItem = collapsed ? NAV_GROUPS.flatMap(g => g.items).find(i => i.id === hoverId) : null

    return (
        <>
        <style>{SIDEBAR_CSS}</style>

        {/* Floating hover card — only when collapsed */}
        {hoverItem && collapsed && (
            <div key={hoverId} style={{
                position:      'fixed',
                left:          72,
                top:           hoverY - 34,
                zIndex:        99999,
                pointerEvents: 'none',
                animation:     'sb-card 0.15s ease',
            }}>
                <div style={{
                    background:   dark ? '#1c2330' : '#fff',
                    border:       `1.5px solid ${hoverItem.color}40`,
                    borderLeft:   `3px solid ${hoverItem.color}`,
                    borderRadius: 9,
                    padding:      '10px 15px',
                    minWidth:     175,
                    boxShadow:    `0 8px 28px rgba(0,0,0,${dark?'0.45':'0.13'})`,
                }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: hoverItem.color, marginBottom: 2 }}>{hoverItem.label}</div>
                    <div style={{ fontSize: 11, color: text2 }}>{hoverItem.desc}</div>
                </div>
            </div>
        )}

        {/* ── Main sidebar ─────────────────────────────────────────────────── */}
        <aside style={{
            width:         W,
            minWidth:      W,
            height:        '100vh',
            display:       'flex',
            flexDirection: 'column',
            background:    bg,
            borderRight:   `1px solid ${border}`,
            boxShadow:     dark ? `2px 0 16px rgba(0,0,0,0.35)` : `2px 0 12px rgba(35,47,62,0.07)`,
            position:      'relative',
            zIndex:        10,
            flexShrink:    0,
            overflow:      'hidden',
            transition:    'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
            fontFamily:    "'Inter', 'Amazon Ember', -apple-system, sans-serif",
        }}>

            {/* Subtle scan line — dark mode */}
            {dark && (
                <div style={{
                    position:      'absolute',
                    left: 0, right: 0,
                    height:        1.5,
                    background:    `linear-gradient(90deg, transparent, ${activeColor}60, transparent)`,
                    animation:     'sb-scan 6s ease-in-out infinite',
                    pointerEvents: 'none',
                    zIndex:        1,
                }} />
            )}

            {/* ── Logo bar ──────────────────────────────────────────────────── */}
            <div style={{
                padding:        collapsed ? '13px 0' : '11px 14px',
                display:        'flex',
                alignItems:     'center',
                gap:            9,
                borderBottom:   `1px solid ${border}`,
                background:     dark ? '#161b22' : '#ffffff',
                flexShrink:     0,
                justifyContent: collapsed ? 'center' : 'flex-start',
                position:       'relative',
            }}>
                {/* Authentic AWS SVG logo mark */}
                <svg width="36" height="22" viewBox="0 0 85 52" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M23.9 21.1c0 .8.1 1.4.2 1.9.2.5.4.9.7 1.4.1.2.2.4.2.5 0 .2-.1.4-.4.6l-1.3.9c-.2.1-.4.2-.5.2-.2 0-.4-.1-.6-.3-.3-.3-.5-.6-.7-1-.2-.4-.4-.8-.6-1.3-1.5 1.8-3.4 2.7-5.7 2.7-1.6 0-2.9-.5-3.8-1.4-.9-.9-1.4-2.1-1.4-3.6 0-1.6.6-2.9 1.7-3.8 1.1-.9 2.6-1.4 4.5-1.4.6 0 1.3.1 2 .2.7.1 1.4.3 2.1.5v-1.3c0-1.4-.3-2.3-.9-2.9-.6-.6-1.6-.8-3-.8-.6 0-1.3.1-2 .3-.7.2-1.3.4-2 .7-.3.1-.5.2-.6.2-.2 0-.3-.2-.3-.5v-.8c0-.3 0-.5.1-.6.1-.1.3-.3.6-.4.7-.3 1.5-.6 2.4-.8 1-.2 2-.3 3.1-.3 2.4 0 4.1.5 5.2 1.6 1.1 1.1 1.6 2.7 1.6 4.9v6.4zm-7.9 3c.6 0 1.3-.1 2-.4.7-.3 1.3-.7 1.8-1.4.3-.4.5-.8.6-1.3.1-.5.2-1 .2-1.6v-.8c-.5-.1-1.1-.2-1.7-.3-.6-.1-1.2-.1-1.8-.1-1.3 0-2.2.3-2.8.8-.6.5-.9 1.2-.9 2.1 0 .9.2 1.5.7 1.9.4.5 1 .8 1.9.8v.3zm15.1 2c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L26 11.2c-.1-.4-.2-.7-.2-.9 0-.4.2-.6.5-.6h2.1c.3 0 .6.1.7.2.2.2.3.4.4.8l3.6 14.5 3.4-14.5c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h1.7c.3 0 .5.1.7.2.2.2.3.4.4.8l3.4 14.7 3.7-14.7c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h2c.4 0 .5.2.5.6 0 .1 0 .3-.1.5l-.1.4-5.1 16.9c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-1.8c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L37.9 12 34.5 26c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-2.3zm27.2.5c-1.1 0-2.2-.1-3.3-.4-1-.3-1.8-.6-2.4-1-.3-.2-.6-.4-.6-.7-.1-.2-.1-.5-.1-.7V23c0-.4.1-.5.4-.5.2 0 .3 0 .5.1.1 0 .3.1.5.2.7.3 1.4.5 2.2.7.8.2 1.6.3 2.4.3 1.3 0 2.3-.2 3-.7.7-.5 1-1.1 1-1.9 0-.6-.2-1-.5-1.4-.4-.4-1-.7-1.9-1l-2.8-.9c-1.4-.4-2.4-1.1-3-2-.6-.9-.9-1.9-.9-3 0-.9.2-1.7.6-2.4.4-.7.9-1.3 1.6-1.8.6-.5 1.4-.8 2.2-1.1.8-.2 1.7-.3 2.6-.3.5 0 .9 0 1.4.1.5.1.9.2 1.3.3.4.1.8.2 1.1.4.3.1.6.3.7.4.2.1.4.3.4.5.1.2.1.4.1.7v.8c0 .4-.1.5-.4.5-.2 0-.4-.1-.7-.2-.6-.3-1.3-.5-2-.7-.7-.2-1.4-.3-2.2-.3-1.2 0-2.1.2-2.7.6-.6.4-.9 1-.9 1.8 0 .6.2 1 .6 1.4.4.4 1.1.7 2 1l2.7.9c1.4.4 2.4 1 3 1.9.6.8.9 1.8.9 3 0 .9-.2 1.7-.6 2.5-.4.7-.9 1.3-1.6 1.8-.7.5-1.5.9-2.4 1.1-.9.3-1.9.4-3 .4z" fill={dark ? '#e6edf3' : '#232F3E'}/>
                    <path d="M58.4 38.5c-7.1 5.3-17.5 8.1-26.4 8.1-12.5 0-23.7-4.6-32.2-12.3-.7-.6-.1-1.4.7-1 9.2 5.4 20.5 8.6 32.3 8.6 7.9 0 16.6-1.6 24.6-5 1.2-.5 2.2.8 1 1.6z" fill="#FF9900"/>
                    <path d="M61.3 35.3c-.9-1.2-6.1-.6-8.4-.3-.7.1-.8-.5-.2-.9 4.1-2.9 10.9-2.1 11.7-1.1.8 1-.2 7.7-4.1 10.9-.6.5-1.2.2-.9-.4.9-2.2 2.8-7 1.9-8.2z" fill="#FF9900"/>
                </svg>

                {/* Product name — only when expanded */}
                {!collapsed && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: text, lineHeight: 1.2, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
                            CloudShield
                        </div>
                        <div style={{ fontSize: 9, color: '#FF9900', letterSpacing: 0.9, marginTop: 1, fontWeight: 700, textTransform: 'uppercase' }}>
                            Security Panel
                        </div>
                    </div>
                )}

                {/* Collapse toggle */}
                <button
                    onClick={toggleCollapse}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    style={{
                        width:          22,
                        height:         22,
                        borderRadius:   6,
                        border:         `1px solid ${border}`,
                        background:     hoverBg,
                        cursor:         'pointer',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexShrink:     0,
                        color:          text2,
                        transition:     'all 0.14s',
                        padding:        0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,153,0,0.12)' : 'rgba(255,153,0,0.1)'; e.currentTarget.style.borderColor = '#FF9900' }}
                    onMouseLeave={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.borderColor = border }}
                >
                    {collapsed
                        ? <ChevronRight size={12} color={text2} />
                        : <ChevronLeft  size={12} color={text2} />
                    }
                </button>
            </div>

            {/* ── Account card ──────────────────────────────────────────────── */}
            <div style={{
                margin:       collapsed ? '8px 6px' : '10px 10px 4px',
                background:   bg2,
                border:       `1px solid ${border}`,
                borderRadius: 9,
                overflow:     'hidden',
                flexShrink:   0,
                boxShadow:    dark ? 'none' : '0 1px 4px rgba(15,17,17,0.07)',
            }}>
                {/* Header row */}
                <div style={{
                    padding:      collapsed ? '8px 0' : '8px 11px',
                    background:   isIam
                        ? (dark ? 'rgba(9,114,211,0.1)' : '#f0f7ff')
                        : (dark ? 'rgba(255,153,0,0.08)' : '#fffbf2'),
                    borderBottom: collapsed ? 'none' : `1px solid ${border}`,
                    display:      'flex',
                    alignItems:   'center',
                    gap:          8,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    position:     'relative',
                }}>
                    {/* Pulse ring + avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                            position:     'absolute',
                            inset:        -2,
                            borderRadius: '50%',
                            border:       `2px solid ${avatarColor}`,
                            animation:    'sb-pulse 2.5s ease-out infinite',
                        }} />
                        <div style={{
                            width:          collapsed ? 28 : 26,
                            height:         collapsed ? 28 : 26,
                            borderRadius:   '50%',
                            background:     `linear-gradient(135deg, ${avatarColor}ee, ${avatarColor}99)`,
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            fontSize:       8,
                            fontWeight:     900,
                            color:          '#fff',
                            letterSpacing:  0.4,
                            boxShadow:      `0 2px 8px ${avatarColor}45`,
                            position:       'relative',
                            zIndex:         1,
                            userSelect:     'none',
                        }}>
                            {initials}
                        </div>
                        {/* Live dot */}
                        <div style={{
                            position:     'absolute',
                            bottom:       -1,
                            right:        -1,
                            width:        7,
                            height:       7,
                            borderRadius: '50%',
                            background:   '#1d8102',
                            border:       `1.5px solid ${bg2}`,
                            animation:    'sb-dot 2s ease-in-out infinite',
                            zIndex:       2,
                        }} />
                    </div>

                    {!collapsed && (
                        <>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize:     11,
                                    fontWeight:   700,
                                    color:        text,
                                    fontFamily:   'monospace',
                                    overflow:     'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace:   'nowrap',
                                }}>{accountId}</div>
                            </div>
                            <span style={{
                                fontSize:        8,
                                fontWeight:      700,
                                color:           isIam ? '#0972d3' : '#e07b00',
                                background:      isIam ? 'rgba(9,114,211,0.12)' : 'rgba(224,123,0,0.12)',
                                border:          `1px solid ${isIam ? 'rgba(9,114,211,0.25)' : 'rgba(224,123,0,0.25)'}`,
                                borderRadius:    3,
                                padding:         '1px 5px',
                                textTransform:   'uppercase',
                                letterSpacing:   0.6,
                                flexShrink:      0,
                            }}>
                                {isIam ? 'IAM' : 'Root'}
                            </span>
                        </>
                    )}
                </div>

                {/* Details row — expanded only */}
                {!collapsed && (
                    <div style={{ padding: '7px 11px 4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: text3 }}>Profile</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: text2, fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                            <span style={{ fontSize: 10, color: text3 }}>Region</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: text2, fontFamily: 'monospace' }}>{region}</span>
                        </div>
                    </div>
                )}

                {/* Switch button — expanded only */}
                {!collapsed && (
                    <button
                        onClick={handleSwitch}
                        style={{
                            width:          '100%',
                            padding:        '7px 11px',
                            background:     '#FF9900',
                            border:         'none',
                            borderTop:      `1px solid ${border}`,
                            color:          '#0f1111',
                            fontSize:       11,
                            fontWeight:     700,
                            cursor:         'pointer',
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            gap:            5,
                            transition:     'background 0.12s',
                            letterSpacing:  0.1,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e07b00'}
                        onMouseLeave={e => e.currentTarget.style.background = '#FF9900'}
                    >
                        <RefreshCcw size={10} /> Switch Account
                    </button>
                )}
            </div>

            {/* ── Navigation ────────────────────────────────────────────────── */}
            <nav style={{ flex: 1, padding: collapsed ? '4px 6px' : '4px 7px', overflowY: 'auto', minHeight: 0 }}>
                {NAV_GROUPS.map((group, gi) => (
                    <div key={gi} style={{ marginBottom: 2 }}>

                        {/* Group label — expanded only */}
                        {group.label && !collapsed && (
                            <div style={{
                                display:       'flex',
                                alignItems:    'center',
                                gap:           7,
                                fontSize:      9.5,
                                fontWeight:    700,
                                color:         dark ? 'rgba(255,153,0,0.6)' : '#9da5ae',
                                padding:       '9px 8px 4px',
                                letterSpacing: 1,
                                textTransform: 'uppercase',
                            }}>
                                <div style={{ width: 14, height: 1, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(35,47,62,0.1)' }} />
                                <span>{group.label}</span>
                                <div style={{ flex: 1, height: 1, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(35,47,62,0.1)' }} />
                            </div>
                        )}
                        {group.label && collapsed && <div style={{ height: 6 }} />}

                        {group.items.map(item => {
                            const Icon     = item.icon
                            const isActive = active === item.id
                            const isHov    = hoverId === item.id && !isActive
                            const ic       = item.color

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNav(item.id)}
                                    onMouseEnter={e => { handleEnter(e, item.id); setHoverId(item.id) }}
                                    onMouseLeave={() => setHoverId(null)}
                                    title={collapsed ? item.label : undefined}
                                    style={{
                                        display:        'flex',
                                        alignItems:     'center',
                                        gap:            collapsed ? 0 : 10,
                                        width:          '100%',
                                        padding:        collapsed ? '7px 0' : '6px 8px',
                                        borderRadius:   9,
                                        border:         'none',
                                        cursor:         'pointer',
                                        marginBottom:   2,
                                        justifyContent: collapsed ? 'center' : 'flex-start',
                                        background:     isActive
                                            ? (dark ? `${ic}18` : `${ic}10`)
                                            : isHov
                                                ? hoverBg
                                                : 'transparent',
                                        outline:        isActive ? `1.5px solid ${ic}30` : '1.5px solid transparent',
                                        position:       'relative',
                                        transition:     'all 0.14s ease',
                                        textAlign:      'left',
                                    }}
                                >
                                    {/* Left active stripe */}
                                    {isActive && (
                                        <div style={{
                                            position:     'absolute',
                                            left:         0,
                                            top:          '18%',
                                            width:        3,
                                            height:       '64%',
                                            borderRadius: '0 3px 3px 0',
                                            background:   ic,
                                            boxShadow:    `0 0 6px ${ic}88`,
                                        }} />
                                    )}

                                    {/* Icon tile */}
                                    <div style={{
                                        width:          32,
                                        height:         32,
                                        borderRadius:   8,
                                        flexShrink:     0,
                                        background:     isActive
                                            ? ic
                                            : isHov
                                                ? `${ic}22`
                                                : dark ? `${ic}16` : `${ic}12`,
                                        border:         `1px solid ${isActive ? ic : ic + '30'}`,
                                        display:        'flex',
                                        alignItems:     'center',
                                        justifyContent: 'center',
                                        transition:     'all 0.16s ease',
                                        boxShadow:      isActive
                                            ? `0 3px 12px ${ic}50`
                                            : isHov ? `0 2px 7px ${ic}28` : 'none',
                                        transform:      isHov ? 'scale(1.06)' : 'scale(1)',
                                    }}>
                                        <Icon
                                            size={15}
                                            strokeWidth={isActive ? 2.3 : 1.8}
                                            color={isActive ? '#fff' : ic}
                                        />
                                    </div>

                                    {/* Label — expanded only */}
                                    {!collapsed && (
                                        <span style={{
                                            flex:       1,
                                            fontSize:   12.5,
                                            fontWeight: isActive ? 700 : 500,
                                            color:      isActive ? ic : dark ? '#c9d1d9' : '#232F3E',
                                            transition: 'color 0.12s',
                                            whiteSpace: 'nowrap',
                                            overflow:   'hidden',
                                        }}>
                                            {item.label}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* ── Bottom bar ────────────────────────────────────────────────── */}
            <div style={{
                borderTop:      `1px solid ${border}`,
                padding:        collapsed ? '6px 6px 8px' : '5px 7px 8px',
                flexShrink:     0,
                background:     dark ? '#161b22' : '#ffffff',
            }}>
                {/* Dark mode toggle */}
                <button
                    onClick={onToggleDark}
                    title={dark ? 'Light Mode' : 'Dark Mode'}
                    style={{
                        display:        'flex',
                        alignItems:     'center',
                        gap:            collapsed ? 0 : 9,
                        width:          '100%',
                        padding:        collapsed ? '7px 0' : '7px 9px',
                        borderRadius:   7,
                        border:         'none',
                        cursor:         'pointer',
                        background:     'transparent',
                        color:          text2,
                        fontSize:       12,
                        fontWeight:     400,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        transition:     'all 0.1s',
                        marginBottom:   1,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    {dark ? <Sun size={13} color="#8b949e" /> : <Moon size={13} color="#687078" />}
                    {!collapsed && (
                        <>
                        <span style={{ flex: 1 }}>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                        <div style={{
                            width:      28,
                            height:     15,
                            borderRadius: 8,
                            background: dark ? '#FF9900' : '#d5d9d9',
                            position:   'relative',
                            transition: 'background 0.2s',
                            flexShrink: 0,
                        }}>
                            <div style={{
                                position:     'absolute',
                                top:          2,
                                left:         dark ? 14 : 2,
                                width:        11,
                                height:       11,
                                borderRadius: '50%',
                                background:   '#fff',
                                transition:   'left 0.2s',
                                boxShadow:    '0 1px 3px rgba(0,0,0,0.22)',
                            }} />
                        </div>
                        </>
                    )}
                </button>

                {/* Disconnect */}
                <button
                    onClick={openDisconnect}
                    title="Disconnect"
                    style={{
                        display:        'flex',
                        alignItems:     'center',
                        gap:            collapsed ? 0 : 9,
                        width:          '100%',
                        padding:        collapsed ? '7px 0' : '7px 9px',
                        borderRadius:   7,
                        border:         'none',
                        cursor:         'pointer',
                        background:     'transparent',
                        color:          text2,
                        fontSize:       12,
                        fontWeight:     400,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        transition:     'all 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(209,50,18,0.08)'; e.currentTarget.style.color = '#d13212' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = text2 }}
                >
                    <LogOut size={13} />
                    {!collapsed && <span>Disconnect</span>}
                </button>
            </div>
        </aside>

        {/* ── Disconnect modal (fully preserved) ──────────────────────────── */}
        {showModal && (
            <div style={{
                position:       'fixed',
                inset:          0,
                zIndex:         99999,
                background:     'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
            }} onClick={cancelDisconnect}>
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        background:   dark ? '#1c2330' : '#ffffff',
                        border:       `1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#d5d9d9'}`,
                        borderRadius: 12,
                        padding:      '28px 32px',
                        width:         380,
                        maxWidth:     '90vw',
                        boxShadow:    '0 20px 60px rgba(0,0,0,0.4)',
                    }}
                >
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                        <div style={{ width:42, height:42, borderRadius:10, background:'rgba(209,50,18,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:20 }}>🔌</span>
                        </div>
                        <div>
                            <div style={{ fontSize:16, fontWeight:800, color: dark ? '#e6edf3' : '#0f1111' }}>Disconnect Account?</div>
                            <div style={{ fontSize:11, color: dark ? '#8b949e' : '#565959', marginTop:2 }}>You can reconnect anytime from the setup page</div>
                        </div>
                    </div>
                    <div style={{ background: dark ? 'rgba(255,255,255,0.04)' : '#f6f6f6', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:12, color: dark ? '#8b949e' : '#565959' }}>
                        Disconnecting: <strong style={{ color: dark ? '#e6edf3' : '#0f1111' }}>{account?.aws_account_id || account?.account_id}</strong>
                        {account?.region && <> · {account.region}</>}
                    </div>
                    <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:24, userSelect:'none' }}>
                        <input
                            type="checkbox"
                            checked={clearData}
                            onChange={e => setClearData(e.target.checked)}
                            style={{ marginTop:2, accentColor:'#d13212', width:15, height:15, flexShrink:0 }}
                        />
                        <div>
                            <div style={{ fontSize:12.5, fontWeight:700, color: clearData ? '#d13212' : (dark ? '#e6edf3' : '#0f1111') }}>Delete all session data</div>
                            <div style={{ fontSize:11, color: dark ? '#8b949e' : '#8d9191', marginTop:2, lineHeight:1.5 }}>
                                Wipes all scan history, findings, and alerts from this session. Cannot be undone.
                            </div>
                        </div>
                    </label>
                    <div style={{ display:'flex', gap:10 }}>
                        <button
                            onClick={cancelDisconnect}
                            style={{ flex:1, padding:'9px 0', border:`1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#d5d9d9'}`, borderRadius:7, background:'transparent', color: dark ? '#8b949e' : '#565959', fontSize:13, fontWeight:600, cursor:'pointer' }}
                        >Cancel</button>
                        <button
                            onClick={confirmDisconnect}
                            disabled={clearing}
                            style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, background: clearData ? '#d13212' : '#b85c00', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity: clearing ? 0.7 : 1 }}
                        >
                            {clearing ? 'Clearing...' : clearData ? '🗑️ Delete & Exit' : '🔌 Disconnect'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
