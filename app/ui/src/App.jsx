import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import WelcomePage from './pages/WelcomePage'
import AccountSetupPage from './pages/AccountSetupPage'
import PanelPage from './pages/PanelPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/setup" element={<AccountSetupPage />} />
        <Route path="/panel" element={<PanelPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
