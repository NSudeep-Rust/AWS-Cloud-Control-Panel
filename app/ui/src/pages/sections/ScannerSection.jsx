import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useScan } from '@/context/ScanContext'
import {
    Search, Shield, Globe, Key, Server, Database, Eye, Lock,
    CheckCircle, ChevronRight, Zap, Activity, XCircle, Square
} from 'lucide-react'

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
    // VPC_FLOW already caught above; SECURITY_GROUP / NACL / ROUTE / KMS / VPC below
    if (type?.startsWith('SECURITY_GROUP') || type?.startsWith('PUBLIC_SECURITY') || type?.startsWith('NACL')
        || type?.startsWith('ROUTE') || type?.startsWith('VPC') || type?.startsWith('INTERNET')
        || type?.startsWith('PUBLIC_SUBNET') || type?.startsWith('KMS')) return <Lock size={size} color={color} />
    return <Shield size={size} color={color} />
}

function moduleOf(type = '') {
    // ── ORDER MATTERS: longer/more specific prefixes MUST come before shorter ones ──
    if (type.startsWith('S3')) return 'S3'
    if (type.startsWith('IAM')) return 'IAM'
    if (type.startsWith('EC2') || type.startsWith('EBS')) return 'EC2'
    if (type.startsWith('RDS')) return 'RDS'
    if (type.startsWith('CLOUDTRAIL')) return 'CloudTrail'
    if (type.startsWith('CLOUDWATCH')) return 'CloudWatch'
    // VPC_FLOW must be checked BEFORE VPC (VPC_FLOW starts with VPC)
    if (type.startsWith('VPC_FLOW')) return 'CloudTrail'
    if (type.startsWith('VPC')) return 'VPC'
    if (type.startsWith('SECURITY_GROUP') || type.startsWith('PUBLIC_SECURITY') || type.startsWith('NACL')) return 'Firewall'
    // ROUTE_TABLE must be checked BEFORE ROUTE (in case both exist)
    if (type.startsWith('ROUTE_TABLE') || type.startsWith('ROUTE')) return 'Network'
    if (type.startsWith('INTERNET') || type.startsWith('PUBLIC_SUBNET')) return 'Network'
    if (type.startsWith('KMS')) return 'KMS'
    if (type.startsWith('LAMBDA')) return 'Lambda'
    if (type.startsWith('EKS') || type.startsWith('ECS')) return 'Containers'
    if (type.startsWith('SNS') || type.startsWith('SQS')) return 'Messaging'
    if (type.startsWith('CONFIG')) return 'Config'
    return 'Security'
}

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
    'Enumerating S3 buckets...',
    'Checking bucket policies & ACLs...',
    'Scanning IAM users and roles...',
    'Analyzing attached policies...',
    'Probing EC2 instances [us-east-1]...',
    'Checking security groups...',
    'Scanning EBS volumes...',
    'Evaluating encryption status...',
    'Checking CloudTrail logging...',
    'Scanning VPC flow logs...',
    'Analyzing network ACLs...',
    'Checking route tables...',
    'Scanning KMS key rotation...',
    'Probing EC2 instances [eu-north-1]...',
    'Evaluating public endpoints...',
    'Cross-referencing findings...',
    'Calculating severity scores...',
    'Finalizing scan results...',
]

// 6 regions from aws_session.py
const SCAN_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'eu-central-1', 'eu-north-1']

export function ScannerSection({ onNav, dark }) {
    const { account } = useAuth()

    const isIam = account?.account_type === 'iam'
    const dbId = isIam ? (account?.account_id ?? null) : (account?.id ?? null)
    const awsId = isIam ? (account?.parent_aws_account_id || '—') : (account?.aws_account_id || '—')
    const cacheKey = `scan_v3_${account?.account_type}_${awsId}_${dbId}`

    // ── Global scan state ──────────────────────────────────────────
    const {
        status, findings, elapsed,
        scanLineIdx, factIdx, factVisible,
        startScan, stopScan,
        highlightFindingId, setHighlightFindingId,
    } = useScan()

    const scanning = status === 'scanning'
    const hasScan = status === 'done'

    // ── Highlight: scroll to specific finding OR apply severity filter ──
    const highlightRef = useRef(null)
    useEffect(() => {
        if (!highlightFindingId) return

        // Sentinel from stat tile click: '__filter_CRITICAL__' etc
        if (highlightFindingId.startsWith('__filter_')) {
            const sev = highlightFindingId.replace('__filter_', '').replace('__', '')
            setFilterSev(sev)
            setFilterMod('ALL')
            setSearch('')
            setHighlightFindingId(null)
            return
        }

        // Specific finding clicked from Overview list
        setFilterSev('ALL')
        setFilterMod('ALL')
        setSearch('')
        const t = setTimeout(() => { if (highlightRef.current) highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 150)
        const clear = setTimeout(() => setHighlightFindingId(null), 4000)
        return () => { clearTimeout(t); clearTimeout(clear) }
    }, [highlightFindingId])

    // ── Local filter state ─────────────────────────────────────────
    const [filterSev, setFilterSev] = useState('ALL')
    const [filterMod, setFilterMod] = useState('ALL')
    const [search, setSearch] = useState('')
    const [hoverId, setHoverId] = useState(null)

    function triggerScan() {
        if (!dbId || scanning) return
        startScan({ dbId, awsId, cacheKey })
    }

    const modules = [...new Set(findings.map(f => moduleOf(f.type)))].sort()
    const filtered = findings.filter(f => {
        if (filterSev !== 'ALL' && f.severity !== filterSev) return false
        if (filterMod !== 'ALL' && moduleOf(f.type) !== filterMod) return false
        if (search && !f.type.toLowerCase().includes(search.toLowerCase()) && !f.resource_id?.toLowerCase().includes(search.toLowerCase())) return false
        return true
    }).sort((a, b) => (SEV[a.severity]?.rank ?? 9) - (SEV[b.severity]?.rank ?? 9))

    const counts = {
        CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
        HIGH: findings.filter(f => f.severity === 'HIGH').length,
        MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
        LOW: findings.filter(f => f.severity === 'LOW').length,
    }

    const pct = Math.min(100, Math.round((scanLineIdx / SCAN_LINES.length) * 100))
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

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Stop button — only shown while scanning */}
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
                    <div style={{ position: 'relative', width: 160, height: 160 }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ position: 'absolute', inset: i * 20, borderRadius: '50%', border: `1px solid rgba(255,153,0,${0.15 - i * 0.04})` }} />
                        ))}
                        <div style={{ position: 'absolute', inset: 60, borderRadius: '50%', background: 'rgba(255,153,0,0.1)', border: '2px solid rgba(255,153,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Search size={20} color="#FF9900" />
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Ready to Scan</div>
                        <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 420, lineHeight: 1.6 }}>
                            Full security scan across <strong style={{ color: 'var(--text2)' }}>key AWS regions</strong> · Checks 52+ misconfiguration types across IAM, S3, EC2, VPC, and more.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 28 }}>
                        {[{ label: 'Check Types', val: '52+' }, { label: 'Services', val: '12+' }, { label: 'Coverage', val: 'Global' }].map(s => (
                            <div key={s.label} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#FF9900', fontFamily: 'monospace' }}>{s.val}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                    {/* Region chips — generic labels, not specific AWS region names */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['US Primary', 'US Secondary', 'EU West', 'Asia Pacific', 'EU Central', 'EU North'].map(r => (
                            <span key={r} style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px' }}>{r}</span>
                        ))}
                    </div>
                    <button onClick={triggerScan} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 32px', borderRadius: 8, background: '#FF9900', color: '#232F3E', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 20px rgba(255,153,0,0.35)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#ec8a00'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FF9900'; e.currentTarget.style.transform = 'translateY(0)' }}>
                        <Zap size={16} />Start Security Scan
                    </button>
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
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 0 }}>

                    {/* LEFT — Terminal */}
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
                            {['#d13212', '#f59e0b', '#067340'].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>cloud-security-scanner — {awsId}</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace' }}>
                            {SCAN_LINES.slice(0, scanLineIdx + 1).map((line, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, animation: i === scanLineIdx ? 'fadeUp 0.3s ease' : 'none' }}>
                                    <span style={{ color: i < scanLineIdx ? '#067340' : '#FF9900', fontSize: 11, flexShrink: 0 }}>{i < scanLineIdx ? '✓' : '▶'}</span>
                                    <span style={{ fontSize: 12, color: i < scanLineIdx ? 'var(--text3)' : 'var(--text)', fontWeight: i === scanLineIdx ? 600 : 400 }}>{line}</span>
                                    {i === scanLineIdx && <span style={{ width: 8, height: 14, background: '#FF9900', borderRadius: 1, animation: 'pulse 0.8s ease infinite' }} />}
                                </div>
                            ))}
                        </div>
                        {/* Progress */}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', fontWeight: 600 }}>SCAN PROGRESS</span>
                                <span style={{ fontSize: 10, color: '#FF9900', fontFamily: 'monospace', fontWeight: 700 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #FF9900, #ec8a00)', width: `${pct}%`, transition: 'width 0.8s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                                <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>{scanLine}</span>
                                <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>{elapsed}s elapsed</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — Fact card */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', transition: 'opacity 0.3s ease', opacity: factVisible ? 1 : 0 }}>
                            <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>{fact?.icon}</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#FF9900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>AWS Fact</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8, lineHeight: 1.2 }}>{fact?.title}</div>
                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FF9900', fontFamily: 'monospace', marginBottom: 12, lineHeight: 1 }}>{fact?.stat}</div>
                            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>{fact?.desc}</div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 20 }}>
                                {AWS_FACTS.map((_, i) => <div key={i} style={{ width: i === factIdx ? 18 : 5, height: 5, borderRadius: 3, background: i === factIdx ? '#FF9900' : 'var(--border2)', transition: 'all 0.3s ease' }} />)}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
                            {[
                                { label: 'Elapsed', val: `${elapsed}s`, color: '#0972d3' },
                                { label: 'Step', val: `${scanLineIdx + 1}/${SCAN_LINES.length}`, color: '#FF9900' },
                                { label: 'Regions', val: 'Multi-Region', color: '#8B5CF6' },
                                { label: 'Mode', val: 'DRY RUN', color: '#067340' },
                            ].map(c => (
                                <div key={c.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: c.color, fontFamily: 'monospace' }}>{c.val}</div>
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
                                    // When any finding is highlighted, dim all others
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
                                                // Highlighted tile pops up above others
                                                transform: isHighlight ? 'translateY(-4px) scale(1.02)' : 'none',
                                                boxShadow: isHighlight
                                                    ? `0 8px 32px ${cfg.color}40, 0 0 0 3px ${cfg.color}20`
                                                    : isHov
                                                        ? `0 4px 16px ${cfg.color}18`
                                                        : 'var(--card-shadow)',
                                                // Dim non-highlighted tiles
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
