import React from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import WelcomePage from './pages/WelcomePage'
import AccountSetupPage from './pages/AccountSetupPage'
import PanelPage from './pages/PanelPage'
import WebAuthPage from './pages/WebAuthPage'

// ── Web mode auth guard ────────────────────────────────────────────────────
const WEB_MODE = import.meta.env.VITE_WEB_MODE === 'true'

function RequireWebAuth({ children }) {
  if (!WEB_MODE) return children
  const token = localStorage.getItem('cloudshield_web_token')
  if (!token) return <Navigate to="/auth" replace />
  return children
}

// ── Floating Sign Out button (web mode only) ───────────────────────────────
function WebSignOutButton() {
  const navigate = useNavigate()
  if (!WEB_MODE) return null

  const email = localStorage.getItem('cloudshield_web_email') || ''

  function signOut() {
    localStorage.removeItem('cloudshield_web_token')
    localStorage.removeItem('cloudshield_web_email')
    navigate('/auth', { replace: true })
  }

  return (
    <div style={{
      position: 'fixed', top: 12, right: 16, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {email && (
        <span style={{
          fontSize: 11, color: '#687078', background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(35,47,62,0.12)', borderRadius: 20,
          padding: '3px 10px', backdropFilter: 'blur(8px)',
          fontWeight: 600, maxWidth: 180, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {email}
        </span>
      )}
      <button
        id="web-sign-out"
        onClick={signOut}
        style={{
          fontSize: 11, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg,#d13212,#ff6b35)',
          border: 'none', borderRadius: 20, padding: '5px 14px',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(209,50,18,0.25)',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.target.style.opacity = '0.85'}
        onMouseLeave={e => e.target.style.opacity = '1'}
      >
        Sign Out
      </button>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* /auth is always public */}
        <Route path="/auth"  element={<WebAuthPage />} />

        {/* All other routes are guarded in web mode */}
        <Route path="/"      element={<RequireWebAuth><WebSignOutButton /><WelcomePage /></RequireWebAuth>} />
        <Route path="/setup" element={<RequireWebAuth><WebSignOutButton /><AccountSetupPage /></RequireWebAuth>} />
        <Route path="/panel" element={<RequireWebAuth><PanelPage /></RequireWebAuth>} />

        <Route path="*" element={<Navigate to={WEB_MODE ? '/auth' : '/'} replace />} />
      </Routes>
    </AuthProvider>
  )
}
