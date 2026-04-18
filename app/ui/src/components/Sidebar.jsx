import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Search, ShieldAlert, Wrench, RotateCcw,
    History, BarChart2, LogOut, Sun, Moon, Globe, Users
} from 'lucide-react'
import { useState } from 'react'

// ── Section color identities ────────────────────────────────────────────────
const SECTION_COLOR = {
    'overview':        '#0972d3',
    'scanner':         '#e07b00',
    'threats':         '#d13212',
    'iam-view':        '#7953d2',
    'execute':         '#1d8102',
    'rollback':        '#8b949e',
    'attack-surface':  '#d13212',
    'history':         '#0a8a6a',
    'analytics':       '#0972d3',
}

// ── Nav item definitions ────────────────────────────────────────────────────
const NAV_ITEMS = [
    { id: 'overview',        label: 'Overview',       icon: LayoutDashboard, color: '#0972d3', desc: 'Risk score & finding summary'        },
    { id: 'scanner',         label: 'Scanner',        icon: Search,          color: '#e07b00', desc: 'Scan AWS for misconfigurations'       },
    { id: 'threats',         label: 'Threat Monitor', icon: ShieldAlert,     color: '#d13212', desc: 'Critical & high severity threats'     },
    { id: 'iam-view',        label: 'IAM View',       icon: Users,           color: '#7953d2', desc: 'Users, roles & policy explorer'       },
    { id: 'execute',         label: 'Remediation',    icon: Wrench,          color: '#1d8102', desc: 'Execute & plan security fixes'        },
    { id: 'rollback',        label: 'Rollback',       icon: RotateCcw,       color: '#8b949e', desc: 'Undo executed remediations'           },
    { id: 'attack-surface',  label: 'Attack Surface', icon: Globe,           color: '#d13212', desc: 'External exposure analysis'           },
    null, // ── divider ──
    { id: 'history',         label: 'History',        icon: History,         color: '#0a8a6a', desc: 'Scan history & audit trail'           },
    { id: 'analytics',       label: 'Analytics',      icon: BarChart2,       color: '#0972d3', desc: 'Charts, trends & metrics'            },
]

// ── CSS keyframe animations ─────────────────────────────────────────────────
const STRIP_CSS = `
  @keyframes cs-spin  { to { transform: rotate(360deg); } }
  @keyframes cs-scan  {
    0%   { top: -3px; opacity: 0;   }
    8%   { opacity: 0.65; }
    92%  { opacity: 0.65; }
    100% { top: 100%;  opacity: 0;  }
  }
  @keyframes cs-card  {
    0%   { opacity: 0; transform: translateX(-10px) scale(0.97); }
    100% { opacity: 1; transform: translateX(0)     scale(1);    }
  }
  @keyframes cs-pulse {
    0%   { transform: scale(1);   opacity: 0.55; }
    100% { transform: scale(2.4); opacity: 0;    }
  }
  @keyframes cs-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }
`

export default function Sidebar({ active, onNav, dark, onToggleDark }) {
    const { account, disconnect } = useAuth()
    const navigate = useNavigate()

    const [hoverId,    setHoverId]   = useState(null)
    const [hoverY,     setHoverY]    = useState(0)
    const [showModal,  setShowModal] = useState(false)
    const [clearData,  setClearData] = useState(false)
    const [clearing,   setClearing]  = useState(false)

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
    const isIam       = account?.account_type === 'iam'
    const initials    = isIam ? 'IAM' : 'RT'
    const avatarColor = isIam ? '#0972d3' : '#e07b00'

    // ── Active section accent color ───────────────────────────────────────────
    const activeColor = SECTION_COLOR[active] || '#0972d3'

    // ── Theme tokens ─────────────────────────────────────────────────────────
    const bg     = dark ? '#0d1117'                   : '#f0f2f5'
    const border = dark ? 'rgba(255,255,255,0.07)'    : 'rgba(0,0,0,0.09)'
    const text2  = dark ? '#8b949e'                   : '#565959'

    // ── Hover card: capture icon position ────────────────────────────────────
    function handleEnter(e, id) {
        const r = e.currentTarget.getBoundingClientRect()
        setHoverY(r.top + r.height / 2)
        setHoverId(id)
    }
    const hoverItem = NAV_ITEMS.find(n => n && n.id === hoverId)

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
        <style>{STRIP_CSS}</style>

        {/* ── Floating hover card (position:fixed so it escapes overflow:hidden) */}
        {hoverItem && (
            <div
                key={hoverId}
                style={{
                    position:      'fixed',
                    left:          76,
                    top:           hoverY - 36,
                    zIndex:        99998,
                    pointerEvents: 'none',
                    animation:     'cs-card 0.16s ease',
                }}
            >
                <div style={{
                    background:   dark ? '#1c2330' : '#ffffff',
                    border:       `1.5px solid ${hoverItem.color}45`,
                    borderLeft:   `3px solid ${hoverItem.color}`,
                    borderRadius: 10,
                    padding:      '11px 16px',
                    minWidth:     186,
                    boxShadow:    `0 8px 28px rgba(0,0,0,${dark ? '0.5' : '0.14'}), 0 0 0 1px ${hoverItem.color}12`,
                }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: hoverItem.color, marginBottom: 3 }}>
                        {hoverItem.label}
                    </div>
                    <div style={{ fontSize: 11, color: text2, lineHeight: 1.55 }}>
                        {hoverItem.desc}
                    </div>
                </div>
            </div>
        )}

        {/* ── Command strip ─────────────────────────────────────────────────── */}
        <aside style={{
            width:          68,
            minWidth:       68,
            height:         '100vh',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            background:     bg,
            borderRight:    `2px solid ${activeColor}55`,
            boxShadow:      `3px 0 22px ${activeColor}18`,
            position:       'relative',
            zIndex:         10,
            flexShrink:     0,
            overflow:       'hidden',
            transition:     'border-right-color 0.4s ease, box-shadow 0.4s ease',
            fontFamily:     "'Inter', -apple-system, sans-serif",
        }}>

            {/* Scan-line sweep — dark mode only */}
            {dark && (
                <div style={{
                    position:        'absolute',
                    left:            0,
                    right:           0,
                    height:          2,
                    background:      `linear-gradient(90deg, transparent, ${activeColor}70, transparent)`,
                    animation:       'cs-scan 5s ease-in-out infinite',
                    pointerEvents:   'none',
                    zIndex:          1,
                }} />
            )}

            {/* ── Logo zone ──────────────────────────────────────────────── */}
            <div style={{
                width:          '100%',
                padding:        '14px 0 12px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                borderBottom:   `1px solid ${border}`,
                flexShrink:     0,
            }}>
                {/* Spinning gradient ring + CS letters */}
                <div style={{
                    width:          44,
                    height:         44,
                    borderRadius:   '50%',
                    background:     `conic-gradient(${activeColor} 0deg, #FF9900 120deg, ${activeColor} 240deg, #FF9900 360deg)`,
                    animation:      'cs-spin 5s linear infinite',
                    padding:        2.5,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    flexShrink:     0,
                    transition:     'background 0.4s ease',
                }}>
                    <div style={{
                        width:          '100%',
                        height:         '100%',
                        borderRadius:   '50%',
                        background:     bg,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        fontSize:       11,
                        fontWeight:     900,
                        color:          activeColor,
                        letterSpacing:  -0.3,
                        transition:     'color 0.4s ease',
                        userSelect:     'none',
                    }}>
                        CS
                    </div>
                </div>
            </div>

            {/* ── Account avatar chip ─────────────────────────────────────── */}
            <div
                onClick={handleSwitch}
                title={`${accountId} · ${region} — click to switch account`}
                style={{
                    width:          '100%',
                    padding:        '11px 0 10px',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    borderBottom:   `1px solid ${border}`,
                    flexShrink:     0,
                    cursor:         'pointer',
                    position:       'relative',
                }}
            >
                {/* Pulsing ring */}
                <div style={{
                    position:     'absolute',
                    width:        32,
                    height:       32,
                    borderRadius: '50%',
                    border:       `2px solid ${avatarColor}`,
                    animation:    'cs-pulse 2.4s ease-out infinite',
                }} />
                {/* Avatar circle */}
                <div style={{
                    width:          32,
                    height:         32,
                    borderRadius:   '50%',
                    background:     `linear-gradient(135deg, ${avatarColor}ee, ${avatarColor}99)`,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    fontSize:       9,
                    fontWeight:     900,
                    color:          '#fff',
                    letterSpacing:  0.4,
                    boxShadow:      `0 2px 12px ${avatarColor}50`,
                    position:       'relative',
                    zIndex:         1,
                    border:         `2px solid ${avatarColor}35`,
                    userSelect:     'none',
                }}>
                    {initials}
                </div>
                {/* Live green dot */}
                <div style={{
                    position:     'absolute',
                    bottom:       10,
                    right:        14,
                    width:        7,
                    height:       7,
                    borderRadius: '50%',
                    background:   '#1d8102',
                    border:       `1.5px solid ${bg}`,
                    boxShadow:    '0 0 0 2px rgba(29,129,2,0.28)',
                    animation:    'cs-dot 2s ease-in-out infinite',
                }} />
            </div>

            {/* ── Nav items ──────────────────────────────────────────────── */}
            <nav style={{
                flex:      1,
                width:     '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingTop: 4,
                paddingBottom: 4,
                minHeight: 0,
            }}>
                {NAV_ITEMS.map((item, idx) => {
                    // Thin divider
                    if (!item) return (
                        <div key={`div-${idx}`} style={{
                            margin:     '5px 14px',
                            height:     1,
                            background: border,
                        }} />
                    )

                    const Icon     = item.icon
                    const isActive = active === item.id
                    const isHov    = hoverId === item.id
                    const ic       = item.color

                    return (
                        <div key={item.id} style={{ position: 'relative', width: '100%' }}>
                            <button
                                onClick={() => onNav(item.id)}
                                onMouseEnter={e => handleEnter(e, item.id)}
                                onMouseLeave={() => setHoverId(null)}
                                title={item.label}
                                style={{
                                    width:          '100%',
                                    height:         50,
                                    display:        'flex',
                                    alignItems:     'center',
                                    justifyContent: 'center',
                                    border:         'none',
                                    cursor:         'pointer',
                                    position:       'relative',
                                    background:     isActive
                                        ? `linear-gradient(180deg, ${ic}14 0%, ${ic}07 100%)`
                                        : isHov
                                            ? (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
                                            : 'transparent',
                                    transition:     'background 0.15s',
                                    outline:        'none',
                                }}
                            >
                                {/* Icon wrapper */}
                                <div style={{
                                    width:          40,
                                    height:         40,
                                    borderRadius:   11,
                                    display:        'flex',
                                    alignItems:     'center',
                                    justifyContent: 'center',
                                    background:     isActive ? `${ic}20` : 'transparent',
                                    transition:     'all 0.2s ease',
                                    transform:      isHov && !isActive ? 'scale(1.12)' : 'scale(1)',
                                }}>
                                    <Icon
                                        size={isActive ? 19 : 17}
                                        strokeWidth={isActive ? 2.4 : 1.8}
                                        color={isActive ? ic : isHov ? ic : dark ? '#6e7681' : '#8d9191'}
                                        style={{
                                            filter:     isActive ? `drop-shadow(0 0 5px ${ic}99)` : 'none',
                                            transition: 'all 0.18s ease',
                                        }}
                                    />
                                </div>

                                {/* Left accent stripe (active) */}
                                {isActive && (
                                    <div style={{
                                        position:     'absolute',
                                        left:         0,
                                        top:          '18%',
                                        width:        3,
                                        height:       '64%',
                                        borderRadius: '0 3px 3px 0',
                                        background:   ic,
                                        boxShadow:    `0 0 8px ${ic}99`,
                                    }} />
                                )}

                                {/* Bottom tab glow (active) */}
                                {isActive && (
                                    <div style={{
                                        position:     'absolute',
                                        bottom:       0,
                                        left:         '50%',
                                        transform:    'translateX(-50%)',
                                        width:        22,
                                        height:       3,
                                        borderRadius: '3px 3px 0 0',
                                        background:   ic,
                                        boxShadow:    `0 0 10px ${ic}cc, 0 0 20px ${ic}44`,
                                    }} />
                                )}
                            </button>
                        </div>
                    )
                })}
            </nav>

            {/* ── Bottom action bar ──────────────────────────────────────── */}
            <div style={{
                width:          '100%',
                borderTop:      `1px solid ${border}`,
                padding:        '8px 0 10px',
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            3,
                flexShrink:     0,
                background:     dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.03)',
            }}>
                {/* Dark / Light toggle */}
                <button
                    onClick={onToggleDark}
                    title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    style={{
                        width:          40,
                        height:         40,
                        borderRadius:   10,
                        border:         'none',
                        cursor:         'pointer',
                        background:     'transparent',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        transition:     'background 0.14s',
                        outline:        'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    {dark
                        ? <Sun  size={15} color="#8b949e" />
                        : <Moon size={15} color="#565959" />
                    }
                </button>

                {/* Disconnect */}
                <button
                    onClick={openDisconnect}
                    title="Disconnect Account"
                    style={{
                        width:          40,
                        height:         40,
                        borderRadius:   10,
                        border:         'none',
                        cursor:         'pointer',
                        background:     'transparent',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        transition:     'background 0.14s',
                        outline:        'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(209,50,18,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    <LogOut size={15} color="#d13212" />
                </button>
            </div>
        </aside>

        {/* ── Disconnect confirmation modal (fully preserved) ─────────────── */}
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
                        background:  dark ? '#1c2330' : '#ffffff',
                        border:     `1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#d5d9d9'}`,
                        borderRadius: 12,
                        padding:     '28px 32px',
                        width:        380,
                        maxWidth:    '90vw',
                        boxShadow:   '0 20px 60px rgba(0,0,0,0.4)',
                    }}
                >
                    {/* Icon + Title */}
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                        <div style={{ width:42, height:42, borderRadius:10, background:'rgba(209,50,18,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:20 }}>🔌</span>
                        </div>
                        <div>
                            <div style={{ fontSize:16, fontWeight:800, color: dark ? '#e6edf3' : '#0f1111' }}>Disconnect Account?</div>
                            <div style={{ fontSize:11, color: dark ? '#8b949e' : '#565959', marginTop:2 }}>You can reconnect anytime from the setup page</div>
                        </div>
                    </div>

                    {/* Account info row */}
                    <div style={{ background: dark ? 'rgba(255,255,255,0.04)' : '#f6f6f6', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:12, color: dark ? '#8b949e' : '#565959' }}>
                        Disconnecting: <strong style={{ color: dark ? '#e6edf3' : '#0f1111' }}>{account?.aws_account_id || account?.account_id}</strong>
                        {account?.region && <> · {account.region}</>}
                    </div>

                    {/* Clear data checkbox */}
                    <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:24, userSelect:'none' }}>
                        <input
                            type="checkbox"
                            checked={clearData}
                            onChange={e => setClearData(e.target.checked)}
                            style={{ marginTop:2, accentColor:'#d13212', width:15, height:15, flexShrink:0 }}
                        />
                        <div>
                            <div style={{ fontSize:12.5, fontWeight:700, color: clearData ? '#d13212' : (dark ? '#e6edf3' : '#0f1111') }}>
                                Delete all session data
                            </div>
                            <div style={{ fontSize:11, color: dark ? '#8b949e' : '#8d9191', marginTop:2, lineHeight:1.5 }}>
                                Wipes all scan history, findings, and security alerts from this session. Cannot be undone.
                            </div>
                        </div>
                    </label>

                    {/* Buttons */}
                    <div style={{ display:'flex', gap:10 }}>
                        <button
                            onClick={cancelDisconnect}
                            style={{ flex:1, padding:'9px 0', border:`1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#d5d9d9'}`, borderRadius:7, background:'transparent', color: dark ? '#8b949e' : '#565959', fontSize:13, fontWeight:600, cursor:'pointer' }}
                        >
                            Cancel
                        </button>
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
