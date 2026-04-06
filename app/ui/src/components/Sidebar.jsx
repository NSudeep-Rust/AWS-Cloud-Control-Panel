import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Search, ShieldAlert, Play, RotateCcw,
    History, BarChart2, Bell, LogOut, Sun, Moon, ChevronRight,
    Shield
} from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
    { id: 'overview',  label: 'Overview',       icon: LayoutDashboard },
    { id: 'scanner',   label: 'Scanner',         icon: Search          },
    { id: 'threats',   label: 'Threat Monitor',  icon: ShieldAlert     },
    { id: 'execute',   label: 'Execute Fix',      icon: Play            },
    { id: 'rollback',  label: 'Rollback',         icon: RotateCcw       },
    { id: 'history',   label: 'History',          icon: History         },
    { id: 'analytics', label: 'Analytics',        icon: BarChart2       },
    { id: 'alerts',    label: 'Alerts',           icon: Bell            },
]

export default function Sidebar({ active, onNav, dark, onToggleDark }) {
    const { account, disconnect } = useAuth()
    const navigate = useNavigate()
    const [hoverId, setHoverId] = useState(null)
    const [disconnectHov, setDisconnectHov] = useState(false)

    function handleDisconnect() {
        disconnect()
        navigate('/setup')
    }

    const accountId = account?.aws_account_id || account?.account_id || '—'
    const region    = account?.region || '—'
    const profile   = account?.profile_name || account?.username || 'default'
    const isIam     = account?.account_type === 'iam'
    const initials  = profile.slice(0, 2).toUpperCase()

    return (
        <aside style={{
            width: 220,
            minWidth: 220,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--sidebar-border)',
            position: 'relative',
            zIndex: 10,
            flexShrink: 0,
        }}>
            {/* ── Logo / Brand ── */}
            <div style={{
                padding: '20px 18px 16px',
                borderBottom: '1px solid var(--sidebar-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                <div style={{
                    width: 32, height: 32,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #232F3E 0%, #1a2332 100%)',
                    border: '1.5px solid rgba(255,153,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Shield size={16} color="#FF9900" />
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>Security Panel</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', letterSpacing: 0.3 }}>Control Center</div>
                </div>
            </div>

            {/* ── Account Card ── */}
            <div style={{
                margin: '12px 12px 4px',
                background: dark ? 'rgba(255,153,0,0.06)' : 'rgba(255,153,0,0.05)',
                border: '1px solid rgba(255,153,0,0.2)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: isIam ? 'rgba(9,114,211,0.15)' : 'rgba(255,153,0,0.12)',
                    border: `1.5px solid ${isIam ? 'rgba(9,114,211,0.3)' : 'rgba(255,153,0,0.3)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: '#067340',
                        boxShadow: '0 0 0 2px rgba(6,115,64,0.25)',
                    }} />
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountId}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>{profile} · {region}</div>
                </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '10px 0' }} />

            {/* ── Nav Items ── */}
            <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
                {NAV_ITEMS.map(item => {
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
                                display: 'flex', alignItems: 'center', gap: 10,
                                width: '100%', padding: '8px 10px',
                                borderRadius: 6, border: 'none', cursor: 'pointer',
                                marginBottom: 2,
                                background: isActive
                                    ? dark ? 'rgba(255,153,0,0.12)' : 'rgba(255,153,0,0.1)'
                                    : isHov
                                        ? dark ? 'rgba(255,255,255,0.05)' : 'rgba(35,47,62,0.04)'
                                        : 'transparent',
                                color: isActive ? '#FF9900' : 'var(--text2)',
                                fontWeight: isActive ? 600 : 400,
                                fontSize: 13,
                                transition: 'all 0.12s',
                                textAlign: 'left',
                                position: 'relative',
                            }}
                        >
                            {/* Active indicator bar */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                                    width: 3, borderRadius: 2, background: '#FF9900',
                                }} />
                            )}
                            <Icon size={15} strokeWidth={isActive ? 2 : 1.7} />
                            <span>{item.label}</span>
                            {isActive && (
                                <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                            )}
                        </button>
                    )
                })}
            </nav>

            {/* ── Bottom ── */}
            <div style={{
                borderTop: '1px solid var(--sidebar-border)',
                padding: '10px 8px 12px',
                display: 'flex', flexDirection: 'column', gap: 4,
            }}>
                {/* Dark/Light toggle */}
                <button
                    onClick={onToggleDark}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '7px 10px',
                        borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: 'var(--text3)',
                        fontSize: 12, fontWeight: 500,
                        transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.05)' : 'rgba(35,47,62,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    {dark
                        ? <><Sun size={14} /><span>Light Mode</span></>
                        : <><Moon size={14} /><span>Dark Mode</span></>
                    }
                    <div style={{
                        marginLeft: 'auto',
                        width: 28, height: 15, borderRadius: 8,
                        background: dark ? '#FF9900' : 'var(--border2)',
                        position: 'relative', transition: 'background 0.2s',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: 2, left: dark ? 15 : 2,
                            width: 11, height: 11, borderRadius: '50%',
                            background: '#fff',
                            transition: 'left 0.2s',
                        }} />
                    </div>
                </button>

                {/* Disconnect */}
                <button
                    onClick={handleDisconnect}
                    onMouseEnter={() => setDisconnectHov(true)}
                    onMouseLeave={() => setDisconnectHov(false)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '7px 10px',
                        borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: disconnectHov ? 'rgba(209,50,18,0.08)' : 'transparent',
                        color: disconnectHov ? '#d13212' : 'var(--text3)',
                        fontSize: 12, fontWeight: 500,
                        transition: 'all 0.12s',
                    }}
                >
                    <LogOut size={14} />
                    <span>Disconnect</span>
                </button>
            </div>
        </aside>
    )
}
