import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from '@/components/Sidebar'
import Overview from '@/pages/sections/Overview'
import { ScannerSection, ThreatsSection, ExecuteSection, RollbackSection } from '@/pages/sections/Operations'
import { HistorySection, AnalyticsSection, AlertsSection } from '@/pages/sections/DataSections'
import { ScanProvider } from '@/context/ScanContext'

const FONT_INJECT = `
@font-face { font-family: 'Amazon Ember'; src: local('Amazon Ember'), local('AmazonEmber'); }
*, *::before, *::after {
  box-sizing: border-box;
  font-family: 'Amazon Ember', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif !important;
}
`

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
    const [dark, setDark] = useState(() => localStorage.getItem('panel_dark') === 'true')
    const [authChecked, setAuthChecked] = useState(false)
    const prevAccountIdRef = useRef(null)

    // Auth check — no flicker
    useEffect(() => {
        if (!account) {
            navigate('/setup', { replace: true })
        } else {
            setAuthChecked(true)
        }
    }, []) // eslint-disable-line

    // Block browser back button
    useEffect(() => {
        if (!authChecked) return
        window.history.replaceState({ panel: true }, '', window.location.href)
        function handlePopState() {
            window.history.pushState({ panel: true }, '', window.location.href)
        }
        function handleBeforeUnload(e) { e.preventDefault(); e.returnValue = '' }
        window.addEventListener('popstate', handlePopState)
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => {
            window.removeEventListener('popstate', handlePopState)
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [authChecked])

    // Clear scan caches from old accounts
    useEffect(() => {
        if (!account) return
        const awsId = account.aws_account_id || account.parent_aws_account_id
        if (prevAccountIdRef.current && prevAccountIdRef.current !== awsId) {
            Object.keys(sessionStorage).forEach(k => {
                if (k.startsWith('scan_v')) sessionStorage.removeItem(k)
            })
        }
        prevAccountIdRef.current = awsId
    }, [account?.aws_account_id, account?.parent_aws_account_id])

    useEffect(() => { localStorage.setItem('panel_dark', dark) }, [dark])

    const handleNav = useCallback((section) => setActive(section), [])

    if (!authChecked) return null

    const Section = SECTIONS[active] || Overview
    const theme = dark ? darkTheme : lightTheme

    return (
        // ── ScanProvider wraps EVERYTHING so scan state persists across nav ──
        <ScanProvider>
            <style>{FONT_INJECT}</style>
            <style>{`
                :root {
                    --bg:           ${theme.bg};
                    --bg2:          ${theme.bg2};
                    --bg3:          ${theme.bg3};
                    --border:       ${theme.border};
                    --border2:      ${theme.border2};
                    --text:         ${theme.text};
                    --text2:        ${theme.text2};
                    --text3:        ${theme.text3};
                    --accent:       #FF9900;
                    --accent2:      #232F3E;
                    --success:      #067340;
                    --danger:       #d13212;
                    --warn:         #f59e0b;
                    --info:         #0972d3;
                    --card-shadow:  ${theme.cardShadow};
                    --sidebar-bg:   ${theme.sidebarBg};
                    --sidebar-border: ${theme.sidebarBorder};
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                html, body, #root { height: 100%; }
                body { background: var(--bg); color: var(--text); }
                ::-webkit-scrollbar { width: 4px; height: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
                @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                @keyframes spin     { to{transform:rotate(360deg)} }
                @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.4} }
                @keyframes radarSweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
                @keyframes radarBlip { 0%{opacity:0} 25%{opacity:1} 60%{opacity:0.5} 100%{opacity:0} }
                @keyframes overviewPulseRing { 0%{transform:scale(0.6);opacity:0.9} 100%{transform:scale(1.8);opacity:0} }
            `}</style>

            <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
                <Sidebar active={active} onNav={handleNav} dark={dark} onToggleDark={() => setDark(d => !d)} />
                <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', minHeight: 0 }}>
                    {/* NOTE: key removed — we don't remount sections on nav so scan stays alive */}
                    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px', animation: 'fadeUp 0.3s ease both' }}>
                        <Section onNav={handleNav} dark={dark} />
                    </div>
                </main>
            </div>
        </ScanProvider>
    )
}

const lightTheme = {
    bg: '#f8f4f0',
    bg2: '#ffffff',
    bg3: '#f0ebe4',
    border: 'rgba(35,47,62,0.1)',
    border2: 'rgba(35,47,62,0.2)',
    text: '#16191f',
    text2: '#414d5c',
    text3: '#687078',
    cardShadow: '0 1px 6px rgba(0,28,36,0.1)',
    sidebarBg: '#ffffff',
    sidebarBorder: 'rgba(35,47,62,0.12)',
}

const darkTheme = {
    bg: '#0d1117',
    bg2: '#161b22',
    bg3: '#1c2128',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.15)',
    text: '#e6edf3',
    text2: '#8b949e',
    text3: '#6e7681',
    cardShadow: '0 1px 6px rgba(0,0,0,0.4)',
    sidebarBg: '#161b22',
    sidebarBorder: 'rgba(255,255,255,0.08)',
}
