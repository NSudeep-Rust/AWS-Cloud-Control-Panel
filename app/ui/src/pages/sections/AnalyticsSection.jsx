// AnalyticsSection.jsx — Premium Security Analytics, AWS CloudShield Theme
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { analyticsAPI } from '@/api'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  critical: '#d13212', criticalBg: 'rgba(209,50,18,0.08)',   criticalBorder: 'rgba(209,50,18,0.22)',
  high:     '#e07b00', highBg:     'rgba(224,123,0,0.08)',   highBorder:     'rgba(224,123,0,0.22)',
  medium:   '#c8960c', mediumBg:   'rgba(200,150,12,0.08)',  mediumBorder:   'rgba(200,150,12,0.22)',
  low:      '#1d8102', lowBg:      'rgba(29,128,2,0.08)',    lowBorder:      'rgba(29,128,2,0.22)',
  blue:     '#0972d3', blueBg:     'rgba(9,114,211,0.08)',   blueBorder:     'rgba(9,114,211,0.22)',
  aws:      '#FF9900',
}
const SEV_C = { CRITICAL: C.critical, HIGH: C.high, MEDIUM: C.medium, LOW: C.low }
const RISK_C = s => s > 80 ? C.critical : s > 50 ? C.high : s > 20 ? C.medium : C.low

const fmt  = n => typeof n === 'number' ? n.toLocaleString() : (n ?? '—')
const cap  = s => s ? s.split('_').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''
const relT = iso => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : s < 86400 ? `${Math.floor(s/3600)}h ago` : `${Math.floor(s/86400)}d ago`
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  @keyframes anlFade    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
  @keyframes anlSlide   { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
  @keyframes anlSpin    { to{transform:rotate(360deg)} }
  @keyframes anlPulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }
  @keyframes anlGlow    { 0%,100%{box-shadow:0 0 0 0 rgba(255,153,0,0.35)} 50%{box-shadow:0 0 0 10px rgba(255,153,0,0)} }
  @keyframes anlBar     { from{width:0} }
  @keyframes anlCount   { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
  @keyframes shimmer    { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  .anl-card   { animation: anlFade 0.38s ease both; }
  .anl-card-d { animation: anlFade 0.38s ease 0.06s both; }
  .anl-card-dd{ animation: anlFade 0.38s ease 0.12s both; }
  .anl-tab    { transition: all 0.14s; border: none; background: transparent; cursor: pointer; font-family: Inter,sans-serif; }
  .anl-tab:hover { color: #FF9900 !important; }
  .anl-btn    { transition: all 0.14s; }
  .anl-btn:hover{ background: rgba(9,114,211,0.07) !important; transform: translateY(-1px); }
  .anl-row    { transition: background 0.1s; }
  .anl-row:hover { background: rgba(9,114,211,0.04) !important; }
  .skeleton   { background: linear-gradient(90deg,#f0f2f4 25%,#e8eaed 50%,#f0f2f4 75%); background-size:400px 100%; animation: shimmer 1.4s ease infinite; border-radius: 8px; }
`

// ── Count-up ──────────────────────────────────────────────────────────────────
function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (!target && target !== 0) return
    cancelAnimationFrame(raf.current)
    const t0 = Date.now()
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / ms)
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return v
}

// ── Gauge (canvas) ────────────────────────────────────────────────────────────
function RiskGauge({ score = 0 }) {
  const ref = useRef(null)
  const raf = useRef(null)
  const color = RISK_C(score)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const W = 220, CX = W / 2, CY = 110, R = 82
    c.width = W; c.height = 155
    const ctx = c.getContext('2d')
    const SA = Math.PI * 0.75, ARC = Math.PI * 1.5
    let prog = 0
    const draw = () => {
      ctx.clearRect(0, 0, W, 155)
      // Track
      ctx.beginPath(); ctx.arc(CX, CY, R, SA, SA + ARC)
      ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.stroke()
      // Arc
      if (prog > 0.001) {
        const g = ctx.createLinearGradient(CX - R, CY, CX + R, CY)
        g.addColorStop(0, '#1d8102'); g.addColorStop(0.4, '#c8960c')
        g.addColorStop(0.7, '#e07b00'); g.addColorStop(1, '#d13212')
        ctx.beginPath(); ctx.arc(CX, CY, R, SA, SA + ARC * prog)
        ctx.strokeStyle = g; ctx.lineWidth = 16; ctx.lineCap = 'round'
        ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0
      }
      // Tick marks
      for (let i = 0; i <= 10; i++) {
        const a = SA + ARC * (i / 10)
        ctx.beginPath()
        ctx.moveTo(CX + Math.cos(a) * (R - 12), CY + Math.sin(a) * (R - 12))
        ctx.lineTo(CX + Math.cos(a) * (R - 4), CY + Math.sin(a) * (R - 4))
        ctx.strokeStyle = i % 5 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)'; ctx.lineWidth = i % 5 === 0 ? 2 : 1; ctx.stroke()
      }
      // Tip
      if (prog > 0) {
        const a = SA + ARC * prog
        const dx = CX + Math.cos(a) * R, dy = CY + Math.sin(a) * R
        ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2)
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0
      }
      // Score number
      ctx.fillStyle = color; ctx.font = `900 38px Inter,system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(Math.round(prog * score), CX, CY - 6)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.font = '11px Inter'
      ctx.fillText('/ 100', CX, CY + 22)
    }
    const t0 = Date.now(); const dur = 1100
    const anim = () => {
      prog = Math.min(1, (Date.now() - t0) / dur)
      prog = 1 - Math.pow(1 - prog, 3)
      draw()
      if (prog < 1) raf.current = requestAnimationFrame(anim)
    }
    raf.current = requestAnimationFrame(anim)
    return () => cancelAnimationFrame(raf.current)
  }, [score, color])
  return <canvas ref={ref} style={{ width: 220, height: 155, display: 'block' }} />
}

// ── Trend chart (canvas) ──────────────────────────────────────────────────────
function TrendChart({ trend = [] }) {
  const ref = useRef(null)
  const raf = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c || !trend.length) return
    const W = c.offsetWidth || 600, H = 140
    c.width = W; c.height = H
    const ctx = c.getContext('2d')
    const scores = trend.map(t => t.risk_score)
    const maxV = Math.max(...scores, 10)
    const pts = scores.map((s, i) => ({
      x: 44 + (i / Math.max(trend.length - 1, 1)) * (W - 60),
      y: H - 24 - (s / maxV) * (H - 48)
    }))
    let prog = 0
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      // Grid
      ;[0.25, 0.5, 0.75, 1].forEach(f => {
        const y = H - 24 - f * (H - 48)
        ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 8, y)
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.font = '9px Inter'; ctx.textAlign = 'right'
        ctx.fillText(Math.round(f * maxV), 36, y + 3)
      })
      if (pts.length < 2) return
      const visible = Math.max(2, Math.round(prog * pts.length))
      const vp = pts.slice(0, visible)
      // Fill gradient
      const fg = ctx.createLinearGradient(0, 0, 0, H)
      fg.addColorStop(0, 'rgba(255,153,0,0.15)'); fg.addColorStop(1, 'rgba(255,153,0,0)')
      ctx.beginPath(); ctx.moveTo(vp[0].x, H - 24)
      vp.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.lineTo(vp[vp.length - 1].x, H - 24)
      ctx.closePath(); ctx.fillStyle = fg; ctx.fill()
      // Line
      const lg = ctx.createLinearGradient(pts[0].x, 0, pts[pts.length - 1].x, 0)
      lg.addColorStop(0, '#1d8102'); lg.addColorStop(0.5, '#c8960c'); lg.addColorStop(1, '#d13212')
      ctx.beginPath()
      vp.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.strokeStyle = lg; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(255,153,0,0.4)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0
      // Dots
      vp.forEach((p, i) => {
        const col = SEV_C[trend[i]?.risk_level] || '#FF9900'
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
      })
    }
    const t0 = Date.now()
    const anim = () => { prog = Math.min(1, (Date.now() - t0) / 800); draw(); if (prog < 1) raf.current = requestAnimationFrame(anim) }
    raf.current = requestAnimationFrame(anim)
    return () => cancelAnimationFrame(raf.current)
  }, [trend])
  return <canvas ref={ref} style={{ width: '100%', height: 140, display: 'block' }} />
}

// ── Animated bar ──────────────────────────────────────────────────────────────
function AnimBar({ label, value, max, color, delay = 0, count }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const tid = setTimeout(() => {
      const t0 = Date.now()
      const tick = () => {
        const p = Math.min(1, (Date.now() - t0) / 600)
        setW((1 - Math.pow(1 - p, 3)) * (max > 0 ? (value / max) * 100 : 0))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(tid)
  }, [value, max, delay])
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#565959', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color }}>{count !== undefined ? fmt(count) : fmt(value)}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, borderRadius: 3, background: `linear-gradient(90deg,${color}88,${color})`, boxShadow: `0 0 6px ${color}44`, transition: 'width 0.03s linear' }} />
      </div>
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KpiTile({ icon, label, value, color, sub, delay = 0 }) {
  const num = useCountUp(typeof value === 'number' ? value : 0)
  return (
    <div className="anl-card" style={{ flex: 1, minWidth: 130, background: '#fff', border: '1.5px solid #e5e8ed', borderTop: `3px solid ${color}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', animationDelay: `${delay}s` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, letterSpacing: -0.5 }}>
        {typeof value === 'number' ? fmt(num) : value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#8d9191', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

// ── SVG Compliance ring ───────────────────────────────────────────────────────
function ComplianceRing({ rating = 'GOOD', score = 0 }) {
  const pct = Math.max(0, 100 - score)
  const color = rating === 'GOOD' ? '#1d8102' : rating === 'MODERATE' ? '#c8960c' : '#d13212'
  const R = 42, circ = 2 * Math.PI * R, dash = (pct / 100) * circ
  return (
    <div style={{ position: 'relative', width: 100, height: 100 }}>
      <svg width={100} height={100} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={R} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={11} />
        <circle cx={50} cy={50} r={R} fill="none" stroke={color} strokeWidth={11}
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1.3s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 5px ${color}66)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 8, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 }}>compliant</span>
      </div>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 140px 1fr', gap: 12, marginBottom: 12 }}>
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  )
}

// ── No-data empty state ───────────────────────────────────────────────────────
function EmptyAnalytics({ onNav }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 20, textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,153,0,0.08)', border: '2px solid rgba(255,153,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, animation: 'anlGlow 2s ease infinite' }}>📊</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#0f1111', marginBottom: 8 }}>No Analytics Data Yet</div>
        <p style={{ fontSize: 13, color: '#565959', maxWidth: 360, lineHeight: 1.8, margin: 0 }}>
          Analytics populate automatically after each security scan. Run a scan first to see your risk score, trends, and compliance data.
        </p>
      </div>
      {onNav && (
        <button onClick={() => onNav('scanner')} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF9900,#e07b00)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,153,0,0.4)' }}>
          → Go to Scanner
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AnalyticsSection({ onNav }) {
  const { accountId } = useAuth()
  const [rs,   setRs]   = useState(null)
  const [tr,   setTr]   = useState([])
  const [ar,   setAr]   = useState(null)
  const [pv,   setPv]   = useState(null)
  const [bd,   setBd]   = useState(null)
  const [cs,   setCs]   = useState(null)
  const [load, setLoad] = useState(true)
  const [err,  setErr]  = useState(null)
  const [tab,  setTab]  = useState('overview')
  const [last, setLast] = useState(null)

  const doFetch = useCallback(async () => {
    setLoad(true); setErr(null)
    try {
      const aid = accountId || null  // pass null — backend supports no account_id
      const [a, b, c, d, e, f] = await Promise.all([
        analyticsAPI.riskScore(aid),
        analyticsAPI.riskTrend(aid),
        analyticsAPI.auditReport(aid),
        analyticsAPI.policyViolations(aid),
        analyticsAPI.breakdown(aid),
        analyticsAPI.complianceScore(aid),
      ])
      const ex = r => r?.data?.data ?? r?.data ?? {}
      setRs(ex(a))
      const td = ex(b); setTr(Array.isArray(td?.trend) ? td.trend : [])
      setAr(ex(c))
      setPv(ex(d))
      setBd(ex(e))
      setCs(ex(f))
      setLast(new Date())
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to load analytics')
    } finally {
      setLoad(false)
    }
  }, [accountId])

  useEffect(() => { doFetch() }, [doFetch])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const score    = rs?.risk_score ?? 0
  const level    = rs?.risk_level ?? 'LOW'
  const riskCol  = RISK_C(score)
  const sev      = bd?.severity_distribution ?? {}
  const total    = (sev.CRITICAL || 0) + (sev.HIGH || 0) + (sev.MEDIUM || 0) + (sev.LOW || 0)
  const maxSev   = Math.max(sev.CRITICAL || 0, sev.HIGH || 0, sev.MEDIUM || 0, sev.LOW || 0, 1)
  const types    = Array.isArray(bd?.top_types) ? bd.top_types : []
  const regions  = Array.isArray(bd?.top_regions) ? bd.top_regions : []
  const maxReg   = regions.reduce((m, r) => Math.max(m, r.count), 1)
  const maxTyp   = types.reduce((m, t) => Math.max(m, t.count), 1)
  const rating   = ar?.compliance_rating ?? 'GOOD'
  const rcolor   = rating === 'GOOD' ? '#1d8102' : rating === 'MODERATE' ? '#c8960c' : '#d13212'
  const viol     = Array.isArray(pv?.violations) ? pv.violations : []
  const noData   = !load && !err && !rs?.latest_scan_id && tr.length === 0

  const TABS = [
    { k: 'overview',    label: '📊 Overview'    },
    { k: 'trend',       label: '📈 Risk Trend'   },
    { k: 'breakdown',   label: '🔍 Breakdown'    },
    { k: 'regions',     label: '🌏 Regions'      },
    { k: 'violations',  label: '⚠️ Violations'   },
    { k: 'compliance',  label: '🛡️ Compliance'   },
  ]

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, sans-serif', background: '#f4f4f4', minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 16 }}>
      <style>{CSS}</style>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,rgba(255,153,0,0.18),rgba(9,114,211,0.12))', border: '1.5px solid rgba(255,153,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 2px 10px rgba(255,153,0,0.18)' }}>📊</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f1111', margin: 0, letterSpacing: -0.5 }}>Security Analytics</h1>
                  {!load && !noData && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(29,128,2,0.09)', border: '1px solid rgba(29,128,2,0.25)', borderRadius: 20, padding: '2px 10px', fontSize: 9.5, fontWeight: 700, color: '#1d8102' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1d8102', animation: 'anlPulse 1.8s ease infinite' }} /> LIVE
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#8d9191', margin: 0, marginTop: 3 }}>
                  {load ? 'Fetching data…' : last ? `Updated ${relT(last)}` : 'No data yet'}
                  {ar?.total_scan_events > 0 && ` · ${ar.total_scan_events} scan${ar.total_scan_events !== 1 ? 's' : ''} analysed`}
                </p>
              </div>
            </div>
            <button onClick={doFetch} disabled={load} className="anl-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'rgba(9,114,211,0.05)', border: '1.5px solid rgba(9,114,211,0.25)', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: '#1a6296', cursor: load ? 'wait' : 'pointer', opacity: load ? 0.6 : 1 }}>
              <span style={{ display: 'inline-block', animation: load ? 'anlSpin 0.7s linear infinite' : 'none' }}>↻</span>
              {load ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 28px', gap: 0, borderTop: '1.5px solid #e5e8ed' }}>
          {TABS.map(t => (
            <button key={t.k} className="anl-tab" onClick={() => setTab(t.k)}
              style={{ padding: '10px 18px', fontSize: 12, fontWeight: tab === t.k ? 700 : 500, color: tab === t.k ? '#FF9900' : '#8d9191', borderBottom: tab === t.k ? '2.5px solid #FF9900' : '2.5px solid transparent', letterSpacing: 0.2 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* Error banner */}
        {err && !load && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: C.criticalBg, border: `1.5px solid ${C.criticalBorder}`, borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            <span style={{ fontSize: 13, color: C.critical, fontWeight: 600 }}>{err}</span>
            <button onClick={doFetch} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.blue, border: 'none', background: 'transparent', cursor: 'pointer' }}>Retry →</button>
          </div>
        )}

        {load && <Skeleton />}
        {!load && noData && <EmptyAnalytics onNav={onNav} />}

        {/* ═══ OVERVIEW ══════════════════════════════════════════════════════════ */}
        {!load && !noData && tab === 'overview' && (
          <>
            {/* KPI row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <KpiTile icon="🎯" label="Risk Score"     value={score}                            color={riskCol}   sub={`${level} risk level`}            delay={0} />
              <KpiTile icon="🔍" label="Total Findings" value={total}                            color={C.aws}     sub={`${ar?.total_scan_events || 0} scans`} delay={0.05} />
              <KpiTile icon="🔥" label="Critical + High" value={(sev.CRITICAL||0)+(sev.HIGH||0)} color={C.critical} sub="high-severity issues"             delay={0.1} />
              <KpiTile icon="✅" label="Remediations"   value={bd?.total_remediations || 0}     color={C.low}     sub="auto-fixes applied"                delay={0.15} />
            </div>

            {/* Main grid: Gauge | Compliance | Bars */}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 160px 1fr', gap: 14, marginBottom: 14 }}>

              {/* Gauge */}
              <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.06s' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Risk Score</div>
                <RiskGauge score={score} />
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 800, color: riskCol, background: `${riskCol}12`, border: `1px solid ${riskCol}30`, borderRadius: 20, padding: '3px 14px', letterSpacing: 0.5 }}>
                  {level} RISK
                </div>
              </div>

              {/* Compliance */}
              <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.1s' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Compliance</div>
                <ComplianceRing rating={rating} score={score} />
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: rcolor }}>{rating}</div>
                <div style={{ fontSize: 10, color: '#8d9191', marginTop: 4 }}>{pv?.total_violations ?? 0} violation{(pv?.total_violations ?? 0) !== 1 ? 's' : ''}</div>
              </div>

              {/* Severity + Remediation bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '16px 20px', flex: 1, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.14s' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 13 }}>Severity Breakdown</div>
                  {[['CRITICAL', sev.CRITICAL || 0, C.critical], ['HIGH', sev.HIGH || 0, C.high], ['MEDIUM', sev.MEDIUM || 0, C.medium], ['LOW', sev.LOW || 0, C.low]].map(([k, v, c], i) => (
                    <AnimBar key={k} label={k} value={v} max={maxSev} color={c} delay={i * 70} />
                  ))}
                  {total > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {[['CRITICAL', sev.CRITICAL || 0, C.critical, C.criticalBg], ['HIGH', sev.HIGH || 0, C.high, C.highBg], ['MEDIUM', sev.MEDIUM || 0, C.medium, C.mediumBg], ['LOW', sev.LOW || 0, C.low, C.lowBg]].map(([k, v, c, bg]) => (
                        <span key={k} style={{ fontSize: 9.5, fontWeight: 700, color: c, background: bg, borderRadius: 20, padding: '2px 10px', border: `1px solid ${c}30` }}>
                          {k[0]+k.slice(1).toLowerCase()} {Math.round(v / total * 100)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '16px 20px', flex: 1, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.18s' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 13 }}>Remediation Rate</div>
                  {[
                    ['Detected',    ar?.total_high_findings_detected || 0,  C.aws],
                    ['Remediated',  ar?.total_remediated_findings || 0,     C.low],
                    ['Still Active',ar?.current_active_high_findings || 0,  C.critical],
                  ].map(([l, v, c], i) => (
                    <AnimBar key={l} label={l} value={v} max={Math.max(ar?.total_high_findings_detected || 1, 1)} color={c} delay={i * 80} />
                  ))}
                  {(ar?.total_high_findings_detected || 0) > 0 && (
                    <div style={{ marginTop: 10, padding: '7px 12px', background: C.lowBg, border: `1px solid ${C.lowBorder}`, borderRadius: 7, fontSize: 11, color: C.low, fontWeight: 700 }}>
                      ✅ {Math.round((ar.total_remediated_findings / ar.total_high_findings_detected) * 100)}% remediation rate
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Top finding types */}
            {types.length > 0 && (
              <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '18px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.22s' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Top Finding Types</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 32px' }}>
                  {types.slice(0, 8).map((t, i) => (
                    <AnimBar key={t.type} label={cap(t.type)} value={t.count} max={maxTyp} color={[C.aws, C.blue, '#8B5CF6', C.low, C.high, C.critical][i % 6]} delay={i * 50} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ RISK TREND ════════════════════════════════════════════════════════ */}
        {!load && !noData && tab === 'trend' && (
          <>
            <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 24px', marginBottom: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1111' }}>Risk Score Over Time</div>
                <div style={{ fontSize: 10, color: '#8d9191' }}>{tr.length} data point{tr.length !== 1 ? 's' : ''}</div>
              </div>
              <TrendChart trend={tr} />
              <div style={{ display: 'flex', gap: 14, marginTop: 12, justifyContent: 'center' }}>
                {[['LOW', C.low], ['MEDIUM', C.medium], ['HIGH', C.high], ['CRITICAL', C.critical]].map(([l, c]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                    <span style={{ fontSize: 9.5, color: '#8d9191', fontWeight: 600 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.08s' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1111', marginBottom: 14 }}>Per-Scan Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '4px 16px', fontSize: 9.5, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 0.8, paddingBottom: 10, borderBottom: '1.5px solid #e5e8ed', marginBottom: 4 }}>
                <span>Scan</span><span>Time</span><span>Score</span><span>Level</span><span>Active H+C</span>
              </div>
              {tr.map((t, i) => (
                <div key={t.scan_id} className="anl-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '3px 16px', alignItems: 'center', padding: '8px 6px', borderBottom: '1px solid #f4f4f4', animation: `anlFade 0.3s ease ${i * 0.04}s both`, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#8d9191', fontFamily: 'monospace' }}>#{t.scan_id?.slice(0, 8)}</span>
                  <span style={{ fontSize: 10.5, color: '#565959' }}>{relT(t.timestamp)}</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: RISK_C(t.risk_score) }}>{t.risk_score}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: SEV_C[t.risk_level] || C.aws, background: `${SEV_C[t.risk_level] || C.aws}12`, border: `1px solid ${SEV_C[t.risk_level] || C.aws}28`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{t.risk_level}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.high }}>{t.active_high_findings}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══ BREAKDOWN ═════════════════════════════════════════════════════════ */}
        {!load && !noData && tab === 'breakdown' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Severity card */}
            <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Severity Distribution</div>
              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
                {[['CRITICAL', sev.CRITICAL || 0, C.critical], ['HIGH', sev.HIGH || 0, C.high], ['MEDIUM', sev.MEDIUM || 0, C.medium], ['LOW', sev.LOW || 0, C.low]].filter(([, v]) => v > 0).map(([k, v, c]) => (
                  <div key={k} style={{ flex: v, background: c, transition: 'flex 1s ease' }} />
                ))}
              </div>
              {[['CRITICAL', sev.CRITICAL || 0, C.critical, C.criticalBg, C.criticalBorder], ['HIGH', sev.HIGH || 0, C.high, C.highBg, C.highBorder], ['MEDIUM', sev.MEDIUM || 0, C.medium, C.mediumBg, C.mediumBorder], ['LOW', sev.LOW || 0, C.low, C.lowBg, C.lowBorder]].map(([k, v, c, bg, border], i) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, marginBottom: 6, background: bg, border: `1px solid ${border}`, animation: `anlFade 0.3s ease ${i * 0.07}s both` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3d4f60' }}>{k}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 10, color: '#8d9191' }}>{total > 0 ? Math.round(v / total * 100) : 0}%</span>
                    <span style={{ fontSize: 17, fontWeight: 900, color: c }}>{fmt(v)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Finding types */}
            <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.08s' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Top Finding Types</div>
              {types.map((t, i) => (
                <AnimBar key={t.type} label={cap(t.type)} value={t.count} max={maxTyp}
                  color={[C.aws, C.blue, '#8B5CF6', C.low, C.high, C.critical][i % 6]} delay={i * 60} />
              ))}
            </div>

            {/* Per-scan stacked bars */}
            {Array.isArray(bd?.scan_totals) && bd.scan_totals.length > 0 && (
              <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 22px', gridColumn: 'span 2', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.16s' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Per-Scan Finding Counts</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 88 }}>
                  {bd.scan_totals.map((s, i) => {
                    const maxT = Math.max(...bd.scan_totals.map(x => x.total), 1)
                    return (
                      <div key={s.scan_id} title={`Scan ${s.scan_id}: ${s.total} findings`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, maxWidth: 56 }}>
                        <div style={{ width: '100%', height: Math.max(4, (s.total / maxT) * 70), borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', cursor: 'pointer', transition: 'filter 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.12)'}
                          onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                          {[['low', C.low], ['medium', C.medium], ['high', C.high], ['critical', C.critical]].map(([k, c]) => (
                            s[k] > 0 && <div key={k} style={{ height: `${(s[k] / s.total) * 100}%`, background: c, minHeight: 2 }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 8, color: '#8d9191', fontFamily: 'monospace' }}>#{s.scan_id?.slice(0, 6)}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'center' }}>
                  {[['Critical', C.critical], ['High', C.high], ['Medium', C.medium], ['Low', C.low]].map(([l, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                      <span style={{ fontSize: 9.5, color: '#8d9191' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ REGIONS ═══════════════════════════════════════════════════════════ */}
        {!load && !noData && tab === 'regions' && (
          <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1111', marginBottom: 5 }}>Regional Finding Heatmap</div>
            <p style={{ fontSize: 11, color: '#8d9191', margin: '0 0 20px' }}>Finding distribution across AWS regions — darker = more findings</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {regions.length > 0 ? regions.map((r, i) => {
                const pct = r.count / maxReg
                const col = pct > 0.7 ? C.critical : pct > 0.4 ? C.high : pct > 0.2 ? C.medium : C.low
                return (
                  <div key={r.region} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8f9fa', border: '1px solid #e5e8ed', borderLeft: `3px solid ${col}`, borderRadius: 8, animation: `anlSlide 0.3s ease ${i * 0.04}s both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}99` }} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3d4f60', fontFamily: 'monospace' }}>{r.region}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 44, height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: col, borderRadius: 2, transition: 'width 0.8s ease' }} />
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: col, minWidth: 22, textAlign: 'right' }}>{r.count}</span>
                    </div>
                  </div>
                )
              }) : (
                <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '40px 0', color: '#8d9191', fontSize: 13 }}>No region data available — run a scan first</div>
              )}
            </div>
          </div>
        )}

        {/* ═══ VIOLATIONS ════════════════════════════════════════════════════════ */}
        {!load && !noData && tab === 'violations' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              {[
                ['Compliance Status', pv?.compliance_status || 'N/A', pv?.compliance_status === 'COMPLIANT' ? C.low : C.critical],
                ['Findings Evaluated', pv?.total_findings_evaluated || 0, C.aws],
                ['Violations Found', pv?.total_violations || 0, (pv?.total_violations || 0) > 0 ? C.critical : C.low],
              ].map(([l, v, c], i) => (
                <div key={l} className="anl-card" style={{ flex: 1, background: '#fff', border: '1.5px solid #e5e8ed', borderTop: `3px solid ${c}`, borderRadius: 12, padding: '14px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', animationDelay: `${i * 0.07}s` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8d9191', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{l}</div>
                  <div style={{ fontSize: typeof v === 'number' ? 26 : 16, fontWeight: 900, color: c }}>{typeof v === 'number' ? fmt(v) : v}</div>
                </div>
              ))}
            </div>

            <div className="anl-card" style={{ background: '#fff', border: '1.5px solid #e5e8ed', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', animationDelay: '0.18s' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1111', marginBottom: 14 }}>Violation Details</div>
              {viol.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#1d8102', fontSize: 13, fontWeight: 600 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  No policy violations detected — your account is compliant!
                </div>
              ) : viol.map((v, i) => {
                const sC = SEV_C[v.severity] || C.blue
                return (
                  <div key={i} className="anl-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 10px', borderBottom: '1px solid #f4f4f4', borderRadius: 6, animation: `anlFade 0.3s ease ${i * 0.05}s both` }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: sC, flexShrink: 0, marginTop: 4, boxShadow: `0 0 5px ${sC}77` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f1111', marginBottom: 3 }}>{cap(v.policy || v.type)}</div>
                      <div style={{ fontSize: 11, color: '#565959', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.resource_id || v.description || '—'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {v.severity && <span style={{ fontSize: 9, fontWeight: 800, color: sC, background: `${sC}12`, border: `1px solid ${sC}30`, borderRadius: 4, padding: '2px 8px' }}>{v.severity}</span>}
                      {v.region && <span style={{ fontSize: 9.5, color: '#8d9191', fontFamily: 'monospace' }}>{v.region}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── 🛡️ Compliance Scorecard tab ──────────────────────────────────── */}
        {!load && !noData && tab === 'compliance' && (
          <ComplianceScoreTab cs={cs} />
        )}

      </div>
    </div>
  )
}

export default AnalyticsSection

// ── Compliance Score Tab ──────────────────────────────────────────────────────
function ComplianceScoreTab({ cs }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  if (!cs || !Array.isArray(cs.scorecards)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8d9191', fontSize: 14 }}>
        No compliance data yet. Run a scan first.
      </div>
    )
  }

  const overall = cs.overall_pct || 0
  const oCol = overall >= 80 ? '#1d8102' : overall >= 60 ? '#c8960c' : '#d13212'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overall banner */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e8ed', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
          <circle cx={44} cy={44} r={36} fill="none" stroke="#f0f0f0" strokeWidth={8} />
          <circle cx={44} cy={44} r={36} fill="none" stroke={oCol} strokeWidth={8}
            strokeDasharray={`${(overall / 100) * 226.2} 226.2`}
            strokeLinecap="round" transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          <text x={44} y={40} textAnchor="middle" fontSize={18} fontWeight={800} fill={oCol} fontFamily="Inter,sans-serif">{overall}%</text>
          <text x={44} y={54} textAnchor="middle" fontSize={8} fill="#8d9191" fontFamily="Inter,sans-serif" letterSpacing={0.5}>OVERALL</text>
        </svg>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f1111', marginBottom: 4 }}>
            Overall Compliance: <span style={{ color: oCol }}>{overall}%</span>
          </div>
          <div style={{ fontSize: 12, color: '#8d9191', maxWidth: 500 }}>
            Averaged across CIS AWS Benchmark, PCI DSS &amp; NIST CSF — based on {cs.total_findings || 0} findings from your latest scan.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {cs.scorecards.map(sc => {
              const sCol = sc.score_pct >= 80 ? '#1d8102' : sc.score_pct >= 60 ? '#c8960c' : '#d13212'
              return (
                <span key={sc.key} style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: `${sCol}14`, color: sCol, border: `1px solid ${sCol}30` }}>
                  {sc.icon} {sc.label}: {sc.score_pct}%
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Per-framework cards */}
      {cs.scorecards.map(sc => {
        const col = sc.score_pct >= 80 ? '#1d8102' : sc.score_pct >= 60 ? '#c8960c' : '#d13212'
        const isOpen = expanded[sc.key]
        return (
          <div key={sc.key} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e8ed', overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,0.04)' }}>
            <div onClick={() => toggle(sc.key)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, userSelect: 'none' }}>
              <svg width={56} height={56} viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
                <circle cx={28} cy={28} r={22} fill="none" stroke="#f0f0f0" strokeWidth={6} />
                <circle cx={28} cy={28} r={22} fill="none" stroke={col} strokeWidth={6}
                  strokeDasharray={`${(sc.score_pct / 100) * 138.2} 138.2`}
                  strokeLinecap="round" transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dasharray 0.7s ease' }} />
                <text x={28} y={32} textAnchor="middle" fontSize={12} fontWeight={800} fill={col} fontFamily="Inter,sans-serif">{sc.score_pct}%</text>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f1111' }}>{sc.icon} {sc.label}</div>
                <div style={{ fontSize: 11, color: '#8d9191', marginTop: 2 }}>
                  {sc.passing}/{sc.total} rules passing &nbsp;·&nbsp;
                  <span style={{ color: sc.failing > 0 ? '#d13212' : '#1d8102' }}>{sc.failing} failing</span>
                </div>
                <div style={{ display: 'flex', height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 8, background: '#f0f0f0' }}>
                  <div style={{ width: `${sc.score_pct}%`, background: col, transition: 'width 0.7s ease' }} />
                </div>
              </div>
              <span style={{ fontSize: 18, color: '#8d9191', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', lineHeight: 1 }}>▾</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid #f0f0f0' }}>
                {sc.rules.map((rule, ri) => {
                  const pass = rule.status === 'PASS'
                  const sC2 = rule.severity === 'CRITICAL' ? '#d13212' : rule.severity === 'HIGH' ? '#c8960c' : rule.severity === 'MEDIUM' ? '#0972d3' : '#067340'
                  return (
                    <div key={rule.policy_id} style={{ padding: '12px 20px', borderBottom: ri < sc.rules.length - 1 ? '1px solid #f8f8f8' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: pass ? 'rgba(29,129,2,0.1)' : 'rgba(209,50,18,0.08)', border: `1.5px solid ${pass ? 'rgba(29,129,2,0.4)' : 'rgba(209,50,18,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: pass ? '#1d8102' : '#d13212', flexShrink: 0, marginTop: 1 }}>
                        {pass ? '✓' : '✗'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f1111' }}>{rule.rule_name}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: sC2, background: `${sC2}14`, borderRadius: 4, padding: '1px 7px', border: `1px solid ${sC2}30` }}>{rule.severity}</span>
                          {!pass && rule.affected_count > 0 && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#d13212', background: 'rgba(209,50,18,0.08)', borderRadius: 4, padding: '1px 7px', border: '1px solid rgba(209,50,18,0.2)' }}>
                              {rule.affected_count} affected
                            </span>
                          )}
                          <span style={{ fontSize: 9, color: '#8d9191', fontFamily: 'monospace' }}>{rule.framework_ref}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#565959', lineHeight: 1.5 }}>{rule.description}</div>
                        {!pass && rule.remediation && (
                          <div style={{ fontSize: 10.5, color: '#1a6296', marginTop: 6, padding: '6px 10px', background: 'rgba(9,114,211,0.05)', borderRadius: 6, borderLeft: '3px solid rgba(9,114,211,0.35)', lineHeight: 1.4 }}>
                            💡 {rule.remediation}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
