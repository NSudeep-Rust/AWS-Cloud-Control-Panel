import React, { useEffect, useState } from 'react'
import { analyticsAPI, alertsAPI, historyAPI } from '@/api'
import { StatCard, Card, Badge } from '@/components/UI'
import { useAuth } from '@/context/AuthContext'

export default function Overview({ onNav }) {
  const { account } = useAuth()
  const [riskScore, setRiskScore] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      analyticsAPI.getRiskScore().then(r => setRiskScore(r.data)).catch(() => null),
      alertsAPI.getAlerts().then(r => setAlerts(r.data || [])).catch(() => []),
      historyAPI.getAll().then(r => setHistory((r.data || []).slice(0, 5))).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [])

  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length
  const riskVal = typeof riskScore === 'number' ? riskScore : (riskScore?.score ?? '--')

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Control Center
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Account: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{account?.aws_account_id}</span>
          &nbsp;·&nbsp;Region: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{account?.region}</span>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard label="Risk Score" value={loading ? '...' : riskVal} type={riskVal > 70 ? 'danger' : riskVal > 40 ? 'warn' : 'success'} sub="Overall risk index" />
        <StatCard label="Total Alerts" value={loading ? '...' : alerts.length} type="warn" sub="Active alerts" />
        <StatCard label="Critical" value={loading ? '...' : criticalAlerts} type="danger" sub="High priority" />
        <StatCard label="Events" value={loading ? '...' : history.length} type="default" sub="Recent history" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Run Security Scan', id: 'scanner', icon: '▶', color: 'var(--accent)' },
              { label: 'Start Threat Monitor', id: 'threats', icon: '⚡', color: 'var(--warn)' },
              { label: 'View Alerts', id: 'alerts', icon: '⚠', color: 'var(--danger)' },
              { label: 'Analytics Report', id: 'analytics', icon: '◈', color: 'var(--accent3)' },
            ].map(a => (
              <button key={a.id} onClick={() => onNav(a.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg4)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '11px 14px', cursor: 'pointer',
                fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text)',
                transition: 'border-color 0.2s',
              }}>
                <span style={{ color: a.color, fontSize: 14 }}>{a.icon}</span>
                {a.label}
                <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6H10M7 3L10 6L7 9" stroke="var(--text3)" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Recent Activity</h3>
          {loading ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
            : history.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>No recent activity.</div>
            : history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent2)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{h.action || h.type || 'Event'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}</div>
                </div>
                <Badge type={h.status === 'SUCCESS' ? 'success' : h.status === 'FAILED' ? 'danger' : 'default'}>{h.status || 'DONE'}</Badge>
              </div>
            ))
          }
        </Card>
      </div>
    </div>
  )
}
