import React, { useState, useEffect } from 'react'
import { scanAPI, threatAPI, executeAPI, rollbackAPI } from '@/api'
import { Card, SectionTitle, Field, PrimaryBtn, SecondaryBtn, ResponseBox, Badge } from '@/components/UI'
import { useAuth } from '@/context/AuthContext'

const REGIONS = ['us-east-1','us-east-2','us-west-1','us-west-2','ap-south-1','eu-west-1','eu-central-1']

export function ScannerSection() {
  const { account } = useAuth()
  const [form, setForm] = useState({ account_id: account?.aws_account_id || '', mode: 'FULL', regions: [] })
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  const toggleRegion = (r) => setForm(f => ({
    ...f, regions: f.regions.includes(r) ? f.regions.filter(x => x !== r) : [...f.regions, r]
  }))

  const submit = async () => {
    setLoading(true); setErr(''); setRes(null)
    try {
      const r = await scanAPI.runScan({ ...form, account_id: parseInt(form.account_id) || form.account_id })
      setRes(r.data)
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Initiate a security scan on your AWS resources">Security Scanner</SectionTitle>
      <Card style={{ maxWidth: 560 }}>
        <div style={formGrid}>
          <Field label="Account ID" required>
            <input value={form.account_id} onChange={e => setForm(f => ({...f, account_id: e.target.value}))} placeholder="Account ID (integer)" />
          </Field>
          <Field label="Scan Mode">
            <select value={form.mode} onChange={e => setForm(f => ({...f, mode: e.target.value}))}>
              <option value="FULL">FULL — Complete Scan</option>
              <option value="QUICK">QUICK — Fast Scan</option>
              <option value="COMPLIANCE">COMPLIANCE — Policy Check</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Regions (optional — leave empty for all)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {REGIONS.map(r => (
              <button key={r} onClick={() => toggleRegion(r)} style={{
                padding: '5px 12px', borderRadius: 6,
                fontSize: 12, fontFamily: 'var(--mono)',
                background: form.regions.includes(r) ? 'rgba(59,130,246,0.2)' : 'var(--bg4)',
                color: form.regions.includes(r) ? 'var(--accent)' : 'var(--text2)',
                border: `1px solid ${form.regions.includes(r) ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <PrimaryBtn onClick={submit} loading={loading}>Run Scan</PrimaryBtn>
        </div>
        <ResponseBox data={res} error={err} />
      </Card>
    </div>
  )
}

export function ThreatsSection() {
  const { account } = useAuth()
  const [scanId, setScanId] = useState('')
  const [monitorAccountId, setMonitorAccountId] = useState(account?.aws_account_id || '')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState({})
  const [res, setRes] = useState({})
  const [err, setErr] = useState({})

  const call = async (key, fn) => {
    setLoading(l => ({...l, [key]: true})); setErr(e => ({...e, [key]: ''})); setRes(r => ({...r, [key]: null}))
    try { const r = await fn(); setRes(prev => ({...prev, [key]: r.data})) }
    catch (e) { setErr(prev => ({...prev, [key]: e?.response?.data?.detail || e.message})) }
    finally { setLoading(l => ({...l, [key]: false})) }
  }

  const getStatus = async () => {
    try { const r = await threatAPI.getStatus(); setStatus(r.data) } catch {}
  }

  useEffect(() => { getStatus(); const iv = setInterval(getStatus, 10000); return () => clearInterval(iv) }, [])

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Monitor, start and stop threat detection">Threat Monitor</SectionTitle>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>Monitor Status:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status?.running ? 'var(--accent3)' : 'var(--text3)',
            boxShadow: status?.running ? '0 0 8px var(--accent3)' : 'none',
            animation: status?.running ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: status?.running ? 'var(--accent3)' : 'var(--text3)' }}>
            {status?.running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <h3 style={cardTitle}>Run Threat Monitor</h3>
          <Field label="Scan ID" required>
            <input value={scanId} onChange={e => setScanId(e.target.value)} placeholder="scan-uuid" />
          </Field>
          <div style={{ marginTop: 14 }}>
            <PrimaryBtn loading={loading.run} onClick={() => call('run', () => threatAPI.runThreatMonitor({ scan_id: scanId }))}>
              Run Threat Monitor
            </PrimaryBtn>
          </div>
          <ResponseBox data={res.run} error={err.run} />
        </Card>

        <Card>
          <h3 style={cardTitle}>Monitor Controls</h3>
          <Field label="Account ID">
            <input value={monitorAccountId} onChange={e => setMonitorAccountId(e.target.value)} placeholder="Account ID" />
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <PrimaryBtn loading={loading.start} onClick={() => call('start', () => threatAPI.startMonitor({ account_id: monitorAccountId }))}>
              Start
            </PrimaryBtn>
            <PrimaryBtn danger loading={loading.stop} onClick={() => call('stop', () => threatAPI.stopMonitor({ account_id: monitorAccountId }))}>
              Stop
            </PrimaryBtn>
          </div>
          <ResponseBox data={res.start || res.stop} error={err.start || err.stop} />
        </Card>
      </div>
    </div>
  )
}

export function ExecuteSection() {
  const [form, setForm] = useState({ scan_id: '', finding_ids: '', mode: 'DRY_RUN', approval_token: '', confirm: false })
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  const submit = async () => {
    setLoading(true); setErr(''); setRes(null)
    try {
      const r = await executeAPI.executeFix({
        scan_id: form.scan_id,
        finding_ids: form.finding_ids.split(',').map(s => s.trim()).filter(Boolean),
        mode: form.mode,
        approval_token: form.approval_token || null,
        confirm: form.confirm,
      })
      setRes(r.data)
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Execute automated fixes for findings">Execute Fix</SectionTitle>
      <Card style={{ maxWidth: 560 }}>
        <div style={formGrid}>
          <Field label="Scan ID" required>
            <input value={form.scan_id} onChange={e => setForm(f => ({...f, scan_id: e.target.value}))} placeholder="scan-uuid" />
          </Field>
          <Field label="Execution Mode">
            <select value={form.mode} onChange={e => setForm(f => ({...f, mode: e.target.value}))}>
              <option value="DRY_RUN">DRY_RUN — Preview only</option>
              <option value="AUTO">AUTO — Automatic fix</option>
              <option value="MANUAL">MANUAL — Manual approval</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Finding IDs (comma-separated)" required>
            <input value={form.finding_ids} onChange={e => setForm(f => ({...f, finding_ids: e.target.value}))} placeholder="finding-1, finding-2" />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Approval Token">
            <input value={form.approval_token} onChange={e => setForm(f => ({...f, approval_token: e.target.value}))} placeholder="Optional approval token" />
          </Field>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="confirm-cb" checked={form.confirm}
            onChange={e => setForm(f => ({...f, confirm: e.target.checked}))}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="confirm-cb" style={{ fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>Confirm execution</label>
        </div>
        <div style={{ marginTop: 20 }}>
          <PrimaryBtn onClick={submit} loading={loading}>Execute Fix</PrimaryBtn>
        </div>
        <ResponseBox data={res} error={err} />
      </Card>
    </div>
  )
}

export function RollbackSection() {
  const [execId, setExecId] = useState('')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  const submit = async () => {
    setLoading(true); setErr(''); setRes(null)
    try {
      const r = await rollbackAPI.rollback({ execution_id: execId })
      setRes(r.data)
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <SectionTitle subtitle="Roll back a previous execution">Rollback</SectionTitle>
      <Card style={{ maxWidth: 480 }}>
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: '#fca5a5' }}>⚠ Rollback will revert changes made by a previous execution. This action may be irreversible.</span>
        </div>
        <Field label="Execution ID" required>
          <input value={execId} onChange={e => setExecId(e.target.value)} placeholder="execution-uuid" />
        </Field>
        <div style={{ marginTop: 20 }}>
          <PrimaryBtn danger onClick={submit} loading={loading} disabled={!execId}>Rollback Execution</PrimaryBtn>
        </div>
        <ResponseBox data={res} error={err} />
      </Card>
    </div>
  )
}

const formGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }
const cardTitle = { fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }
const labelStyle = { fontSize: 13, color: 'var(--text2)', fontWeight: 500 }
