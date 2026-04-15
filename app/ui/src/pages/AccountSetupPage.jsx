import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Check, Plus, User, Key, Cloud } from 'lucide-react'
import { accountsAPI } from '../api/index'
import { useAuth } from '../context/AuthContext'

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'ap-southeast-1', 'ap-southeast-2',
    'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
    'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1',
]

const PANELS = [
    {
        service: 'IAM', color: '#8B5CF6',
        title: 'Identity & Access Management',
        desc: 'Securely control who can access what in your AWS environment.',
        facts: ['Role-based access control (RBAC)', 'Multi-factor authentication (MFA)', 'Free with every AWS account'],
    },
    {
        service: 'EC2', color: '#FF9900',
        title: 'Elastic Compute Cloud',
        desc: 'Virtual servers that launch in seconds and scale in minutes.',
        facts: ['400+ instance types & families', 'Auto Scaling for demand spikes', 'Spot instances save up to 90%'],
    },
    {
        service: 'S3', color: '#22C55E',
        title: 'Simple Storage Service',
        desc: 'Object storage built for any amount of data, from anywhere.',
        facts: ['99.999999999% (11 9s) durability', 'Object versioning & lifecycle rules', 'AES-256 server-side encryption'],
    },
    {
        service: 'VPC', color: '#0972d3',
        title: 'Virtual Private Cloud',
        desc: 'Your own logically isolated network inside AWS.',
        facts: ['Network-level isolation & segmentation', 'Security groups & Network ACLs', 'AWS Direct Connect & VPN support'],
    },
    {
        service: 'Shield', color: '#d13212',
        title: 'AWS Shield & GuardDuty',
        desc: 'Always-on DDoS protection and ML-powered threat detection.',
        facts: ['Automatic DDoS mitigation', 'ML-powered anomaly detection', 'Real-time CloudTrail log analysis'],
    },
]

function clearAllScanCaches() {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('scan_v')) localStorage.removeItem(k) })
}
function makeRootEntry(a) { return { ...a, _type: 'root', _key: a.aws_account_id } }
function makeIamEntry(u)  { return { ...u, _type: 'iam',  _key: `iam-${u.id}` } }

export default function AccountSetupPage() {
    const navigate = useNavigate()
    const { connect, account } = useAuth()

    const [tab,          setTab]          = useState('existing')
    const [entries,      setEntries]      = useState([])
    const [rootAccounts, setRootAccounts] = useState([])
    const [loading,      setLoading]      = useState(false)
    const [selectedKey,  setSelectedKey]  = useState(null)
    const [hoveredKey,   setHoveredKey]   = useState(null)
    const [error,        setError]        = useState('')
    const [connecting,   setConnecting]   = useState(false)
    const [bannerIndex,  setBannerIndex]  = useState(0)
    const [appVersion,   setAppVersion]   = useState(null)

    const [rootForm,     setRootForm]     = useState({ aws_account_id: '', profile_name: '', region: 'us-east-1', access_key: '', secret_key: '' })
    const [rootError,    setRootError]    = useState('')
    const [rootSuccess,  setRootSuccess]  = useState('')
    const [rootCreating, setRootCreating] = useState(false)

    const [iamForm,     setIamForm]     = useState({ account_id: '', username: '', access_key: '', secret_key: '', region: 'us-east-1' })
    const [iamError,    setIamError]    = useState('')
    const [iamSuccess,  setIamSuccess]  = useState('')
    const [iamCreating, setIamCreating] = useState(false)

    const glowOuterRef = useRef(null)
    const glowInnerRef = useRef(null)

    useEffect(() => {
        let rafId = null
        const handle = e => {
            if (rafId) return
            rafId = requestAnimationFrame(() => {
                if (glowOuterRef.current)
                    glowOuterRef.current.style.transform = `translate(${e.clientX - 250}px,${e.clientY - 250}px)`
                if (glowInnerRef.current)
                    glowInnerRef.current.style.transform = `translate(${e.clientX - 70}px,${e.clientY - 70}px)`
                rafId = null
            })
        }
        window.addEventListener('mousemove', handle, { passive: true })
        return () => {
            window.removeEventListener('mousemove', handle)
            if (rafId) cancelAnimationFrame(rafId)
        }
    }, [])

    useEffect(() => {
        const iv = setInterval(() => setBannerIndex(i => (i + 1) % PANELS.length), 4200)
        return () => clearInterval(iv)
    }, [])

    useEffect(() => {
        fetch('http://127.0.0.1:8000/api/version').then(r => r.json()).then(d => setAppVersion(d.version)).catch(() => {})
    }, [])

    useEffect(() => {
        if (tab === 'existing' || tab === 'iam') fetchAll()
    }, [tab])

    async function fetchAll() {
        setLoading(true); setError('')
        try {
            const rootRes = await accountsAPI.list()
            const roots   = (rootRes.data?.accounts || rootRes.data || []).map(makeRootEntry)
            let iamEntries = []
            try {
                const iamRes = await accountsAPI.listIamUsers()
                iamEntries   = (iamRes.data?.iam_users || iamRes.data || []).map(makeIamEntry)
            } catch {}
            const all = [...roots, ...iamEntries]
            setEntries(all)
            setRootAccounts(roots)
            if (roots.length > 0 && !iamForm.account_id) setIamForm(f => ({ ...f, account_id: roots[0].id }))
        } catch { setError('Failed to load accounts. Is the backend running?') }
        finally { setLoading(false) }
    }

    function handleSelect(key) { setSelectedKey(p => p === key ? null : key); setError('') }

    async function handleConnect() {
        if (!selectedKey) { setError('Please select an account.'); return }
        const entry = entries.find(e => e._key === selectedKey)
        if (!entry) return
        setConnecting(true)
        try {
            clearAllScanCaches()
            connect({ ...entry, account_type: entry._type })
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
                profile_name:   rootForm.profile_name.trim() || 'default',
                region:         rootForm.region,
                ...(rootForm.access_key && { access_key: rootForm.access_key.trim() }),
                ...(rootForm.secret_key && { secret_key: rootForm.secret_key.trim() }),
            })
            setRootSuccess('Account added!')
            setRootForm({ aws_account_id: '', profile_name: '', region: 'us-east-1', access_key: '', secret_key: '' })
            setTimeout(() => { setRootSuccess(''); setTab('existing') }, 1400)
        } catch (err) { setRootError(err.response?.data?.detail || 'Failed to add account.') }
        finally { setRootCreating(false) }
    }

    async function handleCreateIam(e) {
        e.preventDefault(); setIamError(''); setIamSuccess('')
        if (!iamForm.account_id)           { setIamError('Select a parent root account.'); return }
        if (!iamForm.username.trim())       { setIamError('Username is required.'); return }
        if (!iamForm.access_key.trim() || !iamForm.secret_key.trim()) { setIamError('Access Key and Secret Key are required.'); return }
        setIamCreating(true)
        try {
            const res = await accountsAPI.createIamUser({
                account_id: parseInt(iamForm.account_id),
                username:   iamForm.username.trim(),
                access_key: iamForm.access_key.trim(),
                secret_key: iamForm.secret_key.trim(),
                region:     iamForm.region,
            })
            setIamSuccess('IAM user added! Signing in...')
            const d = res.data?.iam_user
            if (d) {
                setTimeout(() => { clearAllScanCaches(); connect({ ...d, account_type: 'iam' }); navigate('/panel') }, 1200)
            } else {
                setTimeout(() => { setIamSuccess(''); setTab('existing') }, 1500)
            }
        } catch (err) { setIamError(err.response?.data?.detail || 'Failed to add IAM user.') }
        finally { setIamCreating(false) }
    }

    function getInitials(e) {
        if (e._type === 'iam') return (e.username || '??').slice(0, 2).toUpperCase()
        return (e.profile_name || e.aws_account_id || '?').slice(0, 2).toUpperCase()
    }
    function getTitle(e) { return e._type === 'iam' ? (e.username || 'IAM User') : e.aws_account_id }
    function getMeta(e)  { return e._type === 'iam' ? `IAM | ${e.parent_aws_account_id || ''} | ${e.region}` : `${e.profile_name || 'default'} | ${e.region}` }

    const panel = PANELS[bannerIndex]
    const TABS = [
        { id: 'new',      label: '+ Add Account' },
        { id: 'existing', label: 'Sign In'        },
        { id: 'iam',      label: 'IAM User'       },
    ]

    return (
        <div style={s.page}>
            <style>{`
                @font-face { font-family:'Amazon Ember'; src:local('Amazon Ember'),local('AmazonEmber'); }
                *,*::before,*::after { box-sizing:border-box; font-family:'Amazon Ember','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif; }
                @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                @keyframes spin    { to{transform:rotate(360deg)} }
                @keyframes blobA   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.08) translate(20px,-15px)} }
                @keyframes blobB   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.05) translate(-15px,20px)} }
                @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                @keyframes panelIn { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
                ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(35,47,62,.15);border-radius:4px}
                input:focus,select:focus{outline:none;border-color:#FF9900!important;box-shadow:0 0 0 2px rgba(255,153,0,0.18)!important}
            `}</style>

            {/* Version badge — fixed bottom right */}
            {appVersion && (
                <span style={{
                    position: 'fixed', bottom: 14, right: 14, zIndex: 9999,
                    fontSize: 10, fontFamily: 'monospace', fontWeight: 800,
                    color: '#FF9900', background: 'rgba(255,153,0,0.1)',
                    border: '1px solid rgba(255,153,0,0.3)',
                    borderRadius: 4, padding: '3px 9px', letterSpacing: 0.3,
                    pointerEvents: 'none',
                }}>
                    CloudShield v{appVersion}
                </span>
            )}

            <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                backgroundImage:'radial-gradient(circle, rgba(180,110,0,0.16) 1.5px, transparent 1.5px)',
                backgroundSize:'22px 22px' }} />
            <div style={{ position:'absolute', bottom:-180, left:-140, width:680, height:680,
                borderRadius:'50%', pointerEvents:'none', willChange:'transform', animation:'blobA 9s ease-in-out infinite',
                background:'radial-gradient(circle,rgba(255,153,0,0.07) 0%,transparent 70%)' }} />
            <div style={{ position:'absolute', top:-140, right:-120, width:560, height:560,
                borderRadius:'50%', pointerEvents:'none', willChange:'transform', animation:'blobB 12s ease-in-out infinite',
                background:'radial-gradient(circle,rgba(255,180,40,0.05) 0%,transparent 70%)' }} />

            <div ref={glowOuterRef} style={{
                position:'absolute', left:0, top:0, width:500, height:500, borderRadius:'50%',
                background:'radial-gradient(circle,rgba(255,180,0,0.18) 0%,rgba(255,160,0,0.08) 30%,rgba(255,140,0,0.02) 60%,transparent 80%)',
                pointerEvents:'none', zIndex:0, willChange:'transform',
            }} />
            <div ref={glowInnerRef} style={{
                position:'absolute', left:0, top:0, width:140, height:140, borderRadius:'50%',
                background:'radial-gradient(circle,rgba(255,210,50,0.35) 0%,rgba(255,185,0,0.16) 40%,transparent 70%)',
                pointerEvents:'none', zIndex:0, willChange:'transform',
            }} />

            <button onClick={() => navigate(account ? '/panel' : '/')} style={s.backBtn}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor='rgba(255,153,0,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor='rgba(35,47,62,0.2)' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M13 8H3M7 4L3 8L7 12" stroke="#414d5c" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {account ? 'Back to Dashboard' : 'Back to Home'}
            </button>

            <div style={s.layout}>

                {/* LEFT - Form card */}
                <div style={{ ...s.card, animation:'fadeUp 0.4s ease both' }}>
                    {/* Logo */}
                    <div style={{ textAlign:'center', marginBottom:18 }}>
                        <svg viewBox="0 0 130 52" width="120" height="48" style={{ display:'inline-block' }}>
                            <text x="65" y="36" textAnchor="middle" fill="#232F3E" fontSize="38" fontWeight="bold" fontFamily="Arial,sans-serif">aws</text>
                            <path d="M20 43 Q65 57 110 43" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round"/>
                            <path d="M105 39 L110 43 L105 47" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div style={{ height:1, background:'rgba(255,153,0,0.2)', margin:'10px 0 13px' }} />
                        <div style={{ fontSize:20, fontWeight:900, color:'#16191f', letterSpacing:-.3 }}>
                            {tab === 'existing' ? 'Sign in to Security Panel' : tab === 'new' ? 'Add AWS Account' : 'Add IAM User'}
                        </div>
                        <div style={{ fontSize:12, color:'#5a6a7a', marginTop:4, fontWeight:500 }}>Cloud infrastructure security monitoring</div>
                    </div>

                    {/* Tabs */}
                    <div style={{ display:'flex', gap:5, marginBottom:16, background:'rgba(35,47,62,0.05)', borderRadius:8, padding:4 }}>
                        {TABS.map(t => (
                            <button key={t.id}
                                style={{ flex:1, padding:'7px 4px', border:'none', borderRadius:6, cursor:'pointer',
                                         fontSize:11, fontWeight:700, transition:'all 0.15s',
                                         background: tab===t.id ? '#FF9900' : 'transparent',
                                         color:      tab===t.id ? '#232F3E' : '#687078',
                                         boxShadow:  tab===t.id ? '0 2px 8px rgba(255,153,0,0.3)' : 'none' }}
                                onClick={() => { setTab(t.id); setError(''); setRootError(''); setIamError('') }}
                                onMouseEnter={e => { if(tab!==t.id) e.currentTarget.style.color='#232F3E' }}
                                onMouseLeave={e => { if(tab!==t.id) e.currentTarget.style.color='#687078' }}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* SIGN IN TAB */}
                    {tab === 'existing' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                            {loading && (
                                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', color:'#687078', fontSize:13 }}>
                                    <div style={s.spin} /> Loading accounts...
                                </div>
                            )}
                            {!loading && entries.length === 0 && (
                                <div style={{ textAlign:'center', padding:'16px 0', color:'#687078' }}>
                                    <Cloud size={28} color="#aab7b8" style={{ marginBottom:8 }} />
                                    <div style={{ fontSize:13, lineHeight:1.6 }}>No accounts yet.<br/>Use "Add Account" to get started.</div>
                                </div>
                            )}
                            {!loading && entries.length > 0 && (
                                <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:190, overflowY:'auto' }}>
                                    {entries.map(entry => {
                                        const isSel = selectedKey === entry._key
                                        const isIam = entry._type === 'iam'
                                        return (
                                            <button key={entry._key} onClick={() => handleSelect(entry._key)}
                                                onMouseEnter={() => setHoveredKey(entry._key)}
                                                onMouseLeave={() => setHoveredKey(null)}
                                                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:7,
                                                         cursor:'pointer', textAlign:'left', width:'100%', transition:'all 0.15s',
                                                         border:`1.5px solid ${isSel ? '#FF9900' : 'rgba(35,47,62,0.12)'}`,
                                                         background: isSel ? 'rgba(255,153,0,0.07)' : 'rgba(255,255,255,0.7)',
                                                         boxShadow: isSel ? '0 0 0 3px rgba(255,153,0,0.12)' : 'none' }}>
                                                <div style={{ width:32, height:32, borderRadius:6, flexShrink:0, display:'flex',
                                                              alignItems:'center', justifyContent:'center',
                                                              background: isSel ? '#FF9900' : (isIam ? 'rgba(9,114,211,0.10)' : 'rgba(35,47,62,0.08)'),
                                                              border:`1.5px solid ${isSel ? '#FF9900' : (isIam ? 'rgba(9,114,211,0.2)' : 'rgba(35,47,62,0.12)')}` }}>
                                                    <span style={{ fontSize:11, fontWeight:800, fontFamily:'monospace',
                                                                   color: isSel ? '#fff' : (isIam ? '#0972d3' : '#414d5c') }}>
                                                        {getInitials(entry)}
                                                    </span>
                                                </div>
                                                <div style={{ flex:1, minWidth:0 }}>
                                                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                                        <span style={{ fontSize:12, fontWeight:700, color:'#16191f', fontFamily:'monospace',
                                                                       overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                            {getTitle(entry)}
                                                        </span>
                                                        {isIam && (
                                                            <span style={{ fontSize:9, fontWeight:800, color:'#0972d3',
                                                                           background:'rgba(9,114,211,0.08)', border:'1px solid rgba(9,114,211,0.2)',
                                                                           borderRadius:3, padding:'1px 5px', letterSpacing:.3, flexShrink:0 }}>IAM</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize:10, color:'#687078', marginTop:1 }}>{getMeta(entry)}</div>
                                                </div>
                                                {isSel && (
                                                    <div style={{ width:18, height:18, borderRadius:'50%', background:'#067340',
                                                                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                        <Check size={10} color="#fff" />
                                                    </div>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {error && <div style={s.errBox}>{error}</div>}

                            {entries.length > 0 && (
                                <button style={{ ...s.primaryBtn, opacity: selectedKey ? 1 : 0.5 }}
                                    disabled={connecting || !selectedKey} onClick={handleConnect}
                                    onMouseEnter={e => { if(selectedKey) e.currentTarget.style.background='#ec8a00' }}
                                    onMouseLeave={e => { e.currentTarget.style.background='#FF9900' }}>
                                    {connecting ? <div style={s.spinBtn}/> : <ChevronRight size={15}/>}
                                    {connecting ? 'Connecting...' : 'Sign in'}
                                </button>
                            )}

                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ flex:1, height:1, background:'rgba(35,47,62,0.1)' }}/>
                                <span style={{ color:'#aab7b8', fontSize:11, fontWeight:600, fontFamily:'monospace' }}>OR</span>
                                <div style={{ flex:1, height:1, background:'rgba(35,47,62,0.1)' }}/>
                            </div>

                            <button style={s.secondBtn} onClick={() => setTab('new')}
                                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,153,0,0.4)'; e.currentTarget.style.color='#FF9900' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(35,47,62,0.18)'; e.currentTarget.style.color='#414d5c' }}>
                                + Add a new account
                            </button>
                        </div>
                    )}

                    {/* ADD ACCOUNT TAB */}
                    {tab === 'new' && (
                        <form style={{ display:'flex', flexDirection:'column', gap:10 }} onSubmit={handleCreateRoot}>
                            <FG label="AWS account ID" required>
                                <FI value={rootForm.aws_account_id} placeholder="123456789012"
                                    onChange={e => setRootForm(f => ({ ...f, aws_account_id: e.target.value }))} />
                            </FG>
                            <FG label="Profile name">
                                <FI value={rootForm.profile_name} placeholder="default"
                                    onChange={e => setRootForm(f => ({ ...f, profile_name: e.target.value }))} />
                            </FG>
                            <FG label="Default region" required>
                                <FS value={rootForm.region} options={AWS_REGIONS}
                                    onChange={e => setRootForm(f => ({ ...f, region: e.target.value }))} />
                            </FG>
                            <div style={{ fontSize:12, fontWeight:700, color:'#414d5c', borderBottom:'1px solid rgba(35,47,62,0.1)', paddingBottom:5 }}>
                                Credentials <span style={{ color:'#687078', fontWeight:400, fontSize:11 }}>- optional if using IAM role</span>
                            </div>
                            <FG label="Access key ID">
                                <FI value={rootForm.access_key} placeholder="AKIAIOSFODNN7EXAMPLE"
                                    onChange={e => setRootForm(f => ({ ...f, access_key: e.target.value }))} />
                            </FG>
                            <FG label="Secret access key">
                                <FI type="password" value={rootForm.secret_key} placeholder="Your secret key"
                                    onChange={e => setRootForm(f => ({ ...f, secret_key: e.target.value }))} />
                            </FG>
                            {rootError   && <div style={s.errBox}>{rootError}</div>}
                            {rootSuccess && <div style={s.okBox}>{rootSuccess}</div>}
                            <button type="submit" style={s.primaryBtn} disabled={rootCreating}
                                onMouseEnter={e => { if(!rootCreating) e.currentTarget.style.background='#ec8a00' }}
                                onMouseLeave={e => { e.currentTarget.style.background='#FF9900' }}>
                                {rootCreating ? <div style={s.spinBtn}/> : <ChevronRight size={15}/>}
                            {rootCreating ? 'Adding account...' : 'Add account'}
                            </button>
                        </form>
                    )}

                    {/* IAM USER TAB */}
                    {tab === 'iam' && (
                        <form style={{ display:'flex', flexDirection:'column', gap:10 }} onSubmit={handleCreateIam}>
                            <div style={{ display:'flex', alignItems:'flex-start', gap:9, background:'rgba(9,114,211,0.05)',
                                          border:'1px solid rgba(9,114,211,0.2)', borderRadius:7, padding:'9px 12px' }}>
                                <Key size={14} color="#0972d3" style={{ flexShrink:0, marginTop:1 }} />
                                <p style={{ fontSize:12, color:'#0972d3', lineHeight:1.5, margin:0 }}>
                                    Select a root account then enter IAM credentials to connect with specific permissions.
                                </p>
                            </div>
                            <FG label="Root Account">
                                {loading
                                    ? <div style={{ display:'flex', alignItems:'center', gap:8, color:'#687078', fontSize:13 }}><div style={s.spin}/>Loading...</div>
                                    : <FS value={iamForm.account_id} isObjOptions
                                        options={rootAccounts.map(a => ({ value: a.id, label: `${a.aws_account_id} (${a.profile_name || 'default'})` }))}
                                        onChange={e => setIamForm(f => ({ ...f, account_id: e.target.value }))} />
                                }
                            </FG>
                            <FG label="IAM Username" required>
                                <FI value={iamForm.username} placeholder="john.doe"
                                    onChange={e => setIamForm(f => ({ ...f, username: e.target.value }))} />
                            </FG>
                            <FG label="Region" required>
                                <FS value={iamForm.region} options={AWS_REGIONS}
                                    onChange={e => setIamForm(f => ({ ...f, region: e.target.value }))} />
                            </FG>
                            <div style={{ fontSize:12, fontWeight:700, color:'#414d5c', borderBottom:'1px solid rgba(35,47,62,0.1)', paddingBottom:5 }}>Credentials</div>
                            <FG label="Access key ID" required>
                                <FI value={iamForm.access_key} placeholder="AKIAIOSFODNN7EXAMPLE"
                                    onChange={e => setIamForm(f => ({ ...f, access_key: e.target.value }))} />
                            </FG>
                            <FG label="Secret access key" required>
                                <FI type="password" value={iamForm.secret_key} placeholder="Your secret key"
                                    onChange={e => setIamForm(f => ({ ...f, secret_key: e.target.value }))} />
                            </FG>
                            {iamError   && <div style={s.errBox}>{iamError}</div>}
                            {iamSuccess && <div style={s.okBox}>{iamSuccess}</div>}
                            <button type="submit" style={s.primaryBtn} disabled={iamCreating}
                                onMouseEnter={e => { if(!iamCreating) e.currentTarget.style.background='#ec8a00' }}
                                onMouseLeave={e => { e.currentTarget.style.background='#FF9900' }}>
                                {iamCreating ? <div style={s.spinBtn}/> : <Key size={13}/>}
                                {iamCreating ? 'Adding IAM user...' : 'Add IAM user'}
                            </button>
                        </form>
                    )}

                    {/* Footer */}
                    <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:16 }}>
                        {['FastAPI', 'SQLite', 'OAS 3.1'].map(b => (
                            <span key={b} style={{ fontSize:10, fontFamily:'monospace', color:'#687078',
                                background:'rgba(35,47,62,0.05)', border:'1px solid rgba(35,47,62,0.11)',
                                borderRadius:3, padding:'2px 7px' }}>{b}</span>
                        ))}
                    </div>
                </div>

                {/* RIGHT - Info panel */}
                <div style={{ ...s.infoCard, animation:'fadeUp 0.4s ease 0.15s both' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                        <span style={{ fontSize:10, fontWeight:800, color: panel.color,
                                       background:`${panel.color}12`, border:`1px solid ${panel.color}30`,
                                       borderRadius:5, padding:'3px 10px', fontFamily:'monospace', letterSpacing:1 }}>
                            AWS {panel.service}
                        </span>
                        <div style={{ display:'flex', gap:5 }}>
                            {PANELS.map((_, i) => (
                                <button key={i} onClick={() => setBannerIndex(i)}
                                    style={{ width: bannerIndex===i ? 20 : 6, height:6, borderRadius:10,
                                             border:'none', cursor:'pointer', padding:0, transition:'all 0.3s',
                                             background: bannerIndex===i ? panel.color : 'rgba(35,47,62,0.15)' }} />
                            ))}
                        </div>
                    </div>

                    <div key={bannerIndex} style={{ animation:'panelIn 0.35s ease both' }}>
                        <h3 style={{ fontSize:17, fontWeight:800, color:'#16191f', margin:'0 0 8px', lineHeight:1.25 }}>{panel.title}</h3>
                        <p style={{ fontSize:12, color:'#687078', lineHeight:1.65, margin:'0 0 16px' }}>{panel.desc}</p>
                        <div style={{ height:3, borderRadius:2, background:`linear-gradient(90deg,${panel.color},${panel.color}44)`, marginBottom:16 }} />
                        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:18 }}>
                            {panel.facts.map((fact, i) => (
                                <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                                    <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0,
                                                  background:`${panel.color}15`, border:`1.5px solid ${panel.color}30`,
                                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        <svg width="8" height="8" viewBox="0 0 12 12">
                                            <path d="M2 6L5 9L10 3" stroke={panel.color} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
                                        </svg>
                                    </div>
                                    <span style={{ fontSize:12, color:'#414d5c', fontWeight:500 }}>{fact}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'11px 13px', borderRadius:8,
                                      background:'rgba(255,153,0,0.05)', border:'1px solid rgba(255,153,0,0.18)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <p style={{ fontSize:11, color:'#5a6a7a', lineHeight:1.6, margin:0 }}>
                                <strong style={{ color:'#414d5c' }}>Pro tip:</strong> Use IAM roles with temporary credentials instead of long-term access keys for all production workloads.
                            </p>
                        </div>
                    </div>

                    <div style={{ height:1, background:'rgba(180,100,0,0.10)', margin:'18px 0 14px' }} />

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                        {[
                            { val:'52+', lbl:'Checks', color:'#FF9900' },
                            { val:'9',   lbl:'Regions', color:'#0972d3' },
                            { val:'32',  lbl:'AZs',    color:'#067340' },
                        ].map(st => (
                            <div key={st.lbl} style={{ textAlign:'center', padding:'8px 4px', borderRadius:7,
                                                        background:`${st.color}08`, border:`1px solid ${st.color}20` }}>
                                <div style={{ fontSize:16, fontWeight:900, color:st.color, fontFamily:'monospace' }}>{st.val}</div>
                                <div style={{ fontSize:9, color:'#8a9aaa', textTransform:'uppercase', letterSpacing:.7, marginTop:1 }}>{st.lbl}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop:14 }}>
                        <div style={{ fontSize:9, fontWeight:800, color:'#687078', textTransform:'uppercase', letterSpacing:.9, marginBottom:9 }}>
                            What We Scan On Your Account
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {[
                                { label:'IAM',        checks:8,  color:'#8B5CF6' },
                                { label:'S3',         checks:12, color:'#22C55E' },
                                { label:'EC2',        checks:9,  color:'#FF9900' },
                                { label:'VPC',        checks:7,  color:'#0972d3' },
                                { label:'CloudTrail', checks:6,  color:'#d13212' },
                                { label:'KMS',        checks:10, color:'#687078' },
                            ].map(sc => (
                                <div key={sc.label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                                    <span style={{ fontSize:10, fontWeight:700, color:'#414d5c', width:70, flexShrink:0 }}>{sc.label}</span>
                                    <div style={{ flex:1, height:4, borderRadius:3, background:'rgba(35,47,62,0.07)', overflow:'hidden' }}>
                                        <div style={{ height:'100%', borderRadius:3,
                                                      width:`${Math.round((sc.checks/12)*100)}%`,
                                                      background:`linear-gradient(90deg,${sc.color},${sc.color}77)` }} />
                                    </div>
                                    <span style={{ fontSize:10, fontWeight:700, color:sc.color,
                                                   fontFamily:'monospace', flexShrink:0, minWidth:52, textAlign:'right' }}>
                                        {sc.checks} checks
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Access key guide — fills empty space below bars when on Add/IAM tabs */}
                    {(tab === 'new' || tab === 'iam') && (
                        <div style={{ marginTop:14, padding:'12px 14px', borderRadius:8,
                            background: tab === 'iam' ? 'rgba(9,114,211,0.04)' : 'rgba(35,47,62,0.03)',
                            border: `1px solid ${tab === 'iam' ? 'rgba(9,114,211,0.15)' : 'rgba(35,47,62,0.10)'}` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke={tab === 'iam' ? '#0972d3' : '#687078'}
                                    strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <span style={{ fontSize:10, fontWeight:800,
                                    color: tab === 'iam' ? '#0972d3' : '#414d5c',
                                    textTransform:'uppercase', letterSpacing:.6 }}>
                                    {tab === 'iam' ? 'How to get IAM User Access Key' : 'How to get your Access Key'}
                                </span>
                            </div>
                            <ol style={{ margin:0, paddingLeft:16, display:'flex', flexDirection:'column', gap:4 }}>
                                {(tab === 'iam' ? [
                                    'Sign in to AWS Console',
                                    'Go to IAM → Users → select the user',
                                    'Click the Security credentials tab',
                                    'Under Access keys → Create access key',
                                    'Copy Access key ID and Secret access key',
                                ] : [
                                    'Sign in to AWS Console',
                                    'Click your account name (top-right)',
                                    'Go to Security credentials',
                                    'Scroll to Access keys → Create access key',
                                    'Copy Access key ID and Secret access key',
                                ]).map((step, i) => (
                                    <li key={i} style={{ fontSize:11, color:'#5a6a7a', lineHeight:1.55 }}>{step}</li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}

/* Sub-components */
function FG({ label, required, children }) {
    return (
        <div>
            <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#414d5c', marginBottom:4 }}>
                {label}{required && <span style={{ color:'#d13212', marginLeft:3 }}>*</span>}
            </label>
            {children}
        </div>
    )
}

function FI({ value, onChange, placeholder, type = 'text' }) {
    const [show, setShow] = useState(false)
    const base = {
        background:'rgba(255,255,255,0.85)', border:'1.5px solid rgba(35,47,62,0.18)',
        borderRadius:6, color:'#16191f', fontSize:13, width:'100%',
        transition:'border-color 0.15s, box-shadow 0.15s',
    }
    if (type !== 'password') return (
        <input type="text" value={value} onChange={onChange} placeholder={placeholder}
            style={{ ...base, padding:'8px 11px' }} />
    )
    return (
        <div style={{ position:'relative' }}>
            <input
                type={show ? 'text' : 'password'}
                value={value} onChange={onChange} placeholder={placeholder}
                style={{ ...base, padding:'8px 40px 8px 11px' }}
            />
            <button
                type="button" tabIndex={-1}
                onClick={() => setShow(s => !s)}
                title={show ? 'Hide' : 'Show'}
                style={{
                    position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer', padding:4,
                    color:'#687078', display:'flex', alignItems:'center', borderRadius:4,
                    transition:'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color='#FF9900'}
                onMouseLeave={e => e.currentTarget.style.color='#687078'}
            >
                {show ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                )}
            </button>
        </div>
    )
}

function FS({ value, onChange, options, isObjOptions }) {
    return (
        <select value={value} onChange={onChange}
            style={{ background:'rgba(255,255,255,0.85)', border:'1.5px solid rgba(35,47,62,0.18)',
                     borderRadius:6, padding:'8px 11px', color:'#16191f', fontSize:13, width:'100%', cursor:'pointer',
                     transition:'border-color 0.15s' }}>
            {isObjOptions
                ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                : options.map(r => <option key={r} value={r}>{r}</option>)
            }
        </select>
    )
}

const s = {
    page: {
        position:'fixed', inset:0, overflow:'hidden',
        background:'linear-gradient(160deg,#fafaf8 0%,#f8f8f6 50%,#f6f6f4 100%)',
        display:'flex', alignItems:'center', justifyContent:'center',
    },
    layout: {
        display:'grid', gridTemplateColumns:'420px 360px', gap:20,
        maxHeight:'calc(100vh - 50px)', position:'relative', zIndex:1,
        padding:'0 16px',
    },
    card: {
        background:'rgba(255,255,255,0.92)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)',
        border:'1.5px solid rgba(255,153,0,0.20)', borderRadius:12, padding:'24px 26px',
        boxShadow:'0 8px 40px rgba(180,100,0,0.12), 0 1px 0 rgba(255,255,255,0.9) inset',
        overflowY:'auto', maxHeight:'calc(100vh - 50px)',
    },
    infoCard: {
        background:'rgba(255,255,255,0.88)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)',
        border:'1.5px solid rgba(255,153,0,0.16)', borderRadius:12, padding:'22px 20px',
        boxShadow:'0 4px 20px rgba(180,100,0,0.09)',
        overflowY:'auto', maxHeight:'calc(100vh - 50px)',
    },
    backBtn: {
        position:'absolute', top:18, left:18, zIndex:10,
        display:'flex', alignItems:'center', gap:6, color:'#414d5c', fontSize:12, fontWeight:600,
        background:'rgba(255,255,255,0.65)', backdropFilter:'blur(8px)',
        border:'1.5px solid rgba(35,47,62,0.2)', cursor:'pointer', padding:'7px 13px',
        borderRadius:7, transition:'all 0.15s', boxShadow:'0 2px 10px rgba(0,28,36,0.08)',
    },
    primaryBtn: {
        display:'flex', alignItems:'center', justifyContent:'center', gap:6, width:'100%',
        padding:'11px 18px', background:'#FF9900', color:'#232F3E', border:'2px solid #FF9900',
        borderRadius:7, fontSize:13, fontWeight:800, cursor:'pointer',
        boxShadow:'0 3px 14px rgba(255,153,0,0.38)', transition:'background 0.15s',
    },
    secondBtn: {
        display:'flex', alignItems:'center', justifyContent:'center', width:'100%',
        padding:'10px 18px', background:'rgba(255,255,255,0.6)', color:'#414d5c',
        border:'1.5px solid rgba(35,47,62,0.18)', borderRadius:7, fontSize:13,
        fontWeight:700, cursor:'pointer', transition:'all 0.15s',
    },
    spin:    { width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,153,0,0.25)', borderTopColor:'#FF9900', animation:'spin 0.7s linear infinite', flexShrink:0 },
    spinBtn: { width:12, height:12, borderRadius:'50%', border:'2px solid rgba(35,47,62,0.2)',   borderTopColor:'#232F3E', animation:'spin 0.7s linear infinite' },
    errBox:  { background:'rgba(209,50,18,0.06)', border:'1px solid rgba(209,50,18,0.25)', borderRadius:6, padding:'8px 12px', color:'#d13212', fontSize:12, fontWeight:500 },
    okBox:   { background:'rgba(6,115,64,0.06)',  border:'1px solid rgba(6,115,64,0.25)',  borderRadius:6, padding:'8px 12px', color:'#067340', fontSize:12, fontWeight:500 },
}
