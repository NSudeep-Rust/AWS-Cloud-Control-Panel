import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const NAV = [
  { id: 'overview', label: 'Overview', icon: GridIcon },
  { id: 'scanner', label: 'Scanner', icon: ScanIcon },
  { id: 'threats', label: 'Threat Monitor', icon: ThreatIcon },
  { id: 'execute', label: 'Execute Fix', icon: ExecuteIcon },
  { id: 'rollback', label: 'Rollback', icon: RollbackIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'analytics', label: 'Analytics', icon: AnalyticsIcon },
  { id: 'alerts', label: 'Alerts', icon: AlertIcon },
]

export default function Sidebar({ active, onNav }) {
  const { account, disconnect } = useAuth()
  const navigate = useNavigate()

  return (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logo}>
        <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
          <path d="M20 4L36 12V20C36 28.8 29 37 20 39C11 37 4 28.8 4 20V12L20 4Z" fill="rgba(59,130,246,0.25)" stroke="var(--accent)" strokeWidth="1.5"/>
          <path d="M20 14L26 17V21C26 24.8 23 28.2 20 29C17 28.2 14 24.8 14 21V17L20 14Z" fill="rgba(59,130,246,0.3)" stroke="var(--accent2)" strokeWidth="1"/>
        </svg>
        <div>
          <div style={s.logoTitle}>Security Panel</div>
          <div style={s.logoSub}>Control Center</div>
        </div>
      </div>

      {/* Account badge */}
      {account && (
        <div style={s.accountBadge}>
          <div style={s.accDot} />
          <div style={s.accInfo}>
            <div style={s.accId}>{account.aws_account_id}</div>
            <div style={s.accRegion}>{account.region}</div>
          </div>
        </div>
      )}

      <div style={s.divider} />

      {/* Nav items */}
      <nav style={s.nav}>
        {NAV.map(item => (
          <button key={item.id} style={{ ...s.navItem, ...(active === item.id ? s.navActive : {}) }}
            onClick={() => onNav(item.id)}>
            <item.icon size={16} active={active === item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />
      <div style={s.divider} />

      {/* Disconnect */}
      <button style={s.disconnect} onClick={() => { disconnect(); navigate('/') }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2H2v10h3M9 4l3 3-3 3M5 7h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Disconnect
      </button>
    </aside>
  )
}

function GridIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
}
function ScanIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M5 7H9M7 5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
}
function ThreatIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 2L14 5V8C14 11.5 11.5 14.5 8 15.5C4.5 14.5 2 11.5 2 8V5L8 2Z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 6V9M8 11V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
}
function ExecuteIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M4 3L12 8L4 13V3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
}
function RollbackIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8C3 5.24 5.24 3 8 3C10.76 3 13 5.24 13 8S10.76 13 8 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M3 5V8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}
function HistoryIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 5V8.5L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
}
function AnalyticsIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2 12L6 7L10 9L14 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 14H14" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
  </svg>
}
function AlertIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M8 7V9.5M8 11V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
}

const s = {
  sidebar: {
    width: 220, minWidth: 220,
    height: '100vh', position: 'sticky', top: 0,
    background: 'var(--bg2)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    padding: '20px 0', gap: 0,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 20px 0 20px', marginBottom: 20,
  },
  logoTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 },
  logoSub: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.5px' },
  accountBadge: {
    margin: '0 12px 16px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  accDot: {
    width: 7, height: 7, borderRadius: '50%',
    background: 'var(--accent3)', flexShrink: 0,
    boxShadow: '0 0 6px var(--accent3)',
  },
  accInfo: {},
  accId: { fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600 },
  accRegion: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 },
  divider: { height: 1, background: 'var(--border)', margin: '8px 0' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8,
    background: 'none', color: 'var(--text2)',
    fontSize: 13, fontWeight: 400, fontFamily: 'var(--sans)',
    textAlign: 'left', cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  navActive: {
    background: 'rgba(59,130,246,0.12)',
    color: 'var(--accent)',
    fontWeight: 600,
  },
  disconnect: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '8px 10px 0',
    padding: '9px 12px', borderRadius: 8,
    background: 'none', color: 'var(--text3)',
    fontSize: 12, fontFamily: 'var(--sans)',
    cursor: 'pointer',
  },
}
