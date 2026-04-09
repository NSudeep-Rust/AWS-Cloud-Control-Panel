import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'
import { Wrench, CheckCircle, AlertTriangle, Clock, Play, Zap, RotateCcw, Shield } from 'lucide-react'
import { getServiceTag } from '@/utils/getModuleGroup'

const API = 'http://localhost:8000'

// Actions that are irreversible — show a danger checkbox before allowing execute
const DANGER_ACTIONS = new Set([
  'TERMINATE_EC2_INSTANCE', 'FORCE_TERMINATE_EC2_INSTANCE',
  'DELETE_DEFAULT_VPC', 'DELETE_UNUSED_IAM_USER', 'DELETE_ACCESS_KEY',
])

// Actions where rollback is impossible — inform user BEFORE they execute
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

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyPipeline() {
  const STEPS = [
    { icon:'🔍', label:'DETECT',  sub:'Scan findings',    color:'#e07b00' },
    { icon:'📋', label:'PLAN',    sub:'Generate fix plan', color:'#FF9900' },
    { icon:'⚡', label:'EXECUTE', sub:'Apply to AWS',      color:'#1d8102' },
    { icon:'✅', label:'FIXED',   sub:'Mark resolved',     color:'#0972d3' },
  ]
  return (
    <div style={{ background:'#fff', border:'1px solid rgba(255,153,0,0.2)', borderTop:'4px solid #FF9900', borderRadius:14, padding:'48px', boxShadow:'0 4px 24px rgba(255,153,0,0.10)', display:'flex', flexDirection:'column', gap:40, minHeight:'calc(100vh - 190px)' }}>
      <style>{`
        @keyframes stageActive { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04);box-shadow:0 0 18px rgba(255,153,0,0.3)} }
        @keyframes dotFlow { 0%{left:-12px;opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{left:calc(100% + 12px);opacity:0} }
        @keyframes remBlink { 0%,100%{opacity:1} 50%{opacity:0.15} }
      `}</style>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:12, fontWeight:800, color:'#FF9900', letterSpacing:1.6, textTransform:'uppercase' }}>⚡ Auto-Remediation Pipeline</div>
        <div style={{ flex:1, height:1.5, background:'rgba(255,153,0,0.18)' }} />
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'#8d9191' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#1d8102', display:'inline-block', animation:'remBlink 1.2s ease infinite' }} />
          8 service engines online
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', flex:1, gap:0 }}>
        {STEPS.map((step, i) => (
          <div key={step.label} style={{ display:'flex', alignItems:'center', flex:1 }}>
            <div style={{ flex:1, textAlign:'center', padding:'44px 16px', background:`${step.color}07`, border:`1px solid ${step.color}35`, borderRadius:14, animation:`stageActive 3s ease ${i*0.75}s infinite`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
              <div style={{ fontSize:44, marginBottom:12 }}>{step.icon}</div>
              <div style={{ fontSize:11, fontWeight:800, color:step.color, letterSpacing:1.2, marginBottom:5, textTransform:'uppercase' }}>{step.label}</div>
              <div style={{ fontSize:11, color:'#8d9191' }}>{step.sub}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width:40, flexShrink:0, position:'relative', height:2.5, background:'rgba(255,153,0,0.15)' }}>
                <div style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', width:10, height:10, borderRadius:'50%', background:STEPS[i+1].color, boxShadow:`0 0 8px ${STEPS[i+1].color}`, animation:`dotFlow 2.8s ease ${i*0.7}s infinite` }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop:'1px solid rgba(35,47,62,0.07)', paddingTop:24, fontSize:12, color:'#8d9191', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:'#FF990015', border:'1px solid #FF990030', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🔍</div>
        Run a security scan from the <strong style={{ color:'#e07b00' }}>Scanner</strong> to auto-load fixable findings into this pipeline.
      </div>
    </div>
  )
}

// ─── FindingCard — 2-step: Dry Run → Execute ────────────────────────────────
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

  // cleanup on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  // smooth exit when done
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
      // Step 1: kick off the LIVE execution
      await axios.post(`${API}/api/execute/`, {
        scan_id: scanId, finding_ids: [finding.id], mode: 'LIVE'
      })

      // Step 2: poll for result, auto-confirming if backend asks for approval
      let attempts = 0
      const confirmed = new Set()
      pollRef.current = setInterval(async () => {
        attempts++
        // 45 × 2s = 90s total timeout
        if (attempts > 45) {
          clearInterval(pollRef.current)
          setErrorReason('Execution timed out — AWS did not respond within 90 seconds.')
          setPhase('error')
          return
        }
        try {
          const r = await axios.get(`${API}/api/execute/executions?scan_id=${scanId}`)
          // Newest execution for this finding (multiple may exist after re-runs)
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
          // Backend requires approval — user already confirmed via danger checkbox, so auto-confirm
          if (mine.status === 'REQUIRE_APPROVAL' && mine.approval_token && !confirmed.has(mine.approval_token)) {
            confirmed.add(mine.approval_token)
            attempts = 0 // reset clock after confirmation
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
      <div onClick={() => !['executing'].includes(phase) && setOpen(x => !x)} style={{ background:'#fff', border:`1.5px solid ${isOpen||hovered ? ac.stripe+'aa' : ac.stripe+'30'}`, borderRadius: isOpen ? '14px 14px 0 0' : 14, overflow:'hidden', cursor:'pointer', boxShadow: isOpen ? `0 0 0 2px ${ac.stripe}20, 0 8px 32px ${ac.glow}` : hovered ? `0 8px 28px ${ac.glow}, 0 2px 8px rgba(0,0,0,0.07)` : '0 2px 8px rgba(15,17,17,0.06)', transition:'all 0.22s ease', userSelect:'none' }}>
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
              <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:700, color:'#0f1111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtType(finding.type)}</div>
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
            <div style={{ fontSize:10.5, color:'#565959', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
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
        <div style={{ background:'#fffcf5', border:`1.5px solid ${ac.stripe}aa`, borderTop:`2px dashed ${ac.stripe}44`, borderRadius:'0 0 14px 14px', padding:'18px 20px 20px', boxShadow:`0 18px 48px ${ac.glow}, 0 4px 16px rgba(0,0,0,0.08)`, animation:'fcPop 0.22s ease' }}>

          {/* Idle — show dry run CTA */}
          {phase === 'idle' && (
            <div style={{ display:'flex', alignItems:'center', gap:14, animation:'fcSlide 0.18s ease' }}>
              <button onClick={doDryRun} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 22px', borderRadius:9, border:'none', background:`linear-gradient(135deg, ${ac.stripe}, ${ac.stripe}cc)`, color:'#fff', fontSize:12.5, fontWeight:800, cursor:'pointer', boxShadow:`0 4px 18px ${ac.stripe}44`, transition:'all 0.16s', whiteSpace:'nowrap' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 7px 24px ${ac.stripe}66` }}
                onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=`0 4px 18px ${ac.stripe}44` }}>
                <Play size={13} fill="#fff" /> Run Dry Run
              </button>
              <div style={{ fontSize:11, color:'#687078', lineHeight:1.6 }}>
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
                <div style={{ fontSize:12.5, fontWeight:700, color:'#0f1111' }}>Generating fix plan…</div>
                <div style={{ fontSize:10, color:'#8d9191', marginTop:2 }}>Analysing {finding.resource_id}</div>
              </div>
            </div>
          )}

          {/* Planned — show plan + execute button */}
          {phase === 'planned' && plan && (
            <div style={{ animation:'fcPop 0.22s ease' }}>
              {/* Plan box */}
              <div style={{ padding:'12px 16px', borderRadius:10, background:'#fffbef', border:'1.5px solid rgba(224,123,0,0.28)', marginBottom:14 }}>
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
                <button onClick={e => { e.stopPropagation(); setPhase('idle'); setOpen(false); setPlan(null); setDangerOk(false) }} style={{ padding:'10px 16px', borderRadius:9, border:'1px solid rgba(35,47,62,0.15)', background:'transparent', color:'#565959', fontSize:11.5, cursor:'pointer' }}>
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
                <div style={{ fontSize:13, fontWeight:800, color:'#0f1111', marginBottom:3 }}>Applying fix to AWS…</div>
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

// ─── Manual finding card ─────────────────────────────────────────────────────
function ManualCard({ finding }) {
  const ac = accent(finding.severity)
  const icon = svcIcon(finding.type)
  const [hovered, setHovered] = useState(false)
  const steps = finding.recommended_fix
    ? [finding.recommended_fix]
    : ['Review the resource in the AWS Console.', 'Apply recommended security hardening.', 'Re-run a scan to verify resolution.']

  return (
    <div style={{ borderRadius:14, overflow:'hidden', background:'#fff', border:`1.5px solid ${hovered ? ac.stripe+'aa' : ac.stripe+'30'}`, boxShadow: hovered ? `0 8px 28px ${ac.glow}, 0 2px 8px rgba(0,0,0,0.07)` : '0 2px 8px rgba(15,17,17,0.06)', transform: hovered ? 'translateY(-2px)' : 'none', transition:'all 0.22s ease' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ height:4, background:`linear-gradient(90deg, ${ac.stripe}, ${ac.stripe}66)` }} />
      <div style={{ padding:'14px 18px', display:'flex', gap:14 }}>
        <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, background:ac.light, border:`1.5px solid ${ac.stripe}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <div style={{ flex:1, fontSize:14, fontWeight:700, color:'#0f1111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtType(finding.type)}</div>
            <span style={{ fontSize:9, fontWeight:800, color:ac.tag, background:ac.tagBg, borderRadius:4, padding:'3px 7px', textTransform:'uppercase', border:`1px solid ${ac.tag}30`, flexShrink:0 }}>{finding.severity||'INFO'}</span>
            <span style={{ fontSize:9, fontWeight:700, color:'#5b9bd5', background:'rgba(91,155,213,0.1)', borderRadius:4, padding:'3px 7px', border:'1px solid rgba(91,155,213,0.2)', flexShrink:0 }}>MANUAL</span>
          </div>
          <div style={{ fontSize:10.5, color:'#565959', fontFamily:'monospace', marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{finding.resource_id}{finding.region ? ` · ${finding.region}` : ''}</div>
          <div style={{ background:'#f0f7ff', border:'1px solid rgba(91,155,213,0.22)', borderRadius:9, padding:'10px 14px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'#1a6296', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>📋 Manual Steps Required</div>
            {steps.map((s, i) => (
              <div key={i} style={{ display:'flex', gap:10, marginBottom: i < steps.length-1 ? 7 : 0, alignItems:'flex-start' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, background:'rgba(91,155,213,0.15)', border:'1px solid rgba(91,155,213,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#1a6296' }}>{i+1}</div>
                <div style={{ fontSize:11.5, color:'#3d4f60', lineHeight:1.65 }}>{s}</div>
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

// ─── Main Section ────────────────────────────────────────────────────────────
export default function RemediationSection({ dark, onNav }) {
  const { account } = useAuth()
  const { scanId: ctxScanId, refreshToken } = useScan()

  const [scanId, setScanId]           = useState(null)
  const [findings, setFindings]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('auto')
  const [executedIds, setExecutedIds] = useState(new Set())
  const [filterSev, setFilterSev]     = useState('ALL')
  const [filterSvc, setFilterSvc]     = useState('ALL')
  const [searchQ, setSearchQ]         = useState('')

  // ── Load findings ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    // Always resolve the LATEST scan, whether manual or scheduled.
    // ctxScanId = last manual scan from this browser session.
    // History API = most-recent scan in DB (may be newer scheduled scan).
    let sid = null
    try {
      const hr = await axios.get(`${API}/api/scan/history`)
      const dbLatest = hr.data?.data?.scans?.[0]?.scan_id
      // Prefer DB latest (may be a newer scheduled scan) over ctxScanId
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
  }, [ctxScanId])

  // On mount + whenever ctxScanId changes (new manual scan)
  useEffect(() => { load() }, [load])

  // Auto-refresh when backend broadcasts execution_complete / scan_complete
  useEffect(() => {
    if (refreshToken === 0) return
    // 1.5s delay so backend finishes committing before we re-fetch
    const t = setTimeout(() => load(), 1500)
    return () => clearTimeout(t)
  }, [refreshToken])

  const handleExecuted = useCallback(id => setExecutedIds(s => new Set([...s, id])), [])

  const autoFindings   = findings.filter(f => f.remediation_type === 'AUTO' && !executedIds.has(f.id))
  const manualFindings = findings.filter(f => f.remediation_type === 'MANUAL')

  // Build unique service tags from active tab findings using canonical mapping
  const uniqueSvcs = [...new Set(
    (tab === 'auto' ? autoFindings : manualFindings).map(f => getServiceTag(f.type))
  )].sort()

  function applyFilters(list) {
    return list.filter(f => {
      if (filterSev !== 'ALL' && (f.severity||'').toUpperCase() !== filterSev) return false
      // Use canonical getServiceTag for match — fixes broken .includes() mismatches
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
  const border = '#e5e8ed'
  const text   = '#0f1111'
  const text2  = '#565959'

  return (
    <div style={{ fontFamily:"'Inter', -apple-system, sans-serif" }}>
      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1d6a4a,#3ea97c)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Wrench size={16} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:text, margin:0 }}>Remediation</h1>
            <div style={{ fontSize:11, color:text2 }}>Auto-fix & manual advisory for security findings</div>
          </div>
        </div>
        {scanId && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'#1d8102', background:'rgba(29,128,2,0.1)', border:'1px solid rgba(29,128,2,0.2)', borderRadius:4, padding:'3px 8px', fontWeight:600 }}>● {autoFindings.length} auto-fixable</span>
            <span style={{ fontSize:10, color:'#5b9bd5', background:'rgba(91,155,213,0.1)', border:'1px solid rgba(91,155,213,0.2)', borderRadius:4, padding:'3px 8px', fontWeight:600 }}>{manualFindings.length} manual</span>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:80, color:text2, gap:10, alignItems:'center' }}>
          <span style={{ width:18, height:18, border:'2.5px solid #FF9900', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
          Loading findings…
        </div>
      )}

      {!loading && !scanId && <EmptyPipeline />}

      {!loading && scanId && (
        <>
          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:18, borderBottom:`1px solid ${border}` }}>
            {[{ key:'auto', label:`⚡ Auto-Fix (${autoFindings.length})` }, { key:'manual', label:`📋 Manual (${manualFindings.length})` }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'8px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, fontWeight:tab===t.key?700:400, color:tab===t.key?'#FF9900':text2, borderBottom:tab===t.key?'2.5px solid #FF9900':'2.5px solid transparent', marginBottom:-1, transition:'all 0.12s' }}>{t.label}</button>
            ))}
          </div>

          {/* Filter bar */}
          {(autoFindings.length > 0 || manualFindings.length > 0) && (
            <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, padding:'12px 16px', marginBottom:16, background:'#fafafa', border:`1px solid ${border}`, borderRadius:10 }}>
              <div style={{ position:'relative', flex:'1 1 160px', minWidth:140 }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:11, color:text2, pointerEvents:'none' }}>🔍</span>
                <input type="text" placeholder="Search name or resource…" value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ paddingLeft:28, paddingRight:10, paddingTop:6, paddingBottom:6, border:`1px solid ${border}`, borderRadius:7, background:'#fff', color:text, fontSize:11.5, width:'100%', outline:'none' }} />
              </div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(s => {
                  const c = {CRITICAL:'#d13212',HIGH:'#e07b00',MEDIUM:'#c8960c',LOW:'#3ea97c'}[s]||'#8d9191'
                  const active = filterSev === s
                  return <button key={s} onClick={() => setFilterSev(s)} style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${active?c:border}`, background:active?(s==='ALL'?'#FF990020':`${c}18`):'transparent', color:active?(s==='ALL'?'#e07b00':c):text2, fontSize:10.5, fontWeight:active?700:500, cursor:'pointer', transition:'all 0.12s' }}>{s==='ALL'?'All Severity':s.charAt(0)+s.slice(1).toLowerCase()}</button>
                })}
              </div>
              <select value={filterSvc} onChange={e => setFilterSvc(e.target.value)} style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${filterSvc!=='ALL'?'#FF9900':border}`, background:'#fff', color:filterSvc!=='ALL'?'#e07b00':text, fontSize:11.5, cursor:'pointer', outline:'none' }}>
                <option value="ALL">All Services</option>
                {uniqueSvcs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(filterSev!=='ALL'||filterSvc!=='ALL'||searchQ) && (
                <button onClick={() => { setFilterSev('ALL'); setFilterSvc('ALL'); setSearchQ('') }} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid rgba(209,50,18,0.3)', background:'rgba(209,50,18,0.07)', color:'#d13212', fontSize:10.5, fontWeight:700, cursor:'pointer' }}>✕ Clear</button>
              )}
              <div style={{ fontSize:10, color:text2, marginLeft:'auto' }}>
                {tab==='auto'?filteredAuto.length:filteredManual.length} of {tab==='auto'?autoFindings.length:manualFindings.length} shown
              </div>
            </div>
          )}

          {/* Auto tab */}
          {tab === 'auto' && (
            filteredAuto.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:text2 }}>
                  {autoFindings.length === 0
                    ? <><CheckCircle size={36} color="#1d8102" style={{ marginBottom:12 }} /><div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:6 }}>All auto-fixes applied!</div><div style={{ fontSize:12 }}>Go to Rollback to review or undo executed fixes.</div></>
                    : <><div style={{ fontSize:32, marginBottom:8 }}>🔍</div><div style={{ fontSize:14, fontWeight:700, color:text, marginBottom:4 }}>No matches</div><div style={{ fontSize:12 }}>Try adjusting your filters</div><button onClick={() => { setFilterSev('ALL'); setFilterSvc('ALL'); setSearchQ('') }} style={{ marginTop:12, padding:'6px 14px', borderRadius:7, border:`1px solid ${border}`, background:'transparent', color:'#FF9900', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>Clear Filters</button></>
                  }
                </div>
              : <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {filteredAuto.map(f => <FindingCard key={f.id} finding={f} scanId={scanId} onExecuted={handleExecuted} />)}
                </div>
          )}

          {/* Manual tab */}
          {tab === 'manual' && (
            filteredManual.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:text2 }}>
                  <CheckCircle size={36} color="#5b9bd5" style={{ marginBottom:12 }} />
                  <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:6 }}>No manual findings</div>
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
