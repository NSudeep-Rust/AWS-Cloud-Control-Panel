import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Search, ShieldAlert, Wrench, RotateCcw,
    History, BarChart2, Bell, LogOut, Sun, Moon, ChevronRight,
    Shield, RefreshCcw
} from 'lucide-react'
import { useState } from 'react'

const NAV_GROUPS = [
    {
        label: null,
        items: [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        ]
    },
    {
        label: 'Security',
        items: [
            { id: 'scanner',   label: 'Scanner',        icon: Search      },
            { id: 'threats',   label: 'Threat Monitor', icon: ShieldAlert },
            { id: 'execute',   label: 'Remediation',    icon: Wrench      },
            { id: 'rollback',  label: 'Rollback',       icon: RotateCcw   },
        ]
    },
    {
        label: 'Reports',
        items: [
            { id: 'history',   label: 'History',   icon: History   },
            { id: 'analytics', label: 'Analytics', icon: BarChart2 },
            { id: 'alerts',    label: 'Alerts',    icon: Bell      },
        ]
    },
]

export default function Sidebar({ active, onNav, dark, onToggleDark }) {
    const { account, disconnect } = useAuth()
    const navigate = useNavigate()
    const [hoverId, setHoverId] = useState(null)

    function handleDisconnect() { disconnect(); navigate('/setup') }
    function handleSwitch()     { navigate('/setup') }

    const accountId = account?.aws_account_id || account?.account_id || '—'
    const region    = account?.region || 'us-east-1'
    const profile   = account?.profile_name || account?.username || 'default'
    const isIam     = account?.account_type === 'iam'

    // Colors
    const bg        = dark ? '#161b22' : '#fafbfc'
    const card      = dark ? '#1c2330' : '#ffffff'
    const border    = dark ? 'rgba(255,255,255,0.08)' : '#d5d9d9'
    const text      = dark ? '#e6edf3'  : '#0f1111'
    const text2     = dark ? '#8b949e'  : '#565959'
    const text3     = dark ? '#484f58'  : '#8d9191'
    const hoverBg   = dark ? 'rgba(255,255,255,0.06)' : 'rgba(35,47,62,0.05)'
    const activeBg  = dark ? 'rgba(255,153,0,0.12)'   : '#fff4e6'
    const activeCol = '#e07b00'   // AWS orange (slightly darker for contrast on white)

    return (
        <aside style={{
            width: 224,
            minWidth: 224,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: bg,
            borderRight: `1px solid ${border}`,
            position: 'relative',
            zIndex: 10,
            flexShrink: 0,
            fontFamily: "'Amazon Ember', 'Inter', -apple-system, sans-serif",
        }}>

            {/* ── Logo bar — AWS logo + product name ── */}
            <div style={{
                padding: '11px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: `1px solid ${border}`,
                background: dark ? '#1c2330' : '#ffffff',
            }}>
                {/* Authentic AWS SVG logo mark */}
                <svg width="38" height="23" viewBox="0 0 85 52" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    {/* AWS text */}
                    <path d="M23.9 21.1c0 .8.1 1.4.2 1.9.2.5.4.9.7 1.4.1.2.2.4.2.5 0 .2-.1.4-.4.6l-1.3.9c-.2.1-.4.2-.5.2-.2 0-.4-.1-.6-.3-.3-.3-.5-.6-.7-1-.2-.4-.4-.8-.6-1.3-1.5 1.8-3.4 2.7-5.7 2.7-1.6 0-2.9-.5-3.8-1.4-.9-.9-1.4-2.1-1.4-3.6 0-1.6.6-2.9 1.7-3.8 1.1-.9 2.6-1.4 4.5-1.4.6 0 1.3.1 2 .2.7.1 1.4.3 2.1.5v-1.3c0-1.4-.3-2.3-.9-2.9-.6-.6-1.6-.8-3-.8-.6 0-1.3.1-2 .3-.7.2-1.3.4-2 .7-.3.1-.5.2-.6.2-.2 0-.3-.2-.3-.5v-.8c0-.3 0-.5.1-.6.1-.1.3-.3.6-.4.7-.3 1.5-.6 2.4-.8 1-.2 2-.3 3.1-.3 2.4 0 4.1.5 5.2 1.6 1.1 1.1 1.6 2.7 1.6 4.9v6.4zm-7.9 3c.6 0 1.3-.1 2-.4.7-.3 1.3-.7 1.8-1.4.3-.4.5-.8.6-1.3.1-.5.2-1 .2-1.6v-.8c-.5-.1-1.1-.2-1.7-.3-.6-.1-1.2-.1-1.8-.1-1.3 0-2.2.3-2.8.8-.6.5-.9 1.2-.9 2.1 0 .9.2 1.5.7 1.9.4.5 1 .8 1.9.8v.3zm15.1 2c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L26 11.2c-.1-.4-.2-.7-.2-.9 0-.4.2-.6.5-.6h2.1c.3 0 .6.1.7.2.2.2.3.4.4.8l3.6 14.5 3.4-14.5c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h1.7c.3 0 .5.1.7.2.2.2.3.4.4.8l3.4 14.7 3.7-14.7c.1-.4.2-.6.4-.8.2-.2.4-.2.7-.2h2c.4 0 .5.2.5.6 0 .1 0 .3-.1.5l-.1.4-5.1 16.9c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-1.8c-.3 0-.5-.1-.7-.2-.2-.2-.3-.4-.4-.8L37.9 12 34.5 26c-.1.4-.2.6-.4.8-.2.2-.4.2-.7.2h-2.3zm27.2.5c-1.1 0-2.2-.1-3.3-.4-1-.3-1.8-.6-2.4-1-.3-.2-.6-.4-.6-.7-.1-.2-.1-.5-.1-.7V23c0-.4.1-.5.4-.5.2 0 .3 0 .5.1.1 0 .3.1.5.2.7.3 1.4.5 2.2.7.8.2 1.6.3 2.4.3 1.3 0 2.3-.2 3-.7.7-.5 1-1.1 1-1.9 0-.6-.2-1-.5-1.4-.4-.4-1-.7-1.9-1l-2.8-.9c-1.4-.4-2.4-1.1-3-2-.6-.9-.9-1.9-.9-3 0-.9.2-1.7.6-2.4.4-.7.9-1.3 1.6-1.8.6-.5 1.4-.8 2.2-1.1.8-.2 1.7-.3 2.6-.3.5 0 .9 0 1.4.1.5.1.9.2 1.3.3.4.1.8.2 1.1.4.3.1.6.3.7.4.2.1.4.3.4.5.1.2.1.4.1.7v.8c0 .4-.1.5-.4.5-.2 0-.4-.1-.7-.2-.6-.3-1.3-.5-2-.7-.7-.2-1.4-.3-2.2-.3-1.2 0-2.1.2-2.7.6-.6.4-.9 1-.9 1.8 0 .6.2 1 .6 1.4.4.4 1.1.7 2 1l2.7.9c1.4.4 2.4 1 3 1.9.6.8.9 1.8.9 3 0 .9-.2 1.7-.6 2.5-.4.7-.9 1.3-1.6 1.8-.7.5-1.5.9-2.4 1.1-.9.3-1.9.4-3 .4z" fill={dark ? '#e6edf3' : '#232F3E'}/>
                    {/* Orange smile arc */}
                    <path d="M58.4 38.5c-7.1 5.3-17.5 8.1-26.4 8.1-12.5 0-23.7-4.6-32.2-12.3-.7-.6-.1-1.4.7-1 9.2 5.4 20.5 8.6 32.3 8.6 7.9 0 16.6-1.6 24.6-5 1.2-.5 2.2.8 1 1.6z" fill="#FF9900"/>
                    {/* Arrow on smile */}
                    <path d="M61.3 35.3c-.9-1.2-6.1-.6-8.4-.3-.7.1-.8-.5-.2-.9 4.1-2.9 10.9-2.1 11.7-1.1.8 1-.2 7.7-4.1 10.9-.6.5-1.2.2-.9-.4.9-2.2 2.8-7 1.9-8.2z" fill="#FF9900"/>
                </svg>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: text, lineHeight: 1.2, letterSpacing: -0.2 }}>
                        CloudShield
                    </div>
                    <div style={{ fontSize: 9, color: '#FF9900', letterSpacing: 0.8, marginTop: 1, fontWeight: 700, textTransform: 'uppercase' }}>
                        Security Panel
                    </div>
                </div>
            </div>

            {/* ── Account selector ── */}
            <div style={{
                margin: '10px 10px 4px',
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: dark ? 'none' : '0 1px 4px rgba(15,17,17,0.08)',
                flexShrink: 0,
            }}>
                {/* Account header */}
                <div style={{
                    padding: '8px 12px',
                    background: isIam
                        ? dark ? 'rgba(9,114,211,0.1)' : '#f0f7ff'
                        : dark ? 'rgba(255,153,0,0.08)' : '#fffbf2',
                    borderBottom: `1px solid ${border}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: '#1d8102',
                        boxShadow: '0 0 0 3px rgba(29,129,2,0.18)',
                        flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 11.5, fontWeight: 700,
                            color: text,
                            fontFamily: 'monospace',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{accountId}</div>
                    </div>
                    <span style={{
                        fontSize: 8.5, fontWeight: 700,
                        color: isIam ? '#0972d3' : '#e07b00',
                        background: isIam ? 'rgba(9,114,211,0.12)' : 'rgba(224,123,0,0.12)',
                        border: `1px solid ${isIam ? 'rgba(9,114,211,0.25)' : 'rgba(224,123,0,0.25)'}`,
                        borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0,
                    }}>
                        {isIam ? 'IAM' : 'Root'}
                    </span>
                </div>

                {/* Account details */}
                <div style={{ padding: '7px 12px 4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: text3 }}>Profile</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: text2, fontFamily: 'monospace', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                        <span style={{ fontSize: 10, color: text3 }}>Region</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: text2, fontFamily: 'monospace' }}>{region}</span>
                    </div>
                </div>

                {/* Switch button */}
                <button
                    onClick={handleSwitch}
                    style={{
                        width: '100%', padding: '8px 12px',
                        background: '#FF9900',
                        border: 'none',
                        borderTop: `1px solid ${border}`,
                        color: '#0f1111',
                        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'background 0.12s',
                        letterSpacing: 0.2,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e07b00'}
                    onMouseLeave={e => e.currentTarget.style.background = '#FF9900'}
                >
                    <RefreshCcw size={11} />
                    Switch Account
                </button>
            </div>

            {/* ── Nav ── */}
            <nav style={{ flex: 1, padding: '6px 6px', overflowY: 'auto' }}>
                {NAV_GROUPS.map((group, gi) => (
                    <div key={gi} style={{ marginBottom: 2 }}>
                        {group.label && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                fontSize: 10.5, fontWeight: 700,
                                color: dark ? 'rgba(255,153,0,0.75)' : '#232F3E',
                                padding: '10px 10px 5px',
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                            }}>
                                <div style={{
                                    flex: 1, height: 1,
                                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(35,47,62,0.12)',
                                }} />
                                <span>{group.label}</span>
                                <div style={{
                                    flex: 1, height: 1,
                                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(35,47,62,0.12)',
                                }} />
                            </div>
                        )}
                        {group.items.map(item => {
                            const Icon = item.icon
                            const isActive = active === item.id
                            const isHov = hoverId === item.id && !isActive
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNav(item.id)}
                                    onMouseEnter={() => setHoverId(item.id)}
                                    onMouseLeave={() => setHoverId(null)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        width: '100%', padding: '8px 10px',
                                        borderRadius: 6, border: 'none', cursor: 'pointer',
                                        marginBottom: 1,
                                        background: isActive ? activeBg : isHov ? hoverBg : 'transparent',
                                        color: isActive ? activeCol : text2,
                                        fontWeight: isActive ? 700 : 400,
                                        fontSize: 13,
                                        transition: 'all 0.1s',
                                        textAlign: 'left',
                                        position: 'relative',
                                        borderLeft: `3px solid ${isActive ? activeCol : 'transparent'}`,
                                    }}
                                >
                                    <Icon
                                        size={14}
                                        strokeWidth={isActive ? 2.2 : 1.7}
                                        color={isActive ? activeCol : dark ? '#8b949e' : '#687078'}
                                    />
                                    <span style={{ flex: 1 }}>{item.label}</span>
                                    {isActive && <ChevronRight size={11} style={{ opacity: 0.45 }} />}
                                </button>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* ── Bottom ── */}
            <div style={{
                borderTop: `1px solid ${border}`,
                padding: '6px 6px 8px',
                flexShrink: 0,
                background: dark ? '#1c2330' : '#ffffff',
            }}>
                <button
                    onClick={onToggleDark}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: 'none', cursor: 'pointer',
                        background: 'transparent', color: text2,
                        fontSize: 12.5, fontWeight: 400, transition: 'all 0.1s', marginBottom: 1,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    {dark ? <Sun size={13} color="#8b949e" /> : <Moon size={13} color="#687078" />}
                    <span style={{ flex: 1 }}>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                    <div style={{
                        width: 30, height: 16, borderRadius: 8,
                        background: dark ? '#FF9900' : '#d5d9d9',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                        <div style={{
                            position: 'absolute', top: 2.5,
                            left: dark ? 15 : 2,
                            width: 11, height: 11, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
                        }} />
                    </div>
                </button>

                <button
                    onClick={handleDisconnect}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: 'none', cursor: 'pointer',
                        background: 'transparent', color: text2,
                        fontSize: 12.5, fontWeight: 400, transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(209,50,18,0.08)'; e.currentTarget.style.color = '#d13212' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = text2 }}
                >
                    <LogOut size={13} />
                    <span>Disconnect</span>
                </button>
            </div>
        </aside>
    )
}
