import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from '@/components/Sidebar'
import Overview from '@/pages/sections/Overview'
import { ScannerSection, ThreatsSection, ExecuteSection, RollbackSection } from '@/pages/sections/Operations'
import { HistorySection, AnalyticsSection, AlertsSection } from '@/pages/sections/DataSections'

const SECTIONS = {
  overview: Overview,
  scanner: ScannerSection,
  threats: ThreatsSection,
  execute: ExecuteSection,
  rollback: RollbackSection,
  history: HistorySection,
  analytics: AnalyticsSection,
  alerts: AlertsSection,
}

export default function PanelPage() {
  const { account } = useAuth()
  const navigate = useNavigate()
  const [active, setActive] = useState('overview')

  useEffect(() => {
    if (!account) navigate('/setup')
  }, [account])

  const Section = SECTIONS[active] || Overview

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar active={active} onNav={setActive} />
      <main style={mainStyle}>
        <div style={innerStyle}>
          <Section onNav={setActive} />
        </div>
      </main>
    </div>
  )
}

const mainStyle = {
  flex: 1, overflowY: 'auto',
  background: 'var(--bg)',
}

const innerStyle = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '36px 40px',
}
