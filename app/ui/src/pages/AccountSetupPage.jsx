import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Check, Plus, User, Key, Cloud } from 'lucide-react'
import { accountsAPI } from '../api/index'
import { useAuth } from '../context/AuthContext'

const FONT_INJECT = `
@font-face { font-family: 'Amazon Ember'; src: local('Amazon Ember'), local('AmazonEmber'); }
*, *::before, *::after {
  box-sizing: border-box;
  font-family: 'Amazon Ember', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif !important;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes bannerIn { from { opacity:0; transform: translateY(-50%) translateX(30px); } to { opacity:1; transform: translateY(-50%) translateX(0); } }
`

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'ap-southeast-1', 'ap-southeast-2',
    'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
    'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1',
]

function AWSLogo() {
    return (
        <svg viewBox="0 0 130 52" width="92" height="36" style={{ display: 'block' }}>
            <text x="65" y="36" textAnchor="middle" fill="#232F3E" fontSize="38" fontWeight="bold" fontFamily="Arial, sans-serif">aws</text>
            <path d="M20 43 Q65 57 110 43" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M105 39 L110 43 L105 47" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// ── Illustrations (kept identical) ─────────────────────────────
const IllustrationIAM = () => (
    <svg viewBox="0 0 320 162" width="100%" style={{ display: 'block' }}>
        <rect width="320" height="162" fill="#f9f5ff" />
        <circle cx="160" cy="45" r="20" fill="#8B5CF6" opacity="0.15" />
        <circle cx="160" cy="39" r="12" fill="#8B5CF6" />
        <ellipse cx="160" cy="63" rx="18" ry="8" fill="#8B5CF6" />
        <rect x="154" y="32" width="12" height="9" rx="2" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M156 32 Q156 28 166 28 Q166 32 166 32" fill="none" stroke="white" strokeWidth="1.5" />
        {[{ x: 12, y: 88, label: 'S3:Read', c: '#22C55E' }, { x: 82, y: 104, label: 'EC2:Start', c: '#FF9900' }, { x: 168, y: 88, label: 'IAM:Admin', c: '#8B5CF6' }, { x: 238, y: 104, label: 'VPC:Deny', c: '#d13212' }].map((b, i) => (
            <g key={i}>
                <line x1="160" y1="71" x2={b.x + 34} y2={b.y} stroke={b.c} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.45" />
                <rect x={b.x} y={b.y} width="68" height="24" rx="5" fill="white" stroke={b.c} strokeWidth="1.4" />
                <text x={b.x + 34} y={b.y + 10} textAnchor="middle" fontSize="8" fill={b.c} fontWeight="700" fontFamily="monospace">{b.label}</text>
                <rect x={b.x + 7} y={b.y + 14} width="40" height="3" rx="1.5" fill={b.c} opacity="0.25" />
            </g>
        ))}
        <rect x="176" y="25" width="30" height="13" rx="6" fill="#8B5CF6" />
        <text x="191" y="35" textAnchor="middle" fontSize="7" fill="white" fontWeight="800">MFA</text>
        <text x="160" y="148" textAnchor="middle" fontSize="8" fill="#8B5CF6" fontWeight="600" fontFamily="monospace" opacity="0.8">Role-Based Access Control (RBAC)</text>
    </svg>
)
const IllustrationEC2 = () => (
    <svg viewBox="0 0 320 162" width="100%" style={{ display: 'block' }}>
        <rect width="320" height="162" fill="#fffbf0" />
        <rect x="28" y="11" width="170" height="134" rx="7" fill="#232F3E" opacity="0.04" stroke="rgba(35,47,62,0.15)" strokeWidth="1.3" />
        <text x="38" y="25" fontSize="8" fill="#687078" fontFamily="monospace">RACK-01 / us-east-1</text>
        {[{ s: 'running', t: 't3.medium', cpu: 62, l: 'web-server-01' }, { s: 'running', t: 'm5.large', cpu: 88, l: 'api-server-02' }, { s: 'stopped', t: 'c5.xlarge', cpu: 0, l: 'batch-worker' }, { s: 'running', t: 't3.small', cpu: 23, l: 'monitoring' }].map((srv, i) => (
            <g key={i}>
                <rect x="38" y={30 + i * 27} width="150" height="22" rx="3" fill="white" stroke={srv.s === 'running' ? 'rgba(255,153,0,0.3)' : 'rgba(35,47,62,0.1)'} strokeWidth="1.2" />
                <circle cx="49" cy={41 + i * 27} r="4" fill={srv.s === 'running' ? '#22C55E' : '#aab7b8'} />
                <text x="58" y={38 + i * 27} fontSize="8" fill="#16191f" fontWeight="600" fontFamily="monospace">{srv.l}</text>
                <text x="58" y={46 + i * 27} fontSize="7" fill="#687078" fontFamily="monospace">{srv.t}</text>
                <rect x="144" y={38 + i * 27} width="32" height="5" rx="2" fill="rgba(35,47,62,0.08)" />
                <rect x="144" y={38 + i * 27} width={srv.cpu * 0.32} height="5" rx="2" fill={srv.cpu > 80 ? '#d13212' : '#FF9900'} />
                <text x="180" y={44 + i * 27} fontSize="6" fill="#687078" fontFamily="monospace">{srv.cpu}%</text>
            </g>
        ))}
        <rect x="208" y="14" width="96" height="130" rx="7" fill="white" stroke="rgba(255,153,0,0.3)" strokeWidth="1.3" />
        <text x="256" y="30" textAnchor="middle" fontSize="8" fill="#FF9900" fontWeight="700" fontFamily="monospace">AUTO SCALE</text>
        {[34, 48, 60, 76, 64, 52, 72].map((h, i) => <rect key={i} x={216 + i * 10} y={142 - h * 0.76} width="8" height={h * 0.76} rx="2" fill="#FF9900" opacity={0.3 + i * 0.09} />)}
        <path d="M240 62 L256 52 L272 62" fill="none" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" />
        <text x="256" y="78" textAnchor="middle" fontSize="7" fill="#22C55E" fontWeight="600">Scale Up</text>
        <path d="M240 98 L256 108 L272 98" fill="none" stroke="#d13212" strokeWidth="1.8" strokeLinecap="round" />
        <text x="256" y="124" textAnchor="middle" fontSize="7" fill="#d13212" fontWeight="600">Scale Down</text>
    </svg>
)
const IllustrationS3 = () => (
    <svg viewBox="0 0 320 162" width="100%" style={{ display: 'block' }}>
        <rect width="320" height="162" fill="#f0fdf4" />
        <ellipse cx="112" cy="38" rx="46" ry="11" fill="#22C55E" opacity="0.2" stroke="#22C55E" strokeWidth="1.6" />
        <path d="M66 38 L74 110 Q112 126 150 110 L158 38" fill="#22C55E" opacity="0.07" stroke="#22C55E" strokeWidth="1.6" />
        <text x="112" y="29" textAnchor="middle" fontSize="8" fill="#22C55E" fontWeight="700" fontFamily="monospace">my-security-bucket</text>
        {[{ y: 56, l: 'logs/2024-01/', s: '4.2 GB', c: '#22C55E' }, { y: 72, l: 'scans/results/', s: '1.1 GB', c: '#0972d3' }, { y: 88, l: 'backups/daily/', s: '18 GB', c: '#FF9900' }, { y: 104, l: 'reports/audit/', s: '240 MB', c: '#8B5CF6' }].map((o, i) => (
            <g key={i}>
                <rect x="77" y={o.y} width="62" height="13" rx="3" fill="white" stroke={o.c} strokeWidth="1" />
                <text x="83" y={o.y + 9} fontSize="7" fill={o.c} fontWeight="600" fontFamily="monospace">{o.l}</text>
                <text x="151" y={o.y + 9} fontSize="7" fill="#aab7b8" fontFamily="monospace">{o.s}</text>
            </g>
        ))}
        <rect x="184" y="11" width="122" height="138" rx="7" fill="white" stroke="rgba(34,197,94,0.25)" strokeWidth="1.3" />
        <text x="245" y="27" textAnchor="middle" fontSize="8" fill="#22C55E" fontWeight="700" fontFamily="monospace">DURABILITY</text>
        <text x="245" y="46" textAnchor="middle" fontSize="11" fill="#16191f" fontWeight="800" fontFamily="monospace">99.99999</text>
        <text x="245" y="57" textAnchor="middle" fontSize="7" fill="#687078" fontFamily="monospace">9999% durable</text>
    </svg>
)
const IllustrationVPC = () => (
    <svg viewBox="0 0 320 162" width="100%" style={{ display: 'block' }}>
        <rect width="320" height="162" fill="#eff6ff" />
        <rect x="9" y="9" width="302" height="138" rx="8" fill="none" stroke="#0972d3" strokeWidth="1.6" strokeDasharray="6 4" />
        <text x="18" y="24" fontSize="8" fill="#0972d3" fontWeight="700" fontFamily="monospace">VPC  10.0.0.0/16</text>
        <rect x="16" y="30" width="130" height="108" rx="5" fill="rgba(9,114,211,0.05)" stroke="#0972d3" strokeWidth="1.2" strokeDasharray="4 3" />
        <text x="81" y="44" textAnchor="middle" fontSize="8" fill="#0972d3" fontWeight="600">Public Subnet</text>
        <rect x="24" y="50" width="50" height="20" rx="4" fill="white" stroke="#22C55E" strokeWidth="1.2" />
        <text x="49" y="63" textAnchor="middle" fontSize="7" fill="#22C55E" fontWeight="700">Internet GW</text>
        <rect x="82" y="50" width="50" height="20" rx="4" fill="white" stroke="#FF9900" strokeWidth="1.2" />
        <text x="107" y="63" textAnchor="middle" fontSize="7" fill="#FF9900" fontWeight="700">Load Balancer</text>
        <rect x="172" y="30" width="130" height="108" rx="5" fill="rgba(35,47,62,0.03)" stroke="#687078" strokeWidth="1.2" strokeDasharray="4 3" />
        <text x="237" y="44" textAnchor="middle" fontSize="8" fill="#687078" fontWeight="600">Private Subnet</text>
        <rect x="180" y="50" width="52" height="20" rx="4" fill="white" stroke="#8B5CF6" strokeWidth="1.2" />
        <text x="206" y="63" textAnchor="middle" fontSize="7" fill="#8B5CF6" fontWeight="700">RDS Primary</text>
        <rect x="242" y="50" width="50" height="20" rx="4" fill="white" stroke="#FF9900" strokeWidth="1.2" />
        <text x="267" y="63" textAnchor="middle" fontSize="7" fill="#FF9900" fontWeight="700">Lambda</text>
    </svg>
)
const IllustrationShield = () => (
    <svg viewBox="0 0 320 162" width="100%" style={{ display: 'block' }}>
        <rect width="320" height="162" fill="#fff5f5" />
        <path d="M160 9 L215 30 V82 C215 121 188 140 160 148 C132 140 105 121 105 82 V30 Z" fill="#d13212" opacity="0.07" stroke="#d13212" strokeWidth="1.8" />
        <path d="M140 78 L153 91 L185 62" stroke="#d13212" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {[40, 76, 112].map((y, i) => (
            <g key={i}>
                <circle cx="34" cy={y} r="5.5" fill="#d13212" opacity="0.5">
                    <animate attributeName="r" values="5.5;8;5.5" dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                </circle>
                <text x="12" y={y - 10} fontSize="7" fill="#d13212" fontFamily="monospace">DDoS</text>
                <path d={`M48 ${y} L97 ${y}`} stroke="#d13212" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.4" />
                <text x="74" y={y - 1} fontSize="8" fill="#d13212" opacity="0.5">✕</text>
            </g>
        ))}
    </svg>
)

const PANELS = [
    { service: 'IAM', title: 'Identity & Access Management', desc: 'Securely control who can access what in your AWS environment.', facts: ['Role-based access control (RBAC)', 'Multi-factor authentication (MFA)', 'Free with every AWS account'], color: '#8B5CF6', bg: 'rgba(139,92,246,0.14)', border: 'rgba(139,92,246,0.35)', Illustration: IllustrationIAM },
    { service: 'EC2', title: 'Elastic Compute Cloud', desc: 'Virtual servers that launch in seconds and scale in minutes.', facts: ['400+ instance types & families', 'Auto Scaling for demand spikes', 'Spot instances save up to 90%'], color: '#FF9900', bg: 'rgba(255,153,0,0.14)', border: 'rgba(255,153,0,0.4)', Illustration: IllustrationEC2 },
    { service: 'S3', title: 'Simple Storage Service', desc: 'Object storage built for any amount of data, from anywhere.', facts: ['99.999999999% (11 9s) durability', 'Object versioning & lifecycle rules', 'AES-256 server-side encryption'], color: '#22C55E', bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.35)', Illustration: IllustrationS3 },
    { service: 'VPC', title: 'Virtual Private Cloud', desc: 'Your own logically isolated network inside AWS.', facts: ['Network-level isolation & segmentation', 'Security groups & Network ACLs', 'AWS Direct Connect & VPN support'], color: '#0972d3', bg: 'rgba(9,114,211,0.14)', border: 'rgba(9,114,211,0.35)', Illustration: IllustrationVPC },
    { service: 'Shield', title: 'AWS Shield & GuardDuty', desc: 'Always-on DDoS protection and ML-powered threat detection.', facts: ['Automatic DDoS mitigation', 'ML-powered anomaly detection', 'Real-time CloudTrail log analysis'], color: '#d13212', bg: 'rgba(209,50,18,0.12)', border: 'rgba(209,50,18,0.35)', Illustration: IllustrationShield },
]

// ── Helper: clear ALL scan caches before login ──────────────────
function clearAllScanCaches() {
    Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('scan_v')) sessionStorage.removeItem(k)
    })
}

// ── Unified entry shape for the Sign In list ────────────────────
// ROOT entry:  { _type:'root', _key: aws_account_id, ...account }
// IAM entry:   { _type:'iam',  _key: 'iam-{id}',    ...iamUser  }
function makeRootEntry(a) { return { ...a, _type: 'root', _key: a.aws_account_id } }
function makeIamEntry(u) { return { ...u, _type: 'iam', _key: `iam-${u.id}` } }

export default function AccountSetupPage() {
    const navigate = useNavigate()
    const { connect } = useAuth()

    const [tab, setTab] = useState('existing')

    // ── FIX: combined list for Sign In — root accounts + IAM users ──
    const [entries, setEntries] = useState([])   // unified list shown in Sign In
    const [rootAccounts, setRootAccounts] = useState([])  // root only (for IAM form dropdown)
    const [loading, setLoading] = useState(false)
    const [selectedKey, setSelectedKey] = useState(null)  // _key of selected entry
    const [hoveredKey, setHoveredKey] = useState(null)
    const [error, setError] = useState('')
    const [connecting, setConnecting] = useState(false)

    // Layout
    const [active, setActive] = useState(false)
    const [bannerIndex, setBannerIndex] = useState(0)
    const formRef = useRef(null)
    const bannerRef = useRef(null)
    const idleRef = useRef(null)

    // Add Account form
    const [rootForm, setRootForm] = useState({ aws_account_id: '', profile_name: '', region: 'us-east-1', access_key: '', secret_key: '' })
    const [rootError, setRootError] = useState('')
    const [rootSuccess, setRootSuccess] = useState('')
    const [rootCreating, setRootCreating] = useState(false)

    // IAM User form
    const [iamForm, setIamForm] = useState({ account_id: '', username: '', access_key: '', secret_key: '', region: 'us-east-1' })
    const [iamError, setIamError] = useState('')
    const [iamSuccess, setIamSuccess] = useState('')
    const [iamCreating, setIamCreating] = useState(false)

    // Fetch both root accounts AND iam users whenever Sign In or IAM tab active
    useEffect(() => {
        if (tab === 'existing' || tab === 'iam') fetchAll()
    }, [tab])

    // Banner auto-cycle
    useEffect(() => {
        const iv = setInterval(() => setBannerIndex(i => (i + 1) % PANELS.length), 4000)
        return () => clearInterval(iv)
    }, [])

    // Click outside → deactivate
    useEffect(() => {
        function handle(e) {
            if (!active) return
            if (!formRef.current?.contains(e.target) && !bannerRef.current?.contains(e.target)) deactivate()
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [active])

    function activate() { setActive(true); clearTimeout(idleRef.current) }
    function deactivate() { setActive(false); clearTimeout(idleRef.current) }

    // ── FIX: fetch BOTH root accounts and IAM users ──────────────
    async function fetchAll() {
        setLoading(true); setError('')
        try {
            // Fetch root accounts
            const rootRes = await accountsAPI.list()
            const roots = (rootRes.data?.accounts || rootRes.data || []).map(makeRootEntry)

            // Fetch IAM users
            let iamEntries = []
            try {
                const iamRes = await accountsAPI.listIamUsers()
                const iams = iamRes.data?.iam_users || iamRes.data || []
                iamEntries = iams.map(makeIamEntry)
            } catch {
                // IAM fetch may fail if endpoint not available — silent fallback
            }

            const allEntries = [...roots, ...iamEntries]
            setEntries(allEntries)
            setRootAccounts(roots)

            // Pre-select first root account for IAM form dropdown
            if (roots.length > 0 && !iamForm.account_id) {
                setIamForm(f => ({ ...f, account_id: roots[0].id }))
            }
        } catch {
            setError('Failed to load accounts. Is the backend running?')
            setEntries([])
            setRootAccounts([])
        } finally { setLoading(false) }
    }

    function handleSelect(key) { setSelectedKey(p => p === key ? null : key); setError('') }

    // ── FIX: sign in works for both root and IAM entries ─────────
    async function handleConnect() {
        if (!selectedKey) { setError('Please select an account.'); return }
        const entry = entries.find(e => e._key === selectedKey)
        if (!entry) return
        setConnecting(true)
        try {
            // ── FIX: Nuke ALL cached scan data before connecting ──
            // This ensures a fresh dashboard every time any account logs in
            clearAllScanCaches()

            if (entry._type === 'root') {
                connect({ ...entry, account_type: 'root' })
            } else {
                connect({ ...entry, account_type: 'iam' })
            }
            navigate('/panel')
        } catch { setError('Connection failed.') }
        finally { setConnecting(false) }
    }

    async function handleCreateRoot(e) {
        e.preventDefault(); setRootError(''); setRootSuccess('')
        if (!rootForm.aws_account_id.trim()) { setRootError('AWS Account ID is required.'); return }
        if (!/^\d{12}$/.test(rootForm.aws_account_id.trim())) { setRootError('Account ID must be exactly 12 digits.'); return }
        setRootCreating(true)
        try {
            await accountsAPI.create({
                aws_account_id: rootForm.aws_account_id.trim(),
                profile_name: rootForm.profile_name.trim() || 'default',
                region: rootForm.region,
                ...(rootForm.access_key && { access_key: rootForm.access_key.trim() }),
                ...(rootForm.secret_key && { secret_key: rootForm.secret_key.trim() }),
            })
            setRootSuccess('Account added!')
            setRootForm({ aws_account_id: '', profile_name: '', region: 'us-east-1', access_key: '', secret_key: '' })
            setTimeout(() => { setRootSuccess(''); setTab('existing') }, 1500)
        } catch (err) { setRootError(err.response?.data?.detail || 'Failed to add account.') }
        finally { setRootCreating(false) }
    }

    async function handleCreateIam(e) {
        e.preventDefault(); setIamError(''); setIamSuccess('')
        if (!iamForm.account_id) { setIamError('Select a parent root account.'); return }
        if (!iamForm.username.trim()) { setIamError('Username is required.'); return }
        if (!iamForm.access_key.trim() || !iamForm.secret_key.trim()) { setIamError('Access Key and Secret Key are required.'); return }
        setIamCreating(true)
        try {
            const res = await accountsAPI.createIamUser({
                account_id: parseInt(iamForm.account_id),
                username: iamForm.username.trim(),
                access_key: iamForm.access_key.trim(),
                secret_key: iamForm.secret_key.trim(),
                region: iamForm.region,
            })
            setIamSuccess('IAM user added! Signing in...')
            const d = res.data?.iam_user
            if (d) {
                setTimeout(() => {
                    // ── FIX: Clear caches before auto-login after creating IAM user ──
                    clearAllScanCaches()
                    connect({ ...d, account_type: 'iam' })
                    navigate('/panel')
                }, 1200)
            } else {
                // Created but no auto-login data — switch to Sign In tab
                setTimeout(() => { setIamSuccess(''); setTab('existing') }, 1500)
            }
        } catch (err) { setIamError(err.response?.data?.detail || 'Failed to add IAM user.') }
        finally { setIamCreating(false) }
    }

    // ── Display helpers ──────────────────────────────────────────
    function getInitials(entry) {
        if (entry._type === 'iam') {
            return (entry.username || '??').slice(0, 2).toUpperCase()
        }
        return (entry.profile_name || entry.aws_account_id || '?').slice(0, 2).toUpperCase()
    }

    function getTitle(entry) {
        if (entry._type === 'iam') return entry.username || 'IAM User'
        return entry.aws_account_id
    }

    function getMeta(entry) {
        if (entry._type === 'iam') {
            return `IAM · ${entry.parent_aws_account_id || '—'} · ${entry.region}`
        }
        return `${entry.profile_name || 'default'} · ${entry.region}`
    }

    const TABS = [
        { id: 'new', label: 'Add Account', icon: <Plus size={13} /> },
        { id: 'existing', label: 'Sign In', icon: <User size={13} /> },
        { id: 'iam', label: 'IAM User', icon: <Key size={13} /> },
    ]

    const panel = PANELS[bannerIndex]
    const { Illustration } = panel

    return (
        <>
            <style>{FONT_INJECT}</style>

            <div style={s.page}>
                <div style={s.blobTL} /><div style={s.blobBR} />

                <button onClick={() => navigate('/')} style={s.backBtn}
                    onMouseEnter={e => e.currentTarget.style.background = '#fff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13 8H3M7 4L3 8L7 12" stroke="#414d5c" strokeWidth="2" strokeLinecap="round" /></svg>
                    Back to Home
                </button>

                {/* ── FORM ── */}
                <div
                    ref={formRef}
                    style={{ ...s.formWrap, left: active ? '28%' : '50%', transition: 'left 0.45s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    onMouseDown={activate}
                >
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                        <AWSLogo />
                    </div>

                    <div style={s.card}>
                        <h1 style={s.title}>
                            {tab === 'existing' ? 'Sign in to Security Panel' : tab === 'new' ? 'Add AWS Account' : 'Add IAM User'}
                        </h1>
                        <div style={s.divider} />

                        <div style={s.tabs}>
                            {TABS.map(t => (
                                <button key={t.id}
                                    style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
                                    onClick={() => { setTab(t.id); setError(''); setRootError(''); setIamError('') }}
                                    onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.background = '#f8f9fa' }}
                                    onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.background = 'transparent' }}>
                                    {t.icon}<span>{t.label}</span>
                                </button>
                            ))}
                        </div>

                        <div style={s.tabArea}>

                            {/* ── SIGN IN TAB — shows roots + IAM users ── */}
                            {tab === 'existing' && (
                                <div style={s.tabContent}>
                                    {loading && <div style={s.loadRow}><div style={s.spin} /><span style={{ color: '#687078', fontSize: 13 }}>Loading accounts...</span></div>}

                                    {!loading && entries.length === 0 && (
                                        <div style={s.empty}>
                                            <Cloud size={26} color="#aab7b8" />
                                            <p style={{ color: '#687078', fontSize: 13, marginTop: 8, textAlign: 'center' }}>No accounts yet.<br />Use "Add Account" to get started.</p>
                                        </div>
                                    )}

                                    {!loading && entries.length > 0 && (
                                        <div style={s.accList}>
                                            {entries.map(entry => {
                                                const isSel = selectedKey === entry._key
                                                const isHov = hoveredKey === entry._key
                                                const isIam = entry._type === 'iam'
                                                return (
                                                    <button key={entry._key}
                                                        style={{ ...s.accRow, ...(isSel ? s.accRowSel : {}), ...(isHov && !isSel ? s.accRowHov : {}) }}
                                                        onClick={() => handleSelect(entry._key)}
                                                        onMouseEnter={() => setHoveredKey(entry._key)}
                                                        onMouseLeave={() => setHoveredKey(null)}>
                                                        <div style={{ ...s.avatar, background: isSel ? '#fdf3e7' : (isIam ? 'rgba(9,114,211,0.08)' : '#f0f2f3'), border: isSel ? '2px solid #FF9900' : '2px solid transparent' }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: isSel ? '#FF9900' : (isIam ? '#0972d3' : '#414d5c') }}>
                                                                {getInitials(entry)}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={s.accId}>{getTitle(entry)}</span>
                                                                {isIam && (
                                                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#0972d3', background: 'rgba(9,114,211,0.08)', border: '1px solid rgba(9,114,211,0.2)', borderRadius: 3, padding: '1px 5px', letterSpacing: 0.3 }}>
                                                                        IAM
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span style={s.accMeta}>{getMeta(entry)}</span>
                                                        </div>
                                                        {isSel && <div style={s.check}><Check size={10} color="#fff" /></div>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {error && <div style={s.errBox}>⚠ {error}</div>}

                                    {entries.length > 0 && (
                                        <button style={s.primaryBtn} onClick={handleConnect} disabled={connecting || !selectedKey}
                                            onMouseEnter={e => { if (!connecting && selectedKey) e.currentTarget.style.background = '#ec8a00' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}>
                                            {connecting ? <div style={s.spinBtn} /> : <ChevronRight size={15} />}
                                            {connecting ? 'Connecting...' : 'Sign in'}
                                        </button>
                                    )}

                                    <div style={s.orRow}><div style={s.orLine} /><span style={s.orTxt}>OR</span><div style={s.orLine} /></div>
                                    <button style={s.secondBtn} onClick={() => setTab('new')}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#aab7b8'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(35,47,62,0.3)'}>
                                        Add a new account
                                    </button>
                                </div>
                            )}

                            {/* ── ADD ACCOUNT TAB ── */}
                            {tab === 'new' && (
                                <form style={s.tabContent} onSubmit={handleCreateRoot}>
                                    <FG label="AWS account ID or account alias" required>
                                        <FI value={rootForm.aws_account_id} placeholder="123456789012" onChange={e => setRootForm(f => ({ ...f, aws_account_id: e.target.value }))} />
                                    </FG>
                                    <FG label="Profile name">
                                        <FI value={rootForm.profile_name} placeholder="default" onChange={e => setRootForm(f => ({ ...f, profile_name: e.target.value }))} />
                                    </FG>
                                    <FG label="Default region" required>
                                        <FS value={rootForm.region} options={AWS_REGIONS} onChange={e => setRootForm(f => ({ ...f, region: e.target.value }))} />
                                    </FG>
                                    <div style={s.secLbl}>Credentials <span style={{ color: '#687078', fontWeight: 400, fontSize: 11 }}>— optional if using IAM role</span></div>
                                    <FG label="Access key ID">
                                        <FI value={rootForm.access_key} placeholder="AKIAIOSFODNN7EXAMPLE" onChange={e => setRootForm(f => ({ ...f, access_key: e.target.value }))} />
                                    </FG>
                                    <FG label="Secret access key">
                                        <FI type="password" value={rootForm.secret_key} placeholder="••••••••••••••••" onChange={e => setRootForm(f => ({ ...f, secret_key: e.target.value }))} />
                                    </FG>
                                    {rootError && <div style={s.errBox}>⚠ {rootError}</div>}
                                    {rootSuccess && <div style={s.okBox}>✓ {rootSuccess}</div>}
                                    <button type="submit" style={s.primaryBtn} disabled={rootCreating}
                                        onMouseEnter={e => { if (!rootCreating) e.currentTarget.style.background = '#ec8a00' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}>
                                        {rootCreating ? <div style={s.spinBtn} /> : <ChevronRight size={15} />}
                                        {rootCreating ? 'Adding account...' : 'Add account'}
                                    </button>
                                </form>
                            )}

                            {/* ── IAM USER TAB ── */}
                            {tab === 'iam' && (
                                <form style={s.tabContent} onSubmit={handleCreateIam}>
                                    <div style={s.infoBox}>
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>🔑</span>
                                        <p style={{ fontSize: 12, color: '#0972d3', lineHeight: 1.5, margin: 0 }}>Select a root account then enter the IAM user credentials to connect with specific permissions.</p>
                                    </div>
                                    <FG label="Root Account">
                                        {loading
                                            ? <div style={s.loadRow}><div style={s.spin} /><span style={{ color: '#687078', fontSize: 13 }}>Loading...</span></div>
                                            : <FS value={iamForm.account_id} isObjOptions
                                                options={rootAccounts.map(a => ({ value: a.id, label: `${a.aws_account_id} (${a.profile_name || 'default'})` }))}
                                                onChange={e => setIamForm(f => ({ ...f, account_id: e.target.value }))} />
                                        }
                                    </FG>
                                    <FG label="IAM Username" required>
                                        <FI value={iamForm.username} placeholder="john.doe" onChange={e => setIamForm(f => ({ ...f, username: e.target.value }))} />
                                    </FG>
                                    <FG label="Region" required>
                                        <FS value={iamForm.region} options={AWS_REGIONS} onChange={e => setIamForm(f => ({ ...f, region: e.target.value }))} />
                                    </FG>
                                    <div style={s.secLbl}>Credentials</div>
                                    <FG label="Access key ID" required>
                                        <FI value={iamForm.access_key} placeholder="AKIAIOSFODNN7EXAMPLE" onChange={e => setIamForm(f => ({ ...f, access_key: e.target.value }))} />
                                    </FG>
                                    <FG label="Secret access key" required>
                                        <FI type="password" value={iamForm.secret_key} placeholder="••••••••••••••••" onChange={e => setIamForm(f => ({ ...f, secret_key: e.target.value }))} />
                                    </FG>
                                    {iamError && <div style={s.errBox}>⚠ {iamError}</div>}
                                    {iamSuccess && <div style={s.okBox}>✓ {iamSuccess}</div>}
                                    <button type="submit" style={s.primaryBtn} disabled={iamCreating}
                                        onMouseEnter={e => { if (!iamCreating) e.currentTarget.style.background = '#ec8a00' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}>
                                        {iamCreating ? <div style={s.spinBtn} /> : <Key size={13} />}
                                        {iamCreating ? 'Adding IAM user...' : 'Add IAM user'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                        {['AWS Cloud Security Panel', '·', 'v0.1.0', '·', 'FastAPI / OAS 3.1'].map((t, i) => (
                            <span key={i} style={{ color: '#aab7b8', fontSize: 11 }}>{t}</span>
                        ))}
                    </div>
                </div>

                {/* ── BANNER ── */}
                {active && (
                    <div ref={bannerRef} style={s.banner} onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: panel.color, background: panel.bg, border: `1px solid ${panel.border}`, borderRadius: 4, padding: '3px 10px', fontFamily: 'monospace', letterSpacing: 1.2 }}>
                                AWS {panel.service}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {PANELS.map((_, i) => (
                                    <button key={i} onClick={() => setBannerIndex(i)} style={{ width: bannerIndex === i ? 18 : 5, height: 5, borderRadius: 20, border: 'none', cursor: 'pointer', padding: 0, background: bannerIndex === i ? panel.color : 'rgba(255,255,255,0.28)', transition: 'all 0.3s ease' }} />
                                ))}
                            </div>
                        </div>
                        <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 8px', lineHeight: 1.2 }}>{panel.title}</h3>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 1.65, margin: '0 0 14px' }}>{panel.desc}</p>
                        <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${panel.border}`, marginBottom: 14, background: '#fff' }}>
                            <Illustration />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
                            {panel.facts.map((fact, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, background: panel.color + '20', border: `1px solid ${panel.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 6L5 9L10 3" stroke={panel.color} strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
                                    </div>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{fact}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 7, padding: '11px 13px' }}>
                            <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: 0 }}>
                                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Pro tip:</strong> Use IAM roles with temporary credentials instead of long-term access keys. AWS recommends roles for all production workloads.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}

function FG({ label, required, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#414d5c', marginBottom: 4 }}>
                {label}{required && <span style={{ color: '#d13212', marginLeft: 3 }}>*</span>}
            </label>
            {children}
        </div>
    )
}
function FI({ value, onChange, placeholder, type = 'text' }) {
    return (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder}
            style={{ background: '#fff', border: '1px solid #aab7b8', borderRadius: 4, padding: '8px 11px', color: '#16191f', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onFocus={e => { e.target.style.borderColor = '#0972d3'; e.target.style.boxShadow = '0 0 0 2px rgba(9,114,211,0.18)' }}
            onBlur={e => { e.target.style.borderColor = '#aab7b8'; e.target.style.boxShadow = 'none' }}
        />
    )
}
function FS({ value, onChange, options, isObjOptions }) {
    return (
        <select value={value} onChange={onChange}
            style={{ background: '#fff', border: '1px solid #aab7b8', borderRadius: 4, padding: '8px 11px', color: '#16191f', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onFocus={e => { e.target.style.borderColor = '#0972d3'; e.target.style.boxShadow = '0 0 0 2px rgba(9,114,211,0.18)' }}
            onBlur={e => { e.target.style.borderColor = '#aab7b8'; e.target.style.boxShadow = 'none' }}>
            {isObjOptions
                ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                : options.map(r => <option key={r} value={r}>{r}</option>)
            }
        </select>
    )
}

const s = {
    page: { position: 'fixed', inset: 0, background: '#f8f4f0', overflow: 'hidden' },
    blobTL: { position: 'absolute', top: -100, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,153,0,0.12) 0%, transparent 70%)', pointerEvents: 'none' },
    blobBR: { position: 'absolute', bottom: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,153,0,0.10) 0%, transparent 70%)', pointerEvents: 'none' },
    backBtn: { position: 'absolute', top: 18, left: 18, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, color: '#414d5c', fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid rgba(35,47,62,0.25)', cursor: 'pointer', padding: '7px 13px', borderRadius: 4, transition: 'background 0.15s', boxShadow: '0 1px 4px rgba(0,28,36,0.08)' },
    formWrap: { position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, width: 400, display: 'flex', flexDirection: 'column', alignItems: 'center' },
    card: { background: '#fff', border: '1px solid rgba(35,47,62,0.18)', borderRadius: 8, padding: '22px 26px', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 24px rgba(0,28,36,0.1)' },
    title: { fontSize: 18, fontWeight: 700, color: '#16191f', margin: '0 0 7px' },
    divider: { height: 1, background: 'rgba(35,47,62,0.1)', marginBottom: 14 },
    tabs: { display: 'flex', border: '1px solid rgba(35,47,62,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 13 },
    tab: { flex: 1, padding: '8px 4px', border: 'none', borderRight: '1px solid rgba(35,47,62,0.12)', background: 'transparent', color: '#414d5c', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'background 0.12s' },
    tabActive: { background: '#232F3E', color: '#FF9900' },
    tabArea: { minHeight: 285 },
    tabContent: { display: 'flex', flexDirection: 'column', gap: 10 },
    loadRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' },
    spin: { width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,153,0,0.2)', borderTopColor: '#FF9900', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
    spinBtn: { width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(35,47,62,0.2)', borderTopColor: '#232F3E', animation: 'spin 0.7s linear infinite' },
    empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0' },
    accList: { display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 175, overflowY: 'auto' },
    accRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa', border: '1px solid rgba(35,47,62,0.12)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.12s' },
    accRowSel: { background: '#fdf6e3', border: '1px solid #FF9900', boxShadow: '0 0 0 2px rgba(255,153,0,0.12)' },
    accRowHov: { background: '#f8f4f0', border: '1px solid rgba(255,153,0,0.35)' },
    avatar: { width: 30, height: 30, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    accId: { color: '#16191f', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' },
    accMeta: { color: '#687078', fontSize: 10 },
    check: { width: 17, height: 17, borderRadius: '50%', background: '#067340', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px 18px', background: '#FF9900', color: '#232F3E', border: '2px solid #FF9900', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(255,153,0,0.2)', transition: 'background 0.12s' },
    secondBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '10px 18px', background: '#fff', color: '#16191f', border: '1px solid rgba(35,47,62,0.3)', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.12s' },
    orRow: { display: 'flex', alignItems: 'center', gap: 10 },
    orLine: { flex: 1, height: 1, background: 'rgba(35,47,62,0.1)' },
    orTxt: { color: '#687078', fontSize: 11, fontWeight: 600, fontFamily: 'monospace' },
    secLbl: { fontSize: 13, fontWeight: 600, color: '#414d5c', borderBottom: '1px solid rgba(35,47,62,0.1)', paddingBottom: 5 },
    infoBox: { display: 'flex', alignItems: 'flex-start', gap: 9, background: '#f0f7ff', border: '1px solid #b3d1f7', borderRadius: 4, padding: '8px 11px' },
    errBox: { background: '#fdf3f1', border: '1px solid #f5bcb3', borderRadius: 4, padding: '7px 11px', color: '#d13212', fontSize: 12 },
    okBox: { background: '#f2f8f4', border: '1px solid #a8d5b5', borderRadius: 4, padding: '7px 11px', color: '#067340', fontSize: 12 },
    banner: { position: 'fixed', top: '50%', right: 36, transform: 'translateY(-50%)', width: 340, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', zIndex: 10, background: '#0f1b2d', borderRadius: 12, padding: '22px 20px', boxShadow: '0 12px 48px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', animation: 'bannerIn 0.38s cubic-bezier(0.4, 0, 0.2, 1) both' },
}
