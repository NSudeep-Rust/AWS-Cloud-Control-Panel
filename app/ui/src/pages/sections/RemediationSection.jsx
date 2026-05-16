import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'
import { Wrench, CheckCircle, AlertTriangle, Clock, Play, Zap, RotateCcw, Shield, RefreshCw, Search, ChevronRight } from 'lucide-react'
import { getServiceTag } from '@/utils/getModuleGroup'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const DANGER_ACTIONS = new Set([
  'TERMINATE_EC2_INSTANCE', 'FORCE_TERMINATE_EC2_INSTANCE',
  'DELETE_DEFAULT_VPC', 'DELETE_UNUSED_IAM_USER', 'DELETE_ACCESS_KEY',
])

const NOT_ROLLBACKABLE_ACTIONS = new Set([
  'TERMINATE_EC2_INSTANCE', 'FORCE_TERMINATE_EC2_INSTANCE',
  'REMOVE_ELASTIC_IP', 'DELETE_DEFAULT_VPC',
  'DELETE_UNUSED_IAM_USER', 'DELETE_ACCESS_KEY',
])

const SEV_ACCENT = {
  CRITICAL: { stripe: '#d13212', light: 'rgba(209,50,18,0.06)', glow: 'rgba(209,50,18,0.14)', tag: '#d13212', tagBg: 'rgba(209,50,18,0.1)' },
  HIGH:     { stripe: '#e07b00', light: 'rgba(255,153,0,0.07)',  glow: 'rgba(224,123,0,0.12)', tag: '#e07b00', tagBg: 'rgba(224,123,0,0.08)' },
  MEDIUM:   { stripe: '#c8960c', light: 'rgba(212,160,23,0.06)', glow: 'rgba(212,160,23,0.10)', tag: '#c8960c', tagBg: 'rgba(212,160,23,0.1)' },
  LOW:      { stripe: '#3ea97c', light: 'rgba(62,169,124,0.06)', glow: 'rgba(62,169,124,0.09)', tag: '#3ea97c', tagBg: 'rgba(62,169,124,0.1)' },
}
const accent = s => SEV_ACCENT[s?.toUpperCase()] || SEV_ACCENT.LOW

const SVC_ICON = { IAM:'🔑', S3:'📦', EC2:'💻', VPC:'🌐', RDS:'🗄️', KMS:'🔒', CLOUDTRAIL:'📋', EBS:'💾', SG:'🛡️', DEFAULT:'⚡' }
function svcIcon(type) {
  if (!type) return SVC_ICON.DEFAULT
  const t = type.toUpperCase()
  for (const [k, v] of Object.entries(SVC_ICON)) { if (t.includes(k)) return v }
  return SVC_ICON.DEFAULT
}
function fmtType(t)   { return (t||'Unknown').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) }
function fmtAction(a) { return (a||'Unknown').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) }

// ─── Empty Pipeline (Premium Redesign) ────────────────────────────────────────
function EmptyPipeline() {
  const STEPS = [
    { icon: '🔍', label: 'DETECT',  sub: 'Scan findings',    color: '#e07b00' },
    { icon: '📋', label: 'PLAN',    sub: 'Generate fix plan', color: '#FF9900' },
    { icon: '⚡', label: 'EXECUTE', sub: 'Apply to AWS',      color: '#1d8102' },
    { icon: '✅', label: 'FIXED',   sub: 'Mark resolved',     color: '#0972d3' },
  ]

  const FEATURES = [
    { icon: '🔄', title: 'Dry Run First',    desc: 'Preview every fix before any AWS change is made' },
    { icon: '🛡️', title: 'Danger Guard',      desc: 'Irreversible actions require explicit confirmation' },
    { icon: '↩️',  title: 'Rollback Support', desc: 'Undo any reversible fix from the Rollback section' },
    { icon: '⚡', title: 'Parallel Engines',  desc: '8 service engines process findings simultaneously' },
    { icon: '🎯', title: 'Auto Prioritise',   desc: 'CRITICAL & HIGH findings surfaced first' },
    { icon: '📊', title: 'Full Audit Trail',  desc: 'Every action logged with timestamp & outcome' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes remBlink    { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes remShimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes remNodePop  { 0%{opacity:0;transform:scale(0.9)} 100%{opacity:1;transform:scale(1)} }
        @keyframes stageFloat  { 0%,100%{transform:scale(1);box-shadow:0 2px 12px rgba(0,0,0,0.04)} 50%{transform:scale(1.04);box-shadow:0 0 24px rgba(255,153,0,0.22)} }
        @keyframes iconPulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes dotFlow     { 0%{left:-12px;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{left:calc(100% + 12px);opacity:0} }
      `}</style>

      {/* ── Pipeline Card ── */}
      <div style={{ background: 'var(--bg2)', border: '1.5px solid rgba(255,153,0,0.25)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 28px rgba(255,153,0,0.08), var(--card-shadow)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#FF9900,#ec8a00,#FF9900)', backgroundSize: '200%', animation: 'remShimmer 2.5s linear infinite' }} />

        <div style={{ padding: '20px 24px 22px' }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FF9900', letterSpacing: 1.6, textTransform: 'uppercase' }}>⚡ Auto-Remediation Pipeline</div>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,153,0,0.18)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d8102', display: 'inline-block', animation: 'remBlink 1.2s ease infinite' }} />
              8 service engines online
            </div>
          </div>

          {/* Stage cards — wave-float with staggered delays, dots relay between them */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEPS.map((step, i) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                {/* Stage card — each floats with its own staggered delay → smooth wave */}
                <div style={{
                  flex: 1, padding: '28px 16px 22px', borderRadius: 14, textAlign: 'center',
                  background: `${step.color}07`,
                  border: `1px solid ${step.color}35`,
                  animation: `remNodePop 0.35s ease ${i * 0.09}s both, stageFloat 3s ease ${i * 0.75}s infinite`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}>
                  {/* Emoji icon with its own gentle pulse */}
                  <div style={{
                    fontSize: 40,
                    animation: `iconPulse 3s ease ${i * 0.75}s infinite`,
                    display: 'inline-block',
                  }}>
                    {step.icon}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: step.color, letterSpacing: 1.2, textTransform: 'uppercase' }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{step.sub}</div>
                </div>

                {/* Connector — dot flows to next stage continuously */}
                {i < STEPS.length - 1 && (
                  <div style={{ width: 40, flexShrink: 0, position: 'relative', height: 2.5, background: 'rgba(255,153,0,0.15)' }}>
                    <div style={{
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      width: 10, height: 10, borderRadius: '50%',
                      background: STEPS[i + 1].color,
                      boxShadow: `0 0 8px ${STEPS[i + 1].color}`,
                      animation: `dotFlow 2.8s ease ${i * 0.7}s infinite`,
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features Card ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={10} color="#FF9900" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Engine Capabilities</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{ background: 'rgba(255,153,0,0.04)', border: '1px solid rgba(255,153,0,0.12)', borderRadius: 9, padding: '10px 12px', animation: `remNodePop 0.3s ease ${i * 0.06}s both`, transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,153,0,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,153,0,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,153,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,153,0,0.12)' }}>
              <div style={{ fontSize: 16, marginBottom: 5 }}>{f.icon}</div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>{f.title}</div>
              <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.45 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA footer ── */}
      <div style={{ padding: '14px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--card-shadow)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🔍</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          Run a security scan from the <strong style={{ color: '#e07b00' }}>Scanner</strong> to auto-load fixable findings into this pipeline.
          CRITICAL and HIGH severity findings will surface first.
        </div>
      </div>
    </div>
  )
}

// ─── Finding Card (UNCHANGED) ──────────────────────────────────────────────────
function FindingCard({ finding, scanId, onExecuted }) {
  const ac = accent(finding.severity)
  const icon = svcIcon(finding.type)
  const isDanger = DANGER_ACTIONS.has(finding.remediation_action || '')

  const [open, setOpen]       = useState(false)
  const [phase, setPhase]     = useState('idle')   // idle|planning|planned|executing|done|error
  const [plan, setPlan]       = useState(null)
  const [dangerOk, setDangerOk] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [errorReason, setErrorReason] = useState('')
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  useEffect(() => {
    if (phase === 'done') {
      setExiting(true)
      const t = setTimeout(() => onExecuted(finding.id), 480)
      return () => clearTimeout(t)
    }
  }, [phase, finding.id, onExecuted])

  async function doDryRun(e) {
    e.stopPropagation()
    setOpen(true); setPhase('planning')
    try {
      const r = await axios.post(`${API}/api/execute/`, { scan_id: scanId, finding_ids: [finding.id], mode: 'DRY_RUN' })
      const plans = r.data?.data?.plans || []
      setPlan(plans[0] || null)
      setPhase('planned')
    } catch { setPhase('error') }
  }

  async function doExecute(e) {
    e.stopPropagation()
    setPhase('executing')
    try {
      await axios.post(`${API}/api/execute/`, {
        scan_id: scanId, finding_ids: [finding.id], mode: 'LIVE'
      })

      let attempts = 0
      const confirmed = new Set()
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 45) {
          clearInterval(pollRef.current)
          setErrorReason('Execution timed out — AWS did not respond within 90 seconds.')
          setPhase('error')
          return
        }
        try {
          const r = await axios.get(`${API}/api/execute/executions?scan_id=${scanId}`)
          const all = (r.data?.data?.executions || [])
            .filter(ex => ex.finding_id === finding.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          const mine = all[0]
          if (!mine) return

          if (mine.status === 'EXECUTED') {
            clearInterval(pollRef.current); setPhase('done'); return
          }
          if (['FAILED', 'SKIPPED', 'MANUAL_REQUIRED', 'BLOCKED', 'BLOCKED_BY_POLICY', 'NOT_RECOVERABLE'].includes(mine.status)) {
            clearInterval(pollRef.current)
            setErrorReason(mine.reason || 'Execution failed — check AWS permissions.')
            setPhase('error'); return
          }
          if (mine.status === 'REQUIRE_APPROVAL' && mine.approval_token && !confirmed.has(mine.approval_token)) {
            confirmed.add(mine.approval_token)
            attempts = 0
            await axios.post(`${API}/api/execute/`, {
              scan_id: scanId, finding_ids: [finding.id], mode: 'LIVE',
              approval_token: mine.approval_token, confirm: true
            }).catch(() => { /* keep polling */ })
          }
        } catch (_) { /* keep polling on network errors */ }
      }, 2000)
    } catch (_) { setPhase('error') }
  }

  const isOpen = open || ['planning','planned','executing','error'].includes(phase)

  return (
    <div
      style={{ position:'relative', transition:'all 0.28s ease', transform: exiting ? 'translateX(60px) scaleY(0.92)' : hovered && !isOpen ? 'translateY(-3px)' : 'none', opacity: exiting ? 0 : 1, zIndex: isOpen ? 10 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => !isOpen && setHovered(false)}
    >
      <style>{`
        @keyframes fcSpin  { to{transform:rotate(360deg)} }
        @keyframes fcPop   { 0%{opacity:0;transform:translateY(-5px)} 100%{opacity:1;transform:none} }
        @keyframes fcShine { 0%{left:-80px} 100%{left:calc(100% + 80px)} }
        @keyframes fcSlide { 0%{opacity:0;transform:translateX(-6px)} 100%{opacity:1;transform:none} }
      `}</style>

      {/* Main card */}
      <div onClick={() => !['executing'].includes(phase) && setOpen(x => !x)} style={{ background:'var(--bg2)', border:`1.5px solid ${isOpen||hovered ? ac.stripe+'aa' : ac.stripe+'30'}`, borderRadius: isOpen ? '14px 14px 0 0' : 14, overflow:'hidden', cursor:'pointer', boxShadow: isOpen ? `0 0 0 2px ${ac.stripe}20, 0 8px 32px ${ac.glow}` : hovered ? `0 8px 28px ${ac.glow}, 0 2px 8px rgba(0,0,0,0.07)` : '0 2px 8px rgba(15,17,17,0.06)', transition:'all 0.22s ease', userSelect:'none' }}>
        {/* Top color bar */}
        <div style={{ height:4, background:`linear-gradient(90deg, ${ac.stripe}, ${ac.stripe}88)`, position:'relative', overflow:'hidden' }}>
          {hovered && <div style={{ position:'absolute', top:0, width:80, height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)', animation:'fcShine 0.7s ease forwards' }} />}
        </div>

        <div style={{ padding:'14px 18px 14px', display:'flex', gap:14, alignItems:'center' }}>
          {/* Icon */}
          <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, background:ac.light, border:`1.5px solid ${ac.stripe}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, transition:'transform 0.2s', transform:hovered?'scale(1.07)':'none' }}>
            {icon}
          </div>
          {/* Content */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtType(finding.type)}</div>
              <span style={{ fontSize:9, fontWeight:800, color:ac.tag, background:ac.tagBg, borderRadius:4, padding:'3px 7px', letterSpacing:0.7, textTransform:'uppercase', border:`1px solid ${ac.tag}30`, flexShrink:0 }}>{finding.severity||'INFO'}</span>
              <span style={{ fontSize:9, fontWeight:700, color:'#0972d3', background:'rgba(9,114,211,0.1)', borderRadius:4, padding:'3px 7px', border:'1px solid rgba(9,114,211,0.2)', flexShrink:0 }}>{finding.remediation_type||'AUTO'}</span>
              {/* Phase indicator */}
              <div style={{ flexShrink:0 }}>
                {phase==='idle'      && <span style={{ fontSize:10, color:hovered?ac.stripe:'#8d9191', transition:'color 0.15s' }}>▼ Expand</span>}
                {phase==='planning'  && <div style={{ width:13, height:13, border:`2px solid ${ac.stripe}`, borderTopColor:'transparent', borderRadius:'50%', animation:'fcSpin 0.7s linear infinite' }} />}
                {phase==='planned'   && <span style={{ fontSize:10, color:'#FF9900', fontWeight:700 }}>⚡ Ready</span>}
                {phase==='executing' && <div style={{ width:13, height:13, border:'2px solid #FF9900', borderTopColor:'transparent', borderRadius:'50%', animation:'fcSpin 0.7s linear infinite' }} />}
                {phase==='done'      && <CheckCircle size={14} color="#1d8102" />}
                {phase==='error'     && <span style={{ fontSize:10, color:'#d13212', fontWeight:700 }}>✕ Error</span>}
              </div>
            </div>
            <div style={{ fontSize:10.5, color:'var(--text3)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {finding.resource_id}{finding.region ? ` · ${finding.region}` : ''}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ padding:'8px 18px', borderTop:`1px solid ${ac.stripe}15`, background:`${ac.stripe}04`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:10, color:'#8d9191', fontFamily:'monospace' }}>{(finding.type||'').replace(/_/g,' ').toUpperCase()}</div>
          <div style={{ fontSize:10, color:ac.stripe, fontWeight:700 }}>{isOpen ? '▲ Collapse' : '▼ Expand & Fix'}</div>
        </div>
      </div>

      {/* Expandable drawer */}
      {isOpen && (
        <div style={{ background:'var(--bg2)', border:`1.5px solid ${ac.stripe}aa`, borderTop:`2px dashed ${ac.stripe}44`, borderRadius:'0 0 14px 14px', padding:'18px 20px 20px', boxShadow:`0 18px 48px ${ac.glow}, 0 4px 16px rgba(0,0,0,0.08)`, animation:'fcPop 0.22s ease' }}>

          {/* Idle — show dry run CTA */}
          {phase === 'idle' && (
            <div style={{ display:'flex', alignItems:'center', gap:14, animation:'fcSlide 0.18s ease' }}>
              <button onClick={doDryRun} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 22px', borderRadius:9, border:'none', background:`linear-gradient(135deg, ${ac.stripe}, ${ac.stripe}cc)`, color:'#fff', fontSize:12.5, fontWeight:800, cursor:'pointer', boxShadow:`0 4px 18px ${ac.stripe}44`, transition:'all 0.16s', whiteSpace:'nowrap' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 7px 24px ${ac.stripe}66` }}
                onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=`0 4px 18px ${ac.stripe}44` }}>
                <Play size={13} fill="#fff" /> Run Dry Run
              </button>
              <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
                <strong style={{ color:'#3d4f60', display:'block', marginBottom:2 }}>Safe preview mode</strong>
                Simulates the fix — no changes made to AWS until you approve
              </div>
            </div>
          )}

          {/* Planning */}
          {phase === 'planning' && (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:18, height:18, border:`2.5px solid ${ac.stripe}`, borderTopColor:'transparent', borderRadius:'50%', animation:'fcSpin 0.7s linear infinite', flexShrink:0 }} />
              <div>
                <div style={{ fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Generating fix plan…</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Analysing {finding.resource_id}</div>
              </div>
            </div>
          )}

          {/* Planned — show plan + execute button */}
          {phase === 'planned' && plan && (
            <div style={{ animation:'fcPop 0.22s ease' }}>
              {/* Plan box */}
              <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(224,123,0,0.05)', border:'1.5px solid rgba(224,123,0,0.28)', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:10, fontWeight:800, color:'#c07000', textTransform:'uppercase', letterSpacing:1.1 }}>📋 Dry Run Plan</span>
                  <div style={{ flex:1, height:1, background:'rgba(192,112,0,0.2)' }} />
                  <span style={{ fontSize:9, color:'#8d9191', background:'rgba(0,0,0,0.04)', padding:'2px 6px', borderRadius:4, border:'1px solid rgba(0,0,0,0.08)' }}>PREVIEW</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'5px 12px', fontSize:11.5 }}>
                  <span style={{ color:'#687078', fontWeight:600 }}>Action</span>
                  <span style={{ color:'#7a4b00', fontWeight:700 }}>{fmtAction(plan.action)}</span>
                  <span style={{ color:'#687078', fontWeight:600 }}>Reason</span>
                  <span style={{ color:'#3d4f60', lineHeight:1.6 }}>{plan.reason}</span>
                </div>
              </div>

              {/* Danger guard for irreversible actions */}
              {isDanger && (
                <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(209,50,18,0.06)', border:'1.5px solid rgba(209,50,18,0.25)', marginBottom:12, display:'flex', alignItems:'flex-start', gap:10 }}>
                  <input type="checkbox" id={`danger-${finding.id}`} checked={dangerOk} onChange={e => setDangerOk(e.target.checked)} style={{ marginTop:2, width:14, height:14, cursor:'pointer', accentColor:'#d13212' }} />
                  <div style={{ flex:1 }}>
                    <label htmlFor={`danger-${finding.id}`} style={{ fontSize:11.5, color:'#d13212', cursor:'pointer', lineHeight:1.6, fontWeight:600 }}>
                      ⚠️ I understand this action is <strong>irreversible</strong> and will permanently change my AWS account.
                    </label>
                    {NOT_ROLLBACKABLE_ACTIONS.has(plan?.action) && (
                      <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#8d4004', fontWeight:600 }}>
                        <span style={{ fontSize:12 }}>🚫</span>
                        <span>Cannot be rolled back — this action will <strong>not</strong> appear in the Rollback section.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={doExecute}
                  disabled={isDanger && !dangerOk}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 22px', borderRadius:9, border:'none', background: isDanger && !dangerOk ? '#b0b0b0' : 'linear-gradient(135deg, #FF9900, #ec8a00)', color: isDanger && !dangerOk ? '#fff' : '#0f1111', fontSize:12.5, fontWeight:800, cursor: isDanger && !dangerOk ? 'not-allowed' : 'pointer', boxShadow: isDanger && !dangerOk ? 'none' : '0 4px 16px rgba(255,153,0,0.45)', transition:'all 0.16s' }}
                  onMouseEnter={e => { if (!(isDanger && !dangerOk)) { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 7px 24px rgba(255,153,0,0.6)' }}}
                  onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 16px rgba(255,153,0,0.45)' }}>
                  <Zap size={13} />⚡ Apply Fix to AWS
                </button>
                <button onClick={e => { e.stopPropagation(); setPhase('idle'); setOpen(false); setPlan(null); setDangerOk(false) }} style={{ padding:'10px 16px', borderRadius:9, border:'1px solid var(--border)', background:'transparent', color:'var(--text3)', fontSize:11.5, cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Executing */}
          {phase === 'executing' && (
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', border:'3px solid rgba(255,153,0,0.15)', borderTopColor:'#FF9900', animation:'fcSpin 0.75s linear infinite', boxShadow:'0 0 14px rgba(255,153,0,0.25)', flexShrink:0 }} />
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:3 }}>Applying fix to AWS…</div>
                <div style={{ fontSize:10.5, color:'#8d9191' }}>Making live changes to <strong style={{ fontFamily:'monospace' }}>{finding.resource_id}</strong></div>
                <div style={{ fontSize:10, color:'#d13212', marginTop:4, fontWeight:600 }}>⚠ Do not close — changes are being applied</div>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <AlertTriangle size={20} color="#d13212" style={{ flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:'#d13212', marginBottom:2 }}>Execution Failed</div>
                <div style={{ fontSize:11, color:'#687078' }}>
                  {errorReason || 'Check that your AWS credentials have the required permissions, then retry.'}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setPhase('idle'); setPlan(null); setOpen(true); setErrorReason('') }} style={{ fontSize:11, fontWeight:700, color:ac.stripe, background:`${ac.stripe}12`, border:`1px solid ${ac.stripe}30`, borderRadius:7, padding:'6px 14px', cursor:'pointer', whiteSpace:'nowrap' }}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Manual Card (UNCHANGED) ───────────────────────────────────────────────────
function ManualCard({ finding }) {
  const ac = accent(finding.severity)
  const icon = svcIcon(finding.type)
  const [hovered, setHovered] = useState(false)
  const steps = finding.recommended_fix
    ? [finding.recommended_fix]
    : ['Review the resource in the AWS Console.', 'Apply recommended security hardening.', 'Re-run a scan to verify resolution.']

  return (
    <div style={{ borderRadius:14, overflow:'hidden', background:'var(--bg2)', border:`1.5px solid ${hovered ? ac.stripe+'aa' : ac.stripe+'30'}`, boxShadow: hovered ? `0 8px 28px ${ac.glow}, 0 2px 8px rgba(0,0,0,0.07)` : '0 2px 8px rgba(15,17,17,0.06)', transform: hovered ? 'translateY(-2px)' : 'none', transition:'all 0.22s ease' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ height:4, background:`linear-gradient(90deg, ${ac.stripe}, ${ac.stripe}66)` }} />
      <div style={{ padding:'14px 18px', display:'flex', gap:14 }}>
        <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, background:ac.light, border:`1.5px solid ${ac.stripe}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <div style={{ flex:1, fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtType(finding.type)}</div>
            <span style={{ fontSize:9, fontWeight:800, color:ac.tag, background:ac.tagBg, borderRadius:4, padding:'3px 7px', textTransform:'uppercase', border:`1px solid ${ac.tag}30`, flexShrink:0 }}>{finding.severity||'INFO'}</span>
            <span style={{ fontSize:9, fontWeight:700, color:'#5b9bd5', background:'rgba(91,155,213,0.1)', borderRadius:4, padding:'3px 7px', border:'1px solid rgba(91,155,213,0.2)', flexShrink:0 }}>MANUAL</span>
          </div>
          <div style={{ fontSize:10.5, color:'var(--text3)', fontFamily:'monospace', marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{finding.resource_id}{finding.region ? ` · ${finding.region}` : ''}</div>
          <div style={{ background:'rgba(91,155,213,0.07)', border:'1px solid rgba(91,155,213,0.22)', borderRadius:9, padding:'10px 14px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'#1a6296', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>📋 Manual Steps Required</div>
            {steps.map((s, i) => (
              <div key={i} style={{ display:'flex', gap:10, marginBottom: i < steps.length-1 ? 7 : 0, alignItems:'flex-start' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:'rgba(91,155,213,0.15)', border:'1px solid rgba(91,155,213,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#1a6296' }}>{i+1}</div>
                <div style={{ fontSize:11.5, color:'var(--text)', lineHeight:1.65 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:'8px 18px', borderTop:`1px solid ${ac.stripe}15`, background:`${ac.stripe}04`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:10, color:'#8d9191', fontFamily:'monospace' }}>{(finding.type||'').replace(/_/g,' ').toUpperCase()}</div>
        <div style={{ fontSize:10, color:'#5b9bd5', fontWeight:700 }}>🔧 Requires manual intervention</div>
      </div>
    </div>
  )
}

// ─── Main Section ──────────────────────────────────────────────────────────────
export default function RemediationSection({ dark, onNav }) {
  const { account } = useAuth()
  const { scanId: ctxScanId, refreshToken } = useScan()

  const isIam = account?.account_type === 'iam'
  const dbId  = isIam ? (account?.account_id ?? null) : (account?.id ?? null)

  const [scanId, setScanId]           = useState(null)
  const [findings, setFindings]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('auto')
  const [executedIds, setExecutedIds] = useState(new Set())
  const [filterSev, setFilterSev]     = useState('ALL')
  const [filterSvc, setFilterSvc]     = useState('ALL')
  const [searchQ, setSearchQ]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let sid = null
    try {
      const url = dbId != null
        ? `${API}/api/scan/history?account_id=${dbId}&limit=1`
        : `${API}/api/scan/history?limit=1`
      const hr = await axios.get(url)
      const dbLatest = hr.data?.data?.scans?.[0]?.scan_id
      sid = dbLatest || ctxScanId
    } catch {
      sid = ctxScanId
    }
    if (!sid) { setLoading(false); return }
    setScanId(sid)
    try {
      const [findingsRes, execsRes] = await Promise.all([
        axios.get(`${API}/api/execute/findings?scan_id=${sid}`),
        axios.get(`${API}/api/execute/executions?scan_id=${sid}`).catch(() => ({ data: { data: { executions: [] } } }))
      ])
      const findingsList = findingsRes.data?.data?.findings || []
      const execList     = execsRes.data?.data?.executions  || []
      const alreadyFixed = new Set(
        execList
          .filter(e => e.status === 'EXECUTED' || e.status === 'NOT_RECOVERABLE')
          .map(e => e.finding_id)
      )
      setExecutedIds(alreadyFixed)
      setFindings(findingsList)
    } catch { setFindings([]) }
    setLoading(false)
  }, [ctxScanId, dbId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (refreshToken === 0) return
    const t = setTimeout(() => load(), 1500)
    return () => clearTimeout(t)
  }, [refreshToken])

  const handleExecuted = useCallback(id => setExecutedIds(s => new Set([...s, id])), [])

  const autoFindings   = findings.filter(f => f.remediation_type === 'AUTO' && !executedIds.has(f.id))
  const manualFindings = findings.filter(f => f.remediation_type === 'MANUAL')

  const uniqueSvcs = [...new Set(
    (tab === 'auto' ? autoFindings : manualFindings).map(f => getServiceTag(f.type))
  )].sort()

  function applyFilters(list) {
    return list.filter(f => {
      if (filterSev !== 'ALL' && (f.severity||'').toUpperCase() !== filterSev) return false
      if (filterSvc !== 'ALL' && getServiceTag(f.type) !== filterSvc) return false
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase()
        if (!(f.type||'').toLowerCase().replace(/_/g,' ').includes(q) && !(f.resource_id||'').toLowerCase().includes(q)) return false
      }
      return true
    })
  }

  const filteredAuto   = applyFilters(autoFindings)
  const filteredManual = applyFilters(manualFindings)

  const totalFixed = executedIds.size
  const totalAll   = findings.length
  const fixedPct   = totalAll > 0 ? Math.round((totalFixed / totalAll) * 100) : 0

  return (
    <div style={{ fontFamily:"'Inter', -apple-system, sans-serif", display:'flex', flexDirection:'column', gap:14 }}>
      <style>{`@keyframes spin { to{transform:rotate(360deg)} } @keyframes remShimLoad { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:3 }}>
            <h1 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:0 }}>Remediation</h1>
            {scanId && (
              <>
                <span style={{ fontSize:9, fontWeight:700, color:'#1d8102', background:'rgba(29,128,2,0.09)', border:'1px solid rgba(29,128,2,0.22)', borderRadius:4, padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#1d8102', display:'inline-block' }} />
                  {autoFindings.length} auto-fixable
                </span>
                <span style={{ fontSize:9, fontWeight:700, color:'#5b9bd5', background:'rgba(91,155,213,0.09)', border:'1px solid rgba(91,155,213,0.22)', borderRadius:4, padding:'2px 8px' }}>
                  📋 {manualFindings.length} manual
                </span>
                {totalFixed > 0 && (
                  <span style={{ fontSize:9, fontWeight:700, color:'#8B5CF6', background:'rgba(139,92,246,0.09)', border:'1px solid rgba(139,92,246,0.22)', borderRadius:4, padding:'2px 8px' }}>
                    ✓ {totalFixed} fixed
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--text3)' }}>Auto-fix & manual advisory for security findings</div>
        </div>
        {scanId && (
          <button onClick={load} disabled={loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:7, background:'var(--bg2)', color:'var(--text2)', border:'1px solid var(--border)', cursor:loading?'not-allowed':'pointer', fontSize:11, fontWeight:600, transition:'all 0.15s' }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
            Refresh
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:80, color:'var(--text3)', gap:10, alignItems:'center' }}>
          <span style={{ width:18, height:18, border:'2.5px solid #FF9900', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
          Loading findings…
        </div>
      )}

      {/* Empty state */}
      {!loading && !scanId && <EmptyPipeline />}

      {/* Findings loaded */}
      {!loading && scanId && (
        <>
          {/* Mini pipeline progress bar */}
          {totalAll > 0 && (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:16, boxShadow:'var(--card-shadow)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                <Wrench size={12} color="#FF9900" />
                <span style={{ fontSize:10, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8 }}>Pipeline Progress</span>
              </div>
              <div style={{ flex:1, height:6, borderRadius:4, background:'var(--border)', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#1d8102,#3fb950)', width:`${fixedPct}%`, transition:'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text3)', flexShrink:0, fontFamily:'monospace' }}>{totalFixed}/{totalAll} fixed ({fixedPct}%)</span>
              <div style={{ display:'flex', gap:8 }}>
                {[
                  { n: findings.filter(f=>(f.severity||'').toUpperCase()==='CRITICAL' && !executedIds.has(f.id)).length, color:'#d13212', label:'C' },
                  { n: findings.filter(f=>(f.severity||'').toUpperCase()==='HIGH' && !executedIds.has(f.id)).length,     color:'#e07b00', label:'H' },
                ].filter(s => s.n > 0).map(s => (
                  <span key={s.label} style={{ fontSize:9, fontWeight:800, color:s.color, background:`${s.color}10`, border:`1px solid ${s.color}28`, borderRadius:4, padding:'2px 7px', fontFamily:'monospace' }}>
                    {s.n} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── TABS ── */}
          <div style={{ display:'flex', gap:6, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
            {[
              { key:'auto',   label:'⚡ Auto-Fix', count: autoFindings.length,   activeColor:'#FF9900',  activeBg:'rgba(255,153,0,0.1)' },
              { key:'manual', label:'📋 Manual',   count: manualFindings.length, activeColor:'#5b9bd5', activeBg:'rgba(91,155,213,0.1)' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                border:'none', background:tab===t.key ? t.activeBg : 'transparent',
                cursor:'pointer', fontSize:12.5, fontWeight:tab===t.key?800:500,
                color:tab===t.key ? t.activeColor : 'var(--text3)',
                borderBottom:tab===t.key?`2.5px solid ${t.activeColor}`:'2.5px solid transparent',
                marginBottom:-1, transition:'all 0.14s', borderRadius:'6px 6px 0 0',
              }}>
                {t.label}
                <span style={{ fontSize:10, fontWeight:800, background:tab===t.key?t.activeColor:'var(--border)', color:tab===t.key?'#fff':'var(--text3)', borderRadius:8, padding:'1px 6px', minWidth:18, textAlign:'center' }}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* ── FILTER BAR ── */}
          {(autoFindings.length > 0 || manualFindings.length > 0) && (
            <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, padding:'12px 16px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'var(--card-shadow)' }}>
              <div style={{ position:'relative', flex:'1 1 160px', minWidth:140 }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'var(--text3)', pointerEvents:'none' }}>🔍</span>
                <input type="text" placeholder="Search name or resource…" value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ paddingLeft:28, paddingRight:10, paddingTop:6, paddingBottom:6, border:'1px solid var(--border)', borderRadius:7, background:'var(--bg)', color:'var(--text)', fontSize:11.5, width:'100%', outline:'none' }} />
              </div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(s => {
                  const c = {CRITICAL:'#d13212',HIGH:'#e07b00',MEDIUM:'#c8960c',LOW:'#3ea97c'}[s]||'#8d9191'
                  const active = filterSev === s
                  return <button key={s} onClick={() => setFilterSev(s)} style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${active?c:'var(--border)'}`, background:active?(s==='ALL'?'#FF990020':`${c}18`):'transparent', color:active?(s==='ALL'?'#e07b00':c):'var(--text3)', fontSize:10.5, fontWeight:active?700:500, cursor:'pointer', transition:'all 0.12s' }}>{s==='ALL'?'All Severity':s.charAt(0)+s.slice(1).toLowerCase()}</button>
                })}
              </div>
              <select value={filterSvc} onChange={e => setFilterSvc(e.target.value)} style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${filterSvc!=='ALL'?'#FF9900':'var(--border)'}`, background:'var(--bg)', color:filterSvc!=='ALL'?'#e07b00':'var(--text)', fontSize:11.5, cursor:'pointer', outline:'none' }}>
                <option value="ALL">All Services</option>
                {uniqueSvcs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(filterSev!=='ALL'||filterSvc!=='ALL'||searchQ) && (
                <button onClick={() => { setFilterSev('ALL'); setFilterSvc('ALL'); setSearchQ('') }} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid rgba(209,50,18,0.3)', background:'rgba(209,50,18,0.07)', color:'#d13212', fontSize:10.5, fontWeight:700, cursor:'pointer' }}>✕ Clear</button>
              )}
              <div style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto' }}>
                {tab==='auto'?filteredAuto.length:filteredManual.length} of {tab==='auto'?autoFindings.length:manualFindings.length} shown
              </div>
            </div>
          )}

          {/* Auto tab */}
          {tab === 'auto' && (
            filteredAuto.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
                  {autoFindings.length === 0
                    ? <><CheckCircle size={36} color="#1d8102" style={{ marginBottom:12 }} /><div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6 }}>All auto-fixes applied!</div><div style={{ fontSize:12 }}>Go to Rollback to review or undo executed fixes.</div></>
                    : <><div style={{ fontSize:32, marginBottom:8 }}>🔍</div><div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>No matches</div><div style={{ fontSize:12 }}>Try adjusting your filters</div><button onClick={() => { setFilterSev('ALL'); setFilterSvc('ALL'); setSearchQ('') }} style={{ marginTop:12, padding:'6px 14px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'#FF9900', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>Clear Filters</button></>
                  }
                </div>
              : <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {filteredAuto.map(f => <FindingCard key={f.id} finding={f} scanId={scanId} onExecuted={handleExecuted} />)}
                </div>
          )}

          {/* Manual tab */}
          {tab === 'manual' && (
            filteredManual.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
                  <CheckCircle size={36} color="#5b9bd5" style={{ marginBottom:12 }} />
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6 }}>No manual findings</div>
                  <div style={{ fontSize:12 }}>All findings are handled automatically.</div>
                </div>
              : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {filteredManual.map(f => <ManualCard key={f.id} finding={f} />)}
                </div>
          )}
        </>
      )}
    </div>
  )
}
