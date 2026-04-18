import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import {
    Search, Shield, Globe, Key, Server, Database, Eye, Lock,
    CheckCircle, ChevronRight, Zap, Activity, XCircle, Square
} from 'lucide-react'
import { getModuleGroup } from '@/utils/getModuleGroup'

const SEV = {
    CRITICAL: { color: '#d13212', bg: 'rgba(209,50,18,0.07)', border: 'rgba(209,50,18,0.45)', rank: 0 },
    HIGH: { color: '#e67e22', bg: 'rgba(230,126,34,0.07)', border: 'rgba(230,126,34,0.45)', rank: 1 },
    MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.4)', rank: 2 },
    LOW: { color: '#0972d3', bg: 'rgba(9,114,211,0.07)', border: 'rgba(9,114,211,0.35)', rank: 3 },
}

function ModuleIcon({ type, size = 13, color }) {
    if (type?.startsWith('S3')) return <Globe size={size} color={color} />
    if (type?.startsWith('IAM')) return <Key size={size} color={color} />
    if (type?.startsWith('EC2') || type?.startsWith('EBS')) return <Server size={size} color={color} />
    if (type?.startsWith('RDS')) return <Database size={size} color={color} />
    if (type?.startsWith('CLOUDTRAIL') || type?.startsWith('VPC_FLOW') || type?.startsWith('CLOUDWATCH')) return <Eye size={size} color={color} />
    if (type?.startsWith('SECURITY_GROUP') || type?.startsWith('PUBLIC_SECURITY') || type?.startsWith('NACL')
        || type?.startsWith('ROUTE') || type?.startsWith('VPC') || type?.startsWith('INTERNET')
        || type?.startsWith('PUBLIC_SUBNET') || type?.startsWith('KMS')) return <Lock size={size} color={color} />
    return <Shield size={size} color={color} />
}

const moduleOf = getModuleGroup


const AWS_FACTS = [
    { icon: '🌐', title: 'AWS Global Infrastructure', stat: '33 Regions', desc: 'AWS operates across 33 geographic regions with 105+ Availability Zones worldwide.' },
    { icon: '⚡', title: 'CloudFront Speed', stat: '600+ PoPs', desc: 'Amazon CloudFront serves content from 600+ Points of Presence to reduce latency globally.' },
    { icon: '🔒', title: 'Security at Scale', stat: '98 compliance programs', desc: 'AWS maintains 98 security compliance programs including SOC, PCI-DSS, HIPAA, and ISO.' },
    { icon: '💾', title: 'S3 Durability', stat: '99.999999999%', desc: 'Amazon S3 is designed for 11 nines of durability — storing millions of objects per customer.' },
    { icon: '🚀', title: 'EC2 Instance Types', stat: '750+ types', desc: 'AWS offers over 750 EC2 instance types optimized for compute, memory, storage, and networking.' },
    { icon: '🛡️', title: 'AWS Shield', stat: '2.3 Tbps attack mitigated', desc: 'AWS Shield mitigated the largest ever DDoS attack at 2.3 Tbps in Q1 2020.' },
    { icon: '🤖', title: 'Lambda Scale', stat: '1M req/sec', desc: 'AWS Lambda can scale from zero to over 1 million requests per second with no provisioning.' },
    { icon: '📊', title: 'IAM Security', stat: 'Zero-trust by design', desc: 'AWS IAM uses explicit deny by default — every resource access must be explicitly permitted.' },
    { icon: '🌊', title: 'Data Transfer', stat: '100+ Tbps network', desc: 'AWS backbone network carries over 100 Tbps of traffic connecting regions and edge locations.' },
    { icon: '🔑', title: 'KMS Encryption', stat: '1B+ key operations/day', desc: 'AWS KMS processes over 1 billion cryptographic key operations daily across all services.' },
    { icon: '📡', title: 'Route 53 DNS', stat: '100% SLA', desc: 'Amazon Route 53 is the only DNS service with a 100% availability SLA commitment.' },
    { icon: '🏗️', title: 'AWS Well-Architected', stat: '5 pillars', desc: 'The AWS Well-Architected Framework covers Security, Reliability, Performance, Cost, and Sustainability.' },
]

const SCAN_LINES = [
    'Initializing AWS session...',
    'Authenticating credentials...',
    'Enumerating IAM users and roles...',
    'Checking for admin policy attachments...',
    'Scanning IAM access key rotation status...',
    'Verifying MFA enforcement on IAM users...',
    'Checking for external role trust policies...',
    'Enumerating S3 buckets...',
    'Checking S3 bucket policies and ACLs...',
    'Verifying S3 public access block settings...',
    'Checking S3 versioning and access logging...',
    'Probing EC2 instances [us-east-1, us-west-2]...',
    'Scanning security groups for open ports...',
    'Checking IMDSv2 enforcement on instances...',
    'Scanning EBS volumes for encryption...',
    'Analyzing RDS instance configurations...',
    'Scanning VPC flow log settings...',
    'Checking network ACL inbound/outbound rules...',
    'Verifying CloudTrail logging status...',
    'Checking CloudWatch log group retention...',
    'Scanning KMS key rotation policies...',
    'Analyzing route tables for internet exposure...',
    'Cross-referencing findings across modules...',
    'Calculating risk scores and severity...',
    'Finalizing scan report...',
]

const SCAN_REGIONS = [
    'us-east-1', 'us-west-2', 'eu-west-1',
    'ap-northeast-1', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'us-east-2', 'ap-south-1',
]

export function ScannerSection({ onNav, dark }) {
    const { account } = useAuth()

    const isIam = account?.account_type === 'iam'
    const dbId = isIam ? (account?.account_id ?? null) : (account?.id ?? null)
    const awsId = isIam ? (account?.parent_aws_account_id || '—') : (account?.aws_account_id || '—')
    const cacheKey = `scan_v3_${account?.account_type}_${awsId}_${dbId}`

    const {
        status, findings, elapsed,
        scanLineIdx, factIdx, factVisible,
        startScan, stopScan, restoreFromCache,
        highlightFindingId, setHighlightFindingId,
    } = useScan()

    useEffect(() => {
        if (cacheKey) restoreFromCache(cacheKey)
    }, [cacheKey]) // eslint-disable-line

    const scanning = status === 'scanning'
    const hasScan = status === 'done'

    const highlightRef = useRef(null)
    useEffect(() => {
        if (!highlightFindingId) return

        if (highlightFindingId.startsWith('__filter_')) {
            const sev = highlightFindingId.replace('__filter_', '').replace('__', '')
            setFilterSev(sev)
            setFilterMod('ALL')
            setSearch('')
            setHighlightFindingId(null)
            return
        }

        setFilterSev('ALL')
        setFilterMod('ALL')
        setSearch('')
        const t = setTimeout(() => { if (highlightRef.current) highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 150)
        const clear = setTimeout(() => setHighlightFindingId(null), 4000)
        return () => { clearTimeout(t); clearTimeout(clear) }
    }, [highlightFindingId])

    const [filterSev, setFilterSev] = useState('ALL')
    const [filterMod, setFilterMod] = useState('ALL')
    const [search, setSearch] = useState('')
    const [hoverId, setHoverId] = useState(null)

    const [testResult, setTestResult] = useState(null)
    const [testing,    setTesting]    = useState(false)

    async function testConnection() {
        if (!dbId || testing) return
        setTesting(true); setTestResult(null)
        try {
            const r = await fetch(`http://127.0.0.1:8000/api/scan/test-aws?account_id=${dbId}`)
            const d = await r.json()
            setTestResult(d)
        } catch (e) {
            setTestResult({ ok: false, error: String(e) })
        } finally {
            setTesting(false)
        }
    }

    function triggerScan() {
        if (!dbId || scanning) return
        startScan({ dbId, awsId, cacheKey })
    }

    const modules = [...new Set(findings.map(f => moduleOf(f.type)))].sort()
    const normSev = f => (f.severity || '').toUpperCase().trim()
    const filtered = findings.filter(f => {
        if (filterSev !== 'ALL' && normSev(f) !== filterSev) return false
        if (filterMod !== 'ALL' && moduleOf(f.type) !== filterMod) return false
        if (search && !f.type.toLowerCase().includes(search.toLowerCase()) && !f.resource_id?.toLowerCase().includes(search.toLowerCase())) return false
        return true
    }).sort((a, b) => (SEV[a.severity]?.rank ?? 9) - (SEV[b.severity]?.rank ?? 9))

    // Counts respect the active module filter so pill badges match filtered results
    const modMatch = f => filterMod === 'ALL' || moduleOf(f.type) === filterMod
    const counts = {
        CRITICAL: findings.filter(f => modMatch(f) && normSev(f) === 'CRITICAL').length,
        HIGH:     findings.filter(f => modMatch(f) && normSev(f) === 'HIGH').length,
        MEDIUM:   findings.filter(f => modMatch(f) && normSev(f) === 'MEDIUM').length,
        LOW:      findings.filter(f => modMatch(f) && normSev(f) === 'LOW').length,
    }

    // Progress: use real elapsed time against expected scan duration.
    // Capped at 95% until scan actually completes, then jumps to 100%.
    const EXPECTED_SCAN_SEC = 75
    const pct = hasScan ? 100 : Math.min(95, elapsed > 0 ? Math.round((elapsed / EXPECTED_SCAN_SEC) * 100) : 2)
    const fact = AWS_FACTS[factIdx]
    const scanLine = SCAN_LINES[scanLineIdx]

    function SevPill({ sev, active, onClick }) {
        const cfg = SEV[sev] || {}
        return (
            <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'transparent', color: active ? cfg.color : 'var(--text3)', fontSize: 11, fontWeight: 700, transition: 'all 0.15s', fontFamily: 'monospace', letterSpacing: 0.3 }}>
                {sev}
                {hasScan && <span style={{ background: active ? cfg.color : 'var(--border2)', color: active ? '#fff' : 'var(--text3)', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 800 }}>{counts[sev]}</span>}
            </button>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: 'calc(100vh - 64px)', minHeight: 0 }}>

            {/* NULL ACCOUNT WARNING */}
            {!dbId && (
                <div style={{ margin: '12px 0 0', padding: '10px 16px', background: 'rgba(209,50,18,0.1)', border: '1px solid rgba(209,50,18,0.3)', borderRadius: 8, color: '#d13212', fontSize: 12, fontWeight: 600 }}>
                    Not signed in - account ID is missing. Please sign out and sign back in.
                    Debug: account={JSON.stringify(account)}
                </div>
            )}

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Security Scanner</h1>
                        {hasScan && <span style={{ fontSize: 10, fontWeight: 700, color: '#067340', background: 'rgba(6,115,64,0.1)', border: '1px solid rgba(6,115,64,0.25)', borderRadius: 4, padding: '2px 8px' }}>{findings.length} FINDINGS</span>}
                        {scanning && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0972d3', background: 'rgba(9,114,211,0.1)', border: '1px solid rgba(9,114,211,0.25)', borderRadius: 4, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0972d3', animation: 'pulse 1s ease infinite', display: 'inline-block' }} />
                                SCANNING · {elapsed}s
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
                        {awsId} · Multi-region scan · 52+ check types
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Test AWS Connection */}
                    {dbId && !scanning && (
                        <button onClick={testConnection} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, background: 'rgba(9,114,211,0.08)', color: '#0972d3', border: '1px solid rgba(9,114,211,0.25)', cursor: testing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, transition: 'all 0.15s' }}>
                            {testing ? 'Testing...' : 'Test AWS'}
                        </button>
                    )}
                    {testResult && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: testResult.ok ? '#067340' : '#d13212', background: testResult.ok ? 'rgba(6,115,64,0.08)' : 'rgba(209,50,18,0.08)', border: `1px solid ${testResult.ok ? 'rgba(6,115,64,0.25)' : 'rgba(209,50,18,0.25)'}`, borderRadius: 6, padding: '4px 10px' }}>
                            {testResult.ok ? `OK: ${testResult.aws_account_id}` : `FAIL: ${testResult.error?.slice(0, 60)}`}
                        </span>
                    )}

                    {/* Stop button */}
                    {scanning && (
                        <button onClick={stopScan} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, background: 'rgba(209,50,18,0.1)', color: '#d13212', border: '1px solid rgba(209,50,18,0.3)', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(209,50,18,0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(209,50,18,0.1)'}>
                            <Square size={11} fill="#d13212" />Stop Scan
                        </button>
                    )}

                    <button onClick={triggerScan} disabled={scanning} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: hasScan ? '6px 12px' : '8px 20px', borderRadius: 6, background: scanning ? 'rgba(255,153,0,0.4)' : '#FF9900', color: '#232F3E', border: 'none', cursor: scanning ? 'not-allowed' : 'pointer', fontSize: hasScan ? 11 : 13, fontWeight: 700, boxShadow: !scanning ? '0 2px 10px rgba(255,153,0,0.3)' : 'none', transition: 'all 0.3s ease', opacity: scanning ? 0.7 : 1 }}
                        onMouseEnter={e => { if (!scanning) e.currentTarget.style.background = '#ec8a00' }}
                        onMouseLeave={e => { if (!scanning) e.currentTarget.style.background = '#FF9900' }}>
                        {scanning
                            ? <><div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(35,47,62,0.3)', borderTopColor: '#232F3E', animation: 'spin 0.7s linear infinite' }} />Scanning...</>
                            : <><Search size={hasScan ? 11 : 13} />{hasScan ? 'Re-Scan' : 'Start Scan'}</>
                        }
                    </button>
                </div>
            </div>

            {/* ── IDLE ── */}
            {status === 'idle' && (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.65fr', gap: 14, minHeight: 0 }}>
                    <style>{`
                        @keyframes orbitRing    { to { transform: rotate(360deg) } }
                        @keyframes orbitRingRev { to { transform: rotate(-360deg) } }
                        @keyframes shieldPulse  { 0%,100%{filter:drop-shadow(0 0 8px rgba(255,153,0,0.4))} 50%{filter:drop-shadow(0 0 24px rgba(255,153,0,0.72))} }
                        @keyframes idleFloat    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
                        @keyframes shimmer      { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                        @keyframes svcPop       { 0%{opacity:0;transform:scale(0.9)} 100%{opacity:1;transform:scale(1)} }
                        @keyframes rgPop        { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
                    `}</style>

                    {/* LEFT: Hero + Animation + CTA */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'28px 22px', overflow:'hidden', position:'relative', boxShadow:'var(--card-shadow)' }}>
                        {/* Radial glow */}
                        <div style={{ position:'absolute', width:320, height:320, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(255,153,0,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />
                        {/* Animated top bar */}
                        <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#FF9900,#ec8a00,#FF9900)', backgroundSize:'200%', animation:'shimmer 3s linear infinite' }} />

                        {/* Orbital animation */}
                        <div style={{ position:'relative', width:160, height:160, animation:'idleFloat 4s ease infinite', flexShrink:0 }}>
                            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid rgba(255,153,0,0.15)', animation:'orbitRing 8s linear infinite' }}>
                                {[0,120,240].map((deg,i) => (
                                    <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:i===0?10:7, height:i===0?10:7, borderRadius:'50%', background:i===0?'#FF9900':i===1?'#0972d3':'#1d8102', boxShadow:`0 0 ${i===0?10:6}px ${i===0?'#FF990088':i===1?'#0972d388':'#1d810288'}`, transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(78px)` }} />
                                ))}
                            </div>
                            <div style={{ position:'absolute', inset:18, borderRadius:'50%', border:'1px dashed rgba(255,153,0,0.2)', animation:'orbitRingRev 12s linear infinite' }}>
                                {[60,180,300].map((deg,i) => (
                                    <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:5, height:5, borderRadius:'50%', background:'rgba(255,153,0,0.45)', transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(52px)` }} />
                                ))}
                            </div>
                            <div style={{ position:'absolute', inset:38, borderRadius:'50%', border:'1px solid rgba(255,153,0,0.1)' }} />
                            <div style={{ position:'absolute', inset:46, borderRadius:'50%', background:'linear-gradient(135deg,rgba(255,153,0,0.15),rgba(255,153,0,0.06))', border:'2px solid rgba(255,153,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', animation:'shieldPulse 2.5s ease infinite' }}>
                                <Shield size={28} color="#FF9900" strokeWidth={1.5} />
                            </div>
                        </div>

                        {/* Text */}
                        <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:22, fontWeight:900, color:'var(--text)', letterSpacing:-0.5, marginBottom:7 }}>Ready to Scan</div>
                            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.65 }}>
                                Multi-region security analysis across <strong style={{ color:'var(--text2)' }}>9 AWS regions</strong><br />
                                52+ check types · IAM, S3, EC2, VPC, KMS &amp; more
                            </div>
                        </div>

                        {/* Stats 2x2 */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, width:'100%' }}>
                            {[
                                { val:'52+',    label:'Check Types', color:'#FF9900' },
                                { val:'12+',    label:'Services',    color:'#0972d3' },
                                { val:'9',      label:'Regions',     color:'#1d8102' },
                                { val:'Global', label:'Coverage',    color:'#8B5CF6' },
                            ].map(s => (
                                <div key={s.label} style={{ background:`${s.color}0a`, border:`1px solid ${s.color}22`, borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                                    <div style={{ fontSize:18, fontWeight:900, color:s.color, fontFamily:'monospace', background:`linear-gradient(90deg,${s.color},${s.color}bb,${s.color})`, backgroundSize:'200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'shimmer 3s linear infinite' }}>{s.val}</div>
                                    <div style={{ fontSize:8.5, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.8, marginTop:2 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* CTA */}
                        <button onClick={triggerScan} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0', borderRadius:10, background:'linear-gradient(135deg,#FF9900,#ec8a00)', color:'#232F3E', border:'none', cursor:'pointer', fontSize:14, fontWeight:800, letterSpacing:0.3, boxShadow:'0 6px 22px rgba(255,153,0,0.38)', transition:'all 0.18s', width:'100%', justifyContent:'center' }}
                            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 30px rgba(255,153,0,0.52)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 6px 22px rgba(255,153,0,0.38)' }}>
                            <Zap size={16} /> Start Security Scan
                        </button>
                    </div>

                    {/* RIGHT: Coverage breakdown */}
                    <div style={{ display:'flex', flexDirection:'column', gap:12, minHeight:0, overflow:'hidden' }}>

                        {/* Service Coverage */}
                        <div style={{ flexShrink:0, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px', overflow:'hidden', boxShadow:'var(--card-shadow)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
                                <div style={{ width:18, height:18, borderRadius:5, background:'rgba(255,153,0,0.12)', border:'1px solid rgba(255,153,0,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <Search size={10} color="#FF9900" />
                                </div>
                                <span style={{ fontSize:10, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:1 }}>Services Scanned</span>
                                <span style={{ marginLeft:'auto', fontSize:9, fontWeight:700, color:'#FF9900', background:'rgba(255,153,0,0.08)', border:'1px solid rgba(255,153,0,0.2)', borderRadius:10, padding:'1px 8px' }}>52+ Checks</span>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                                {[
                                    { Icon: Key,      name:'IAM',        checks:'12 checks', color:'#d13212', delay:'.02s' },
                                    { Icon: Globe,    name:'S3',         checks:'8 checks',  color:'#FF9900', delay:'.04s' },
                                    { Icon: Server,   name:'EC2',        checks:'9 checks',  color:'#0972d3', delay:'.06s' },
                                    { Icon: Lock,     name:'VPC / SG',   checks:'7 checks',  color:'#8B5CF6', delay:'.08s' },
                                    { Icon: Eye,      name:'CloudTrail', checks:'4 checks',  color:'#f59e0b', delay:'.10s' },
                                    { Icon: Database, name:'RDS',        checks:'5 checks',  color:'#1d8102', delay:'.12s' },
                                    { Icon: Server,   name:'EBS',        checks:'3 checks',  color:'#0972d3', delay:'.14s' },
                                    { Icon: Lock,     name:'KMS',        checks:'4 checks',  color:'#e67e22', delay:'.16s' },
                                    { Icon: Activity, name:'CloudWatch', checks:'2 checks',  color:'#7953d2', delay:'.18s' },
                                ].map(svc => (
                                    <div key={svc.name} style={{ background:`${svc.color}08`, border:`1px solid ${svc.color}1e`, borderRadius:8, padding:'10px 10px 8px', animation:`svcPop 0.3s ease ${svc.delay} both`, transition:'border-color 0.15s, background 0.15s', cursor:'default' }}
                                        onMouseEnter={e => { e.currentTarget.style.background=`${svc.color}14`; e.currentTarget.style.borderColor=`${svc.color}44` }}
                                        onMouseLeave={e => { e.currentTarget.style.background=`${svc.color}08`; e.currentTarget.style.borderColor=`${svc.color}1e` }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                                            <div style={{ width:24, height:24, borderRadius:6, background:`${svc.color}14`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                <svc.Icon size={13} color={svc.color} />
                                            </div>
                                            <span style={{ fontSize:11, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{svc.name}</span>
                                        </div>
                                        <div style={{ fontSize:9, color:svc.color, fontWeight:700, fontFamily:'monospace' }}>{svc.checks}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Compliance Frameworks */}
                        <div style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 20px', boxShadow:'var(--card-shadow)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                                <div style={{ width:18, height:18, borderRadius:5, background:'rgba(255,153,0,0.1)', border:'1px solid rgba(255,153,0,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <CheckCircle size={10} color="#FF9900" />
                                </div>
                                <span style={{ fontSize:10, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:1 }}>Compliance Alignment</span>
                                <span style={{ marginLeft:'auto', fontSize:9, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.08)', border:'1px solid rgba(29,129,2,0.2)', borderRadius:10, padding:'1px 8px' }}>4 Frameworks</span>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1, justifyContent:'center' }}>
                                {[
                                    { name:'CIS AWS Foundations Benchmark',         controls:'28 controls', color:'#FF9900', pct:78, desc:'Identity, logging, network & monitoring' },
                                    { name:'AWS Well-Architected Security Pillar',  controls:'17 checks',   color:'#0972d3', pct:85, desc:'IAM, detection, infrastructure protection' },
                                    { name:'NIST CSF — Detect & Protect',           controls:'34 controls', color:'#8B5CF6', pct:65, desc:'Asset mgmt, access control, data security' },
                                    { name:'PCI-DSS Cloud Controls',                controls:'12 checks',   color:'#1d8102', pct:55, desc:'Encryption, access restriction, monitoring' },
                                ].map((f,i) => (
                                    <div key={f.name} style={{ animation:`svcPop 0.3s ease ${i*0.06+0.02}s both` }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                                            <div>
                                                <span style={{ fontSize:10.5, fontWeight:700, color:'var(--text)' }}>{f.name}</span>
                                                <span style={{ fontSize:8.5, color:'var(--text3)', marginLeft:8 }}>{f.desc}</span>
                                            </div>
                                            <span style={{ fontSize:9, fontWeight:700, color:f.color, fontFamily:'monospace', flexShrink:0, marginLeft:8 }}>{f.controls}</span>
                                        </div>
                                        <div style={{ height:4, borderRadius:3, background:'var(--border)', overflow:'hidden' }}>
                                            <div style={{ height:'100%', borderRadius:3, background:`linear-gradient(90deg,${f.color},${f.color}88)`, width:`${f.pct}%`, transition:'width 0.6s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Region Coverage */}
                        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 20px', flexShrink:0, boxShadow:'var(--card-shadow)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                                <div style={{ width:18, height:18, borderRadius:5, background:'rgba(9,114,211,0.1)', border:'1px solid rgba(9,114,211,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <Globe size={10} color="#0972d3" />
                                </div>
                                <span style={{ fontSize:10, fontWeight:800, color:'var(--text3)', textTransform:'uppercase', letterSpacing:1 }}>Region Coverage</span>
                                <span style={{ marginLeft:'auto', fontSize:9, fontWeight:700, color:'#1d8102', background:'rgba(29,129,2,0.08)', border:'1px solid rgba(29,129,2,0.2)', borderRadius:10, padding:'1px 8px' }}>9 Active</span>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
                                {[
                                    { id:'us-east-1',      label:'N. Virginia', color:'#FF9900', delay:'.02s' },
                                    { id:'us-east-2',      label:'Ohio',        color:'#FF9900', delay:'.04s' },
                                    { id:'us-west-2',      label:'Oregon',      color:'#FF9900', delay:'.06s' },
                                    { id:'eu-west-1',      label:'Ireland',     color:'#0972d3', delay:'.08s' },
                                    { id:'eu-central-1',   label:'Frankfurt',   color:'#0972d3', delay:'.10s' },
                                    { id:'eu-north-1',     label:'Stockholm',   color:'#0972d3', delay:'.12s' },
                                    { id:'ap-northeast-1', label:'Tokyo',       color:'#1d8102', delay:'.14s' },
                                    { id:'ap-southeast-1', label:'Singapore',   color:'#1d8102', delay:'.16s' },
                                    { id:'ap-south-1',     label:'Mumbai',      color:'#1d8102', delay:'.18s' },
                                ].map(r => (
                                    <div key={r.id} style={{ background:`${r.color}08`, border:`1px solid ${r.color}22`, borderRadius:6, padding:'6px 8px', animation:`rgPop 0.3s ease ${r.delay} both` }}>
                                        <div style={{ fontSize:8.5, fontFamily:'monospace', color:r.color, fontWeight:700 }}>{r.id}</div>
                                        <div style={{ fontSize:8, color:'var(--text3)', marginTop:1 }}>{r.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ERROR ── */}
            {status === 'error' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                    <XCircle size={36} color="#d13212" />
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#d13212' }}>Scan Failed</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>Could not reach the backend. Is FastAPI running on port 8000?</div>
                    <button onClick={triggerScan} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 6, background: '#FF9900', color: '#232F3E', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        <Zap size={14} />Try Again
                    </button>
                </div>
            )}

            {/* ── SCANNING ── */}
            {scanning && (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minHeight: 0 }}>
                    <style>{`
                        @keyframes termLine    { 0%{opacity:0;transform:translateX(-8px)} 100%{opacity:1;transform:translateX(0)} }
                        @keyframes barGlow     { 0%,100%{box-shadow:0 0 8px rgba(255,153,0,0.3)} 50%{box-shadow:0 0 18px rgba(255,153,0,0.6)} }
                        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
                    `}</style>

                    {/* LEFT — Terminal (page-theme) */}
                    <div style={{ borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'var(--card-shadow)', border:'1px solid var(--border)' }}>
                        {/* Title bar */}
                        <div style={{ background:'var(--bg3, rgba(35,47,62,0.06))', padding:'9px 16px', display:'flex', alignItems:'center', gap:7, flexShrink:0, borderBottom:'1px solid var(--border)' }}>
                            {[['#d13212','#c0392b'],['#f59e0b','#d68910'],['#067340','#1d8102']].map(([bg,sh],i) => (
                                <div key={i} style={{ width:11, height:11, borderRadius:'50%', background:bg, boxShadow:`0 0 4px ${sh}66` }} />
                            ))}
                            <span style={{ marginLeft:8, fontSize:11, color:'var(--text3)', fontFamily:'monospace', letterSpacing:0.2 }}>&#9889; cloud-security-scanner — {awsId}</span>
                            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5 }}>
                                <div style={{ width:6, height:6, borderRadius:'50%', background:'#1d8102', boxShadow:'0 0 5px rgba(29,129,2,0.7)', animation:'pulse 1.5s ease infinite' }} />
                                <span style={{ fontSize:9, color:'#1d8102', fontWeight:700, fontFamily:'monospace' }}>LIVE</span>
                            </div>
                        </div>
                        {/* Body */}
                        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', fontFamily:'monospace', background:'var(--bg2)' }}>
                            {SCAN_LINES.slice(0, scanLineIdx + 1).map((line, i) => (
                                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5, animation: i===scanLineIdx ? 'termLine 0.25s ease' : 'none' }}>
                                    <span style={{ color: i<scanLineIdx ? '#1d8102' : '#FF9900', fontSize:11, flexShrink:0, width:14, textAlign:'center' }}>{i<scanLineIdx ? '✓' : '▶'}</span>
                                    <span style={{ fontSize:11.5, color: i<scanLineIdx ? 'var(--text3)' : i===scanLineIdx ? 'var(--text)' : 'var(--text3)', fontWeight: i===scanLineIdx?600:400, opacity: i<scanLineIdx ? 0.6 : 1 }}>{line}</span>
                                    {i===scanLineIdx && <span style={{ width:8, height:14, background:'#FF9900', borderRadius:1, animation:'cursorBlink 1s step-end infinite', marginLeft:2, flexShrink:0 }} />}
                                </div>
                            ))}
                        </div>
                        {/* Progress */}
                        <div style={{ flexShrink:0, background:'var(--bg3, rgba(35,47,62,0.04))', padding:'12px 20px', borderTop:'1px solid var(--border)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                                <span style={{ fontSize:9.5, color:'var(--text3)', fontFamily:'monospace', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8 }}>Scan Progress</span>
                                <span style={{ fontSize:10, color:'#FF9900', fontFamily:'monospace', fontWeight:700 }}>{pct}%</span>
                            </div>
                            <div style={{ height:5, borderRadius:3, background:'var(--border)', overflow:'hidden', marginBottom:6 }}>
                                <div style={{ height:'100%', borderRadius:3, background:'linear-gradient(90deg,#FF9900,#ec8a00)', width:`${pct}%`, transition:'width 0.8s ease', animation:'barGlow 2s ease infinite' }} />
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between' }}>
                                <span style={{ fontSize:9, color:'var(--text3)', fontFamily:'monospace' }}>{scanLine}</span>
                                <span style={{ fontSize:9, color:'var(--text3)', fontFamily:'monospace' }}>{elapsed}s elapsed</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — Fact + Stats */}
                    <div style={{ display:'flex', flexDirection:'column', gap:12, minHeight:0 }}>
                        {/* Fact card */}
                        <div style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'24px 28px', display:'flex', flexDirection:'column', justifyContent:'center', overflow:'hidden', opacity: factVisible?1:0, transition:'opacity 0.4s ease', boxShadow:'var(--card-shadow)', position:'relative' }}>
                            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#FF9900,#FF990044)' }} />
                            <div style={{ fontSize:44, marginBottom:14, lineHeight:1 }}>{fact?.icon}</div>
                            <div style={{ fontSize:10, fontWeight:800, color:'#FF9900', textTransform:'uppercase', letterSpacing:1.2, marginBottom:6 }}>AWS Fact</div>
                            <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginBottom:8, lineHeight:1.25 }}>{fact?.title}</div>
                            <div style={{ fontSize:28, fontWeight:900, color:'#FF9900', fontFamily:'monospace', marginBottom:12, lineHeight:1 }}>{fact?.stat}</div>
                            <div style={{ fontSize:12.5, color:'var(--text3)', lineHeight:1.7 }}>{fact?.desc}</div>
                            <div style={{ display:'flex', gap:5, marginTop:18 }}>
                                {AWS_FACTS.map((_,i) => (
                                    <div key={i} style={{ width:i===factIdx?18:5, height:5, borderRadius:3, background:i===factIdx?'#FF9900':'var(--border2)', transition:'all 0.35s ease' }} />
                                ))}
                            </div>
                        </div>

                        {/* 4 stat tiles with colored top accent */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, flexShrink:0 }}>
                            {[
                                { label:'Elapsed', val:`${elapsed}s`,                                                         color:'#0972d3' },
                                { label:'Step',    val:`${Math.min(scanLineIdx+1,SCAN_LINES.length)}/${SCAN_LINES.length}`,   color:'#FF9900' },
                                { label:'Regions', val:'Multi-Region',                                                        color:'#8B5CF6' },
                                { label:'Mode',    val:'DRY RUN',                                                             color:'#1d8102' },
                            ].map(c => (
                                <div key={c.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', boxShadow:'var(--card-shadow)' }}>
                                    <div style={{ height:2, background:`linear-gradient(90deg,${c.color},${c.color}55)` }} />
                                    <div style={{ padding:'10px 14px' }}>
                                        <div style={{ fontSize:8.5, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:5 }}>{c.label}</div>
                                        <div style={{ fontSize:16, fontWeight:800, color:c.color, fontFamily:'monospace' }}>{c.val}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── DONE ── */}
            {hasScan && !scanning && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                    {/* Summary strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
                        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
                            const cfg = SEV[sev]
                            return (
                                <div key={sev} onClick={() => setFilterSev(f => f === sev ? 'ALL' : sev)} style={{ background: filterSev === sev ? cfg.bg : 'var(--bg2)', border: `1.5px solid ${filterSev === sev ? cfg.color : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: cfg.color, fontFamily: 'monospace', lineHeight: 1 }}>{counts[sev]}</div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: 0.5 }}>{sev}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>findings</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Filter bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search type or resource..."
                                style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                                onFocus={e => e.target.style.borderColor = '#FF9900'}
                                onBlur={e => e.target.style.borderColor = 'var(--border)'}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => setFilterSev('ALL')} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${filterSev === 'ALL' ? '#FF9900' : 'var(--border)'}`, background: filterSev === 'ALL' ? 'rgba(255,153,0,0.08)' : 'transparent', color: filterSev === 'ALL' ? '#FF9900' : 'var(--text3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s' }}>ALL</button>
                            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => <SevPill key={sev} sev={sev} active={filterSev === sev} onClick={() => setFilterSev(f => f === sev ? 'ALL' : sev)} />)}
                        </div>
                        <select value={filterMod} onChange={e => setFilterMod(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                            <option value="ALL">All Modules</option>
                            {modules.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', flexShrink: 0 }}>{filtered.length} / {findings.length}</span>
                    </div>

                    {/* Findings grid */}
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        {filtered.length === 0
                            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', gap: 10 }}>
                                <CheckCircle size={28} color="#067340" />
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#067340' }}>No findings match this filter</div>
                            </div>
                            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, paddingBottom: 16 }}>
                                {filtered.map((f, i) => {
                                    const cfg = SEV[f.severity] || SEV.LOW
                                    const isHov = hoverId === f.id
                                    const isHighlight = highlightFindingId === f.id
                                    const isDimmed = highlightFindingId && !isHighlight
                                    return (
                                        <div key={f.id || i}
                                            ref={isHighlight ? highlightRef : null}
                                            onMouseEnter={() => setHoverId(f.id)}
                                            onMouseLeave={() => setHoverId(null)}
                                            style={{
                                                background: isHighlight ? cfg.bg : (isHov ? cfg.bg : 'var(--bg2)'),
                                                border: isHighlight
                                                    ? `2px solid ${cfg.color}`
                                                    : `1.5px solid ${isHov ? cfg.color : cfg.border}`,
                                                borderRadius: 8,
                                                padding: '14px 16px',
                                                cursor: 'default',
                                                transition: 'all 0.3s ease',
                                                transform: isHighlight ? 'translateY(-4px) scale(1.02)' : 'none',
                                                boxShadow: isHighlight
                                                    ? `0 8px 32px ${cfg.color}40, 0 0 0 3px ${cfg.color}20`
                                                    : isHov
                                                        ? `0 4px 16px ${cfg.color}18`
                                                        : 'var(--card-shadow)',
                                                opacity: isDimmed ? 0.35 : 1,
                                                zIndex: isHighlight ? 10 : 1,
                                                position: 'relative',
                                                animation: `fadeUp 0.25s ease ${(i % 20) * 0.02}s both`,
                                            }}>
                                            {/* Highlight badge */}
                                            {isHighlight && (
                                                <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: cfg.color, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 10px', borderRadius: 10, letterSpacing: 0.5, whiteSpace: 'nowrap', boxShadow: `0 2px 8px ${cfg.color}50` }}>
                                                    ↓ Selected from Overview
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 7, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <ModuleIcon type={f.type} size={15} color={cfg.color} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{f.type}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 4, padding: '1px 7px', fontFamily: 'monospace', letterSpacing: 0.4 }}>{f.severity}</span>
                                                        <span style={{ fontSize: 9, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{moduleOf(f.type)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                                                <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>Resource</span>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>{f.resource_id || '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 9, alignItems: 'center' }}>
                                                <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>Region</span>
                                                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', fontFamily: 'monospace', flex: 1, textAlign: 'right' }}>{f.region || '—'}</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, borderTop: `1px solid ${isHov ? cfg.color + '22' : 'var(--border)'}`, paddingTop: 8 }}>{f.description}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        }
                    </div>
                </div>
            )}
        </div>
    )
}
