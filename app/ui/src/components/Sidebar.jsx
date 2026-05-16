import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Search, ShieldAlert, Wrench, RotateCcw,
    History, BarChart2, LogOut, Sun, Moon,
    Globe, Users, PanelLeftClose, PanelLeftOpen, RefreshCcw, ShieldCheck
} from 'lucide-react'
import { useState } from 'react'

const WEB_MODE = import.meta.env.VITE_WEB_MODE === 'true'

const NAV_GROUPS = [
    {
        label: null,
        items: [
            { id: 'overview',        label: 'Overview',       icon: LayoutDashboard, color: '#0972d3' },
        ]
    },
    {
        label: 'Security',
        items: [
            { id: 'scanner',         label: 'Scanner',        icon: Search,          color: '#e07b00' },
            { id: 'threats',         label: 'Threat Monitor', icon: ShieldAlert,     color: '#d13212' },
            { id: 'iam-view',        label: 'IAM View',       icon: Users,           color: '#7953d2' },
            { id: 'execute',         label: 'Remediation',    icon: Wrench,          color: '#1d8102' },
            { id: 'rollback',        label: 'Rollback',       icon: RotateCcw,       color: '#6e7f96' },
            { id: 'attack-surface',  label: 'Attack Surface', icon: Globe,           color: '#d13212' },
        ]
    },
    {
        label: 'Reports',
        items: [
            { id: 'history',         label: 'History',        icon: History,         color: '#0a8a6a' },
            { id: 'analytics',       label: 'Analytics',      icon: BarChart2,       color: '#0972d3' },
        ]
    },
]

const SB_CSS = `
  @keyframes sb-pulse  { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(2.4);opacity:0} }
  @keyframes sb-livdot { 0%,100%{opacity:1;box-shadow:0 0 0 2px rgba(29,129,2,.3)} 50%{opacity:.5;box-shadow:0 0 0 4px rgba(29,129,2,.1)} }
  @keyframes sb-card   { 0%{opacity:0;transform:translateX(-6px) scale(.98)} 100%{opacity:1;transform:translateX(0) scale(1)} }
  @keyframes sb-icon   { 0%{transform:scale(1)} 40%{transform:scale(1.18)} 100%{transform:scale(1.08)} }
  @keyframes sb-fadein { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
  .sb-nav-btn:hover .sb-icon-wrap { animation: sb-icon .28s cubic-bezier(.34,1.56,.64,1) forwards !important; }
  .sb-nav-btn { transition: background .18s ease, transform .14s ease !important; }
  .sb-nav-btn:hover { transform: translateX(2px) !important; }
  .sb-nav-btn:active { transform: translateX(1px) scale(.99) !important; }
`

export default function Sidebar({ active, onNav, dark, onToggleDark }) {
    const { account, disconnect } = useAuth()
    const navigate = useNavigate()

    const [collapsed,  setCollapsed]  = useState(() => localStorage.getItem('sb_col2') === '1')
    const [hoverId,    setHoverId]    = useState(null)
    const [hoverY,     setHoverY]     = useState(0)
    const [showModal,  setShowModal]  = useState(false)
    const [clearData,  setClearData]  = useState(false)
    const [clearing,   setClearing]   = useState(false)

    function toggleCollapse() {
        const next = !collapsed
        setCollapsed(next)
        localStorage.setItem('sb_col2', next ? '1' : '0')
    }

    // ── Disconnect (fully preserved) ─────────────────────────────────────────
    function openDisconnect()   { setShowModal(true); setClearData(false) }
    function cancelDisconnect() { setShowModal(false) }

    async function confirmDisconnect() {
        setClearing(true)
        try {
            if (clearData) {
                const API = 'http://127.0.0.1:8000'
                const awsId = account?.aws_account_id || account?.account_id
                if (awsId) {
                    await fetch(`${API}/api/session/wipe?account_id=${encodeURIComponent(awsId)}`, { method: 'DELETE' }).catch(() => {})
                }
                localStorage.removeItem('seen_alert_ids')
                Object.keys(localStorage).forEach(k => { if (k.startsWith('scan_v')) localStorage.removeItem(k) })
            }
        } catch { /* ignore */ } finally {
            setClearing(false)
            setShowModal(false)
            disconnect()
            navigate('/setup')
        }
    }

    function handleSwitch() { navigate('/setup') }

    // ── Account ──────────────────────────────────────────────────────────────
    const accountId   = account?.aws_account_id || account?.account_id || '—'
    const region      = account?.region || 'us-east-1'
    const profile     = account?.profile_name || account?.username || 'default'
    const isIam       = account?.account_type === 'iam'
    const avatarColor = isIam ? '#0972d3' : '#e07b00'
    const initials    = isIam ? 'IAM' : 'RT'

    // ── Active color ─────────────────────────────────────────────────────────
    const allItems   = NAV_GROUPS.flatMap(g => g.items)
    const activeItem = allItems.find(i => i.id === active)
    const activeColor= activeItem?.color || '#0972d3'

    // ── Theme ────────────────────────────────────────────────────────────────
    const bg     = dark ? '#0d1117'                : '#f7f8fa'
    const bg2    = dark ? '#161b22'                : '#ffffff'
    const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(35,47,62,0.09)'
    const text   = dark ? '#e6edf3'                : '#16191f'
    const text2  = dark ? '#8b949e'                : '#414d5c'
    const text3  = dark ? '#4a5260'                : '#8d96a0'
    const hov    = dark ? 'rgba(255,255,255,0.05)' : 'rgba(35,47,62,0.05)'

    const W = collapsed ? 66 : 218

    // hover card (collapsed only)
    function handleEnter(e, id) {
        const r = e.currentTarget.getBoundingClientRect()
        setHoverY(r.top + r.height / 2)
        setHoverId(id)
    }
    const hoverItem = collapsed ? allItems.find(i => i.id === hoverId) : null

    // text fade helper
    const textStyle = {
        opacity:    collapsed ? 0   : 1,
        maxWidth:   collapsed ? 0   : 160,
        overflow:   'hidden',
        whiteSpace: 'nowrap',
        transition: collapsed
            ? 'opacity .15s ease, max-width .22s cubic-bezier(.4,0,.2,1)'
            : 'opacity .22s ease .08s, max-width .22s cubic-bezier(.4,0,.2,1)',
    }

    return (
        <>
        <style>{SB_CSS}</style>

        {/* Floating hover card — collapsed only */}
        {hoverItem && collapsed && (
            <div key={hoverId} style={{ position:'fixed', left:74, top:hoverY-32, zIndex:99999, pointerEvents:'none', animation:'sb-card .16s ease' }}>
                <div style={{
                    background:   dark ? '#1c2330' : '#fff',
                    borderLeft:   `3px solid ${hoverItem.color}`,
                    borderTop:    `1px solid ${hoverItem.color}25`,
                    borderRight:  `1px solid ${hoverItem.color}25`,
                    borderBottom: `1px solid ${hoverItem.color}25`,
                    borderRadius: '0 9px 9px 0',
                    padding:      '9px 15px 9px 13px',
                    minWidth:     150,
                    boxShadow:    dark ? '0 6px 24px rgba(0,0,0,.5)' : '0 4px 20px rgba(35,47,62,.14)',
                }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color: hoverItem.color }}>{hoverItem.label}</div>
                </div>
            </div>
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside style={{
            width:         W,
            minWidth:      W,
            height:        '100vh',
            display:       'flex',
            flexDirection: 'column',
            background:    bg,
            borderRight:   `1px solid ${border}`,
            position:      'relative',
            zIndex:        10,
            flexShrink:    0,
            overflow:      'hidden',
            boxShadow:     dark ? '4px 0 20px rgba(0,0,0,.4)' : '4px 0 16px rgba(35,47,62,.07)',
            transition:    'width .26s cubic-bezier(.4,0,.2,1), min-width .26s cubic-bezier(.4,0,.2,1)',
            fontFamily:    "'Inter','Amazon Ember',-apple-system,sans-serif",
        }}>

            {/* ── Logo zone — always dark gradient ──────────────────────────── */}
            <div style={{
                background:     'linear-gradient(145deg, #1a2332 0%, #232F3E 100%)',
                padding:        collapsed ? '10px 0 8px' : '0 12px',
                height:         collapsed ? 'auto' : 56,
                minHeight:      collapsed ? 72 : 56,
                display:        'flex',
                flexDirection:  collapsed ? 'column' : 'row',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            collapsed ? 6 : 10,
                flexShrink:     0,
                borderBottom:   '1px solid rgba(255,255,255,0.08)',
                position:       'relative',
                transition:     'padding .26s ease, height .26s ease',
            }}>
                {/* AWS logo — white version, always visible */}
                <svg width="34" height="21" viewBox="0 0 85 52" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink:0, minWidth:34 }}>
                    <path d="M23.9 21.1c0 .8.1 1.4.2 1.9.2.5.4.9.7 1.4.1.2.2.4.2.5 0 .2-.1.4-.4.6l-1.3.9c-.2.1-.4.2-.5.2-.2 0-.4-.1-.6-.3-.3-.3-.5-.6-.7-1-.2-.4-.4-.8-.6-1.3-1.5 1.8-3.4 2.7-5.7 2.7-1.6 0-2.9-.5-3.8-1.4-.9-.9-1.4-2.1-1.4-3.6 0-1.6.6-2.9 1.7-3.8 1.1-.9 2.6-1.4 4.5-1.4.6 0 1.3.1 2 .2.7.1 1.4.3 2.1.5v-1.3c0-1.4-.3-2.3-.9-2.9-.6-.6-1.6-.8-3-.8-.6 0-1.3.1-2 .3-.7.2-1.3.4-2 .7-.3.1-.5.2-.6.2-.2 0-.3-.2-.3-.5v-.8c0-.3 0-.5.1-.6.1-.1.3-.3.6-.4.7-.3 1.5-.6 2.4-.8 1-.2 2-.3 3.1-.3 2.4 0 4.1.5 5.2 1.6 1.1 1.1 1.6 2.7 1.6 4.9v6.4zm-7.9 3c.6 0 1.3-.1 2-.4.7-.3 1.3-.7 1.8-1.4.3-.4.5-.8.6-1.3.1-.5.2-1 .2-1.6v-.8c-.5-.1-1.1-.2-1.7-.3-.6-.1-1.2-.1-1.8-.1-1.3 0-2.2.3-2.8.8-.6.5-.9 1.2-.9 2.1 0 .9.2 1.5.7 1.9.4.5 1 .8 1.9.8v.3zm15.1 2c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L26 11.2c-.1-.4-.2-.7-.2-.9 0-.4.2-.6.5-.6h2.1c.3 0 .6.1.7.2.2.2.3.4.4.8l3.6 14.5 3.4-14.5c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h1.7c.3 0 .5.1.7.2.2.2.3.4.4.8l3.4 14.7 3.7-14.7c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h2c.4 0 .5.2.5.6 0 .1 0 .3-.1.5l-.1.4-5.1 16.9c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-1.8c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L37.9 12 34.5 26c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-2.3zm27.2.5c-1.1 0-2.2-.1-3.3-.4-1-.3-1.8-.6-2.4-1-.3-.2-.6-.4-.6-.7-.1-.2-.1-.5-.1-.7V23c0-.4.1-.5.4-.5.2 0 .3 0 .5.1.1 0 .3.1.5.2.7.3 1.4.5 2.2.7.8.2 1.6.3 2.4.3 1.3 0 2.3-.2 3-.7.7-.5 1-1.1 1-1.9 0-.6-.2-1-.5-1.4-.4-.4-1-.7-1.9-1l-2.8-.9c-1.4-.4-2.4-1.1-3-2-.6-.9-.9-1.9-.9-3 0-.9.2-1.7.6-2.4.4-.7.9-1.3 1.6-1.8.6-.5 1.4-.8 2.2-1.1.8-.2 1.7-.3 2.6-.3.5 0 .9 0 1.4.1.5.1.9.2 1.3.3.4.1.8.2 1.1.4.3.1.6.3.7.4.2.1.4.3.4.5.1.2.1.4.1.7v.8c0 .4-.1.5-.4.5-.2 0-.4-.1-.7-.2-.6-.3-1.3-.5-2-.7-.7-.2-1.4-.3-2.2-.3-1.2 0-2.1.2-2.7.6-.6.4-.9 1-.9 1.8 0 .6.2 1 .6 1.4.4.4 1.1.7 2 1l2.7.9c1.4.4 2.4 1 3 1.9.6.8.9 1.8.9 3 0 .9-.2 1.7-.6 2.5-.4.7-.9 1.3-1.6 1.8-.7.5-1.5.9-2.4 1.1-.9.3-1.9.4-3 .4z" fill="#ffffff"/>
                    <path d="M58.4 38.5c-7.1 5.3-17.5 8.1-26.4 8.1-12.5 0-23.7-4.6-32.2-12.3-.7-.6-.1-1.4.7-1 9.2 5.4 20.5 8.6 32.3 8.6 7.9 0 16.6-1.6 24.6-5 1.2-.5 2.2.8 1 1.6z" fill="#FF9900"/>
                    <path d="M61.3 35.3c-.9-1.2-6.1-.6-8.4-.3-.7.1-.8-.5-.2-.9 4.1-2.9 10.9-2.1 11.7-1.1.8 1-.2 7.7-4.1 10.9-.6.5-1.2.2-.9-.4.9-2.2 2.8-7 1.9-8.2z" fill="#FF9900"/>
                </svg>

                {/* Text — only in expanded mode */}
                {!collapsed && (
                    <div style={{ flex:1, overflow:'hidden' }}>
                        <div style={{ fontSize:13, fontWeight:800, color:'#ffffff', lineHeight:1.2, letterSpacing:-0.2, whiteSpace:'nowrap' }}>CloudShield</div>
                        <div style={{ fontSize:8.5, color:'#FF9900', letterSpacing:1, fontWeight:700, textTransform:'uppercase', marginTop:1, whiteSpace:'nowrap' }}>Security Panel</div>
                    </div>
                )}

                {/* Collapse toggle */}
                <button
                    onClick={toggleCollapse}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    style={{
                        width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.15)',
                        background:'rgba(255,255,255,0.07)', cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexShrink:0, transition:'all .18s ease', color:'#8b949e',
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,153,0,0.18)'; e.currentTarget.style.borderColor='#FF990066' }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)' }}
                >
                    {collapsed
                        ? <PanelLeftOpen  size={14} color="#aab4be" />
                        : <PanelLeftClose size={14} color="#aab4be" />
                    }
                </button>
            </div>

            {/* ── Account card ──────────────────────────────────────────────── */}
            <div style={{
                margin:       '10px 9px 4px',
                background:   bg2,
                border:       `1px solid ${border}`,
                borderRadius: 10,
                overflow:     'hidden',
                flexShrink:   0,
                boxShadow:    dark ? '0 2px 10px rgba(0,0,0,.25)' : '0 1px 6px rgba(35,47,62,.08)',
                transition:   'box-shadow .2s',
            }}>
                {/* Header */}
                <div style={{
                    padding:      '9px 11px',
                    background:   isIam
                        ? (dark ? 'rgba(9,114,211,.12)' : '#f0f7ff')
                        : (dark ? 'rgba(255,153,0,.09)'  : '#fffbf2'),
                    borderBottom: collapsed ? 'none' : `1px solid ${border}`,
                    display:      'flex',
                    alignItems:   'center',
                    gap:          9,
                }}>
                    {/* Avatar + pulse */}
                    <div style={{ position:'relative', flexShrink:0 }}>
                        <div style={{
                            position:'absolute', inset:-3, borderRadius:'50%',
                            border:`1.5px solid ${avatarColor}`,
                            animation:'sb-pulse 2.4s ease-out infinite',
                        }}/>
                        <div style={{
                            width:28, height:28, borderRadius:'50%',
                            background:`linear-gradient(135deg,${avatarColor}ee,${avatarColor}99)`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:8, fontWeight:900, color:'#fff', letterSpacing:.4,
                            boxShadow:`0 2px 8px ${avatarColor}50`,
                            position:'relative', zIndex:1, userSelect:'none',
                        }}>{initials}</div>
                        {/* Live dot */}
                        <div style={{
                            position:'absolute', bottom:-1, right:-1,
                            width:8, height:8, borderRadius:'50%',
                            background:'#1d8102', border:`2px solid ${bg2}`,
                            animation:'sb-livdot 2s ease-in-out infinite', zIndex:2,
                        }}/>
                    </div>

                    {/* Account ID + type — hidden when collapsed */}
                    <div style={{ flex:1, minWidth:0, ...textStyle }}>
                        <div style={{
                            fontSize:10.5, fontWeight:700, color:text,
                            fontFamily:'monospace', overflow:'hidden',
                            textOverflow:'ellipsis', whiteSpace:'nowrap',
                        }}>{accountId}</div>
                    </div>
                    <span style={{
                        ...textStyle,
                        fontSize:8, fontWeight:700,
                        color: isIam?'#0972d3':'#e07b00',
                        background: isIam?'rgba(9,114,211,.12)':'rgba(224,123,0,.12)',
                        border:`1px solid ${isIam?'rgba(9,114,211,.25)':'rgba(224,123,0,.25)'}`,
                        borderRadius:3, padding:'1px 5px',
                        textTransform:'uppercase', letterSpacing:.6, flexShrink:0,
                        display:'inline-block',
                    }}>{isIam?'IAM':'Root'}</span>
                </div>

                {/* Details rows — expanded only */}
                <div style={{
                    maxHeight: collapsed ? 0 : 80,
                    opacity:   collapsed ? 0 : 1,
                    overflow:  'hidden',
                    transition:'max-height .24s cubic-bezier(.4,0,.2,1), opacity .18s ease',
                }}>
                    <div style={{ padding:'7px 11px 2px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:10, color:text3 }}>Profile</span>
                            <span style={{ fontSize:10, fontWeight:600, color:text2, fontFamily:'monospace', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:10, color:text3 }}>Region</span>
                            <span style={{ fontSize:10, fontWeight:600, color:text2, fontFamily:'monospace' }}>{region}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSwitch}
                        style={{
                            width:'100%', padding:'7px 11px', marginTop:4,
                            background:'#FF9900', border:'none', borderTop:`1px solid ${border}`,
                            color:'#0f1111', fontSize:11, fontWeight:700,
                            cursor:'pointer', display:'flex', alignItems:'center',
                            justifyContent:'center', gap:5, transition:'background .12s',
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background='#e07b00'}
                        onMouseLeave={e=>e.currentTarget.style.background='#FF9900'}
                    >
                        <RefreshCcw size={10}/> Switch Account
                    </button>
                </div>
            </div>

            {/* ── Navigation ────────────────────────────────────────────────── */}
            <nav style={{ flex:1, padding: collapsed?'4px 7px':'4px 8px', overflowY:'auto', overflowX:'hidden', minHeight:0 }}>
                {NAV_GROUPS.map((group, gi) => (
                    <div key={gi} style={{ marginBottom:2 }}>

                        {/* Group label */}
                        {group.label && (
                            <div style={{
                                display:'flex', alignItems:'center', gap:6,
                                fontSize:9, fontWeight:700,
                                color: dark?'rgba(255,153,0,0.55)':'#9da8b2',
                                padding: collapsed?'8px 0 3px':'9px 8px 4px',
                                letterSpacing:1.1, textTransform:'uppercase',
                                justifyContent: collapsed?'center':'flex-start',
                                ...textStyle,
                                maxWidth:'none', opacity: collapsed?0:1,
                                maxHeight: collapsed?0:28,
                                overflow:'hidden',
                                transition:'opacity .18s ease, max-height .22s cubic-bezier(.4,0,.2,1)',
                            }}>
                                <div style={{ width:12, height:1, background:dark?'rgba(255,255,255,.1)':'rgba(35,47,62,.1)', flexShrink:0 }}/>
                                <span style={{ whiteSpace:'nowrap' }}>{group.label}</span>
                                <div style={{ flex:1, height:1, background:dark?'rgba(255,255,255,.1)':'rgba(35,47,62,.1)' }}/>
                            </div>
                        )}
                        {group.label && collapsed && <div style={{ height:6 }}/>}

                        {group.items.map(item => {
                            const Icon     = item.icon
                            const isActive = active === item.id
                            const isHov    = hoverId === item.id && !isActive
                            const ic       = item.color

                            return (
                                <button
                                    key={item.id}
                                    className="sb-nav-btn"
                                    onClick={() => onNav(item.id)}
                                    onMouseEnter={e => { handleEnter(e, item.id); setHoverId(item.id) }}
                                    onMouseLeave={() => setHoverId(null)}
                                    title={collapsed ? item.label : undefined}
                                    style={{
                                        display:        'flex',
                                        alignItems:     'center',
                                        gap:            collapsed ? 0 : 10,
                                        width:          '100%',
                                        padding:        collapsed ? '7px 0' : '6px 9px',
                                        borderRadius:   9,
                                        border:         'none',
                                        cursor:         'pointer',
                                        marginBottom:   3,
                                        justifyContent: collapsed ? 'center' : 'flex-start',
                                        background:     isActive
                                            ? (dark ? `${ic}1a` : `${ic}0f`)
                                            : isHov ? hov : 'transparent',
                                        outline:        isActive ? `1.5px solid ${ic}28` : '1.5px solid transparent',
                                        position:       'relative',
                                        textAlign:      'left',
                                    }}
                                >
                                    {/* Left stripe — active */}
                                    {isActive && (
                                        <div style={{
                                            position:'absolute', left:0, top:'16%',
                                            width:3, height:'68%',
                                            borderRadius:'0 3px 3px 0',
                                            background: `linear-gradient(180deg,${ic}cc,${ic}88)`,
                                            boxShadow:`0 0 8px ${ic}80`,
                                        }}/>
                                    )}

                                    {/* Icon tile */}
                                    <div
                                        className="sb-icon-wrap"
                                        style={{
                                            width:32, height:32, borderRadius:8, flexShrink:0,
                                            background: isActive
                                                ? `linear-gradient(135deg,${ic}ee,${ic}bb)`
                                                : isHov
                                                    ? `${ic}22`
                                                    : dark ? `${ic}18` : `${ic}12`,
                                            border:`1px solid ${isActive ? ic+'aa' : ic+'28'}`,
                                            display:'flex', alignItems:'center', justifyContent:'center',
                                            transition:'all .18s ease',
                                            boxShadow: isActive
                                                ? `0 3px 12px ${ic}50, inset 0 1px 0 rgba(255,255,255,.15)`
                                                : isHov ? `0 2px 8px ${ic}30` : 'none',
                                        }}
                                    >
                                        <Icon
                                            size={15}
                                            strokeWidth={isActive ? 2.3 : 1.8}
                                            color={isActive ? '#fff' : ic}
                                            style={{ transition:'all .15s ease', filter: isActive?`drop-shadow(0 1px 2px ${ic}80)`:'none' }}
                                        />
                                    </div>

                                    {/* Label */}
                                    <span style={{
                                        flex:1, fontSize:12.5,
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? ic : dark ? '#c9d1d9' : '#232F3E',
                                        transition:'color .14s',
                                        ...textStyle,
                                        maxWidth: collapsed ? 0 : 160,
                                    }}>
                                        {item.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* ── Bottom bar ────────────────────────────────────────────────── */}
            <div style={{
                borderTop:`1px solid ${border}`,
                padding: collapsed?'6px 7px 10px':'5px 8px 10px',
                flexShrink:0,
                background: dark?'rgba(0,0,0,.2)':'rgba(35,47,62,.02)',
            }}>
                {/* Dark mode */}
                <button
                    onClick={onToggleDark}
                    title={dark ? 'Light Mode' : 'Dark Mode'}
                    style={{
                        display:'flex', alignItems:'center', gap: collapsed?0:9,
                        width:'100%', padding: collapsed?'7px 0':'7px 9px',
                        borderRadius:7, border:'none', cursor:'pointer',
                        background:'transparent', color:text2,
                        fontSize:12, fontWeight:400, justifyContent: collapsed?'center':'flex-start',
                        transition:'background .12s, color .12s', marginBottom:2,
                    }}
                    onMouseEnter={e=>e.currentTarget.style.background=hov}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                    {dark ? <Sun size={14} color="#8b949e"/> : <Moon size={14} color="#687078"/>}
                    {!collapsed && (
                        <>
                        <span style={{ flex:1, transition:'opacity .2s' }}>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                        <div style={{
                            width:28, height:15, borderRadius:8,
                            background: dark?'#FF9900':'#d5d9d9',
                            position:'relative', transition:'background .2s', flexShrink:0,
                        }}>
                            <div style={{
                                position:'absolute', top:2, left:dark?14:2,
                                width:11, height:11, borderRadius:'50%',
                                background:'#fff', transition:'left .2s ease',
                                boxShadow:'0 1px 3px rgba(0,0,0,.22)',
                            }}/>
                        </div>
                        </>
                    )}
                </button>

                {/* Disconnect */}
                <button
                    onClick={openDisconnect}
                    title="Disconnect AWS account"
                    style={{
                        display:'flex', alignItems:'center', gap: collapsed?0:9,
                        width:'100%', padding: collapsed?'7px 0':'7px 9px',
                        borderRadius:7, border:'none', cursor:'pointer',
                        background:'transparent', color:text2,
                        fontSize:12, fontWeight:400, justifyContent: collapsed?'center':'flex-start',
                        transition:'background .12s, color .12s',
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='rgba(209,50,18,.08)'; e.currentTarget.style.color='#d13212' }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color=text2 }}
                >
                    <LogOut size={14}/>
                    {!collapsed && <span>Disconnect</span>}
                </button>

                {/* ── Web User Profile Card (web mode only) ─────────────── */}
                {WEB_MODE && (() => {
                    const webEmail = localStorage.getItem('cloudshield_web_email') || ''
                    const initial  = webEmail ? webEmail[0].toUpperCase() : 'U'
                    const username = webEmail.split('@')[0] || 'User'
                    function webSignOut() {
                        localStorage.removeItem('cloudshield_web_token')
                        localStorage.removeItem('cloudshield_web_email')
                        navigate('/auth', { replace: true })
                    }
                    return (
                        <>
                        {/* Gradient divider */}
                        <div style={{
                            height: 1, margin: '7px 4px 9px',
                            background: `linear-gradient(90deg,transparent,${dark?'rgba(255,153,0,0.30)':'rgba(255,153,0,0.35)'},transparent)`,
                        }}/>

                        {!collapsed ? (
                            /* ── Expanded: premium card ── */
                            <div style={{
                                margin: '0 5px 2px',
                                borderRadius: 11,
                                border: `1px solid ${dark?'rgba(255,153,0,0.22)':'rgba(255,153,0,0.28)'}`,
                                background: dark
                                    ? 'linear-gradient(145deg,rgba(255,153,0,0.07) 0%,rgba(255,80,0,0.03) 100%)'
                                    : 'linear-gradient(145deg,rgba(255,248,235,0.95) 0%,rgba(255,240,210,0.6) 100%)',
                                padding: '10px 12px 9px',
                                position: 'relative', overflow: 'hidden',
                                boxShadow: dark
                                    ? '0 2px 14px rgba(255,153,0,0.08), inset 0 1px 0 rgba(255,255,255,0.05)'
                                    : '0 2px 12px rgba(255,153,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
                            }}>
                                {/* Glow orb */}
                                <div style={{
                                    position:'absolute', top:-18, right:-18,
                                    width:56, height:56, borderRadius:'50%',
                                    background:'radial-gradient(circle,rgba(255,153,0,0.18) 0%,transparent 70%)',
                                    pointerEvents:'none',
                                }}/>

                                {/* User row */}
                                <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
                                    {/* Avatar */}
                                    <div style={{
                                        position:'relative', flexShrink:0,
                                    }}>
                                        <div style={{
                                            width:32, height:32, borderRadius:'50%',
                                            background:'linear-gradient(135deg,#FF9900 0%,#e07b00 100%)',
                                            display:'flex', alignItems:'center', justifyContent:'center',
                                            fontSize:13, fontWeight:900, color:'#fff',
                                            letterSpacing:0.3,
                                            boxShadow:'0 3px 12px rgba(255,153,0,0.45)',
                                            border:'2px solid rgba(255,153,0,0.35)',
                                        }}>{initial}</div>
                                        {/* Live dot */}
                                        <div style={{
                                            position:'absolute', bottom:-1, right:-1,
                                            width:9, height:9, borderRadius:'50%',
                                            background:'linear-gradient(135deg,#28a745,#1d8102)',
                                            border:`2px solid ${dark?'#161b22':'#fff'}`,
                                            boxShadow:'0 0 6px rgba(29,129,2,0.5)',
                                        }}/>
                                    </div>

                                    {/* Name + email */}
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{
                                            fontSize:11.5, fontWeight:800,
                                            color: dark?'#e6edf3':'#16191f',
                                            overflow:'hidden', textOverflow:'ellipsis',
                                            whiteSpace:'nowrap', letterSpacing:-0.1,
                                        }}>{username}</div>
                                        <div style={{
                                            fontSize:9.5,
                                            color: dark?'#6e7f8e':'#7a8898',
                                            overflow:'hidden', textOverflow:'ellipsis',
                                            whiteSpace:'nowrap', marginTop:1,
                                        }}>{webEmail}</div>
                                    </div>
                                </div>

                                {/* Sign Out button — premium red gradient */}
                                <button
                                    id="web-sign-out"
                                    onClick={webSignOut}
                                    style={{
                                        width:'100%', padding:'7px 0',
                                        background:'linear-gradient(135deg,#c0392b 0%,#e74c3c 100%)',
                                        border:'none', borderRadius:8,
                                        cursor:'pointer', fontSize:11.5, fontWeight:700,
                                        color:'#fff', letterSpacing:0.4,
                                        display:'flex', alignItems:'center',
                                        justifyContent:'center', gap:6,
                                        boxShadow:'0 3px 10px rgba(192,57,43,0.30)',
                                        transition:'all 0.18s cubic-bezier(.34,1.56,.64,1)',
                                    }}
                                    onMouseEnter={e=>{
                                        e.currentTarget.style.transform='translateY(-2px) scale(1.01)'
                                        e.currentTarget.style.boxShadow='0 6px 20px rgba(192,57,43,0.45)'
                                        e.currentTarget.style.background='linear-gradient(135deg,#a93226 0%,#c0392b 100%)'
                                    }}
                                    onMouseLeave={e=>{
                                        e.currentTarget.style.transform='translateY(0) scale(1)'
                                        e.currentTarget.style.boxShadow='0 3px 10px rgba(192,57,43,0.30)'
                                        e.currentTarget.style.background='linear-gradient(135deg,#c0392b 0%,#e74c3c 100%)'
                                    }}
                                >
                                    <LogOut size={12} strokeWidth={2.5}/>
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            /* ── Collapsed: icon-only button with tooltip ── */
                            <button
                                id="web-sign-out"
                                onClick={webSignOut}
                                title={`Sign Out — ${webEmail}`}
                                style={{
                                    width:'100%', padding:'7px 0',
                                    background:'rgba(192,57,43,0.08)',
                                    border:'1px solid rgba(192,57,43,0.15)',
                                    borderRadius:7, cursor:'pointer',
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    transition:'all 0.15s',
                                }}
                                onMouseEnter={e=>{ e.currentTarget.style.background='rgba(192,57,43,0.18)'; e.currentTarget.style.transform='scale(1.05)' }}
                                onMouseLeave={e=>{ e.currentTarget.style.background='rgba(192,57,43,0.08)'; e.currentTarget.style.transform='scale(1)' }}
                            >
                                <LogOut size={14} color="#c0392b" strokeWidth={2.2}/>
                            </button>
                        )}
                        </>
                    )
                })()}

            </div>
        </aside>

        {/* ── Disconnect modal (fully preserved) ──────────────────────────── */}
        {showModal && (
            <div style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={cancelDisconnect}>
                <div onClick={e=>e.stopPropagation()} style={{ background:dark?'#1c2330':'#fff', border:`1px solid ${dark?'rgba(255,255,255,.1)':'#d5d9d9'}`, borderRadius:12, padding:'28px 32px', width:380, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                        <div style={{ width:42, height:42, borderRadius:10, background:'rgba(209,50,18,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><span style={{ fontSize:20 }}>🔌</span></div>
                        <div>
                            <div style={{ fontSize:16, fontWeight:800, color:dark?'#e6edf3':'#0f1111' }}>Disconnect Account?</div>
                            <div style={{ fontSize:11, color:dark?'#8b949e':'#565959', marginTop:2 }}>You can reconnect anytime from the setup page</div>
                        </div>
                    </div>
                    <div style={{ background:dark?'rgba(255,255,255,.04)':'#f6f6f6', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:12, color:dark?'#8b949e':'#565959' }}>
                        Disconnecting: <strong style={{ color:dark?'#e6edf3':'#0f1111' }}>{account?.aws_account_id||account?.account_id}</strong>{account?.region&&<> · {account.region}</>}
                    </div>
                    <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:24, userSelect:'none' }}>
                        <input type="checkbox" checked={clearData} onChange={e=>setClearData(e.target.checked)} style={{ marginTop:2, accentColor:'#d13212', width:15, height:15, flexShrink:0 }}/>
                        <div>
                            <div style={{ fontSize:12.5, fontWeight:700, color:clearData?'#d13212':(dark?'#e6edf3':'#0f1111') }}>Delete all session data</div>
                            <div style={{ fontSize:11, color:dark?'#8b949e':'#8d9191', marginTop:2, lineHeight:1.5 }}>Wipes all scan history, findings, and alerts. Cannot be undone.</div>
                        </div>
                    </label>
                    <div style={{ display:'flex', gap:10 }}>
                        <button onClick={cancelDisconnect} style={{ flex:1, padding:'9px 0', border:`1px solid ${dark?'rgba(255,255,255,.12)':'#d5d9d9'}`, borderRadius:7, background:'transparent', color:dark?'#8b949e':'#565959', fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                        <button onClick={confirmDisconnect} disabled={clearing} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, background:clearData?'#d13212':'#b85c00', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:clearing?.7:1 }}>
                            {clearing?'Clearing...':clearData?'🗑️ Delete & Exit':'🔌 Disconnect'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
