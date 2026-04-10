import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { RotateCcw, CheckCircle, AlertTriangle, Clock, Ban, Trash2 } from 'lucide-react'

const API = 'http://127.0.0.1:8000'

const NON_ROLLBACKABLE_ACTIONS = new Set([
  'TERMINATE_EC2_INSTANCE',
  'FORCE_TERMINATE_EC2_INSTANCE',
  'REMOVE_ELASTIC_IP',
  'DELETE_DEFAULT_VPC',
  'DELETE_UNUSED_IAM_USER',
  'DELETE_ACCESS_KEY',
])

const SEV = {
  CRITICAL: { badge:'#d13212', badgeBg:'rgba(209,50,18,0.1)',  light:'rgba(209,50,18,0.06)',  stripe:'#d13212' },
  HIGH:     { badge:'#e07b00', badgeBg:'rgba(224,123,0,0.08)', light:'rgba(255,153,0,0.07)',  stripe:'#e07b00' },
  MEDIUM:   { badge:'#9a7009', badgeBg:'rgba(212,160,23,0.1)', light:'rgba(212,160,23,0.06)', stripe:'#c8960c' },
  LOW:      { badge:'#1d6a4a', badgeBg:'rgba(62,169,124,0.1)', light:'rgba(62,169,124,0.06)', stripe:'#3ea97c' },
  INFO:     { badge:'#1a6296', badgeBg:'rgba(91,155,213,0.1)', light:'rgba(91,155,213,0.06)', stripe:'#5b9bd5' },
}
const sevOr = s => SEV[s?.toUpperCase()] || SEV.INFO

const STATUS_STYLE = {
  EXECUTED:          { color:'#1d8102', bg:'rgba(29,128,2,0.1)',    label:'✓ Executed'  },
  NOT_RECOVERABLE:   { color:'#8d4004', bg:'rgba(141,64,4,0.1)',    label:'🚫 Permanent' },
  DRY_RUN:           { color:'#5b9bd5', bg:'rgba(91,155,213,0.1)', label:'▶ Dry Run'   },
  REQUIRE_APPROVAL:  { color:'#e07b00', bg:'rgba(224,123,0,0.1)',  label:'🔐 Approval' },
  BLOCKED_BY_POLICY: { color:'#d13212', bg:'rgba(209,50,18,0.1)',  label:'⛔ Blocked'  },
  MANUAL_REQUIRED:   { color:'#5b9bd5', bg:'rgba(91,155,213,0.1)', label:'📋 Manual'  },
  FAILED:            { color:'#d13212', bg:'rgba(209,50,18,0.1)',  label:'✗ Failed'   },
  SKIPPED:           { color:'#8d9191', bg:'rgba(141,145,145,0.1)',label:'— Skipped'  },
}
const statStyle = s => STATUS_STYLE[s] || { color:'#8d9191', bg:'rgba(0,0,0,0.05)', label: s || 'Unknown' }

const SVC_ICON = { IAM:'🔑', S3:'📦', EC2:'💻', VPC:'🌐', RDS:'🗄️', KMS:'🔒', CLOUDTRAIL:'📋', EBS:'💾', SG:'🛡️', DEFAULT:'↩️' }
function svcIcon(type) {
  if (!type) return SVC_ICON.DEFAULT
  const t = (type||'').toUpperCase()
  for (const [k, v] of Object.entries(SVC_ICON)) { if (t.includes(k)) return v }
  return SVC_ICON.DEFAULT
}
function fmtAction(a) { return (a||'Unknown').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) }
function fmtType(t)   { return (t||'Unknown').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) }
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
}

const GLOBAL_STYLES = `
  @keyframes rbModalIn { 0%{opacity:0;transform:translateX(-50%) translateY(-46%) scale(0.93)} 100%{opacity:1;transform:translateX(-50%) translateY(-50%) scale(1)} }
  @keyframes rbSpin    { to{transform:rotate(360deg)} }
  @keyframes rbPop     { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.25)} 100%{transform:scale(1);opacity:1} }
  @keyframes rbShine   { 0%{left:-80px} 100%{left:calc(100% + 80px)} }
  @keyframes rbSlide   { 0%{opacity:0;transform:translateX(-10px)} 100%{opacity:1;transform:none} }
  @keyframes rbDot     { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }
  @keyframes rbPulse   { 0%{transform:scale(0.9);opacity:0.7} 100%{transform:scale(1.5);opacity:0} }
  @keyframes clockHand { to{transform:rotate(360deg)} }
`

function ConfirmModal({ execution, onConfirm, onCancel }) {
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(true)
    await onConfirm()
  }

  return createPortal(
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translateX(-50%) translateY(-50%)',
      zIndex: 99999, width: 'min(400px, 90vw)',
      animation: 'rbModalIn 0.22s cubic-bezier(0.34,1.3,0.64,1)',
    }}>
      <style>{`
        @keyframes rbModalIn {
          0%   { opacity:0; transform:translateX(-50%) translateY(-46%) scale(0.93); }
          100% { opacity:1; transform:translateX(-50%) translateY(-50%) scale(1); }
        }
        @keyframes rbSpin { to { transform:rotate(360deg); } }
      `}</style>
        <div style={{
          background: 'var(--bg2)', borderRadius: 16,
          border: '2px solid rgba(9,114,211,0.35)',
          borderTop: '4px solid #0972d3',
          boxShadow: '0 8px 40px rgba(0,0,0,0.22), 0 2px 12px rgba(9,114,211,0.15)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '28px 28px 0', textAlign: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(9,114,211,0.08)', border: '2px solid rgba(9,114,211,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 14 }}>
              ↩️
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1111', marginBottom: 6 }}>Confirm Rollback</div>
            <div style={{ fontSize: 12.5, color: '#565959' }}>You are about to undo the AWS change for:</div>
          </div>

          {/* Resource info */}
          <div style={{ margin: '16px 28px', padding: '14px 16px', background: 'rgba(9,114,211,0.04)', border: '1.5px solid rgba(9,114,211,0.18)', borderRadius: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a6296', marginBottom: 5 }}>{fmtAction(execution.action)}</div>
            <div style={{ fontSize: 11.5, color: '#565959', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {execution.resource_name || execution.finding_id || '—'}
            </div>
          </div>

          {/* Warning */}
          <div style={{ margin: '0 28px 20px', padding: '10px 14px', background: 'rgba(224,123,0,0.06)', border: '1px solid rgba(224,123,0,0.22)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 11.5, color: '#7a4b00', lineHeight: 1.6 }}>
              This will make <strong>real changes</strong> to your AWS account to restore the previous state.
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, padding: '0 28px 24px' }}>
            <button
              onClick={onCancel}
              disabled={confirming}
              style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: '1.5px solid #e5e8ed', background: 'transparent', color: '#565959', fontSize: 13, fontWeight: 600, cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.5 : 1 }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              style={{ flex: 1.8, padding: '11px 0', borderRadius: 9, border: 'none', background: confirming ? '#5b8fb5' : 'linear-gradient(135deg,#1a6296,#0972d3)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: confirming ? 'wait' : 'pointer', boxShadow: confirming ? 'none' : '0 4px 16px rgba(9,114,211,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
              {confirming
                ? <><div style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'rbSpin 0.7s linear infinite' }} /> Rolling back…</>
                : <><RotateCcw size={14} /> Confirm Rollback</>
              }
            </button>
          </div>
        </div>
      </div>
  , document.body)
}

function EmptyState() {
  const POINTS = [
    { time:'T-0', label:'IAM policy detached',       resource:'iam::user/admin',  color:'#e07b00' },
    { time:'T-1', label:'S3 public ACL removed',     resource:'s3::prod-bucket',  color:'#0972d3' },
    { time:'T-2', label:'VPC flow logs enabled',     resource:'vpc::vpc-09a3b',   color:'#1d8102' },
    { time:'T-3', label:'Security group restricted', resource:'ec2::sg-af33e',    color:'#8d4004' },
    { time:'T-4', label:'KMS key rotation enabled',  resource:'kms::key-0f9e3',   color:'#0972d3' },
  ]
  return (
    <div style={{ background:'#f4f8ff', border:'1px solid rgba(9,114,211,0.2)', borderLeft:'4px solid #0972d3', borderRadius:14, padding:'44px 48px', boxShadow:'0 4px 20px rgba(9,114,211,0.09)', display:'flex', gap:52, minHeight:'calc(100vh - 190px)' }}>
      <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, minWidth:140 }}>
        <div style={{ position:'relative', width:134, height:134 }}>
          <div style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1.5px solid rgba(9,114,211,0.18)', animation:'rbPulse 2.2s ease-out infinite' }} />
          <div style={{ width:134, height:134, borderRadius:'50%', background:'linear-gradient(135deg,#e4eeff,#d4e4ff)', border:'2.5px solid rgba(9,114,211,0.35)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', boxShadow:'0 4px 20px rgba(9,114,211,0.18)' }}>
            {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
              <div key={deg} style={{ position:'absolute', top:'50%', left:'50%', width:deg%90===0?3:2, height:deg%90===0?12:8, background:`rgba(9,114,211,${deg%90===0?0.5:0.2})`, transformOrigin:'50% calc(-48px)', transform:`translate(-50%,-100%) rotate(${deg}deg)`, borderRadius:2 }} />
            ))}
            <div style={{ position:'absolute', width:4, height:34, borderRadius:3, background:'#0950a1', bottom:'50%', left:'calc(50% - 2px)', transformOrigin:'bottom center', animation:'clockHand 12s linear infinite reverse' }} />
            <div style={{ position:'absolute', width:2.5, height:46, borderRadius:2, background:'#0972d3', bottom:'50%', left:'calc(50% - 1.25px)', transformOrigin:'bottom center', animation:'clockHand 3s linear infinite reverse' }} />
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#0972d3', position:'absolute', zIndex:2 }} />
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#0950a1', letterSpacing:1.6, textTransform:'uppercase' }}>Restore Points</div>
          <div style={{ fontSize:10, color:'#8d9191', marginTop:4, lineHeight:1.5 }}>Waiting for executions<br/>to create history</div>
        </div>
      </div>
      <div style={{ width:1.5, background:'linear-gradient(180deg,rgba(9,114,211,0.25),rgba(9,114,211,0.05))', flexShrink:0, borderRadius:2 }} />
      <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
        <div style={{ fontSize:11, fontWeight:800, color:'#0972d3', textTransform:'uppercase', letterSpacing:1.4, marginBottom:28 }}>What restore points look like:</div>
        <div style={{ position:'relative', paddingLeft:26, flex:1 }}>
          <div style={{ position:'absolute', left:7, top:8, bottom:8, width:2, background:'linear-gradient(180deg,#0972d3,rgba(9,114,211,0.08))', borderRadius:2 }} />
          {POINTS.map((p, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18, opacity:0.5+i*0.1, animation:`rbSlide 0.4s ease ${i*0.1}s both` }}>
              <div style={{ position:'absolute', left:3, width:11, height:11, borderRadius:'50%', background:p.color, border:'2px solid #f4f8ff', animation:`rbDot 2s ease ${i*0.5}s infinite` }} />
              <div style={{ fontSize:9.5, color:'#8d9191', fontFamily:'monospace', flexShrink:0, width:32, textAlign:'right', fontWeight:600 }}>{p.time}</div>
              <div style={{ flex:1, padding:'10px 14px', borderRadius:8, background:`${p.color}09`, border:`1px dashed ${p.color}40`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#3d4f60', marginBottom:2 }}>{p.label}</div>
                  <div style={{ fontSize:10, color:'#8d9191', fontFamily:'monospace' }}>{p.resource}</div>
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:p.color, background:`${p.color}12`, borderRadius:5, padding:'4px 10px' }}>↩ Recover</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:'auto', paddingTop:24, fontSize:12, color:'#8d9191', display:'flex', alignItems:'center', gap:8 }}>
          <span>💡</span> Execute a fix in <strong style={{ color:'#0972d3' }}>Remediation</strong> to create real restore points here.
        </div>
      </div>
    </div>
  )
}

function ExecutionCard({ execution, exiting, rollingId, onRequestRollback, selectMode, selected, onToggleSelect }) {
  const s  = sevOr(execution.finding_severity)
  const st = statStyle(execution.status)
  const [hovered, setHovered] = useState(false)
  const icon   = svcIcon(execution.finding_type || execution.action)
  const accent = s.stripe
  const isRolling = rollingId === execution.execution_id
  const isPermanent = NON_ROLLBACKABLE_ACTIONS.has(execution.action) || execution.status === 'NOT_RECOVERABLE'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 14, overflow: 'hidden', background: 'var(--bg2)',
        border: `1.5px solid ${selected ? '#0972d3' : (hovered && !exiting && !isRolling ? accent+'aa' : accent+'30')}`,
        boxShadow: selected ? '0 0 0 3px rgba(9,114,211,0.15)' : isRolling ? `0 0 0 3px ${accent}30, 0 8px 28px rgba(0,0,0,0.1)` : hovered && !exiting ? '0 8px 28px rgba(91,155,213,0.15), 0 2px 8px rgba(0,0,0,0.07)' : '0 2px 8px rgba(15,17,17,0.06)',
        transition: 'all 0.22s ease', position: 'relative',
        transform: exiting ? 'translateX(-55px) scaleY(0.93)' : hovered && !isRolling && !selected ? 'translateY(-2px)' : 'none',
        opacity: exiting ? 0 : 1,
        pointerEvents: exiting ? 'none' : 'auto',
      }}
    >
      {/* Top stripe */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, ${accent}55)`, position: 'relative', overflow: 'hidden' }}>
        {hovered && !isRolling && <div style={{ position:'absolute', top:0, width:80, height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)', animation:'rbShine 0.65s ease forwards' }} />}
      </div>

      {/* Checkbox — only shown in select mode */}
      {selectMode && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect(execution.execution_id) }}
          style={{ position:'absolute', top:10, right:10, zIndex:10,
            width:20, height:20, borderRadius:5, cursor:'pointer',
            border:`2px solid ${selected ? '#0972d3' : '#d5dbdb'}`,
            background: selected ? '#0972d3' : '#fff',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.12s', boxShadow:'0 1px 4px rgba(0,0,0,0.1)'
          }}
        >
          {selected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      <div style={{ padding: '14px 18px 16px', paddingRight: selectMode ? 38 : 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Icon */}
        <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, background:s.light, border:`1.5px solid ${accent}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, transition:'transform 0.2s', transform:hovered&&!isRolling?'scale(1.07)':'none' }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#0f1111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>
                {fmtAction(execution.action)}
              </div>
              {execution.finding_type && <div style={{ fontSize:11, color:'#565959' }}>{fmtType(execution.finding_type)}</div>}
            </div>
            <div style={{ display:'flex', gap:5, flexShrink:0 }}>
              {execution.finding_severity && (
                <span style={{ fontSize:9, fontWeight:800, color:s.badge, background:s.badgeBg, borderRadius:4, padding:'3px 7px', textTransform:'uppercase', letterSpacing:0.7, border:`1px solid ${s.badge}30` }}>
                  {execution.finding_severity}
                </span>
              )}
              <span style={{ fontSize:9, fontWeight:700, color:st.color, background:st.bg, borderRadius:4, padding:'3px 7px' }}>{st.label}</span>
              {isPermanent && (
                <span style={{ fontSize:9, fontWeight:700, color:'#8d4004', background:'rgba(141,64,4,0.1)', borderRadius:4, padding:'3px 7px', border:'1px solid rgba(141,64,4,0.2)' }}>
                  🚫 No Rollback
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize:11, color:'#565959', fontFamily:'monospace', background:s.light, border:`1px solid ${accent}18`, borderRadius:6, padding:'7px 10px', marginBottom:7, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            📍 {execution.resource_name || '—'}
          </div>
          <div style={{ fontSize:10, color:'#8d9191', display:'flex', alignItems:'center', gap:4 }}>
            <Clock size={9} /> {fmtTime(execution.created_at)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'10px 18px', borderTop:`1px solid ${accent}18`, background:isRolling?`${accent}08`:`${accent}05`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:10, color:'#8d9191', fontFamily:'monospace' }}>
          {(execution.action||'').replace(/_/g,' ').toUpperCase()}
        </div>
        <div>
          {isRolling && (
            <div style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:8, background:`${accent}15`, border:`1px solid ${accent}40` }}>
              <div style={{ width:13, height:13, border:`2px solid ${accent}40`, borderTopColor:accent, borderRadius:'50%', animation:'rbSpin 0.75s linear infinite' }} />
              <span style={{ fontSize:11, fontWeight:700, color:accent }}>Rolling back…</span>
            </div>
          )}
          {!isRolling && isPermanent && (
            <div style={{ fontSize:10.5, color:'#8d4004', fontStyle:'italic', padding:'5px 12px', borderRadius:7, background:'rgba(141,64,4,0.07)', border:'1px solid rgba(141,64,4,0.2)', display:'flex', alignItems:'center', gap:6 }}>
              <Ban size={11} /> Permanent — cannot be undone
            </div>
          )}
          {!isRolling && !isPermanent && execution.status === 'EXECUTED' && (
            <button
              onClick={() => onRequestRollback(execution)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:8, border:'1.5px solid rgba(91,155,213,0.4)', background:'rgba(91,155,213,0.1)', color:'#1a6296', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.14s' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(91,155,213,0.2)'; e.currentTarget.style.borderColor='#5b9bd5' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(91,155,213,0.1)'; e.currentTarget.style.borderColor='rgba(91,155,213,0.4)' }}>
              <RotateCcw size={12} /> ↩ Recover
            </button>
          )}
          {!isRolling && !isPermanent && execution.status !== 'EXECUTED' && (
            <div style={{ fontSize:10.5, color:'#8d9191', fontStyle:'italic', padding:'5px 12px', borderRadius:7, background:'rgba(0,0,0,0.04)', border:'1px solid #e5e8ed', display:'flex', alignItems:'center', gap:6 }}>
              ⛔ Cannot rollback
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RollbackSection({ onNav }) {
  const HIDDEN_KEY = 'rb_hidden_v1'

  const [executions, setExecutions]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [exitingIds, setExitingIds]         = useState(new Set())
  const [removedIds, setRemovedIds]         = useState(new Set())
  const [filter, setFilter]                 = useState('executed')
  const [confirmTarget, setConfirmTarget]   = useState(null)
  const [rollingId, setRollingId]           = useState(null)
  const [rollbackError, setRollbackError]   = useState(null)
  // Delete selection
  const [selectMode, setSelectMode]         = useState(false)
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [hiddenIds, setHiddenIds]           = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')) } catch { return new Set() }
  })
  const pollRef = useRef(null)

  const loadExecutions = useCallback(async () => {
    try {
      // Fetch ALL executions across ALL scans — no scan_id filter.
      // This ensures remediations from previous scans are never lost after a re-scan.
      const r = await axios.get(`${API}/api/execute/executions`)
      const all = r.data?.data?.executions || []

      const latestMap = {}
      const others = []
      for (const e of all) {
        if (e.status === 'EXECUTED') {
          const prev = latestMap[e.finding_id]
          if (!prev || new Date(e.created_at) > new Date(prev.created_at)) latestMap[e.finding_id] = e
        } else {
          others.push(e)
        }
      }
      setExecutions([...Object.values(latestMap), ...others])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])  // no ctxScanId dependency — fetches all executions regardless

  useEffect(() => {
    setLoading(true)
    loadExecutions()
    pollRef.current = setInterval(loadExecutions, 12000)
    return () => clearInterval(pollRef.current)
  }, [loadExecutions])

  function handleRequestRollback(execution) {
    setRollbackError(null)
    setConfirmTarget(execution)
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function deleteSelected() {
    const next = new Set([...hiddenIds, ...selectedIds])
    setHiddenIds(next)
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])) } catch {}
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  function restoreHidden() {
    setHiddenIds(new Set())
    try { localStorage.removeItem(HIDDEN_KEY) } catch {}
  }

  async function handleConfirmRollback() {
    if (!confirmTarget) return
    const execId = confirmTarget.execution_id
    setRollingId(execId)

    try {
      const r = await axios.post(`${API}/api/rollback/`, { execution_id: execId })
      const status = r.data?.data?.status

      setConfirmTarget(null)

      if (status === 'ROLLBACK_SUCCESS') {
        setExitingIds(prev => new Set([...prev, execId]))
        setTimeout(() => {
          setRemovedIds(prev => new Set([...prev, execId]))
          setExitingIds(prev => { const n=new Set(prev); n.delete(execId); return n })
          onNav?.('execute')   // go back to Remediation
        }, 500)
      } else if (status === 'NOT_RECOVERABLE') {
        setExecutions(prev => prev.map(e =>
          e.execution_id === execId ? { ...e, status: 'NOT_RECOVERABLE' } : e
        ))
        setRollbackError('This action is permanent and cannot be rolled back.')
      } else {
        setRollbackError(r.data?.errors?.[0] || `Rollback returned status: ${status || 'unknown'}`)
      }
    } catch (err) {
      setConfirmTarget(null)
      setRollbackError(err?.response?.data?.detail || 'Network error during rollback')
    } finally {
      setRollingId(null)
    }
  }

  const visible = executions.filter(e => !removedIds.has(e.execution_id) && !hiddenIds.has(e.execution_id))

  const rollbackableList = visible.filter(e =>
    e.status === 'EXECUTED' && !NON_ROLLBACKABLE_ACTIONS.has(e.action)
  )
  const permanentList = visible.filter(e =>
    (e.status === 'EXECUTED' && NON_ROLLBACKABLE_ACTIONS.has(e.action)) ||
    e.status === 'NOT_RECOVERABLE'
  )
  const otherList = visible.filter(e =>
    !['EXECUTED', 'NOT_RECOVERABLE'].includes(e.status)
  )

  const filtered =
    filter === 'executed'  ? rollbackableList :
    filter === 'permanent' ? permanentList    :
    filter === 'other'     ? otherList        :
    visible

  const text   = 'var(--text)'
  const text2  = 'var(--text3)'
  const border = 'var(--border)'

  return (
    <div style={{ fontFamily:"'Inter', -apple-system, sans-serif" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Confirm Modal — keeps showing spinner until API finishes */}
      {confirmTarget && (
        <ConfirmModal
          execution={confirmTarget}
          onConfirm={handleConfirmRollback}
          onCancel={() => { if (!rollingId) setConfirmTarget(null) }}
        />
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1a6296,#5b9bd5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <RotateCcw size={16} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:text, margin:0 }}>Rollback</h1>
            <div style={{ fontSize:11, color:text2 }}>All remediations · Undo executed fixes · Permanent changes tracked separately</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {hiddenIds.size > 0 && (
            <button onClick={restoreHidden} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${border}`, background:'rgba(9,114,211,0.06)', color:'#0972d3', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              ↺ Restore {hiddenIds.size} hidden
            </button>
          )}
          {visible.length > 0 && !selectMode && (
            <button onClick={() => { setSelectMode(true); setSelectedIds(new Set()) }} style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${border}`, background:'transparent', color:text2, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              <Trash2 size={11} /> Select to Delete
            </button>
          )}
          {selectMode && (
            <>
              <button
                onClick={() => setSelectedIds(new Set(visible.map(e => e.execution_id)))}
                style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${border}`, background:'transparent', color:text2, fontSize:11, cursor:'pointer' }}>
                Select All
              </button>
              <button
                onClick={deleteSelected}
                disabled={selectedIds.size === 0}
                style={{ padding:'6px 12px', borderRadius:6, border:'none', background: selectedIds.size > 0 ? '#d13212' : '#e5e8ed', color: selectedIds.size > 0 ? '#fff' : '#8d9191', fontSize:11, fontWeight:700, cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5 }}>
                <Trash2 size={11} /> Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${border}`, background:'transparent', color:text2, fontSize:11, cursor:'pointer' }}>
                Cancel
              </button>
            </>
          )}
          {visible.length > 0 && !selectMode && (
            <span style={{ fontSize:10, color:'#8d9191', background:'rgba(0,0,0,0.04)', border:`1px solid ${border}`, borderRadius:4, padding:'3px 8px' }}>
              🔄 Auto-refreshing
            </span>
          )}
          <button onClick={loadExecutions} style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${border}`, background:'transparent', color:text2, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <RotateCcw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* Rollback error banner */}
      {rollbackError && (
        <div style={{ marginBottom:14, padding:'12px 16px', borderRadius:9, background:'rgba(209,50,18,0.07)', border:'1.5px solid rgba(209,50,18,0.28)', display:'flex', alignItems:'center', gap:10 }}>
          <AlertTriangle size={15} color="#d13212" style={{ flexShrink:0 }} />
          <div style={{ flex:1, fontSize:12, color:'#d13212', fontWeight:600 }}>{rollbackError}</div>
          <button onClick={() => setRollbackError(null)} style={{ fontSize:11, color:'#d13212', border:'none', background:'transparent', cursor:'pointer', fontWeight:700 }}>✕</button>
        </div>
      )}

      {loading && (
        <div style={{ display:'flex', justifyContent:'center', padding:80, color:text2, gap:10, alignItems:'center' }}>
          <span style={{ width:18, height:18, border:'2.5px solid #5b9bd5', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'rbSpin 0.8s linear infinite' }} />
          Loading executions…
        </div>
      )}

      {!loading && visible.length === 0 && <EmptyState />}

      {!loading && visible.length > 0 && (
        <>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:`1px solid ${border}` }}>
            {[
              { key:'executed',  label:`↩ Recoverable (${rollbackableList.length})`,   color: filter==='executed'  ? '#0972d3' : text2 },
              { key:'permanent', label:`🚫 Permanent (${permanentList.length})`,        color: filter==='permanent' ? '#8d4004' : text2 },
              { key:'other',     label:`Other (${otherList.length})`,                   color: filter==='other'     ? '#565959' : text2 },
              { key:'all',       label:`All (${visible.length})`,                       color: filter==='all'       ? '#0972d3' : text2 },
            ].map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                padding:'7px 14px', border:'none', background:'transparent', cursor:'pointer',
                fontSize:12.5, fontWeight:filter===t.key?700:400,
                color: t.color,
                borderBottom:filter===t.key ? `2.5px solid ${t.color}` : '2.5px solid transparent',
                marginBottom:-1, transition:'all 0.12s'
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Permanent tab info banner */}
          {filter === 'permanent' && permanentList.length > 0 && (
            <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:9, background:'rgba(141,64,4,0.05)', border:'1px solid rgba(141,64,4,0.2)', display:'flex', alignItems:'center', gap:10 }}>
              <Ban size={15} color="#8d4004" style={{ flexShrink:0 }} />
              <div style={{ fontSize:12, color:'#8d4004' }}>
                <strong>Permanent changes</strong> — these actions cannot be undone by CloudShield. The resource change is irreversible in AWS.
              </div>
            </div>
          )}

          {filtered.length === 0
            ? <div style={{ textAlign:'center', padding:40, color:text2, fontSize:13 }}>No records in this filter.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {filtered.map(e => (
                  <ExecutionCard
                    key={e.execution_id}
                    execution={e}
                    exiting={exitingIds.has(e.execution_id)}
                    rollingId={rollingId}
                    onRequestRollback={handleRequestRollback}
                    selectMode={selectMode}
                    selected={selectedIds.has(e.execution_id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
          }
        </>
      )}
    </div>
  )
}
