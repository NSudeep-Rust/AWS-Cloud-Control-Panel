import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import WelcomePage from './pages/WelcomePage'
import AccountSetupPage from './pages/AccountSetupPage'
import PanelPage from './pages/PanelPage'
import WebAuthPage from './pages/WebAuthPage'

// ── Web mode auth guard ────────────────────────────────────────────────────
// VITE_WEB_MODE=true  → active on cloudshield.me (web hosting)
// VITE_WEB_MODE unset → desktop/EXE mode, no login needed (completely skipped)
const WEB_MODE = import.meta.env.VITE_WEB_MODE === 'true'

function RequireWebAuth({ children }) {
  if (!WEB_MODE) return children                                   // desktop: no gate
  const token = localStorage.getItem('cloudshield_web_token')
  if (!token) return <Navigate to="/auth" replace />              // web: must login first
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* /auth is always public — it IS the login page */}
        <Route path="/auth"  element={<WebAuthPage />} />

        {/* All other routes are guarded in web mode */}
        <Route path="/"      element={<RequireWebAuth><WelcomePage /></RequireWebAuth>} />
        <Route path="/setup" element={<RequireWebAuth><AccountSetupPage /></RequireWebAuth>} />
        <Route path="/panel" element={<RequireWebAuth><PanelPage /></RequireWebAuth>} />

        <Route path="*" element={<Navigate to={WEB_MODE ? '/auth' : '/'} replace />} />
      </Routes>
    </AuthProvider>
  )
}

