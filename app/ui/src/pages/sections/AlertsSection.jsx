import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import axios from 'axios'
import { driftAPI } from '@/api'
import { Bell, CheckCircle, ChevronDown, RefreshCcw, ShieldAlert, Radio, Square, Wrench } from 'lucide-react'

const API = 'http://localhost:8000'

// ─── Severity config ──────────────────────────────────────────────────────────
const SEV = {
  CRITICAL: { color:'#d13212', bg:'rgba(209,50,18,0.08)', border:'rgba(209,50,18,0.3)',  glow:'rgba(209,50,18,0.2)',  badgeBg:'rgba(209,50,18,0.12)', icon:'🚨' },
  HIGH:     { color:'#e07b00', bg:'rgba(224,123,0,0.07)', border:'rgba(224,123,0,0.28)', glow:'rgba(224,123,0,0.15)', badgeBg:'rgba(224,123,0,0.12)', icon:'⚠️' },
}
const sev = s => SEV[s?.toUpperCase()] || SEV.HIGH

// ─── Human-readable descriptions ─────────────────────────────────────────────
const DESCRIPTIONS = {
  IAM_USER_ADMIN_POLICY:           'IAM user has the AdministratorAccess policy attached, granting unrestricted access to all AWS services and resources.',
  IAM_ADMIN_USER:                  'An IAM user exists with administrator-level permissions. This poses significant security risk if compromised.',
  IAM_ROLE_ADMIN_POLICY:           'An IAM role has been granted administrator-level permissions. Restrict this to only what the role needs.',
  IAM_POLICY_FULL_ADMIN:           'A managed IAM policy grants full administrative access. This violates the principle of least privilege.',
  REMOVE_INLINE_WILDCARD_POLICY:   'An IAM entity has an inline policy with wildcard actions (*) granting overly broad permissions.',
  PUBLIC_S3_BUCKET:                'S3 bucket is publicly accessible. This may expose sensitive data to anonymous internet access.',
  S3_PUBLIC_ACL:                   'S3 bucket has a public ACL configured, allowing unauthenticated access to bucket contents.',
  S3_BLOCK_PUBLIC_ACCESS_DISABLED: 'S3 bucket does not have Block Public Access settings enabled, allowing public configurations.',
  PUBLIC_SECURITY_GROUP:           'EC2 security group allows unrestricted inbound traffic from 0.0.0.0/0 (the entire internet).',
  SECURITY_GROUP_UNRESTRICTED_SSH: 'Security group permits SSH (port 22) access from any IP address, creating remote access risk.',
  SECURITY_GROUP_UNRESTRICTED_RDP: 'Security group permits RDP (port 3389) access from any IP address.',
  EC2_INSTANCE_RUNNING:            'EC2 instance is currently running. If unmonitored, it may be consuming unnecessary resources.',
  EC2_INSTANCE_STOPPED:            'EC2 instance is in a stopped state but still incurring EBS storage costs.',
  EC2_PUBLIC_ELASTIC_IP:           'An Elastic IP is attached to a publicly accessible EC2 instance.',
  CLOUDTRAIL_DISABLED:             'AWS CloudTrail is disabled in this region. All API activity is unlogged, making audit impossible.',
  VPC_FLOW_LOGS_DISABLED:          'VPC Flow Logs are not enabled. Network traffic cannot be monitored or audited.',
}
const ACTIONS = {
  DETACH_ADMIN_POLICY:          '🔧 Detach AdministratorAccess policy → go to Remediation for auto-fix',
  BLOCK_PUBLIC_S3:              '🔧 Enable S3 Block Public Access settings → go to Remediation',
  STOP_EC2_INSTANCE:            '🔧 Stop the running EC2 instance → go to Remediation',
  FORCE_TERMINATE_EC2_INSTANCE: '🔧 Directly terminate the running instance → go to Remediation',
  TERMINATE_EC2_INSTANCE:       '🔧 Terminate stopped EC2 instance → go to Remediation',
  REVOKE_UNRESTRICTED_SSH:      '🔧 Remove unrestricted SSH rule → go to Remediation',
  REVOKE_UNRESTRICTED_RDP:      '🔧 Remove unrestricted RDP rule → go to Remediation',
  REMOVE_ELASTIC_IP:            '🔧 Disassociate and release the public Elastic IP',
  DEFAULT:                      '📋 Review in Remediation section → apply the recommended fix',
}
const getDesc   = t => DESCRIPTIONS[t] || `Security finding of type ${t} detected by the live threat monitor.`
const getAction = a => ACTIONS[a] || ACTIONS.DEFAULT

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso), now = new Date(), diff = now - d
  if (diff < 60000)    return 'Just now'
  if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
}

// ─── CSS animations ───────────────────────────────────────────────────────────
const STYLES = `
  @keyframes alSpin    { to{transform:rotate(360deg)} }
  @keyframes alPulse1  { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.55} 50%{transform:translate(-50%,-50%) scale(1.18);opacity:0.2} }
  @keyframes alPulse2  { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.35} 50%{transform:translate(-50%,-50%) scale(1.3);opacity:0.1} }
  @keyframes alPulse3  { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.18} 50%{transform:translate(-50%,-50%) scale(1.42);opacity:0.05} }
  @keyframes alFloat   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes alBlink   { 0%,100%{opacity:1} 50%{opacity:0.15} }
  @keyframes alSlide   { 0%{opacity:0;transform:translateX(-12px)} 100%{opacity:1;transform:none} }
  @keyframes alDrop    { 0%{opacity:0;transform:translateY(-8px)} 100%{opacity:1;transform:none} }
  @keyframes alShimmer { 0%{left:-80px} 100%{left:calc(100%+80px)} }
  @keyframes alCountIn { 0%{transform:scale(0.3);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
  @keyframes livePulse { 0%{box-shadow:0 0 0 0 rgba(29,128,2,0.7)} 70%{box-shadow:0 0 0 10px rgba(29,128,2,0)} 100%{box-shadow:0 0 0 0 rgba(29,128,2,0)} }
  @keyframes radarBeam { to{transform:rotate(360deg)} }
  @keyframes orbit0    { from{transform:rotate(-40deg) translateX(118px) rotate(40deg)}   to{transform:rotate(320deg) translateX(118px) rotate(-320deg)} }
  @keyframes orbit1    { from{transform:rotate(40deg)  translateX(118px) rotate(-40deg)}  to{transform:rotate(400deg) translateX(118px) rotate(-400deg)} }
  @keyframes orbit2    { from{transform:rotate(120deg) translateX(118px) rotate(-120deg)} to{transform:rotate(480deg) translateX(118px) rotate(-480deg)} }
  @keyframes orbit3    { from{transform:rotate(200deg) translateX(118px) rotate(-200deg)} to{transform:rotate(560deg) translateX(118px) rotate(-560deg)} }
  @keyframes orbit4    { from{transform:rotate(280deg) translateX(118px) rotate(-280deg)} to{transform:rotate(640deg) translateX(118px) rotate(-640deg)} }
`

// ─── Radar hero (shown while no findings) ─────────────────────────────────────
function HeroAnimation({ monitorRunning, onToggle, toggling }) {
  const ORBS = [
    { emoji:'🔐', anim:'orbit0', delay:'0s',   dur:'7s'  },
    { emoji:'🛡️', anim:'orbit1', delay:'1.4s', dur:'9s'  },
    { emoji:'🔑', anim:'orbit2', delay:'0.7s', dur:'8s'  },
    { emoji:'⚡', anim:'orbit3', delay:'2.1s', dur:'6.5s'},
    { emoji:'🌐', anim:'orbit4', delay:'1s',   dur:'10s' },
  ]
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', padding:'60px 40px', minHeight:400 }}>
      {/* Grid background */}
      <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(209,50,18,0.04) 1px, transparent 1px),linear-gradient(90deg,rgba(209,50,18,0.04) 1px,transparent 1px)`, backgroundSize:'40px 40px', borderRadius:14 }} />

      {/* Pulsing rings */}
      <div style={{ position:'absolute', top:'50%', left:'50%' }}>
        {[{ s:160, a:'alPulse1', d:'2.8s', dl:'0s',   c:'rgba(209,50,18,0.38)' },
          { s:210, a:'alPulse2', d:'3.6s', dl:'0.7s', c:'rgba(209,50,18,0.15)' },
          { s:260, a:'alPulse3', d:'4.5s', dl:'1.4s', c:'rgba(209,50,18,0.08)' }].map((r,i) => (
          <div key={i} style={{ position:'absolute', width:r.s*2, height:r.s*2, borderRadius:'50%', border:`1.5px solid ${r.c}`, top:0, left:0, transform:'translate(-50%,-50%)', animation:`${r.a} ${r.d} ease-in-out ${r.dl} infinite` }} />
        ))}
      </div>

      {/* Radar sweep */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:240, height:240, borderRadius:'50%', overflow:'hidden', zIndex:1 }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', width:120, height:2, background:'linear-gradient(90deg,rgba(209,50,18,0.75),transparent)', transformOrigin:'0 50%', animation:`radarBeam ${monitorRunning?2:3.5}s linear infinite` }} />
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid rgba(209,50,18,0.25)' }} />
      </div>

      {/* Orbiting icons */}
      <div style={{ position:'absolute', top:'50%', left:'50%', zIndex:2 }}>
        {ORBS.map((o,i) => (
          <div key={i} style={{ position:'absolute', top:0, left:0, transform:'translate(-50%,-50%)', animation:`${o.anim} ${o.dur} linear ${o.delay} infinite`, fontSize:22 }}>{o.emoji}</div>
        ))}
      </div>

      {/* Center content */}
      <div style={{ position:'relative', zIndex:3, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div style={{ width:120, height:120, borderRadius:'50%', background:'linear-gradient(135deg,#1a0a0a,#2d1010)', border:`2.5px solid ${monitorRunning?'rgba(209,50,18,0.9)':'rgba(209,50,18,0.5)'}`, boxShadow:`0 0 0 10px rgba(209,50,18,0.09),0 0 0 20px rgba(209,50,18,0.04),0 12px 40px rgba(209,50,18,${monitorRunning?0.4:0.25})`, display:'flex', alignItems:'center', justifyContent:'center', animation:'alFloat 4s ease-in-out infinite' }}>
          <ShieldAlert size={52} color="#d13212" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize:26, fontWeight:900, color:'#0f1111', marginBottom:8 }}>🔔 Alerts Center</div>
          <div style={{ fontSize:13, color:'#565959', lineHeight:1.7, maxWidth:360, marginBottom:16 }}>
            {monitorRunning
              ? <><strong style={{ color:'#d13212' }}>CRITICAL</strong> &amp; <strong style={{ color:'#e07b00' }}>HIGH</strong> security alerts surface here automatically. Monitoring your AWS environment live.</>
              : <>Real-time <strong style={{ color:'#d13212' }}>CRITICAL</strong> &amp; <strong style={{ color:'#e07b00' }}>HIGH</strong> security alerts surface here when the live threat monitor is running.</>}
          </div>
        </div>

        {monitorRunning && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 18px', borderRadius:30, background:'rgba(29,128,2,0.1)', border:'1.5px solid rgba(29,128,2,0.35)', marginBottom:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#1d8102', animation:'livePulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize:12, fontWeight:800, color:'#1d8102' }}>Live Monitoring is ON — awaiting findings…</span>
            <div style={{ width:14, height:14, border:'2px solid rgba(29,128,2,0.3)', borderTopColor:'#1d8102', borderRadius:'50%', animation:'alSpin 1.2s linear infinite' }} />
          </div>
        )}

        {monitorRunning ? (
          <button onClick={onToggle} disabled={toggling} style={{ display:'inline-flex', alignItems:'center', gap:9, padding:'12px 28px', borderRadius:10, border:'2px solid #d13212', background:'transparent', color:'#d13212', fontSize:13.5, fontWeight:800, cursor:toggling?'wait':'pointer', transition:'all 0.16s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(209,50,18,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            {toggling ? <><div style={{ width:15,height:15,border:'2.5px solid rgba(209,50,18,0.3)',borderTopColor:'#d13212',borderRadius:'50%',animation:'alSpin 0.7s linear infinite' }} /> Stopping…</> : <><Square size={14} fill="#d13212"/> Stop Monitor</>}
          </button>
        ) : (
          <button onClick={onToggle} disabled={toggling} style={{ display:'inline-flex', alignItems:'center', gap:9, padding:'12px 28px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#d13212,#b02710)', color:'#fff', fontSize:13.5, fontWeight:800, cursor:toggling?'wait':'pointer', boxShadow:'0 6px 24px rgba(209,50,18,0.45)', transition:'all 0.16s' }} onMouseEnter={e=>{ if(!toggling){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 10px 32px rgba(209,50,18,0.55)'}}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 6px 24px rgba(209,50,18,0.45)'}}>
            {toggling ? <><div style={{ width:15,height:15,border:'2.5px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'alSpin 0.7s linear infinite' }} /> Starting…</> : <><Radio size={15}/> Run Live Monitor</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Finding tile card ────────────────────────────────────────────────────────
function FindingCard({ finding, onDismiss, idx }) {
  const [expanded, setExpanded] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [hovered,  setHovered]   = useState(false)
  const s = sev(finding.severity)

  async function doDismiss(e) {
    e.stopPropagation()
    setDismissing(true)
    try { await axios.delete(`${API}/api/live-findings/${finding.id}`); onDismiss(finding.id) }
    catch { setDismissing(false) }
  }

  // Human-readable type label
  const typeLabel = finding.finding_type?.replace(/_/g, ' ') || 'Security Finding'

  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ borderRadius:14, overflow:'hidden', background:'#fff', border:`1.5px solid ${expanded||hovered?s.border:s.border.replace('0.3','0.16')}`, boxShadow:expanded?`0 0 0 2px ${s.glow},0 8px 32px ${s.glow}`:hovered?`0 8px 24px ${s.glow}`:'0 2px 8px rgba(15,17,17,0.06)', transition:'all 0.22s ease', animation:`alSlide 0.28s ease ${idx*0.04}s both` }}>

      {/* Severity stripe */}
      <div style={{ height:4, background:`linear-gradient(90deg,${s.color},${s.color}55)`, position:'relative', overflow:'hidden' }}>
        {hovered&&<div style={{ position:'absolute', top:0, width:80, height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)', animation:'alShimmer 0.65s ease forwards' }} />}
      </div>

      {/* Main row — click to expand */}
      <div onClick={() => setExpanded(x=>!x)} style={{ padding:'14px 18px', display:'flex', gap:14, alignItems:'center', cursor:'pointer', userSelect:'none' }}>
        {/* Icon */}
        <div style={{ width:46, height:46, borderRadius:11, flexShrink:0, background:s.bg, border:`1.5px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, transition:'transform 0.2s', transform:hovered?'scale(1.07)':'none' }}>{s.icon}</div>

        {/* Content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <div style={{ flex:1, fontSize:13.5, fontWeight:800, color:'#0f1111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {typeLabel}
            </div>
            <span style={{ fontSize:9, fontWeight:800, color:s.color, background:s.badgeBg, borderRadius:4, padding:'3px 8px', textTransform:'uppercase', letterSpacing:0.8, border:`1px solid ${s.color}30`, flexShrink:0 }}>{finding.severity}</span>
          </div>
          <div style={{ display:'flex', gap:10, fontSize:10.5, color:'#8d9191', flexWrap:'wrap', alignItems:'center' }}>
            {finding.resource_id && finding.resource_id !== '—' && (
              <span style={{ fontFamily:'monospace', background:'#f5f5f5', border:'1px solid #e5e8ed', borderRadius:4, padding:'2px 7px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                🔗 {finding.resource_id}
              </span>
            )}
            {finding.region && <span>📍 {finding.region}</span>}
            <span>🕐 {fmtTime(finding.detected_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
          <button onClick={doDismiss} disabled={dismissing} title="Dismiss finding" style={{ width:28, height:28, borderRadius:'50%', border:'1px solid rgba(29,129,2,0.3)', background:'rgba(29,129,2,0.07)', color:'#1d8102', display:'flex', alignItems:'center', justifyContent:'center', cursor:dismissing?'wait':'pointer', transition:'all 0.14s', flexShrink:0 }} onMouseEnter={e=>e.currentTarget.style.background='rgba(29,129,2,0.2)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(29,129,2,0.07)'}>
            {dismissing?<div style={{ width:11,height:11,border:'2px solid rgba(29,128,2,0.3)',borderTopColor:'#1d8102',borderRadius:'50%',animation:'alSpin 0.7s linear infinite' }} />:<CheckCircle size={13}/>}
          </button>
          <div style={{ color:'#8d9191', transition:'transform 0.2s', transform:expanded?'rotate(180deg)':'none' }}>
            <ChevronDown size={16}/>
          </div>
        </div>
      </div>

      {/* Expanded detail drawer */}
      {expanded && (
        <div style={{ borderTop:`1.5px dashed ${s.border}`, padding:'16px 18px 18px', background:s.bg, animation:'alDrop 0.2s ease' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>

            {/* Description */}
            <div style={{ gridColumn:'1/-1', padding:'14px 16px', borderRadius:10, background:'#fff', border:`1px solid ${s.border}` }}>
              <div style={{ fontSize:10, fontWeight:800, color:s.color, textTransform:'uppercase', letterSpacing:1.1, marginBottom:7 }}>📋 What This Means</div>
              <div style={{ fontSize:12.5, color:'#3d4f60', lineHeight:1.75 }}>{getDesc(finding.finding_type)}</div>
            </div>

            {/* Severity */}
            <div style={{ padding:'12px 16px', borderRadius:10, background:'#fff', border:`1px solid ${s.border}` }}>
              <div style={{ fontSize:10, fontWeight:800, color:'#8d9191', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Risk Level</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:8, background:s.badgeBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:s.color }}>{finding.severity}</div>
                  <div style={{ fontSize:10, color:'#8d9191' }}>{finding.severity==='CRITICAL'?'Immediate response required':'Urgent attention needed'}</div>
                </div>
              </div>
            </div>

            {/* Remediation action */}
            <div style={{ padding:'12px 16px', borderRadius:10, background:'#fff', border:`1px solid ${s.border}` }}>
              <div style={{ fontSize:10, fontWeight:800, color:'#8d9191', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Recommended Fix</div>
              <div style={{ fontSize:11.5, color:'#3d4f60', lineHeight:1.65 }}>
                {finding.remediation_action ? getAction(finding.remediation_action) : getAction(null)}
              </div>
              {finding.remediation_reason && (
                <div style={{ fontSize:11, color:'#8d9191', marginTop:6, fontStyle:'italic' }}>{finding.remediation_reason}</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button onClick={doDismiss} disabled={dismissing} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d6a4a,#1d8102)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(29,128,2,0.35)', transition:'all 0.14s' }} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
              {dismissing?<div style={{ width:12,height:12,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'alSpin 0.7s linear infinite' }} />:<CheckCircle size={13}/>}
              {dismissing?'Dismissing…':'✓ Dismiss Finding'}
            </button>
            <div style={{ flex:1 }} />
            <span style={{ fontSize:10, color:'#8d9191', fontFamily:'monospace' }}>
              {finding.finding_type} · ID:{finding.id}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export function AlertsSection({ onNav }) {
  const { account } = useAuth()

  const [findings,          setFindings]         = useState([])
  const [monitorStatus,     setMonitorStatus]    = useState(null)
  const [monitorOptimistic, setMonitorOptimistic] = useState(null)
  const [toggling,          setToggling]         = useState(false)
  const [loading,           setLoading]          = useState(true)
  const [filter,            setFilter]           = useState('all')
  const [lastRefresh,       setLastRefresh]      = useState(null)
  const [drift,             setDrift]            = useState(null)
  const findingPollRef = useRef(null)
  const monitorPollRef = useRef(null)

  const awsId     = account?.parent_aws_account_id || account?.aws_account_id
  const accountDbId = account?.id

  // Effective running state
  const monitorRunning = monitorOptimistic !== null ? monitorOptimistic : (monitorStatus?.running === true)

  // ── Poll monitor status every 3s ──────────────────────────────────────────
  const fetchMonitorStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/api/threats/monitor/status`)
      setMonitorStatus(r.data?.data || null)
      setMonitorOptimistic(null)
    } catch { setMonitorStatus(null) }
  }, [])

  // ── Poll live findings every 8s ───────────────────────────────────────────
  const loadFindings = useCallback(async () => {
    try {
      const params = accountDbId ? { account_db_id: accountDbId } : {}
      const r = await axios.get(`${API}/api/live-findings/`, { params })
      const all = r.data?.data?.findings || []
      setFindings(all)
      setLastRefresh(new Date())
    } catch { /* ignore */ }
    setLoading(false)
  }, [accountDbId])

  useEffect(() => {
    setLoading(true)
    fetchMonitorStatus()
    loadFindings()
    monitorPollRef.current = setInterval(fetchMonitorStatus, 3000)
    findingPollRef.current = setInterval(loadFindings, 8000)
    // Load drift data once on mount (not polled — it's a scan comparison)
    driftAPI.get(accountDbId).then(r => {
      const d = r.data?.data
      if (d?.has_drift) setDrift(d)
    }).catch(() => {})
    return () => { clearInterval(monitorPollRef.current); clearInterval(findingPollRef.current) }
  }, [fetchMonitorStatus, loadFindings])

  // ── Toggle monitor (optimistic) ───────────────────────────────────────────
  async function toggleMonitor() {
    if (toggling) return
    setToggling(true)
    const wasRunning = monitorRunning
    setMonitorOptimistic(!wasRunning)
    try {
      if (wasRunning) {
        await axios.post(`${API}/api/threats/monitor/stop`)
      } else {
        await axios.post(`${API}/api/threats/monitor/start`, { account_id: awsId })
      }
      setTimeout(() => { fetchMonitorStatus(); setToggling(false) }, 500)
    } catch { setMonitorOptimistic(wasRunning); setToggling(false) }
  }

  function handleDismiss(id) { setFindings(prev => prev.filter(f => f.id !== id)) }

  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL')
  const highFindings     = findings.filter(f => f.severity === 'HIGH')
  const displayed = filter==='critical' ? criticalFindings : filter==='high' ? highFindings : findings

  const hasFindings = findings.length > 0

  return (
    <div style={{ fontFamily:"'Inter',-apple-system,sans-serif" }}>
      <style>{STYLES}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#8d1304,#d13212)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(209,50,18,0.35)', position:'relative' }}>
            <Bell size={16} color="#fff" />
            {monitorRunning && <div style={{ position:'absolute', top:-3, right:-3, width:9, height:9, borderRadius:'50%', background:'#1d8102', border:'2px solid #fff', animation:'livePulse 1.5s ease-in-out infinite' }} />}
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#0f1111', margin:0, display:'flex', alignItems:'center', gap:8 }}>
              Alerts
              {monitorRunning && <span style={{ fontSize:10, fontWeight:700, color:'#1d8102', background:'rgba(29,128,2,0.1)', border:'1px solid rgba(29,128,2,0.25)', borderRadius:5, padding:'2px 8px', animation:'alBlink 2s ease infinite' }}>● LIVE</span>}
            </h1>
            <div style={{ fontSize:11, color:'#565959' }}>
              {monitorRunning ? 'Threat monitor active — findings update in real-time' : 'Critical & High severity findings from live threat monitor'}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastRefresh && <span style={{ fontSize:10, color:'#8d9191' }}>Updated {fmtTime(lastRefresh.toISOString())}</span>}
          <button onClick={() => { setLoading(true); loadFindings(); fetchMonitorStatus() }} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6, border:'1px solid #e5e8ed', background:'transparent', color:'#565959', fontSize:11, cursor:'pointer' }}>
            <RefreshCcw size={11}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:80, gap:10, alignItems:'center', color:'#565959' }}>
          <span style={{ width:18, height:18, border:'2.5px solid #d13212', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'alSpin 0.8s linear infinite' }} /> Loading…
        </div>
      )}

      {/* ── ANIMATION: no findings yet (monitor off or waiting) ──────────────── */}
      {!loading && !hasFindings && (
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <HeroAnimation monitorRunning={monitorRunning} onToggle={toggleMonitor} toggling={toggling} />
          {/* Info bar */}
          <div style={{ display:'flex', gap:1, background:'#fff', border:'1px solid #e5e8ed', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
            {[
              { icon:'🚨', title:'Critical Alerts',  sub:'Immediate action needed',    color:'#d13212' },
              { icon:'⚠️',  title:'High Severity',    sub:'Significant risk detected',  color:'#e07b00' },
              { icon:'🔴', title:'Live Detection',    sub:'Alerts as threats occur',    color:'#0972d3' },
              { icon:'✓',  title:'One-click dismiss', sub:'Acknowledge & track alerts', color:'#1d8102' },
            ].map((item, i) => (
              <div key={i} style={{ flex:1, padding:'18px 20px', borderRight:i<3?'1px solid #e5e8ed':'none' }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{item.icon}</div>
                <div style={{ fontSize:12.5, fontWeight:800, color:item.color, marginBottom:3 }}>{item.title}</div>
                <div style={{ fontSize:11, color:'#8d9191' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FINDINGS: monitor has detected issues ──────────────────────────── */}
      {!loading && hasFindings && (
        <>
          {/* Monitor strip */}
          <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:9, background: monitorRunning?'rgba(29,128,2,0.06)':'rgba(0,0,0,0.03)', border:`1px solid ${monitorRunning?'rgba(29,128,2,0.25)':'#e5e8ed'}`, display:'flex', alignItems:'center', gap:10 }}>
            {monitorRunning
              ? <><div style={{ width:8, height:8, borderRadius:'50%', background:'#1d8102', animation:'livePulse 1.5s ease-in-out infinite', flexShrink:0 }} /><span style={{ fontSize:12, fontWeight:700, color:'#1d8102', flex:1 }}>Live Monitoring is ON — findings auto-update every scan cycle</span></>
              : <><div style={{ width:8, height:8, borderRadius:'50%', background:'#8d9191', flexShrink:0 }} /><span style={{ fontSize:12, color:'#8d9191', flex:1 }}>Monitor is OFF — showing last captured findings</span></>
            }
            <button onClick={toggleMonitor} disabled={toggling} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:6, border:`1px solid ${monitorRunning?'rgba(209,50,18,0.35)':'rgba(209,50,18,0.35)'}`, background:monitorRunning?'rgba(209,50,18,0.07)':'rgba(209,50,18,0.07)', color:'#d13212', fontSize:11, fontWeight:700, cursor:toggling?'wait':'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
              {monitorRunning ? <><Square size={10} fill="#d13212"/> Stop Monitor</> : <><Radio size={10}/> Start Monitor</>}
            </button>
          </div>

          {/* Count summary row */}
          <div style={{ display:'flex', gap:12, marginBottom:18 }}>
            <div style={{ flex:1, padding:'16px 20px', borderRadius:12, background:'rgba(209,50,18,0.06)', border:'1.5px solid rgba(209,50,18,0.25)', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 12px rgba(209,50,18,0.1)' }}>
              <div style={{ width:52,height:52,borderRadius:12,background:'rgba(209,50,18,0.12)',border:'2px solid rgba(209,50,18,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24 }}>🚨</div>
              <div>
                <div style={{ fontSize:32, fontWeight:900, color:'#d13212', lineHeight:1, animation:'alCountIn 0.5s cubic-bezier(0.34,1.3,0.64,1) both' }}>{criticalFindings.length}</div>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(209,50,18,0.7)', textTransform:'uppercase', letterSpacing:1 }}>Critical</div>
              </div>
              {criticalFindings.length>0 && <div style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:'#d13212', background:'rgba(209,50,18,0.1)', border:'1px solid rgba(209,50,18,0.2)', borderRadius:5, padding:'4px 10px', animation:'alBlink 1.5s ease infinite' }}>● ACTIVE</div>}
            </div>
            <div style={{ flex:1, padding:'16px 20px', borderRadius:12, background:'rgba(224,123,0,0.06)', border:'1.5px solid rgba(224,123,0,0.25)', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 12px rgba(224,123,0,0.1)' }}>
              <div style={{ width:52,height:52,borderRadius:12,background:'rgba(224,123,0,0.12)',border:'2px solid rgba(224,123,0,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24 }}>⚠️</div>
              <div>
                <div style={{ fontSize:32, fontWeight:900, color:'#e07b00', lineHeight:1, animation:'alCountIn 0.5s 0.1s cubic-bezier(0.34,1.3,0.64,1) both' }}>{highFindings.length}</div>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(224,123,0,0.7)', textTransform:'uppercase', letterSpacing:1 }}>High</div>
              </div>
              {highFindings.length>0 && <div style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:'#e07b00', background:'rgba(224,123,0,0.1)', border:'1px solid rgba(224,123,0,0.2)', borderRadius:5, padding:'4px 10px' }}>● FLAGGED</div>}
            </div>
            <div style={{ padding:'16px 20px', borderRadius:12, background:'#f8f8f8', border:'1px solid #e5e8ed', display:'flex', alignItems:'center', gap:12, minWidth:130 }}>
              <div style={{ fontSize:30, fontWeight:900, color:'#0f1111' }}>{findings.length}</div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#8d9191', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Total</div>
                <div style={{ fontSize:10, color:'#8d9191' }}>Needs action</div>
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid #e5e8ed' }}>
            {[
              { key:'all',      label:`All (${findings.length})`,                  color: filter==='all'?'#0972d3':'#565959' },
              { key:'critical', label:`🚨 Critical (${criticalFindings.length})`,  color: filter==='critical'?'#d13212':'#565959' },
              { key:'high',     label:`⚠️ High (${highFindings.length})`,          color: filter==='high'?'#e07b00':'#565959' },
            ].map(t => (
              <button key={t.key} onClick={()=>setFilter(t.key)} style={{ padding:'7px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, fontWeight:filter===t.key?700:400, color:t.color, borderBottom:filter===t.key?`2.5px solid ${t.color}`:'2.5px solid transparent', marginBottom:-1, transition:'all 0.12s' }}>{t.label}</button>
            ))}
            {monitorRunning && <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, fontSize:10, color:'#1d8102', padding:'0 4px' }}><span style={{ width:6,height:6,borderRadius:'50%',background:'#1d8102',display:'inline-block',animation:'alBlink 1.5s ease infinite' }} /> Live</div>}
          </div>

          {/* 🔄 Drift: New Since Last Scan banner */}
          {drift && drift.has_drift && (
            <div style={{ marginBottom:16, padding:'12px 18px', borderRadius:10, border:'1.5px solid rgba(209,50,18,0.28)', background:'rgba(209,50,18,0.04)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
              <span style={{ fontSize:16 }}>🆕</span>
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:'#d13212' }}>New Since Last Scan</div>
                <div style={{ fontSize:10.5, color:'#8d9191' }}>{drift.summary.new} finding{drift.summary.new!==1?'s':''} appeared since your previous scan</div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => drift.new_by_severity?.[s] > 0 && (
                  <span key={s} style={{ fontSize:9.5, fontWeight:700,
                    color: s==='CRITICAL'?'#d13212':s==='HIGH'?'#c8960c':s==='MEDIUM'?'#0972d3':'#067340',
                    background: s==='CRITICAL'?'rgba(209,50,18,0.08)':s==='HIGH'?'rgba(200,150,12,0.08)':s==='MEDIUM'?'rgba(9,114,211,0.08)':'rgba(6,115,64,0.08)',
                    borderRadius:4, padding:'2px 7px' }}>
                    +{drift.new_by_severity[s]} {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Finding cards */}
          {displayed.length===0
            ? <div style={{ textAlign:'center', padding:40, color:'#8d9191', fontSize:13 }}>No findings in this filter.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {displayed.map((f,i) => <FindingCard key={f.id} finding={f} onDismiss={handleDismiss} idx={i} />)}
              </div>
          }

          {/* CTA */}
          <div style={{ marginTop:24, padding:'14px 20px', borderRadius:10, background:'rgba(9,114,211,0.05)', border:'1px solid rgba(9,114,211,0.18)', display:'flex', alignItems:'center', gap:12 }}>
            <Wrench size={18} color="#0972d3" />
            <div style={{ fontSize:12.5, color:'#3d4f60', flex:1 }}><strong>Fix now:</strong> Navigate to <strong style={{ color:'#0972d3' }}>Remediation</strong> to apply auto-fixes for these findings.</div>
            <button onClick={()=>onNav?.('execute')} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#0972d3', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>→ Go to Remediation</button>
          </div>
        </>
      )}
    </div>
  )
}
