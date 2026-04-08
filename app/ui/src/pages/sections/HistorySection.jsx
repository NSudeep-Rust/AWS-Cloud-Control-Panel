// HistorySection.jsx — Full Audit History & Event Timeline
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { historyAPI, executeAPI, scheduleAPI, driftAPI } from '@/api'

// ─── helpers ─────────────────────────────────────────────────────────────────
const SEV_COLOR  = { CRITICAL:'#d13212', HIGH:'#f59e0b', MEDIUM:'#0972d3', LOW:'#067340' }
const SEV_BG     = { CRITICAL:'rgba(209,50,18,0.08)', HIGH:'rgba(245,158,11,0.08)', MEDIUM:'rgba(9,114,211,0.08)', LOW:'rgba(6,115,64,0.08)' }
const SEV_ORDER  = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 }

function fmtTime(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true })
}

function relTime(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff/60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m/60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h/24)}d ago`
}

// severity counts from findings array
function severityCounts(findings=[]) {
    const out = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 }
    findings.forEach(f => { if (out[f.severity] !== undefined) out[f.severity]++ })
    return out
}

// service from finding type
function serviceOf(type='') {
    if (type.startsWith('IAM')) return 'IAM'
    if (type.startsWith('S3')) return 'S3'
    if (type.startsWith('EC2') || type.startsWith('EBS')) return 'EC2'
    if (type.startsWith('RDS')) return 'RDS'
    if (type.startsWith('SECURITY_GROUP') || type.startsWith('PUBLIC_SECURITY')) return 'VPC'
    if (type.startsWith('CLOUDTRAIL') || type.startsWith('CLOUDWATCH')) return 'CloudTrail'
    if (type.startsWith('VPC') || type.startsWith('DEFAULT_VPC') || type.startsWith('NACL') || type.startsWith('ROUTE') || type.startsWith('INTERNET') || type.startsWith('PUBLIC_SUBNET')) return 'VPC'
    if (type.startsWith('KMS')) return 'KMS'
    return 'AWS'
}

// ── Compare two scans, return delta info ──────────────────────────────
function scanChangedFrom(scan, prevScan) {
    if (!prevScan) return { changed: true, isFirst: true, dC:0, dH:0, dM:0, dL:0, dTotal:0 }
    const c1 = severityCounts(scan.details)
    const c2 = severityCounts(prevScan.details)
    const dC = c1.CRITICAL - c2.CRITICAL
    const dH = c1.HIGH     - c2.HIGH
    const dM = c1.MEDIUM   - c2.MEDIUM
    const dL = c1.LOW      - c2.LOW
    const dTotal = (scan.count||0) - (prevScan.count||0)
    const changed = dC !== 0 || dH !== 0 || dM !== 0 || dL !== 0
    return { changed, isFirst: false, dC, dH, dM, dL, dTotal }
}

// ─── sub-components ───────────────────────────────────────────────────────────
function StatTile({ label, value, sub, color='#FF9900', icon }) {
    return (
        <div style={{ flex:1, minWidth:120, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:18 }}>{icon}</span>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8 }}>{label}</span>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value ?? '—'}</div>
            {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{sub}</div>}
        </div>
    )
}

function SeverityBar({ counts, total }) {
    if (!total) return null
    const bars = ['CRITICAL','HIGH','MEDIUM','LOW'].filter(s => counts[s] > 0)
    return (
        <div style={{ display:'flex', gap:3, height:4, borderRadius:2, overflow:'hidden', margin:'8px 0 4px' }}>
            {bars.map(s => (
                <div key={s} style={{ flex:counts[s]/total, background:SEV_COLOR[s], minWidth:counts[s]>0?2:0 }} />
            ))}
        </div>
    )
}

function SevBadge({ sev, count }) {
    if (!count) return null
    return (
        <span style={{ fontSize:10, fontWeight:700, color:SEV_COLOR[sev], background:SEV_BG[sev], borderRadius:4, padding:'2px 7px', display:'inline-flex', alignItems:'center', gap:3 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:SEV_COLOR[sev], display:'inline-block' }}/>
            {count} {sev}
        </span>
    )
}

function ScanEvent({ evt, execMap, delta, drift }) {
    const [expanded, setExpanded] = useState(false)
    const counts = severityCounts(evt.details)
    const total  = evt.count || 0
    const execs  = execMap[evt.scan_id] || []

    // Choose card title based on delta
    const eventTitle = (() => {
        if (!delta || delta.isFirst) return 'Latest Security Scan'
        if (delta.dTotal > 0)  return 'New Findings Detected'
        if (delta.dTotal < 0)  return 'Environment Improved'
        return 'Findings Changed'
    })()

    const dotColor = (() => {
        if (!delta || delta.isFirst) return '#FF9900'
        if (delta.dC > 0 || delta.dH > 0) return '#d13212'
        if (delta.dTotal < 0) return '#067340'
        return '#f59e0b'
    })()

    // group findings by service
    const byService = {}
    evt.details?.forEach(f => {
        const svc = serviceOf(f.type)
        if (!byService[svc]) byService[svc] = []
        byService[svc].push(f)
    })

    function DeltaBadge({ val, sev }) {
        if (!val || !delta || delta.isFirst) return null
        const color = val > 0 ? SEV_COLOR[sev] : '#067340'
        const bg    = val > 0 ? SEV_BG[sev]   : 'rgba(6,115,64,0.08)'
        return (
            <span style={{ fontSize:9, fontWeight:800, color, background:bg, borderRadius:4, padding:'2px 6px' }}>
                {val > 0 ? `▲+${val}` : `▼${val}`} {sev}
            </span>
        )
    }

    return (
        <div style={{ display:'flex', gap:0 }}>
            {/* timeline rail */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:32, flexShrink:0 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:dotColor, border:'2px solid #fff', boxShadow:`0 0 0 2px ${dotColor}`, flexShrink:0, marginTop:4 }}/>
                <div style={{ flex:1, width:2, background:'var(--border)', marginTop:4 }}/>
            </div>

            {/* card */}
            <div style={{ flex:1, marginBottom:16, marginLeft:12 }}>
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                    {/* card header */}
                    <div
                        onClick={() => setExpanded(e => !e)}
                        style={{ padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}
                    >
                        <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
                            <div style={{ width:34, height:34, borderRadius:8, background:`${dotColor}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <span style={{ fontSize:17 }}>{!delta||delta.isFirst?'🔍':delta.dTotal>0?'🚨':delta.dTotal<0?'✅':'🔄'}</span>
                            </div>
                            <div style={{ minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                    {eventTitle}
                                    <span style={{ fontSize:10, fontWeight:700, color:'#FF9900', background:'rgba(255,153,0,0.12)', borderRadius:4, padding:'2px 8px' }}>
                                        SCAN #{typeof evt.scan_id === 'string' ? evt.scan_id.slice(0,8) : evt.scan_id}
                                    </span>
                                    {evt.source === 'SCHEDULED' && (
                                        <span style={{ fontSize:10, fontWeight:700, color:'#7953d2', background:'rgba(121,83,210,0.1)', borderRadius:4, padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:3 }}>
                                            ⏰ Auto
                                        </span>
                                    )}
                                    {/* 🆕 Drift badge — only on latest scan */}
                                    {drift && drift.summary?.new > 0 && (
                                        <span style={{ fontSize:10, fontWeight:700, color:'#d13212', background:'rgba(209,50,18,0.1)', borderRadius:4, padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:4, border:'1px solid rgba(209,50,18,0.25)' }}>
                                            <span style={{ width:6, height:6, borderRadius:'50%', background:'#d13212', animation:'anlPulse 1.5s ease infinite' }} />
                                            🆕 {drift.summary.new} new since last scan
                                        </span>
                                    )}
                                    {execs.length > 0 && (
                                        <span style={{ fontSize:10, fontWeight:700, color:'#067340', background:'rgba(6,115,64,0.1)', borderRadius:4, padding:'2px 8px' }}>
                                            {execs.length} FIXED
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                                    {fmtTime(evt.timestamp)} · {relTime(evt.timestamp)}
                                </div>
                                {/* Delta badges row */}
                                {delta && !delta.isFirst && (
                                    <div style={{ display:'flex', gap:5, marginTop:5, flexWrap:'wrap' }}>
                                        <DeltaBadge val={delta.dC} sev="CRITICAL"/>
                                        <DeltaBadge val={delta.dH} sev="HIGH"/>
                                        <DeltaBadge val={delta.dM} sev="MEDIUM"/>
                                        <DeltaBadge val={delta.dL} sev="LOW"/>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                            <span style={{ fontSize:13, fontWeight:800, color:counts.CRITICAL > 0 ? '#d13212' : 'var(--text)' }}>{total} findings</span>
                            <span style={{ fontSize:13, color:'var(--text3)', transition:'transform 0.2s', transform:expanded?'rotate(180deg)':'rotate(0)' }}>▾</span>
                        </div>
                    </div>

                    {/* severity bar */}
                    <div style={{ padding:'0 18px' }}>
                        <SeverityBar counts={counts} total={total} />
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingBottom:12 }}>
                            <SevBadge sev="CRITICAL" count={counts.CRITICAL}/>
                            <SevBadge sev="HIGH" count={counts.HIGH}/>
                            <SevBadge sev="MEDIUM" count={counts.MEDIUM}/>
                            <SevBadge sev="LOW" count={counts.LOW}/>
                        </div>
                    </div>

                    {/* expanded details */}
                    {expanded && (
                        <div style={{ borderTop:'1px solid var(--border)', padding:'14px 18px', background:'var(--bg3)' }}>
                            {/* findings by service */}
                            <div style={{ marginBottom:14 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>Findings by Service</div>
                                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                    {Object.entries(byService).sort((a,b)=>b[1].length-a[1].length).map(([svc,items]) => {
                                        const svCounts = severityCounts(items)
                                        const topSev = ['CRITICAL','HIGH','MEDIUM','LOW'].find(s=>svCounts[s]>0) || 'LOW'
                                        return (
                                            <div key={svc} style={{ background:'var(--bg2)', border:`1px solid ${SEV_COLOR[topSev]}30`, borderRadius:6, padding:'8px 12px', minWidth:100 }}>
                                                <div style={{ fontSize:11, fontWeight:700, color:SEV_COLOR[topSev] }}>{svc}</div>
                                                <div style={{ fontSize:18, fontWeight:800, color:'var(--text)' }}>{items.length}</div>
                                                <div style={{ fontSize:10, color:'var(--text3)' }}>findings</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* remediations taken during this scan */}
                            {execs.length > 0 && (
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>Remediations Executed</div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                        {execs.map((ex,i) => (
                                            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg2)', borderRadius:6, border:'1px solid rgba(6,115,64,0.2)' }}>
                                                <span style={{ fontSize:14 }}>{ex.status==='EXECUTED'?'✅':ex.status==='PARTIAL'?'⚠️':'❌'}</span>
                                                <div style={{ flex:1, minWidth:0 }}>
                                                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', fontFamily:'monospace' }}>{ex.finding_type || ex.type || '—'}</div>
                                                    <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ex.resource_id || '—'}</div>
                                                </div>
                                                <span style={{ fontSize:10, fontWeight:700, color:ex.status==='EXECUTED'?'#067340':ex.status==='PARTIAL'?'#f59e0b':'#d13212', background:ex.status==='EXECUTED'?'rgba(6,115,64,0.1)':ex.status==='PARTIAL'?'rgba(245,158,11,0.1)':'rgba(209,50,18,0.1)', borderRadius:4, padding:'2px 8px' }}>
                                                    {ex.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function RemediationEvent({ ex }) {
    const status = ex.status || 'EXECUTED'
    const statusColor = status==='EXECUTED'?'#067340':status==='PARTIAL'?'#f59e0b':'#d13212'
    const statusBg = status==='EXECUTED'?'rgba(6,115,64,0.1)':status==='PARTIAL'?'rgba(245,158,11,0.1)':'rgba(209,50,18,0.1)'

    return (
        <div style={{ display:'flex', gap:0 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:32, flexShrink:0 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:statusColor, border:'2px solid #fff', boxShadow:`0 0 0 2px ${statusColor}`, flexShrink:0, marginTop:5 }}/>
                <div style={{ flex:1, width:2, background:'var(--border)', marginTop:4 }}/>
            </div>
            <div style={{ flex:1, marginBottom:10, marginLeft:12 }}>
                <div style={{ background:'var(--bg2)', border:`1px solid ${statusColor}25`, borderRadius:8, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:30, height:30, borderRadius:6, background:`${statusColor}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontSize:15 }}>{status==='EXECUTED'?'🛠️':status==='PARTIAL'?'⚠️':'❌'}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', fontFamily:'monospace', marginBottom:2 }}>
                            {ex.finding_type || ex.type || 'REMEDIATION'}
                        </div>
                        <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {ex.resource_id || '—'} {ex.region ? `· ${ex.region}` : ''}
                        </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:statusColor, background:statusBg, borderRadius:4, padding:'2px 8px', display:'block', marginBottom:3 }}>
                            {status}
                        </span>
                        <div style={{ fontSize:10, color:'var(--text3)' }}>{relTime(ex.created_at || ex.executed_at)}</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Animated "Findings Hidden" Banner ─────────────────────────────────────
function HiddenFindingsBanner({ totalScans, totalFindings, totalCritHigh, onToggle, style }) {
    const canvasRef = useRef(null)
    const rafRef    = useRef(null)
    const tRef      = useRef(0)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const S = 110, cx = S/2, cy = S/2
        canvas.width = S; canvas.height = S
        const ctx = canvas.getContext('2d')
        const orbs = [
            { r:36, speed:0.012, offset:0,           size:3,   color:'#8B5CF6' },
            { r:36, speed:0.012, offset:Math.PI,     size:3,   color:'#8B5CF6' },
            { r:44, speed:0.007, offset:Math.PI/3,   size:2.2, color:'rgba(139,92,246,0.6)' },
            { r:44, speed:0.007, offset:Math.PI*4/3, size:2.2, color:'rgba(139,92,246,0.6)' },
            { r:26, speed:0.019, offset:Math.PI/2,   size:1.8, color:'rgba(139,92,246,0.4)' },
            { r:26, speed:0.019, offset:Math.PI*3/2, size:1.8, color:'rgba(139,92,246,0.4)' },
        ]
        function draw() {
            const t = tRef.current
            ctx.clearRect(0, 0, S, S)
            ;[22, 34, 46].forEach((r, i) => {
                const pulse = 0.4 + 0.25 * Math.sin(t * 0.04 - i * 0.7)
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2)
                ctx.strokeStyle = `rgba(139,92,246,${pulse * 0.4})`
                ctx.lineWidth = i === 1 ? 1.5 : 0.8; ctx.stroke()
            })
            orbs.forEach(o => {
                const angle = o.offset + t * o.speed
                const x = cx + Math.cos(angle) * o.r
                const y = cy + Math.sin(angle) * o.r
                const grad = ctx.createRadialGradient(x, y, 0, x, y, o.size * 3)
                grad.addColorStop(0, o.color); grad.addColorStop(1, 'transparent')
                ctx.beginPath(); ctx.arc(x, y, o.size * 3, 0, Math.PI*2)
                ctx.fillStyle = grad; ctx.fill()
                ctx.beginPath(); ctx.arc(x, y, o.size, 0, Math.PI*2)
                ctx.fillStyle = o.color
                ctx.shadowColor = '#8B5CF6'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0
            })
            const lp = 0.85 + 0.15 * Math.sin(t * 0.05)
            ctx.save(); ctx.translate(cx, cy); ctx.scale(lp, lp)
            ctx.beginPath(); ctx.arc(0, -6, 7, Math.PI, 0)
            ctx.strokeStyle = '#8B5CF6'; ctx.lineWidth = 2.5
            ctx.shadowColor = '#8B5CF6'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0
            ctx.beginPath(); ctx.roundRect(-9, -3, 18, 14, 3)
            ctx.fillStyle = 'rgba(139,92,246,0.15)'; ctx.fill()
            ctx.strokeStyle = '#8B5CF6'; ctx.lineWidth = 1.8
            ctx.shadowColor = '#8B5CF6'; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0
            ctx.beginPath(); ctx.arc(0, 3.5, 2.5, 0, Math.PI*2)
            ctx.fillStyle = '#8B5CF6'; ctx.fill()
            ctx.restore()
            tRef.current = t + 1
            rafRef.current = requestAnimationFrame(draw)
        }
        draw()
        return () => cancelAnimationFrame(rafRef.current)
    }, [])

    return (
        <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', textAlign:'center', gap:0,
            ...style,
        }}>
            <style>{`
                @keyframes hfb-bounce-down {
                    0%,100% { transform:translateY(0); opacity:0.6; }
                    50%     { transform:translateY(9px); opacity:1; }
                }
                @keyframes hfb-fadein {
                    from { opacity:0; transform:translateY(6px); }
                    to   { opacity:1; transform:translateY(0); }
                }
                @keyframes hfb-pulse-toggle {
                    0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.5); }
                    50%     { box-shadow: 0 0 0 10px rgba(139,92,246,0); }
                }
            `}</style>

            {/* Canvas */}
            <canvas ref={canvasRef} style={{ width:110, height:110, marginBottom:6 }} />

            {/* Title + badges */}
            <div style={{ animation:'hfb-fadein 0.4s ease', marginBottom:12 }}>
                <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:8 }}>
                    Findings Locked
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#8B5CF6',
                        background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.25)',
                        borderRadius:20, padding:'2px 12px' }}>
                        {totalScans} scan{totalScans!==1?'s':''}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#d13212',
                        background:'rgba(209,50,18,0.1)', border:'1px solid rgba(209,50,18,0.25)',
                        borderRadius:20, padding:'2px 12px' }}>
                        {totalFindings} finding{totalFindings!==1?'s':''}
                    </span>
                    {totalCritHigh > 0 && (
                        <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b',
                            background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)',
                            borderRadius:20, padding:'2px 12px' }}>
                            {totalCritHigh} critical/high
                        </span>
                    )}
                </div>
            </div>

            {/* Down arrow → points at the toggle below */}
            <div style={{ fontSize:22, color:'#8B5CF6', lineHeight:1, marginBottom:4,
                animation:'hfb-bounce-down 1.3s ease-in-out infinite',
                filter:'drop-shadow(0 0 6px rgba(139,92,246,0.8))' }}>↓</div>
            <div style={{ fontSize:10, fontWeight:700, color:'#8B5CF6', letterSpacing:1,
                textTransform:'uppercase', marginBottom:10, opacity:0.7 }}>
                click to reveal
            </div>

            {/* Centered toggle switch — this IS the action */}
            <div
                onClick={onToggle}
                title="Toggle to show findings"
                style={{
                    width:60, height:30, borderRadius:15, cursor:'pointer',
                    position:'relative', background:'rgba(139,92,246,0.15)',
                    border:'2px solid rgba(139,92,246,0.5)',
                    animation:'hfb-pulse-toggle 2s ease infinite',
                    transition:'background 0.2s',
                    flexShrink:0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(139,92,246,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(139,92,246,0.15)' }}
            >
                {/* thumb on the left = OFF state */}
                <div style={{
                    position:'absolute', top:3, left:3,
                    width:20, height:20, borderRadius:'50%',
                    background:'#8B5CF6', boxShadow:'0 0 8px rgba(139,92,246,0.7)',
                }} />
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
                Toggle to view audit timeline
            </div>
        </div>
    )
}


// ─── Animated radar canvas for empty state ─────────────────────────────────
// ── Schedule Control Panel ──────────────────────────────────────────────────
function SchedulePanel({ accountDbId }) {
    const [cfg,      setCfg]      = useState(null)   // null = loading
    const [saving,   setSaving]   = useState(false)
    const [running,  setRunning]  = useState(false)
    const [interval, setInterval] = useState(24)
    const [enabled,  setEnabled]  = useState(false)
    const [tick,     setTick]     = useState(0)       // clock for countdown

    // Load schedule
    const loadCfg = useCallback(async () => {
        if (!accountDbId) return
        try {
            const r = await scheduleAPI.get(accountDbId)
            const c = r.data?.data?.config || null
            setCfg(c)
            if (c) { setInterval(c.interval_hours); setEnabled(c.enabled === 1) }
        } catch { /* ignore */ }
    }, [accountDbId])

    useEffect(() => { loadCfg() }, [loadCfg])
    // countdown ticker — every 10s so 1-min interval looks live
    useEffect(() => { const t = setInterval(() => setTick(x=>x+1), 10000); return () => clearInterval(t) }, [])

    async function save(newEnabled, newInterval) {
        if (!accountDbId) return
        setSaving(true)
        try {
            await scheduleAPI.save({ account_db_id: accountDbId, enabled: newEnabled?1:0, interval_hours: newInterval || interval })
            await loadCfg()
        } finally { setSaving(false) }
    }

    async function handleRunNow() {
        if (!accountDbId) return
        setRunning(true)
        try {
            await scheduleAPI.runNow(accountDbId)
        } finally { setTimeout(() => setRunning(false), 2000) }
    }

    // Countdown formatter
    function countdown(iso) {
        if (!iso) return '—'
        const diff = new Date(iso) - new Date()
        if (diff <= 0) return 'Any moment…'
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        if (h > 0) return `${h}h ${m}m`
        return `${m}m`
    }

    const INTERVALS = [
        { v:-1,  label:'Every 1m'  },
        { v:-20, label:'Every 20m' },
        { v:1,   label:'Every 1h'  },
        { v:6,   label:'Every 6h'  },
        { v:12,  label:'Every 12h' },
        { v:24,  label:'Every 24h' },
    ]

    // Human-readable interval label from stored value
    function intervalLabel(v) {
        const found = INTERVALS.find(i => i.v === v)
        return found ? found.label : (v < 0 ? `Every ${Math.abs(v)}m` : `Every ${v}h`)
    }

    return (
        <div style={{ marginBottom:16, borderRadius:12, border:'1.5px solid rgba(121,83,210,0.25)', background:'rgba(121,83,210,0.04)', overflow:'hidden' }}>
            {/* Header row */}
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom: enabled ? '1px solid rgba(121,83,210,0.15)' : 'none' }}>
                <div style={{ width:36, height:36, borderRadius:9, background:'rgba(121,83,210,0.12)', border:'1.5px solid rgba(121,83,210,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⏰</div>
                <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', marginBottom:1 }}>Scheduled Scans</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>
                        {enabled && cfg?.next_run_at
                            ? <>Next scan in <strong style={{color:'#7953d2'}}>{countdown(cfg.next_run_at)}</strong> · {intervalLabel(cfg.interval_hours)} · Last: {cfg.last_run_at ? relTime(cfg.last_run_at) : 'Never'}</>
                            : 'Automatically snapshot your AWS environment on a schedule'}
                    </div>
                </div>
                {/* Enable toggle */}
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {enabled && (
                        <button
                            onClick={handleRunNow} disabled={running}
                            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:7, border:'1px solid rgba(121,83,210,0.35)', background:'rgba(121,83,210,0.08)', color:'#7953d2', fontSize:11, fontWeight:700, cursor:running?'wait':'pointer', whiteSpace:'nowrap' }}
                        >
                            {running ? '⏳ Running…' : '▶ Run Now'}
                        </button>
                    )}
                    <button
                        onClick={() => { const n=!enabled; setEnabled(n); save(n, interval) }}
                        disabled={saving}
                        style={{
                            width:44, height:24, borderRadius:12, border:'none', cursor:saving?'wait':'pointer',
                            background: enabled ? '#7953d2' : 'var(--border2)',
                            position:'relative', transition:'background 0.2s', flexShrink:0,
                        }}
                    >
                        <div style={{ position:'absolute', top:3, left: enabled?22:3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                    </button>
                    <span style={{ fontSize:11, fontWeight:600, color: enabled?'#7953d2':'var(--text3)', minWidth:32 }}>{enabled?'ON':'OFF'}</span>
                </div>
            </div>

            {/* Interval picker — only shown when enabled */}
            {enabled && (
                <div style={{ padding:'12px 20px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, marginRight:4 }}>Interval:</span>
                    {INTERVALS.map(({ v, label }) => (
                        <button
                            key={v}
                            onClick={() => { setInterval(v); save(true, v) }}
                            disabled={saving}
                            style={{
                                padding:'5px 14px', borderRadius:7, border:`1.5px solid ${interval===v ? '#7953d2' : 'var(--border)'}`,
                                background: interval===v ? 'rgba(121,83,210,0.12)' : 'transparent',
                                color: interval===v ? '#7953d2' : 'var(--text3)',
                                fontSize:12, fontWeight: interval===v ? 700 : 500,
                                cursor:'pointer', transition:'all 0.12s',
                            }}
                        >{label}</button>
                    ))}
                    {saving && <span style={{ fontSize:11, color:'#7953d2' }}>Saving…</span>}
                    {running && <span style={{ fontSize:11, color:'#7953d2' }}>⏳ Scan triggered — check timeline in ~30s</span>}
                </div>
            )}
        </div>
    )
}


function HistoryRadarBanner({ onNav }) {
    const canvasRef = useRef(null)
    const rafRef    = useRef(null)
    const angRef    = useRef(0)
    const [msg, setMsg] = useState(0)
    const msgs = [
        'Waiting for first scan…',
        'Run a scan to see security posture',
        'History builds as you scan',
        'Each scan is compared to the last',
        'Changes and new findings are highlighted',
    ]
    useEffect(() => {
        const iv = setInterval(() => setMsg(m => (m+1)%msgs.length), 2400)
        return () => clearInterval(iv)
    }, [])
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const S = 130, cx = S/2, cy = S/2, R = S/2 - 6
        canvas.width = S; canvas.height = S
        const ctx = canvas.getContext('2d')
        const blips = [
            { a:0.6, r:0.55 }, { a:1.4, r:0.72 }, { a:2.1, r:0.40 },
            { a:3.0, r:0.65 }, { a:3.8, r:0.48 }, { a:5.0, r:0.70 },
        ]
        function draw() {
            ctx.clearRect(0, 0, S, S)
            ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2)
            ctx.fillStyle='rgba(139,92,246,0.05)'; ctx.fill()
            ctx.strokeStyle='rgba(139,92,246,0.3)'; ctx.lineWidth=1.2; ctx.stroke()
            ;[0.35,0.65].forEach(f => {
                ctx.beginPath(); ctx.arc(cx,cy,R*f,0,Math.PI*2)
                ctx.strokeStyle='rgba(139,92,246,0.1)'; ctx.lineWidth=0.7; ctx.stroke()
            })
            ctx.beginPath()
            ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy)
            ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R)
            ctx.strokeStyle='rgba(139,92,246,0.08)'; ctx.lineWidth=0.7; ctx.stroke()
            const a = angRef.current, TRAIL = Math.PI*1.2
            for (let t=0;t<40;t++) {
                const ta = a-(TRAIL*t/40)
                ctx.beginPath(); ctx.moveTo(cx,cy)
                ctx.arc(cx,cy,R-1,ta-0.08,ta+0.001); ctx.closePath()
                ctx.fillStyle=`rgba(139,92,246,${(1-t/40)*0.15})`; ctx.fill()
            }
            ctx.beginPath(); ctx.moveTo(cx,cy)
            ctx.lineTo(cx+Math.cos(a)*(R-1),cy+Math.sin(a)*(R-1))
            ctx.strokeStyle='rgba(139,92,246,0.9)'; ctx.lineWidth=2
            ctx.shadowColor='#8B5CF6'; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0
            blips.forEach(b => {
                const bx=cx+Math.cos(b.a)*R*b.r, by=cy+Math.sin(b.a)*R*b.r
                let diff=(a-b.a)%(Math.PI*2); if(diff<0) diff+=Math.PI*2
                const alpha=diff<1.4?Math.max(0,1-diff/1.4):0
                ctx.beginPath(); ctx.arc(bx,by,alpha>0.05?3.5:2,0,Math.PI*2)
                ctx.fillStyle='#8B5CF6'; ctx.shadowColor='#8B5CF6'
                ctx.shadowBlur=alpha>0.05?8*alpha:0
                ctx.globalAlpha=alpha>0.05?(0.3+alpha*0.7):0.2; ctx.fill()
                ctx.globalAlpha=1; ctx.shadowBlur=0
            })
            ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2)
            ctx.fillStyle='#8B5CF6'; ctx.shadowColor='#8B5CF6'; ctx.shadowBlur=12; ctx.fill(); ctx.shadowBlur=0
            angRef.current=(a+0.035)%(Math.PI*2)
            rafRef.current=requestAnimationFrame(draw)
        }
        draw(); return () => cancelAnimationFrame(rafRef.current)
    }, [])
    return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, padding:'50px 24px', textAlign:'center' }}>
            <canvas ref={canvasRef} style={{ width:130, height:130 }} />
            <div>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginBottom:6 }}>No Scan History Yet</div>
                <div style={{ fontSize:12, color:'#8B5CF6', fontFamily:'monospace', fontWeight:600,
                    background:'rgba(139,92,246,0.07)', border:'1px solid rgba(139,92,246,0.2)',
                    borderRadius:6, padding:'4px 14px', marginBottom:12, display:'inline-block' }}>
                    ⬡ {msgs[msg]}
                </div>
                <p style={{ fontSize:12, color:'var(--text3)', maxWidth:360, lineHeight:1.7, margin:'0 auto 16px' }}>
                    Run a security scan and CloudShield will record every finding, track changes between scans, and build a full audit trail here.
                </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => onNav?.('scanner')}
                    style={{ padding:'9px 22px', background:'#8B5CF6', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 12px rgba(139,92,246,0.3)' }}>
                    🔍 Run First Scan
                </button>
                <button onClick={() => onNav?.('overview')}
                    style={{ padding:'9px 18px', background:'transparent', color:'var(--text2)', border:'1px solid var(--border2)', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    Overview →
                </button>
            </div>
        </div>
    )
}

// ─── main section ──────────────────────────────────────────────────────────────
export function HistorySection({ onNav }) {
    const { account } = useAuth()
    // For IAM users: account_id = parent root account DB id; for root: account.id
    const accountId = account?.account_type === 'iam'
        ? (account?.account_id ?? null)
        : (account?.id ?? null)

    const [scans,         setScans]        = useState([])
    const [summary,       setSummary]      = useState(null)
    const [execs,         setExecs]        = useState([])
    const [drift,         setDrift]        = useState(null)
    const [loading,       setLoading]      = useState(true)
    const [error,         setError]        = useState(null)
    const [filter,        setFilter]       = useState('all')
    const [sevFilter,     setSevFilter]    = useState('ALL')
    const [search,        setSearch]       = useState('')
    const [lastRefresh,   setLast]         = useState(null)
    const [changesOnly,   setChangesOnly]  = useState(true)
    const [showFindings,  setShowFindings] = useState(true)  // ← toggle findings list

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const [hRes, sRes, eRes, dRes] = await Promise.all([
                historyAPI.all(accountId),
                historyAPI.summary(accountId),
                executeAPI.list(accountId).catch(()=>({ data:{ data:[] } })),
                driftAPI.get(accountId).catch(()=>({ data:{ data: null } })),
            ])
            const rawVal = hRes.data?.data
            const raw    = Array.isArray(rawVal) ? rawVal : (Array.isArray(hRes.data) ? hRes.data : [])
            const sData  = sRes.data?.data || sRes.data || {}
            const eData  = eRes.data?.data || eRes.data || []
            const dData  = dRes.data?.data || null

            const sorted = [...raw].sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp))
            setScans(sorted)
            setSummary(sData)
            if (dData?.has_drift) setDrift(dData)
            const execList = Array.isArray(eData) ? eData : (eData.executions || [])
            setExecs(execList.sort((a,b) => new Date(b.created_at||b.executed_at||0) - new Date(a.created_at||a.executed_at||0)))
            setLast(new Date())
        } catch(e) {
            setError(e.message || 'Failed to load history')
        } finally {
            setLoading(false)
        }
    }, [accountId])

    useEffect(() => { load() }, [load])

    // executions grouped by scan_id for quick lookup
    const execMap = {}
    execs.forEach(ex => {
        const sid = ex.scan_id
        if (sid) { if (!execMap[sid]) execMap[sid] = []; execMap[sid].push(ex) }
    })

    // ── Compute delta-annotated scans (sorted newest first) ────────────────
    // scans[0] = newest, scans[n-1] = oldest
    // delta for scans[i] = diff from scans[i+1] (the scan before it in time)
    const annotatedScans = scans.map((sc, i) => ({
        scan:  sc,
        delta: scanChangedFrom(sc, scans[i + 1] || null),
        execs: execMap[sc.scan_id] || [],
    }))

    // Apply search + severity filters
    const baseFiltered = annotatedScans.filter(({ scan, delta }) => {
        if (sevFilter !== 'ALL') {
            const counts = severityCounts(scan.details)
            if (!counts[sevFilter]) return false
        }
        if (search) {
            const q = search.toLowerCase()
            return (
                String(scan.scan_id).includes(q) ||
                scan.details?.some(f => f.type?.toLowerCase().includes(q) || f.resource_id?.toLowerCase().includes(q))
            )
        }
        return true
    })

    // Apply changes-only filter: hide scans identical to previous (unless they have remediations)
    const displayScans = changesOnly && !search && sevFilter === 'ALL'
        ? baseFiltered.filter(({ delta, execs }) => delta.changed || delta.isFirst || execs.length > 0)
        : baseFiltered

    const hiddenCount = baseFiltered.length - displayScans.length

    // aggregate computed values
    const totalFindings  = scans.reduce((s,sc) => s + (sc.count||0), 0)
    const totalCritHigh  = scans.reduce((s,sc) => { const c = severityCounts(sc.details); return s+c.CRITICAL+c.HIGH }, 0)
    const totalExecs     = execs.length
    const totalScans     = scans.length
    const changedScans   = annotatedScans.filter(({ delta, execs }) => delta.changed || delta.isFirst || execs.length > 0).length

    // ── styles ──────────────────────────────────────────────────────────────
    const S = {
        root:   { display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)', overflow:'hidden' },
        header: { padding:'20px 24px 0', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', flexShrink:0, boxShadow:'0 1px 8px rgba(0,0,0,0.07)', marginBottom:4 },
        hTop:   { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 },
        hLeft:  { display:'flex', alignItems:'center', gap:14 },
        icon:   { width:42, height:42, borderRadius:10, background:'rgba(139,92,246,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:21, flexShrink:0 },
        h1:     { fontSize:22, fontWeight:800, color:'var(--text)', margin:0, lineHeight:1.2 },
        sub:    { fontSize:12, color:'var(--text3)', marginTop:3 },
        refreshBtn: { display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'transparent', border:'1px solid var(--border2)', borderRadius:6, fontSize:12, fontWeight:600, color:'var(--text2)', cursor:'pointer' },
        tiles:  { display:'flex', gap:12, margin:'0 0 20px' },
        tabs:   { display:'flex', gap:0, borderTop:'1px solid var(--border)', marginTop:8 },
        tab:    (active) => ({ padding:'10px 20px', fontSize:12, fontWeight:600, border:'none', background:'transparent', cursor:'pointer', color:active?'#8B5CF6':'var(--text3)', borderBottom:active?'2px solid #8B5CF6':'2px solid transparent', transition:'all 0.15s' }),
        body:   { flex:1, overflow: showFindings ? 'auto' : 'hidden', padding:'20px 28px', display:'flex', flexDirection:'column' },
        filterBar: { display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' },
        searchBox: { flex:1, minWidth:200, display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:6, padding:'7px 12px' },
        searchInput: { border:'none', background:'transparent', fontSize:12, color:'var(--text)', flex:1, outline:'none' },
        sevBtn: (active) => ({ padding:'6px 12px', fontSize:11, fontWeight:700, border:`1px solid ${active?'#8B5CF6':'var(--border)'}`, borderRadius:6, background:active?'rgba(139,92,246,0.1)':'transparent', color:active?'#8B5CF6':'var(--text3)', cursor:'pointer', transition:'all 0.15s' }),
        emptyState: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:'60px 20px', textAlign:'center' },
        timeline: { display:'flex', flexDirection:'column' },
        spinner: { width:16, height:16, border:'2px solid var(--border)', borderTopColor:'#8B5CF6', borderRadius:'50%', animation:'spin 0.8s linear infinite' },
    }

    return (
        <div style={S.root}>
            {/* ── Header ──────────────────────────────────────────── */}
            <div style={S.header}>
                <div style={S.hTop}>
                    <div style={S.hLeft}>
                        <div style={S.icon}>📋</div>
                        <div>
                            <h1 style={S.h1}>Audit History</h1>
                            <p style={S.sub}>
                                {changesOnly
                                    ? <>{changedScans} change event{changedScans!==1?'s':''} · {totalScans} total scans · {totalExecs} remediation{totalExecs!==1?'s':''}</>
                                    : <>{totalScans} scan{totalScans!==1?'s':''} · {totalExecs} remediation{totalExecs!==1?'s':''}</>}
                                {lastRefresh && <span style={{marginLeft:8}}>· Updated {relTime(lastRefresh)}</span>}
                            </p>
                        </div>
                    </div>
                    <button style={S.refreshBtn} onClick={load} disabled={loading}>
                        <span style={{ display:'inline-block', animation:loading?'spin 0.8s linear infinite':undefined }}>↻</span>
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                {/* stat tiles */}
                <div style={S.tiles}>
                    <StatTile icon="🔍" label="Total Scans"      value={totalScans}    sub="full security scans run"     color="#FF9900"/>
                    <StatTile icon="🐛" label="Total Findings"   value={totalFindings} sub="across all scans"            color="#d13212"/>
                    <StatTile icon="🔥" label="Critical + High"  value={totalCritHigh} sub="high-severity issues found"  color="#f59e0b"/>
                    <StatTile icon="🛠️" label="Remediations"     value={totalExecs}    sub="auto-fixes executed"         color="#067340"/>
                </div>

                {/* tabs */}
                <div style={S.tabs}>
                    {[['all','All Events'],['scans','Scans Only'],['remediations','Remediations Only']].map(([k,l]) => (
                        <button key={k} style={S.tab(filter===k)} onClick={()=>setFilter(k)}>{l}</button>
                    ))}
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────────── */}
            <div style={S.body}>

                {/* ── Scheduled Scans control panel ── */}
                <SchedulePanel accountDbId={accountId} />

                {/* filter bar */}

                <div style={S.filterBar}>
                    <div style={S.searchBox}>
                        <span style={{ fontSize:13, color:'var(--text3)' }}>🔍</span>
                        <input
                            style={S.searchInput}
                            placeholder="Search finding type, resource ID, region..."
                            value={search}
                            onChange={e=>setSearch(e.target.value)}
                        />
                        {search && <button onClick={()=>setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14 }}>✕</button>}
                    </div>

                    {/* Changes-only toggle */}
                    <button
                        onClick={() => setChangesOnly(v => !v)}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', fontSize:11, fontWeight:700,
                            border:`1px solid ${changesOnly ? '#8B5CF6' : 'var(--border)'}`,
                            borderRadius:6, background:changesOnly ? 'rgba(139,92,246,0.1)' : 'transparent',
                            color:changesOnly ? '#8B5CF6' : 'var(--text3)', cursor:'pointer', transition:'all 0.15s',
                            whiteSpace:'nowrap' }}
                    >
                        {changesOnly ? '⚡ Changes Only' : '📋 All Scans'}
                    </button>

                    {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(s => (
                        <button key={s} style={S.sevBtn(sevFilter===s)} onClick={()=>setSevFilter(s)}>
                            {s!=='ALL' && <span style={{ color:SEV_COLOR[s] }}>● </span>}{s}
                        </button>
                    ))}
                </div>

                {/* hidden count notice */}
                {changesOnly && hiddenCount > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, marginBottom:16, fontSize:11, color:'var(--text3)' }}>
                        <span>🔽</span>
                        <span>{hiddenCount} identical scan{hiddenCount!==1?'s':''} hidden (no new findings). </span>
                        <button onClick={()=>setChangesOnly(false)} style={{ border:'none', background:'none', color:'#8B5CF6', fontWeight:700, cursor:'pointer', fontSize:11, padding:0 }}>Show all</button>
                    </div>
                )}

                {/* error */}
                {error && (
                    <div style={{ padding:'14px 18px', background:'rgba(209,50,18,0.07)', border:'1px solid rgba(209,50,18,0.2)', borderRadius:8, color:'#d13212', fontSize:13, marginBottom:16 }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* loading skeleton */}
                {loading && (
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                        {[1,2,3].map(i => (
                            <div key={i} style={{ height:80, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, animation:'pulse 1.5s ease-in-out infinite', opacity:0.6 }}/>
                        ))}
                    </div>
                )}

                {/* ── Empty state: animated radar banner ── */}
                {!loading && !error && totalScans === 0 && (
                    <HistoryRadarBanner onNav={onNav} />
                )}

                {/* ── Show Findings toggle row — only when timeline IS visible ── */}
                {!loading && !error && totalScans > 0 && showFindings && (
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14,
                        padding:'8px 14px', background:'var(--bg2)', border:'1px solid var(--border)',
                        borderRadius:8, width:'fit-content' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
                            <div
                                onClick={() => setShowFindings(v => !v)}
                                style={{
                                    width:38, height:20, borderRadius:10, cursor:'pointer', position:'relative',
                                    background: '#8B5CF6',
                                    border:'1.5px solid #8B5CF6',
                                    transition:'background 0.25s, border-color 0.25s',
                                    boxShadow:'0 0 8px rgba(139,92,246,0.35)',
                                    flexShrink:0,
                                }}
                            >
                                <div style={{
                                    position:'absolute', top:1, left:19,
                                    width:16, height:16, borderRadius:'50%',
                                    background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.2)',
                                    transition:'left 0.25s',
                                }} />
                            </div>
                            <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
                                📌 Findings visible
                            </span>
                        </label>
                    </div>
                )}

                {/* ── Animated "Findings Hidden" banner — fills remaining height ── */}
                {!loading && !error && totalScans > 0 && !showFindings && (
                    <HiddenFindingsBanner
                        style={{ flex:1 }}
                        totalScans={totalScans}
                        totalFindings={totalFindings}
                        totalCritHigh={totalCritHigh}
                        onToggle={() => setShowFindings(true)}
                    />
                )}


                {/* ── 🔄 Drift Summary Banner ─────────────────────── */}
                {!loading && drift && drift.has_drift && showFindings && (
                    <div style={{ background:'var(--surface)', border:'1.5px solid rgba(209,50,18,0.3)', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', boxShadow:'0 2px 8px rgba(209,50,18,0.08)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:18 }}>🔄</span>
                            <div>
                                <div style={{ fontSize:12, fontWeight:800, color:'var(--text)' }}>Drift Detected vs Previous Scan</div>
                                <div style={{ fontSize:10.5, color:'var(--text3)', marginTop:1 }}>
                                    {drift.total_previous} → {drift.summary.total_latest} findings &nbsp;·&nbsp; net {drift.summary.net_change > 0 ? `+${drift.summary.net_change}` : drift.summary.net_change}
                                </div>
                            </div>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontSize:11, fontWeight:700, color:'#d13212', background:'rgba(209,50,18,0.1)', borderRadius:6, padding:'3px 10px', border:'1px solid rgba(209,50,18,0.2)' }}>
                                🆕 {drift.summary.new} new
                            </span>
                            {drift.summary.resolved > 0 && (
                                <span style={{ fontSize:11, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.1)', borderRadius:6, padding:'3px 10px', border:'1px solid rgba(29,129,2,0.2)' }}>
                                    ✅ {drift.summary.resolved} resolved
                                </span>
                            )}
                            <span style={{ fontSize:11, fontWeight:700, color:'#8d9191', background:'rgba(141,145,145,0.08)', borderRadius:6, padding:'3px 10px', border:'1px solid rgba(141,145,145,0.15)' }}>
                                🔁 {drift.summary.persistent} persistent
                            </span>
                        </div>
                        {/* New findings severity breakdown */}
                        {drift.new_by_severity && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginLeft:'auto' }}>
                                {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => drift.new_by_severity[s] > 0 && (
                                    <span key={s} style={{ fontSize:9.5, fontWeight:700, color: s==='CRITICAL'?'#d13212':s==='HIGH'?'#c8960c':s==='MEDIUM'?'#0972d3':'#067340', background: s==='CRITICAL'?'rgba(209,50,18,0.08)':s==='HIGH'?'rgba(200,150,12,0.08)':s==='MEDIUM'?'rgba(9,114,211,0.08)':'rgba(6,115,64,0.08)', borderRadius:4, padding:'2px 7px' }}>
                                        +{drift.new_by_severity[s]} {s}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Timeline ─────────────────────────────────────── */}
                {!loading && !error && totalScans > 0 && showFindings && (
                    <div style={S.timeline}>
                        {(filter === 'all' || filter === 'scans') && displayScans.map(({ scan, delta: dl, execs: _e }, idx) => (
                            <ScanEvent key={scan.scan_id} evt={scan} execMap={execMap} delta={dl}
                              drift={idx === 0 ? drift : null} />
                        ))}

                        {filter === 'scans' && displayScans.length === 0 && (
                            <div style={S.emptyState}>
                                <span style={{ fontSize:40 }}>✅</span>
                                <p style={{ color:'var(--text3)', fontSize:13 }}>No changed scans found. Your environment has been stable.</p>
                                {changesOnly && <button onClick={()=>setChangesOnly(false)} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'6px 14px', background:'none', cursor:'pointer', fontSize:12, color:'#8B5CF6', fontWeight:700 }}>Show All Scans</button>}
                            </div>
                        )}

                        {filter === 'remediations' && (
                            execs.length === 0
                                ? <div style={S.emptyState}>
                                    <span style={{ fontSize:40 }}>🛠️</span>
                                    <p style={{ color:'var(--text3)', fontSize:13 }}>No remediations have been executed yet.</p>
                                  </div>
                                : execs
                                    .filter(ex => !search || ex.finding_type?.toLowerCase().includes(search.toLowerCase()) || ex.resource_id?.toLowerCase().includes(search.toLowerCase()))
                                    .filter(ex => sevFilter === 'ALL' || ex.severity === sevFilter)
                                    .map((ex,i) => <RemediationEvent key={i} ex={ex}/>)
                        )}

                        {filter === 'all' && displayScans.length === 0 && !search && sevFilter === 'ALL' && (
                            <div style={S.emptyState}>
                                <span style={{ fontSize:40 }}>🔍</span>
                                <p style={{ color:'var(--text3)', fontSize:13 }}>No events match the current filter.</p>
                            </div>
                        )}

                        {filter === 'all' && (search || sevFilter !== 'ALL') && displayScans.length === 0 && (
                            <div style={S.emptyState}>
                                <span style={{ fontSize:36 }}>🔍</span>
                                <p style={{ color:'var(--text3)', fontSize:13 }}>No events match "{search || sevFilter}"</p>
                                <button onClick={()=>{setSearch('');setSevFilter('ALL')}} style={{border:'1px solid var(--border)',borderRadius:6,padding:'6px 14px',background:'none',cursor:'pointer',fontSize:12,color:'var(--text2)'}}>
                                    Clear Filters
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
