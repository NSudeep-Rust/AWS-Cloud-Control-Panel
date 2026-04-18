import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

/* ── Colour palette ───────────────────────────────── */
const SEV_PALETTE = {
    CRITICAL: { col: '#d13212', bg: 'rgba(209,50,18,0.12)',  border: 'rgba(209,50,18,0.35)' },
    HIGH:     { col: '#e07b00', bg: 'rgba(224,123,0,0.12)',  border: 'rgba(224,123,0,0.35)' },
    MEDIUM:   { col: '#7953d2', bg: 'rgba(121,83,210,0.12)', border: 'rgba(121,83,210,0.35)' },
    LOW:      { col: '#0972d3', bg: 'rgba(9,114,211,0.12)',  border: 'rgba(9,114,211,0.35)' },
}

/* ── Category definitions (icons as inline SVG paths) ─ */
const CATS_META = [
    {
        id: 'PUBLIC_STORAGE', label: 'Public Storage', sub: 'S3 buckets exposed to the internet',
        severity: 'CRITICAL',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><path d="M3 7c0-1.1 4-2 9-2s9 .9 9 2-4 2-9 2-9-.9-9-2z"/><path d="M3 7v10c0 1.1 4 2 9 2s9-.9 9-2V7"/><path d="M3 12c0 1.1 4 2 9 2s9-.9 9-2"/></svg>,
    },
    {
        id: 'OPEN_NETWORK', label: 'Open Network Ports', sub: 'Security groups with unrestricted access',
        severity: 'CRITICAL',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="9" y="16" width="6" height="6" rx="1"/><path d="M5 8v4a2 2 0 002 2h10a2 2 0 002-2V8"/><path d="M12 12v4"/></svg>,
    },
    {
        id: 'PUBLIC_COMPUTE', label: 'Public Compute', sub: 'EC2 instances reachable from the internet',
        severity: 'HIGH',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
    },
    {
        id: 'EXPOSED_DATA', label: 'Exposed Data Stores', sub: 'Databases & snapshots with public access',
        severity: 'CRITICAL',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
    },
    {
        id: 'BLIND_SPOTS', label: 'Monitoring Blind Spots', sub: 'Regions where attacks go unlogged',
        severity: 'HIGH',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    },
    {
        id: 'IAM_EXPOSURE', label: 'IAM Exposure', sub: 'Over-privileged identities & missing MFA',
        severity: 'CRITICAL',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
    },
]

/* ───────────────────────────────────────────────────────
   EMPTY STATE  —  Premium 2-col layout
──────────────────────────────────────────────────────── */
function EmptyState({ dark }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <style>{`
                @keyframes asSlideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
                @keyframes asShimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                @keyframes asPulseRing { 0%{transform:scale(0.82);opacity:0.55} 100%{transform:scale(2.6);opacity:0} }
                @keyframes asBlink     { 0%,100%{opacity:1} 50%{opacity:0.15} }
                @keyframes asPop       { 0%{opacity:0;transform:scale(0.93)} 100%{opacity:1;transform:scale(1)} }
                @keyframes asOrbit     { to{transform:rotate(360deg)} }
                @keyframes asOrbitRev  { to{transform:rotate(-360deg)} }
                @keyframes asFloat     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
                @keyframes asSpin      { to{transform:rotate(360deg)} }
                @keyframes asBarScan   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
            `}</style>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, animation:'asSlideUp 0.4s ease both' }}>
                <div style={{ width:46, height:46, borderRadius:12, flexShrink:0, background:'rgba(209,50,18,0.1)', border:'1.5px solid rgba(209,50,18,0.28)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#d13212" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize:19, fontWeight:800, color:'var(--text)', letterSpacing:-0.4, marginBottom:3 }}>Attack Surface</div>
                    <div style={{ fontSize:11.5, color:'var(--text3)' }}>Identifies every publicly-exposed resource across your AWS infrastructure</div>
                </div>
            </div>

            {/* Main pipeline card */}
            <div style={{ background:'var(--bg2)', border:'1.5px solid rgba(209,50,18,0.22)', borderRadius:14, overflow:'hidden', boxShadow:'0 4px 28px rgba(209,50,18,0.07), var(--card-shadow)', animation:'asSlideUp 0.4s ease 0.06s both' }}>
                {/* Shimmer top bar */}
                <div style={{ height:3, background:'linear-gradient(90deg,#d13212,#e07b00,#d13212)', backgroundSize:'200%', animation:'asShimmer 2.4s linear infinite' }} />

                {/* Card header */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'13px 20px', borderBottom:'1px solid rgba(209,50,18,0.1)' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:'#d13212', animation:'asBlink 1.6s ease infinite' }} />
                    <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.5, color:'#d13212', textTransform:'uppercase' }}>Exposure Analysis Engine</span>
                    <div style={{ flex:1 }} />
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--text3)' }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#1d8102', display:'inline-block', boxShadow:'0 0 6px #1d810280' }} />
                        6 detectors ready
                    </div>
                </div>

                {/* 2-col body */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.65fr', minHeight:0 }}>

                    {/* LEFT — Globe radar + stats */}
                    <div style={{ padding:'28px 20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, borderRight:'1px solid rgba(209,50,18,0.1)', background:'rgba(209,50,18,0.02)' }}>
                        {/* Concentric-ring globe */}
                        <div style={{ position:'relative', width:120, height:120, display:'flex', alignItems:'center', justifyContent:'center', animation:'asFloat 4s ease infinite', flexShrink:0 }}>
                            {/* Outer orbit ring - carries 2 dots */}
                            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1px solid rgba(209,50,18,0.18)', animation:'asOrbit 7s linear infinite' }}>
                                {[0, 180].map((deg, k) => (
                                    <div key={k} style={{ position:'absolute', top:'50%', left:'50%', width:7, height:7, borderRadius:'50%', background: k===0 ? '#d13212' : '#e07b00', boxShadow:`0 0 8px ${k===0?'#d1321280':'#e07b0080'}`, transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(58px)` }} />
                                ))}
                            </div>
                            {/* Inner orbit ring - reversed */}
                            <div style={{ position:'absolute', inset:16, borderRadius:'50%', border:'1px dashed rgba(209,50,18,0.14)', animation:'asOrbitRev 11s linear infinite' }}>
                                {[90, 270].map((deg, k) => (
                                    <div key={k} style={{ position:'absolute', top:'50%', left:'50%', width:5, height:5, borderRadius:'50%', background:'rgba(209,50,18,0.5)', transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(36px)` }} />
                                ))}
                            </div>
                            {/* Pulse rings — all same animation cycle, just staggered start */}
                            {[0, 0.8, 1.6].map(delay => (
                                <div key={delay} style={{ position:'absolute', width:72, height:72, borderRadius:'50%', border:'1.5px solid rgba(209,50,18,0.3)', animation:`asPulseRing 2.4s ease-out ${delay}s infinite` }} />
                            ))}
                            {/* Globe icon centre */}
                            <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(209,50,18,0.1)', border:'2px solid rgba(209,50,18,0.45)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:2 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#d13212" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={28} height={28}>
                                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                                </svg>
                            </div>
                        </div>

                        {/* Label */}
                        <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Awaiting Scan Data</div>
                            <div style={{ fontSize:10, color:'var(--text3)', lineHeight:1.6 }}>52+ exposure checks · 6 detection engines<br/>covering 9 AWS regions</div>
                        </div>

                        {/* 2×2 stat grid */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, width:'100%' }}>
                            {[
                                { val:'52+', label:'Checks',    color:'#d13212' },
                                { val:'6',   label:'Detectors', color:'#e07b00' },
                                { val:'9',   label:'Regions',   color:'#0972d3' },
                                { val:'All', label:'Coverage',  color:'#1d8102' },
                            ].map(s => (
                                <div key={s.label} style={{ background:`${s.color}0a`, border:`1px solid ${s.color}22`, borderRadius:8, padding:'7px 8px', textAlign:'center' }}>
                                    <div style={{ fontSize:17, fontWeight:900, color:s.color, fontFamily:'monospace', background:`linear-gradient(90deg,${s.color},${s.color}bb,${s.color})`, backgroundSize:'200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'asShimmer 3s linear infinite' }}>{s.val}</div>
                                    <div style={{ fontSize:8, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8, marginTop:1 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT — 6 category rows (uniform, no random beams) */}
                    <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:9, justifyContent:'center' }}>
                        <div style={{ fontSize:9, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:3 }}>Detection Coverage</div>
                        {CATS_META.map((cat, i) => {
                            const pal = SEV_PALETTE[cat.severity] || SEV_PALETTE.HIGH
                            return (
                                <div key={cat.id} style={{
                                    background:`${pal.col}07`, border:`1px solid ${pal.col}20`,
                                    borderRadius:10, padding:'11px 14px',
                                    display:'flex', alignItems:'center', gap:12,
                                    animation:`asPop 0.3s ease ${i * 0.07}s both`,
                                    transition:'background 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.background = `${pal.col}12` }}
                                    onMouseLeave={e => { e.currentTarget.style.background = `${pal.col}07` }}
                                >
                                    {/* Icon tile */}
                                    <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, background:pal.bg, border:`1.5px solid ${pal.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:pal.col }}>
                                        {cat.icon}
                                    </div>
                                    {/* Content */}
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:11.5, fontWeight:700, color:'var(--text)', marginBottom:2 }}>{cat.label}</div>
                                        <div style={{ fontSize:9.5, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat.sub}</div>
                                    </div>
                                    {/* Severity badge */}
                                    <span style={{ fontSize:8.5, fontWeight:800, color:pal.col, background:`${pal.col}10`, border:`1px solid ${pal.col}28`, borderRadius:4, padding:'2px 8px', flexShrink:0, letterSpacing:0.5 }}>{cat.severity}</span>
                                    {/* Status dot — ALL same animation, no stagger */}
                                    <div style={{ width:7, height:7, borderRadius:'50%', background:pal.col, animation:'asBlink 1.8s ease infinite', flexShrink:0 }} />
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Footer CTA */}
                <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(209,50,18,0.08)', display:'flex', alignItems:'center', gap:10, background:'rgba(209,50,18,0.02)' }}>
                    <div style={{ width:28, height:28, borderRadius:7, background:'rgba(209,50,18,0.08)', border:'1px solid rgba(209,50,18,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#d13212" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                    </div>
                    <span style={{ fontSize:11.5, color:'var(--text3)' }}>
                        Run a security scan from the{' '}
                        <span style={{ color:'#e07b00', fontWeight:700 }}>Scanner</span>
                        {' '}to reveal your full attack surface map.
                    </span>
                </div>
            </div>

            {/* Bottom "what we detect" info row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, animation:'asSlideUp 0.4s ease 0.32s both' }}>
                {[
                    { icon:'🪣', label:'Public S3 Buckets',   desc:'Buckets without Block Public Access',    color:'#d13212' },
                    { icon:'🔓', label:'Open Firewall Ports',  desc:'SGs allowing 0.0.0.0/0 inbound',        color:'#d13212' },
                    { icon:'🗄️', label:'Exposed Databases',    desc:'RDS instances publicly accessible',      color:'#e07b00' },
                    { icon:'🖥️', label:'Internet-facing EC2',  desc:'Instances with direct public IPs',       color:'#e07b00' },
                    { icon:'👁️', label:'Unmonitored Regions',  desc:'Regions with CloudTrail disabled',       color:'#0972d3' },
                    { icon:'🔑', label:'IAM Over-Privileges',  desc:'Admin users, roles & missing MFA',       color:'#0972d3' },
                ].map((item, i) => (
                    <div key={i} style={{
                        background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:11,
                        padding:'12px 14px', display:'flex', alignItems:'center', gap:11,
                        boxShadow:'var(--card-shadow)', transition:'border-color 0.15s, box-shadow 0.15s',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor=`${item.color}44`; e.currentTarget.style.boxShadow=`0 4px 16px ${item.color}12` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.boxShadow='var(--card-shadow)' }}
                    >
                        <div style={{ fontSize:20, flexShrink:0 }}>{item.icon}</div>
                        <div>
                            <div style={{ fontSize:11.5, fontWeight:700, color:'var(--text)', marginBottom:2 }}>{item.label}</div>
                            <div style={{ fontSize:9.5, color:'var(--text3)' }}>{item.desc}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}


/* ───────────────────────────────────────────────────────
   CATEGORY CARD  (loaded state)
──────────────────────────────────────────────────────── */
function CategoryCard({ cat, dark, onFix, fixing, fixedIds }) {
    const [expanded,  setExpanded]  = useState(true)
    const [showAll,   setShowAll]   = useState(false)
    const pal    = SEV_PALETTE[cat.severity] || SEV_PALETTE.HIGH
    const meta   = CATS_META.find(m => m.id === cat.id) || {}
    const card   = dark ? '#161b22' : '#ffffff'
    const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
    const text   = dark ? '#e6edf3' : '#0f1111'
    const text2  = dark ? '#8b949e' : '#5a6270'
    const rowDiv = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'

    const LIMIT          = 10
    const visibleFindings = showAll
        ? cat.findings.filter(f => !fixedIds?.has(String(f.id)))
        : cat.findings.filter(f => !fixedIds?.has(String(f.id))).slice(0, LIMIT)
    const hiddenCount    = cat.findings.filter(f => !fixedIds?.has(String(f.id))).length - LIMIT

    return (
        <div style={{
            background: card,
            border:`1.5px solid ${cat.count > 0 ? pal.border : border}`,
            borderRadius:14,
            overflow:'hidden',
            boxShadow: cat.count > 0 ? `0 4px 20px ${pal.col}18` : 'none',
            transition:'box-shadow 0.2s',
        }}>
            {/* Header */}
            <div
                onClick={() => cat.count > 0 && setExpanded(e => !e)}
                style={{
                    padding:'14px 18px',
                    display:'flex', alignItems:'center', gap:12,
                    cursor: cat.count > 0 ? 'pointer' : 'default',
                    background: cat.count > 0 ? pal.bg : 'transparent',
                    borderBottom: expanded && cat.count > 0 ? `1px solid ${pal.col}25` : 'none',
                }}
            >
                <div style={{
                    width:40, height:40, borderRadius:11, flexShrink:0,
                    background: cat.count > 0 ? pal.bg : (dark ? 'rgba(255,255,255,0.05)' : '#f5f5f5'),
                    border:`1.5px solid ${cat.count > 0 ? pal.border : border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color: cat.count > 0 ? pal.col : text2,
                }}>
                    {meta.icon}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: cat.count > 0 ? text : text2 }}>{cat.label}</div>
                    <div style={{ fontSize:10.5, color:text2, marginTop:2 }}>{cat.desc}</div>
                </div>
                {cat.count === 0 ? (
                    <div style={{ fontSize:10, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.12)', border:'1px solid rgba(29,129,2,0.3)', borderRadius:20, padding:'3px 11px', flexShrink:0 }}>
                        All Clear
                    </div>
                ) : (
                    <>
                        <div style={{
                            minWidth:26, height:26, borderRadius:13,
                            background:pal.col, color:'#fff',
                            fontSize:11, fontWeight:800,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            padding:'0 8px', flexShrink:0,
                            boxShadow:`0 3px 10px ${pal.col}55`,
                        }}>
                            {cat.count > 99 ? '99+' : cat.count}
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke={text2} strokeWidth={2} width={13} height={13}
                            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition:'transform 0.2s', flexShrink:0 }}>
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </>
                )}
            </div>

            {/* Findings list */}
            {cat.count > 0 && expanded && (
                <div>
                    {visibleFindings.map((f, i) => (
                        <div key={f.id || i} style={{
                            padding:'10px 18px',
                            display:'flex', alignItems:'center', gap:10,
                            borderBottom: i < visibleFindings.length - 1 || (!showAll && hiddenCount > 0)
                                ? `1px solid ${rowDiv}` : 'none',
                        }}>
                            <div style={{
                                fontSize:9, fontWeight:700, color:pal.col,
                                background:pal.bg, border:`1px solid ${pal.border}`,
                                borderRadius:4, padding:'2px 7px',
                                whiteSpace:'nowrap', flexShrink:0, letterSpacing:0.3,
                            }}>
                                {(f.type||'').replace(/_/g,' ')}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:text, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {f.resource_id || '—'}
                                </div>
                            </div>
                            <div style={{ fontSize:10, color:text2, background: dark ? 'rgba(255,255,255,0.06)' : '#f5f5f5', border:`1px solid ${border}`, borderRadius:4, padding:'2px 8px', flexShrink:0, fontFamily:'monospace' }}>
                                {f.region}
                            </div>
                            {f.status === 'OPEN' ? (
                                <button
                                    onClick={() => onFix(f)}
                                    disabled={fixing === String(f.id)}
                                    style={{
                                        padding:'5px 13px',
                                        background: fixing === String(f.id) ? 'rgba(209,50,18,0.5)' : pal.col,
                                        color:'#fff', fontSize:11, fontWeight:700,
                                        border:'none', borderRadius:7, cursor: fixing === String(f.id) ? 'wait' : 'pointer',
                                        flexShrink:0, boxShadow: fixing === String(f.id) ? 'none' : `0 2px 8px ${pal.col}45`,
                                        transition:'all 0.15s',
                                        display:'flex', alignItems:'center', gap:5,
                                        opacity: fixing === String(f.id) ? 0.8 : 1,
                                    }}
                                    onMouseEnter={e=>{ if(fixing !== String(f.id)) e.currentTarget.style.opacity='0.8' }}
                                    onMouseLeave={e=>{ if(fixing !== String(f.id)) e.currentTarget.style.opacity='1' }}
                                >
                                    {fixing === String(f.id) ? (
                                        <>
                                            <div style={{ width:9, height:9, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', animation:'asSpin 0.7s linear infinite', flexShrink:0 }} />
                                            Executing...
                                        </>
                                    ) : 'Fix Now'}
                                </button>
                            ) : (
                                <div style={{ padding:'5px 10px', fontSize:10, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.1)', border:'1px solid rgba(29,129,2,0.25)', borderRadius:6, flexShrink:0 }}>
                                    {f.status}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Show More / Show Less */}
                    {hiddenCount > 0 && (
                        <div
                            onClick={() => setShowAll(s => !s)}
                            style={{
                                padding:'11px 18px',
                                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                                cursor:'pointer',
                                background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                borderTop: `1px solid ${rowDiv}`,
                                fontSize:12, fontWeight:700,
                                color: pal.col,
                                transition:'background 0.15s',
                                userSelect:'none',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={13} height={13}
                                style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                            {showAll
                                ? `Show less`
                                : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'resource' : 'resources'}`
                            }
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ───────────────────────────────────────────────────────
   MAIN EXPORT
──────────────────────────────────────────────────────── */
export function AttackSurfaceSection({ dark }) {
    const { account } = useAuth()
    const { refreshToken, status: scanStatus, elapsed } = useScan()
    const [data,    setData]    = useState(null)
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState(null)
    const [fixing,  setFixing]  = useState(null)
    const [fixedIds, setFixedIds] = useState(new Set())
    const [toast,   setToast]   = useState(null)

    const bg     = dark ? '#0d1117' : '#f0f2f5'
    const card   = dark ? '#161b22' : '#ffffff'
    const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
    const text   = dark ? '#e6edf3' : '#0f1111'
    const text2  = dark ? '#8b949e' : '#5a6270'

    const load = useCallback(async () => {
        if (!account?.id) return
        setLoading(true); setError(null)
        try {
            const r = await axios.get(`${API}/api/attack-surface/`, { params: { account_id: account.id } })
            setData(r.data?.data || null)
            setFixedIds(new Set())
            setFixing(null)     // clear any in-flight state after reload
        } catch { setError('Could not load attack surface data.') }
        finally { setLoading(false) }
    }, [account?.id])

    // ── Auto-refresh whenever a main scan completes (refreshToken bumped by WS scan_complete)
    useEffect(() => { load() }, [load, refreshToken])

    function showToast(text, ok = true) {
        setToast({ text, ok })
        setTimeout(() => setToast(null), 3000)
    }

    async function handleFix(finding) {
        setFixing(String(finding.id))
        // Small delay so React renders "Executing..." before the fast API call resolves
        await new Promise(r => setTimeout(r, 120))
        try {
            await axios.post(`${API}/api/execute/`, {
                scan_id:     String(data.scan_id),
                finding_ids: [String(finding.id)],
                mode:        'LIVE',
                source:      'attack_surface',
            })
            // Add to fixedIds — card disappears immediately and stays hidden this session.
            // The backend Execution filter excludes it on any future load.
            setFixedIds(prev => new Set([...prev, String(finding.id)]))
            showToast(`\u2705 ${finding.resource_id} \u2014 fix submitted to AWS`)
        } catch (e) {
            showToast(`\u274c Fix failed: ${e?.response?.data?.errors?.[0] || e.message}`, false)
            setFixing(null)   // Only reset on error — card stays visible
        }
    }

    /* ── Loading ── */
    if (loading) return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background: bg }}>
            <style>{`@keyframes asSpin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ textAlign:'center' }}>
                <div style={{ width:44, height:44, borderRadius:'50%', border:`3px solid ${border}`, borderTopColor:'#d13212', animation:'asSpin 0.8s linear infinite', margin:'0 auto 16px' }} />
                <div style={{ fontSize:13, color:text2 }}>Loading attack surface data...</div>
            </div>
        </div>
    )

    /* ── No scan yet ── */
    if (!data || data.no_scan) return <EmptyState dark={dark} />

    /* ── Loaded ── */
    const critCount = data.categories?.reduce((n,c) => n + (c.severity==='CRITICAL' ? c.count : 0), 0) || 0
    const highCount = data.categories?.reduce((n,c) => n + (c.severity==='HIGH'     ? c.count : 0), 0) || 0
    const allClear  = data.total_exposed === 0
    const lastScan  = data.last_scanned ? new Date(data.last_scanned).toLocaleString() : '—'

    return (
        <div style={{ minHeight:'100%', background:bg, padding:'28px' }}>
            <style>{`
                @keyframes asSpin    { to{transform:rotate(360deg)} }
                @keyframes asSlideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
                @keyframes asLiveDot { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.5} }
            `}</style>

            {/* ── Header ── */}
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:22, animation:'asSlideUp 0.4s ease both', flexWrap:'wrap' }}>
                <div style={{ width:50, height:50, borderRadius:14, flexShrink:0, background: allClear ? 'rgba(29,129,2,0.12)' : 'rgba(209,50,18,0.12)', border:`1.5px solid ${allClear ? 'rgba(29,129,2,0.3)' : 'rgba(209,50,18,0.3)'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={allClear ? '#1d8102' : '#d13212'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
                        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                    </svg>
                </div>
                <div style={{ flex:1 }}>
                    <div style={{ fontSize:20, fontWeight:800, color:text, letterSpacing:-0.5 }}>Attack Surface</div>
                    <div style={{ fontSize:12, color:text2, marginTop:3 }}>Last scanned: {lastScan}</div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    {!allClear && critCount > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:'#d13212', background:'rgba(209,50,18,0.1)', border:'1px solid rgba(209,50,18,0.3)', borderRadius:20, padding:'6px 14px' }}>
                            <div style={{ width:7, height:7, borderRadius:'50%', background:'#d13212', animation:'asLiveDot 1.4s ease infinite' }} />
                            {critCount} CRITICAL
                        </div>
                    )}
                    {!allClear && highCount > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:'#e07b00', background:'rgba(224,123,0,0.1)', border:'1px solid rgba(224,123,0,0.3)', borderRadius:20, padding:'6px 14px' }}>
                            <div style={{ width:7, height:7, borderRadius:'50%', background:'#e07b00', animation:'asLiveDot 1.8s ease infinite' }} />
                            {highCount} HIGH
                        </div>
                    )}
                    {allClear && (
                        <div style={{ fontSize:12, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.1)', border:'1px solid rgba(29,129,2,0.3)', borderRadius:20, padding:'6px 16px' }}>
                            No exposures found ✓
                        </div>
                    )}
                    <button onClick={load} style={{ padding:'7px 16px', background: dark?'rgba(255,255,255,0.06)':'#f6f6f6', border:`1px solid ${border}`, borderRadius:8, color:text2, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all 0.15s' }}
                        onMouseEnter={e=>{e.currentTarget.style.background=dark?'rgba(255,255,255,0.1)':'#eee';e.currentTarget.style.color=text}}
                        onMouseLeave={e=>{e.currentTarget.style.background=dark?'rgba(255,255,255,0.06)':'#f6f6f6';e.currentTarget.style.color=text2}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── All clear ── */}
            {allClear && (
                <div style={{ background:card, border:'1.5px solid rgba(29,129,2,0.25)', borderRadius:16, padding:'32px 28px', textAlign:'center', animation:'asSlideUp 0.5s ease both', boxShadow:'0 4px 20px rgba(29,129,2,0.08)' }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🛡️</div>
                    <div style={{ fontSize:17, fontWeight:800, color:'#1d8102', marginBottom:8 }}>Attack Surface is Clean</div>
                    <div style={{ fontSize:13, color:text2 }}>No publicly exposed resources were found in the last scan.</div>
                </div>
            )}

            {/* ── Toast notification ── */}
            {toast && (
                <div style={{
                    position:'fixed', bottom:28, right:28, zIndex:9999,
                    background: toast.ok ? '#1d8102' : '#d13212',
                    color:'#fff', fontSize:13, fontWeight:600,
                    padding:'12px 20px', borderRadius:12,
                    boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
                    animation:'asSlideUp 0.3s ease both',
                    maxWidth:380, lineHeight:1.4,
                }}>
                    {toast.text}
                </div>
            )}

            {/* ── Category cards — single column, full width ── */}
            {!allClear && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {data.categories?.filter(c => c.count > 0).map((cat, i) => {
                        const filteredCount = cat.findings.filter(f => !fixedIds.has(String(f.id))).length
                        if (filteredCount === 0) return null
                        return (
                            <div key={cat.id} style={{ animation:`asSlideUp 0.4s ease ${i*0.07}s both` }}>
                                <CategoryCard cat={cat} dark={dark} onFix={handleFix} fixing={fixing} fixedIds={fixedIds} />
                            </div>
                        )
                    })}

                    {/* Clear categories summary */}
                    {data.categories?.some(c => c.count === 0) && (
                        <div style={{ background:card, border:`1px solid ${border}`, borderRadius:14, padding:'14px 20px', display:'flex', alignItems:'center', gap:12, animation:'asSlideUp 0.4s ease 0.5s both' }}>
                            <div style={{ fontSize:18 }}>✅</div>
                            <div>
                                <div style={{ fontSize:12, fontWeight:700, color:'#1d8102' }}>
                                    {data.categories.filter(c=>c.count===0).map(c=>c.label).join(' · ')}
                                </div>
                                <div style={{ fontSize:11, color:text2, marginTop:2 }}>No exposures in these categories</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div style={{ background:'rgba(209,50,18,0.08)', border:'1px solid rgba(209,50,18,0.3)', borderRadius:10, padding:'14px 18px', color:'#d13212', fontSize:13, marginTop:16 }}>
                    {error}
                </div>
            )}
        </div>
    )
}
