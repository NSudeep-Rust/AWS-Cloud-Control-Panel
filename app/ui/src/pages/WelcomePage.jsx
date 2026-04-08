import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API = 'http://localhost:8000'

// ── Real scan regions CloudShield supports (with actual AWS AZ counts) ──
const SCAN_REGIONS = [
    { id: 'us-east-1',      name: 'N. Virginia', group: 'US',   azs: 6, azIds: ['a','b','c','d','e','f'] },
    { id: 'us-east-2',      name: 'Ohio',        group: 'US',   azs: 3, azIds: ['a','b','c'] },
    { id: 'us-west-2',      name: 'Oregon',      group: 'US',   azs: 4, azIds: ['a','b','c','d'] },
    { id: 'eu-west-1',      name: 'Ireland',     group: 'EU',   azs: 3, azIds: ['a','b','c'] },
    { id: 'eu-central-1',   name: 'Frankfurt',   group: 'EU',   azs: 3, azIds: ['a','b','c'] },
    { id: 'eu-north-1',     name: 'Stockholm',   group: 'EU',   azs: 3, azIds: ['a','b','c'] },
    { id: 'ap-northeast-1', name: 'Tokyo',       group: 'APAC', azs: 4, azIds: ['a','b','c','d'] },
    { id: 'ap-southeast-1', name: 'Singapore',   group: 'APAC', azs: 3, azIds: ['a','b','c'] },
    { id: 'ap-south-1',     name: 'Mumbai',      group: 'APAC', azs: 3, azIds: ['a','b','c'] },
]
const TOTAL_AZS = SCAN_REGIONS.reduce((s, r) => s + r.azs, 0)
const GRP_COLORS = { US: '#0972d3', EU: '#8B5CF6', APAC: '#067340' }

// ── Security modules CloudShield checks ──
const COVERAGE = [
    { icon: '🔑', label: 'IAM',        desc: 'Roles, users, policies & access keys' },
    { icon: '🪣', label: 'S3',         desc: 'Bucket ACLs, policies & public access' },
    { icon: '🖥️', label: 'EC2',        desc: 'Instances, security groups & EBS' },
    { icon: '🛡️', label: 'VPC',        desc: 'Flow logs, NACLs & route tables' },
    { icon: '📋', label: 'CloudTrail', desc: 'Logging, encryption & trail status' },
    { icon: '🔐', label: 'KMS',        desc: 'Key rotation & policy compliance' },
]

export default function WelcomePage() {
    const navigate = useNavigate()
    const { account, connect } = useAuth()

    // ── DB + health state ──────────────────────────────────────────
    const [dbAccounts,   setDbAccounts]   = useState([])
    const [loadingAccts, setLoadingAccts] = useState(true)
    const [apiOnline,    setApiOnline]    = useState(null)
    const [selectedAcc,  setSelectedAcc]  = useState(null)
    const [showPicker,   setShowPicker]   = useState(false)
    const [hoveredCov,   setHoveredCov]   = useState(null)
    const [hoveredReg,   setHoveredReg]   = useState(null)

    // ── Direct DOM refs for glow — NO React re-renders (UFL-style) ──
    const glowOuterRef = useRef(null)
    const glowInnerRef = useRef(null)

    // ── Smooth mouse tracking via direct DOM writes ──
    useEffect(() => {
        const handleMove = (e) => {
            if (glowOuterRef.current) {
                glowOuterRef.current.style.left = (e.clientX - 250) + 'px'
                glowOuterRef.current.style.top  = (e.clientY - 250) + 'px'
            }
            if (glowInnerRef.current) {
                glowInnerRef.current.style.left = (e.clientX - 70) + 'px'
                glowInnerRef.current.style.top  = (e.clientY - 70) + 'px'
            }
        }
        window.addEventListener('mousemove', handleMove)
        return () => window.removeEventListener('mousemove', handleMove)
    }, [])

    // ── Fetch accounts + health ──
    useEffect(() => {
        Promise.all([
            fetch(`${API}/api/accounts/`).then(r => r.json()).catch(() => ({ accounts: [] })),
            fetch(`${API}/api/accounts/iam-users/`).then(r => r.json()).catch(() => ({ iam_users: [] })),
        ]).then(([rootData, iamData]) => {
            const roots = (rootData.accounts  || []).map(a => ({
                ...a, _label: a.profile_name || a.aws_account_id, _sub: `Root · ${a.region}`,
            }))
            const iams = (iamData.iam_users || []).map(u => ({
                ...u, _label: u.username, _sub: `IAM · ${u.parent_aws_account_id} · ${u.region}`,
            }))
            setDbAccounts([...roots, ...iams])
            setApiOnline(true)
            setLoadingAccts(false)
        }).catch(() => { setApiOnline(false); setLoadingAccts(false) })
    }, [])

    function signInWith(acc) {
        const authData = acc.account_type === 'iam'
            ? { id: acc.id, account_id: acc.id, parent_aws_account_id: acc.parent_aws_account_id,
                username: acc.username, region: acc.region, account_type: 'iam' }
            : { id: acc.id, aws_account_id: acc.aws_account_id,
                profile_name: acc.profile_name, region: acc.region, account_type: 'root' }
        connect(authData)
        navigate('/panel')
    }

    const rootCount = dbAccounts.filter(a => a.account_type === 'root').length
    const iamCount  = dbAccounts.filter(a => a.account_type === 'iam').length
    const groups    = ['US', 'EU', 'APAC']

    return (
        <div style={s.root}>
            <style>{`
                @font-face { font-family:'Amazon Ember'; src:local('Amazon Ember'),local('AmazonEmber'); }
                *,*::before,*::after { box-sizing:border-box; font-family:'Amazon Ember','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif; }
                @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
                @keyframes spin    { to{transform:rotate(360deg)} }
                @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                @keyframes blobA   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.08) translate(20px,-15px)} }
                @keyframes blobB   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.05) translate(-15px,20px)} }
                ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent}
                ::-webkit-scrollbar-thumb{background:rgba(35,47,62,.15);border-radius:4px}
            `}</style>

            {/* ── Background layers ── */}
            {/* Dot grid — more visible, UFL-inspired */}
            <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                backgroundImage:'radial-gradient(circle, rgba(180,110,0,0.18) 1.5px, transparent 1.5px)',
                backgroundSize:'22px 22px' }} />
            {/* Amber blob — bottom-left (softer for white bg) */}
            <div style={{ position:'absolute', bottom:-180, left:-140, width:680, height:680, borderRadius:'50%',
                pointerEvents:'none', animation:'blobA 9s ease-in-out infinite',
                background:'radial-gradient(circle,rgba(255,153,0,0.08) 0%,rgba(255,153,0,0.02) 45%,transparent 70%)',
                filter:'blur(2px)' }} />
            {/* Gold blob — top-right */}
            <div style={{ position:'absolute', top:-140, right:-120, width:560, height:560, borderRadius:'50%',
                pointerEvents:'none', animation:'blobB 12s ease-in-out infinite',
                background:'radial-gradient(circle,rgba(255,180,40,0.06) 0%,rgba(255,153,0,0.02) 50%,transparent 70%)',
                filter:'blur(3px)' }} />

            {/* ── UFL-style mouse glow — direct DOM refs, zero lag ── */}
            {/* Outer ring — large soft amber halo */}
            <div ref={glowOuterRef} style={{
                position:'absolute', left:-250, top:-250,
                width:500, height:500, borderRadius:'50%',
                background:'radial-gradient(circle, rgba(255,180,0,0.22) 0%, rgba(255,160,0,0.12) 30%, rgba(255,140,0,0.04) 60%, transparent 80%)',
                pointerEvents:'none', zIndex:0,
                filter:'blur(4px)',
            }} />
            {/* Inner bright core — tight hot spot */}
            <div ref={glowInnerRef} style={{
                position:'absolute', left:-70, top:-70,
                width:140, height:140, borderRadius:'50%',
                background:'radial-gradient(circle, rgba(255,210,50,0.42) 0%, rgba(255,185,0,0.22) 40%, transparent 70%)',
                pointerEvents:'none', zIndex:0,
                filter:'blur(2px)',
            }} />

            {/* ── 3-column layout ── */}
            <div style={s.layout}>

                {/* ═══ LEFT — Regions & AZs ═══ */}
                <div style={{ ...s.sideCard, animation:'fadeUp 0.4s ease 0.1s both' }}>
                    {/* Header */}
                    <div style={s.sideTitle}>
                        <span style={{ ...s.statusDot,
                            background: apiOnline === null ? '#FF9900' : apiOnline ? '#067340' : '#d13212',
                            boxShadow: `0 0 7px ${apiOnline === null ? '#FF990088' : apiOnline ? '#06734088' : '#d1321288'}` }} />
                        System Health
                    </div>

                    {/* API / DB status */}
                    <HealthRow label="API Backend"
                        value={apiOnline === null ? 'Checking…' : apiOnline ? 'Online'    : 'Offline'}
                        color={apiOnline === null ? '#FF9900'  : apiOnline ? '#067340'   : '#d13212'}
                        loading={apiOnline === null} />
                    <HealthRow label="Database"
                        value={apiOnline === null ? 'Checking…' : apiOnline ? 'Connected' : 'Unreachable'}
                        color={apiOnline === null ? '#FF9900'  : apiOnline ? '#067340'   : '#d13212'}
                        loading={apiOnline === null} />

                    <div style={s.divLine} />

                    {/* Account counts */}
                    <div style={s.secLabel}>Registered Accounts</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:0 }}>
                        <StatMini label="Root"      value={loadingAccts ? '…' : rootCount} color="#FF9900" />
                        <StatMini label="IAM Users" value={loadingAccts ? '…' : iamCount}  color="#0972d3" />
                    </div>

                    <div style={s.divLine} />

                    {/* Scan Regions & AZs */}
                    <div style={s.secLabel}>Scan Regions &amp; AZs</div>
                    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:3 }}>
                        {groups.map(grp => {
                            const regs = SCAN_REGIONS.filter(r => r.group === grp)
                            return (
                                <div key={grp}>
                                    <div style={{ fontSize:9, fontWeight:800, color: GRP_COLORS[grp],
                                                  letterSpacing:1, textTransform:'uppercase', marginBottom:3, marginTop:4 }}>
                                        {grp === 'US' ? '🇺🇸 United States' : grp === 'EU' ? '🇪🇺 Europe' : '🌏 Asia Pacific'}
                                    </div>
                                    {regs.map(r => {
                                        const isHov = hoveredReg === r.id
                                        return (
                                            <div key={r.id}
                                                onMouseEnter={() => setHoveredReg(r.id)}
                                                onMouseLeave={() => setHoveredReg(null)}
                                                style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                                         padding:'4px 7px', borderRadius:5, marginBottom:2, transition:'all 0.15s',
                                                         background: isHov ? `${GRP_COLORS[grp]}10` : 'rgba(35,47,62,0.03)',
                                                         border:`1px solid ${isHov ? GRP_COLORS[grp]+'35' : 'rgba(35,47,62,0.07)'}`,
                                                         cursor:'default' }}>
                                                <div>
                                                    <div style={{ fontSize:10, fontWeight:700, color:'#16191f', fontFamily:'monospace' }}>{r.id}</div>
                                                    {isHov && (
                                                        <div style={{ fontSize:9, color:'#687078', marginTop:1 }}>
                                                            AZs: {r.azIds.map(az => `${r.id}${az}`).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1 }}>
                                                    <span style={{ fontSize:9, color: GRP_COLORS[grp], fontWeight:700,
                                                                   background:`${GRP_COLORS[grp]}12`, border:`1px solid ${GRP_COLORS[grp]}25`,
                                                                   borderRadius:3, padding:'1px 5px', fontFamily:'monospace' }}>
                                                        {r.azs} AZs
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>

                    {/* Total AZ strip */}
                    <div style={{ marginTop:8, padding:'5px 8px', borderRadius:5,
                                  background:'rgba(255,153,0,0.07)', border:'1px solid rgba(255,153,0,0.18)',
                                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:10, color:'#687078', fontWeight:500 }}>Total AZs covered</span>
                        <span style={{ fontSize:12, fontWeight:900, color:'#FF9900', fontFamily:'monospace' }}>{TOTAL_AZS}</span>
                    </div>
                </div>

                {/* ═══ CENTER — Main Card ═══ */}
                <div style={{ ...s.card, animation:'fadeUp 0.4s ease both' }}>
                    {/* Logo */}
                    <div style={{ textAlign:'center', marginBottom:18 }}>
                        <svg viewBox="0 0 130 52" width="140" height="56" style={{ display:'inline-block' }}>
                            <text x="65" y="36" textAnchor="middle" fill="#232F3E" fontSize="38" fontWeight="bold" fontFamily="Arial,sans-serif">aws</text>
                            <path d="M20 43 Q65 57 110 43" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round" />
                            <path d="M105 39 L110 43 L105 47" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div style={{ height:1, background:'rgba(255,153,0,0.2)', margin:'12px 0 14px' }} />
                        <div style={{ fontSize:26, fontWeight:900, color:'#16191f', letterSpacing:-.5 }}>Cloud Security Panel</div>
                        <div style={{ fontSize:14, fontWeight:500, color:'#5a6a7a', marginTop:6, letterSpacing:.1 }}>AWS infrastructure monitoring &amp; remediation</div>
                    </div>

                    {/* ── SMART ACTION SECTION ── */}
                    <div style={{ marginTop:8 }}>
                    {loadingAccts ? (
                        <div style={{ textAlign:'center', padding:'20px 0 12px' }}>
                            <div style={{ display:'inline-block', width:20, height:20, border:'2.5px solid #FF9900',
                                          borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                            <div style={{ marginTop:8, fontSize:12, color:'#687078' }}>Connecting to backend...</div>
                        </div>
                    ) : !apiOnline ? (
                        <div style={{ textAlign:'center', padding:'16px 0 10px' }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>⚠️</div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#d13212', marginBottom:4 }}>Backend Offline</div>
                            <div style={{ fontSize:11, color:'#687078', lineHeight:1.5 }}>
                                Start the FastAPI server first:<br/>
                                <code style={{ background:'rgba(35,47,62,0.07)', padding:'2px 6px', borderRadius:3, fontSize:10 }}>
                                    uvicorn app.api.main:app --reload
                                </code>
                            </div>
                        </div>
                    ) : dbAccounts.length === 0 ? (
                        <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:11, color:'#687078', marginBottom:14, lineHeight:1.6 }}>
                                No accounts connected yet.<br/>Add your AWS credentials to get started.
                            </div>
                            <button style={s.btnPrimary} onClick={() => navigate('/setup')}
                                onMouseEnter={e => e.currentTarget.style.background='#ec8a00'}
                                onMouseLeave={e => e.currentTarget.style.background='#FF9900'}>
                                Initialize Connection <Arrow color="#232F3E" />
                            </button>
                        </div>
                    ) : account && !showPicker ? (
                        <div>
                            <button style={{ ...s.btnPrimary, background:'#067340', borderColor:'#067340', marginBottom:8 }}
                                onClick={() => signInWith(account)}
                                onMouseEnter={e => e.currentTarget.style.background='#055c35'}
                                onMouseLeave={e => e.currentTarget.style.background='#067340'}>
                                Continue as {account.profile_name || account.aws_account_id || account.username}
                                <Arrow color="#fff" />
                            </button>
                            <button style={s.btnOutline}
                                onClick={() => { setShowPicker(true); setSelectedAcc(null) }}
                                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,153,0,0.08)'; e.currentTarget.style.borderColor='#FF9900' }}
                                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor='rgba(35,47,62,0.2)' }}>
                                Use Different Account
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ fontSize:11, fontWeight:700, color:'#414d5c', marginBottom:6 }}>
                                {account ? 'Choose an account:' : 'Select an account to continue:'}
                            </div>
                            <div style={{ maxHeight:150, overflowY:'auto', display:'flex', flexDirection:'column', gap:5, marginBottom:8 }}>
                                {dbAccounts.map(acc => {
                                    const isSel = selectedAcc?.id === acc.id && selectedAcc?.account_type === acc.account_type
                                    const ini = (acc._label || '?').slice(0,2).toUpperCase()
                                    return (
                                        <button key={`${acc.account_type}-${acc.id}`} onClick={() => setSelectedAcc(acc)}
                                            style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', borderRadius:6,
                                                     cursor:'pointer', textAlign:'left', transition:'all 0.15s',
                                                     border:`1.5px solid ${isSel ? '#FF9900' : 'rgba(35,47,62,0.13)'}`,
                                                     background: isSel ? 'rgba(255,153,0,0.07)' : 'rgba(255,255,255,0.7)' }}
                                            onMouseEnter={e => { if(!isSel) e.currentTarget.style.borderColor='rgba(255,153,0,0.35)' }}
                                            onMouseLeave={e => { if(!isSel) e.currentTarget.style.borderColor='rgba(35,47,62,0.13)' }}>
                                            <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                                                          background: isSel ? '#FF9900' : '#232F3E', color:'#fff',
                                                          display:'flex', alignItems:'center', justifyContent:'center',
                                                          fontSize:10, fontWeight:700 }}>{ini}</div>
                                            <div style={{ flex:1, minWidth:0 }}>
                                                <div style={{ fontSize:12, fontWeight:700, color:'#16191f',
                                                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{acc._label}</div>
                                                <div style={{ fontSize:10, color:'#687078' }}>{acc._sub}</div>
                                            </div>
                                            {isSel && <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="#FF9900" strokeWidth="2.2" strokeLinecap="round"/></svg>}
                                        </button>
                                    )
                                })}
                            </div>
                            <button disabled={!selectedAcc} onClick={() => selectedAcc && signInWith(selectedAcc)}
                                style={{ ...s.btnPrimary, marginBottom:6,
                                         background:    selectedAcc ? '#FF9900'              : 'rgba(35,47,62,0.07)',
                                         borderColor:   selectedAcc ? '#FF9900'              : 'transparent',
                                         color:         selectedAcc ? '#232F3E'              : '#aab7b8',
                                         cursor:        selectedAcc ? 'pointer'              : 'not-allowed',
                                         boxShadow:     selectedAcc ? '0 3px 14px rgba(255,153,0,0.35)' : 'none' }}
                                onMouseEnter={e => { if(selectedAcc) e.currentTarget.style.background='#ec8a00' }}
                                onMouseLeave={e => { if(selectedAcc) e.currentTarget.style.background='#FF9900' }}>
                                {selectedAcc ? `Sign In as ${selectedAcc._label}` : 'Select an account above'}
                                {selectedAcc && <Arrow color="#232F3E" />}
                            </button>
                            <button style={{ ...s.btnOutline, fontSize:12, borderStyle:'dashed' }}
                                onClick={() => navigate('/setup')}
                                onMouseEnter={e => { e.currentTarget.style.borderColor='#FF9900'; e.currentTarget.style.color='#FF9900' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(35,47,62,0.2)'; e.currentTarget.style.color='#414d5c' }}>
                                + Add New Account
                            </button>
                        </div>
                    )}

                    </div>{/* end action wrapper div */}

                    {/* ── Mini security capability strip ── */}
                    <div style={{ margin:'16px 0 12px', padding:'10px 14px', borderRadius:8,
                                  background:'rgba(255,153,0,0.05)', border:'1px solid rgba(255,153,0,0.15)',
                                  display:'flex', justifyContent:'space-around', alignItems:'center' }}>
                        {[
                            { icon:'🔒', val:'52+',  lbl:'Security Checks' },
                            { icon:'🌍', val:'9',    lbl:'Regions' },
                            { icon:'⚡', val:'32',   lbl:'AZs Covered' },
                        ].map(item => (
                            <div key={item.lbl} style={{ textAlign:'center' }}>
                                <div style={{ fontSize:11, marginBottom:2 }}>{item.icon}</div>
                                <div style={{ fontSize:15, fontWeight:900, color:'#FF9900', lineHeight:1, fontFamily:'monospace' }}>{item.val}</div>
                                <div style={{ fontSize:9, color:'#8a9aaa', textTransform:'uppercase', letterSpacing:.6, marginTop:2 }}>{item.lbl}</div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:4 }}>
                        {['FastAPI', 'PostgreSQL', 'OAS 3.1'].map(b => (
                            <span key={b} style={{ fontSize:10, fontFamily:'monospace', color:'#687078',
                                background:'rgba(35,47,62,0.05)', border:'1px solid rgba(35,47,62,0.12)',
                                borderRadius:3, padding:'2px 7px' }}>{b}</span>
                        ))}
                    </div>
                </div>

                {/* ═══ RIGHT — Security Coverage ═══ */}
                <div style={{ ...s.sideCard, animation:'fadeUp 0.4s ease 0.2s both' }}>
                    <div style={s.sideTitle}>🛡️ Security Coverage</div>

                    {/* Modules — stretch to fill all available space */}
                    <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', flex:1, marginBottom:8 }}>
                        {COVERAGE.map((c, i) => {
                            const isHov = hoveredCov === i
                            return (
                                <div key={c.label}
                                    onMouseEnter={() => setHoveredCov(i)}
                                    onMouseLeave={() => setHoveredCov(null)}
                                    style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'9px 10px',
                                             borderRadius:7, cursor:'default', transition:'all 0.18s',
                                             background: isHov ? 'rgba(255,153,0,0.07)' : 'rgba(35,47,62,0.03)',
                                             border:`1px solid ${isHov ? 'rgba(255,153,0,0.32)' : 'rgba(35,47,62,0.09)'}`,
                                             transform: isHov ? 'translateX(3px)' : 'none' }}>
                                    <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>{c.icon}</span>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:11, fontWeight:800, color: isHov ? '#FF9900' : '#16191f',
                                                      transition:'color 0.15s', marginBottom:2 }}>{c.label}</div>
                                        <div style={{ fontSize:9, color:'#687078', lineHeight:1.4 }}>{c.desc}</div>
                                    </div>
                                    <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:5,
                                                  background:'#067340', opacity: isHov ? 1 : 0.32, transition:'opacity 0.2s' }} />
                                </div>
                            )
                        })}
                    </div>

                    <div style={s.divLine} />

                    {/* Supported regions */}
                    <div style={s.secLabel}>Supported Regions ({SCAN_REGIONS.length})</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:8 }}>
                        {SCAN_REGIONS.map(r => (
                            <span key={r.id} style={{
                                fontSize:8.5, fontFamily:'monospace', fontWeight:700,
                                color: GRP_COLORS[r.group], background:`${GRP_COLORS[r.group]}0d`,
                                border:`1px solid ${GRP_COLORS[r.group]}28`, borderRadius:4, padding:'2px 6px',
                                transition:'background 0.15s', cursor:'default' }}
                                onMouseEnter={e => e.currentTarget.style.background=`${GRP_COLORS[r.group]}20`}
                                onMouseLeave={e => e.currentTarget.style.background=`${GRP_COLORS[r.group]}0d`}>
                                {r.id}
                            </span>
                        ))}
                    </div>

                    {/* Summary stats */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                        <StatMini label="Check Types" value="52+" color="#067340" />
                        <StatMini label="Total AZs"   value={TOTAL_AZS} color="#8B5CF6" />
                    </div>
                </div>




            </div>
        </div>
    )
}

/* ── Sub-components ── */
function Arrow({ color = '#232F3E' }) {
    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
            <path d="M3 8H13M9 4L13 8L9 12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
        </svg>
    )
}

function HealthRow({ label, value, color, loading }) {
    return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'5px 8px', borderRadius:5, marginBottom:5,
                      background:'rgba(35,47,62,0.03)', border:'1px solid rgba(35,47,62,0.08)' }}>
            <span style={{ fontSize:11, color:'#414d5c', fontWeight:600 }}>{label}</span>
            <span style={{ fontSize:11, fontWeight:800, color, display:'flex', alignItems:'center', gap:4, fontFamily:'monospace' }}>
                {loading
                    ? <span style={{ display:'inline-block', width:10, height:10, border:`1.5px solid ${color}`,
                                     borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                    : (color === '#067340' ? '✓ ' : '✗ ')
                }
                {value}
            </span>
        </div>
    )
}

function StatMini({ label, value, color }) {
    return (
        <div style={{ textAlign:'center', padding:'7px 6px', borderRadius:6,
                      background:`${color}09`, border:`1.5px solid ${color}22` }}>
            <div style={{ fontSize:17, fontWeight:900, color, fontFamily:'monospace',
                          background:`linear-gradient(90deg,${color},${color}bb,${color})`,
                          backgroundSize:'200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                          animation:'shimmer 3s linear infinite' }}>{value}</div>
            <div style={{ fontSize:9, color:'#687078', textTransform:'uppercase', letterSpacing:.6, marginTop:1 }}>{label}</div>
        </div>
    )
}

/* ── Styles ── */
const s = {
    root: {
        height:'100vh', width:'100vw', display:'flex', alignItems:'center', justifyContent:'center',
        // Pale off-white — clean, not pure white, not warm amber
        background:'linear-gradient(160deg, #fafaf8 0%, #f8f8f6 50%, #f6f6f4 100%)',
        overflow:'hidden', position:'relative',
    },
    layout: {
        display:'grid', gridTemplateColumns:'1fr 1.5fr 1fr', gap:18, alignItems:'stretch',
        padding:'0 28px', width:'100%', maxWidth:960, maxHeight:'calc(100vh - 48px)', position:'relative', zIndex:1,
    },
    card: {
        background:'rgba(255,255,255,0.85)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
        border:'1.5px solid rgba(255,153,0,0.22)', borderRadius:12, padding:'22px 24px',
        boxShadow:'0 8px 40px rgba(180,100,0,0.13), 0 1px 0 rgba(255,255,255,0.9) inset',
    },
    sideCard: {
        background:'rgba(255,255,255,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
        border:'1.5px solid rgba(255,153,0,0.16)', borderRadius:12, padding:'16px 14px',
        boxShadow:'0 4px 20px rgba(180,100,0,0.09)', display:'flex', flexDirection:'column',
    },
    sideTitle: {
        display:'flex', alignItems:'center', gap:7, fontSize:11, fontWeight:800,
        color:'#232F3E', textTransform:'uppercase', letterSpacing:1, marginBottom:11,
    },
    statusDot: { width:8, height:8, borderRadius:'50%', flexShrink:0, display:'inline-block' },
    divLine:   { height:1, background:'rgba(180,100,0,0.11)', margin:'9px 0' },
    secLabel:  { fontSize:10, fontWeight:700, color:'#687078', textTransform:'uppercase', letterSpacing:.9, marginBottom:7 },
    btnPrimary: {
        display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%',
        padding:'11px 18px', background:'#FF9900', color:'#232F3E', border:'2px solid #FF9900',
        borderRadius:7, fontSize:13, fontWeight:800, cursor:'pointer', marginBottom:8,
        boxShadow:'0 3px 14px rgba(255,153,0,0.38)', transition:'background 0.15s',
    },
    btnOutline: {
        display:'flex', alignItems:'center', justifyContent:'center', gap:6, width:'100%',
        padding:'10px 18px', background:'rgba(255,255,255,0.6)', color:'#414d5c',
        border:'1.5px solid rgba(35,47,62,0.2)', borderRadius:7, fontSize:13,
        fontWeight:700, cursor:'pointer', transition:'all 0.15s',
    },
}
