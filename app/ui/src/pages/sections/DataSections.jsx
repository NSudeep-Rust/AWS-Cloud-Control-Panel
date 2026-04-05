import React, { useState, useEffect } from 'react'
import { historyAPI, analyticsAPI, alertsAPI } from '@/api'
import { Card, SectionTitle, Field, PrimaryBtn, ResponseBox, Badge, StatCard } from '@/components/UI'

export function HistorySection() {
  const [history, setHistory] = useState([])
  const [summary, setSummary] = useState(null)
  const [resourceId, setResourceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      historyAPI.getAll().then(r => setHistory(r.data || [])).catch(() => []),
      historyAPI.getSummary().then(r => setSummary(r.data)).catch(() => null),
    ]).finally(() => setLoading(false))
  }, [])

  const fetchByResource = async () => {
    if (!resourceId) return
    try {
      const r = await historyAPI.getByResource(resourceId)
      setRes(r.data); setErr('')
    } catch (e) { setErr(e?.response?.data?.detail || e.message); setRes(null) }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Audit trail of all operations">History</SectionTitle>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Events" value={summary.total ?? '--'} />
          <StatCard label="Successful" value={summary.success ?? '--'} type="success" />
          <StatCard label="Failed" value={summary.failed ?? '--'} type="danger" />
        </div>
      )}

      <Card style={{ marginBottom: 20 }}>
        <h3 style={cardTitle}>Filter by Resource</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label="Resource ID">
              <input value={resourceId} onChange={e => setResourceId(e.target.value)} placeholder="resource-id" />
            </Field>
          </div>
          <PrimaryBtn onClick={fetchByResource}>Fetch</PrimaryBtn>
        </div>
        <ResponseBox data={res} error={err} />
      </Card>

      <Card>
        <h3 style={cardTitle}>All History</h3>
        {loading ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading...</div>
          : history.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No history records found.</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['ID', 'Action', 'Resource', 'Status', 'Timestamp'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdMono}>{h.id || i}</td>
                      <td style={tdStyle}>{h.action || h.type || '—'}</td>
                      <td style={tdMono}>{h.resource_id || '—'}</td>
                      <td style={tdStyle}><Badge type={h.status === 'SUCCESS' ? 'success' : h.status === 'FAILED' ? 'danger' : 'default'}>{h.status || '—'}</Badge></td>
                      <td style={tdStyle}>{h.timestamp ? new Date(h.timestamp).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  )
}

export function AnalyticsSection() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState({})
  const [err, setErr] = useState({})
  const [enforceLoading, setEnforceLoading] = useState(false)
  const [enforceRes, setEnforceRes] = useState(null)
  const [enforceErr, setEnforceErr] = useState('')

  const fetch = async (key, fn) => {
    setLoading(l => ({...l, [key]: true}))
    try { const r = await fn(); setData(d => ({...d, [key]: r.data})); setErr(e => ({...e, [key]: ''})) }
    catch (e) { setErr(prev => ({...prev, [key]: e?.response?.data?.detail || e.message})) }
    finally { setLoading(l => ({...l, [key]: false})) }
  }

  const enforcePolicies = async () => {
    setEnforceLoading(true); setEnforceErr(''); setEnforceRes(null)
    try { const r = await analyticsAPI.enforcePolicies({}); setEnforceRes(r.data) }
    catch (e) { setEnforceErr(e?.response?.data?.detail || e.message) }
    finally { setEnforceLoading(false) }
  }

  const actions = [
    { key: 'risk', label: 'Risk Score', fn: analyticsAPI.getRiskScore },
    { key: 'trend', label: 'Risk Trend', fn: analyticsAPI.getRiskTrend },
    { key: 'audit', label: 'Audit Report', fn: analyticsAPI.getAuditReport },
    { key: 'violations', label: 'Policy Violations', fn: analyticsAPI.getPolicyViolations },
  ]

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Risk scoring, audit reports and policy management">Analytics</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {actions.map(a => (
          <Card key={a.key}>
            <h3 style={cardTitle}>{a.label}</h3>
            <PrimaryBtn loading={loading[a.key]} onClick={() => fetch(a.key, a.fn)}>
              Fetch {a.label}
            </PrimaryBtn>
            <ResponseBox data={data[a.key]} error={err[a.key]} />
          </Card>
        ))}

        <Card style={{ gridColumn: '1 / -1' }}>
          <h3 style={cardTitle}>Enforce Policies</h3>
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#fbbf24' }}>⚠ This will actively enforce all configured policies across your account.</span>
          </div>
          <PrimaryBtn loading={enforceLoading} onClick={enforcePolicies}>Enforce Policies</PrimaryBtn>
          <ResponseBox data={enforceRes} error={enforceErr} />
        </Card>
      </div>
    </div>
  )
}

export function AlertsSection() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    try { const r = await alertsAPI.getAlerts(); setAlerts(r.data || []) }
    catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const severities = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.severity === filter)

  const severityColor = { CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warn', LOW: 'info', INFO: 'info' }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Security alerts and notifications">Alerts</SectionTitle>

      {alerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => (
            <StatCard key={s} label={s} value={alerts.filter(a => a.severity === s).length} type={severityColor[s]} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {severities.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: 6,
            background: filter === s ? 'var(--accent)' : 'var(--bg3)',
            color: filter === s ? '#fff' : 'var(--text2)',
            border: `1px solid ${filter === s ? 'var(--accent)' : 'var(--border)'}`,
            fontSize: 12, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all 0.15s',
          }}>{s}</button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      <Card>
        {loading ? <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 24 }}>Loading alerts...</div>
          : err ? <div style={{ color: '#f87171', fontSize: 13 }}>{err}</div>
          : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ color: 'var(--accent3)', fontSize: 14 }}>No alerts</div>
              <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>Your account is clean for this filter.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center', gap: 16, padding: '14px 16px',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  borderLeft: `3px solid ${a.severity === 'CRITICAL' ? 'var(--danger)' : a.severity === 'HIGH' ? '#f97316' : a.severity === 'MEDIUM' ? 'var(--warn)' : 'var(--accent)'}`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>
                      {a.title || a.message || a.description || 'Alert'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {a.resource_id && `Resource: ${a.resource_id} · `}
                      {a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}
                    </div>
                  </div>
                  <Badge type={severityColor[a.severity] || 'default'}>{a.severity || 'INFO'}</Badge>
                  <Badge type={a.status === 'RESOLVED' ? 'success' : a.status === 'ACTIVE' ? 'danger' : 'default'}>
                    {a.status || 'ACTIVE'}
                  </Badge>
                </div>
              ))}
            </div>
          )
        }
      </Card>
    </div>
  )
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle = { textAlign: 'left', padding: '10px 12px', color: 'var(--text3)', fontWeight: 500, fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }
const tdStyle = { padding: '12px 12px', color: 'var(--text)', verticalAlign: 'middle' }
const tdMono = { ...tdStyle, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }
const cardTitle = { fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }
