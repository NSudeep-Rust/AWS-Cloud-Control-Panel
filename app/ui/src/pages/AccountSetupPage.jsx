import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Check, Plus, User, Key, Cloud } from 'lucide-react'
import { accountsAPI } from '../api/index'
import { useAuth } from '../context/AuthContext'

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'ap-southeast-1', 'ap-southeast-2',
    'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
    'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1'
]

export default function AccountSetupPage() {
    const navigate = useNavigate()
    const { connect } = useAuth()

    const [tab, setTab] = useState('existing')
    const [accounts, setAccounts] = useState([])
    const [loading, setLoading] = useState(false)
    const [selectedId, setSelectedId] = useState(null)
    const [hoveredId, setHoveredId] = useState(null)
    const [error, setError] = useState('')
    const [connecting, setConnecting] = useState(false)

    const [rootForm, setRootForm] = useState({
        aws_account_id: '', profile_name: '', region: 'us-east-1',
        access_key: '', secret_key: '',
    })
    const [rootError, setRootError] = useState('')
    const [rootSuccess, setRootSuccess] = useState('')
    const [rootCreating, setRootCreating] = useState(false)

    const [iamForm, setIamForm] = useState({
        account_id: '', username: '', access_key: '', secret_key: '', region: 'us-east-1',
    })
    const [iamError, setIamError] = useState('')
    const [iamSuccess, setIamSuccess] = useState('')
    const [iamCreating, setIamCreating] = useState(false)

    useEffect(() => {
        if (tab === 'existing' || tab === 'iam') fetchAccounts()
    }, [tab])

    async function fetchAccounts() {
        setLoading(true); setError('')
        try {
            const res = await accountsAPI.list()
            const list = res.data?.accounts || res.data || []
            setAccounts(list)
            if (list.length > 0 && !iamForm.account_id)
                setIamForm(f => ({ ...f, account_id: list[0].id }))
        } catch {
            setError('Failed to load accounts. Is the backend running?')
            setAccounts([])
        } finally { setLoading(false) }
    }

    function handleSelect(id) {
        setSelectedId(prev => prev === id ? null : id)
        setError('')
    }

    async function handleConnect() {
        if (!selectedId) { setError('Please select an account to continue.'); return }
        const account = accounts.find(a => a.aws_account_id === selectedId)
        if (!account) return
        setConnecting(true)
        try { connect({ ...account, account_type: 'root' }); navigate('/panel') }
        catch { setError('Connection failed. Please try again.') }
        finally { setConnecting(false) }
    }

    async function handleCreateRoot(e) {
        e.preventDefault(); setRootError(''); setRootSuccess('')
        if (!rootForm.aws_account_id.trim()) { setRootError('AWS Account ID is required.'); return }
        if (!/^\d{12}$/.test(rootForm.aws_account_id.trim())) {
            setRootError('Account ID must be exactly 12 digits.'); return
        }
        setRootCreating(true)
        try {
            await accountsAPI.create({
                aws_account_id: rootForm.aws_account_id.trim(),
                profile_name: rootForm.profile_name.trim() || 'default',
                region: rootForm.region,
                ...(rootForm.access_key && { access_key: rootForm.access_key.trim() }),
                ...(rootForm.secret_key && { secret_key: rootForm.secret_key.trim() }),
            })
            setRootSuccess('Account added successfully!')
            setRootForm({ aws_account_id: '', profile_name: '', region: 'us-east-1', access_key: '', secret_key: '' })
            setTimeout(() => { setRootSuccess(''); setTab('existing') }, 1500)
        } catch (err) {
            setRootError(err.response?.data?.detail || 'Failed to add account.')
        } finally { setRootCreating(false) }
    }

    async function handleCreateIam(e) {
        e.preventDefault(); setIamError(''); setIamSuccess('')
        if (!iamForm.account_id) { setIamError('Select a parent root account.'); return }
        if (!iamForm.username.trim()) { setIamError('Username is required.'); return }
        if (!iamForm.access_key.trim() || !iamForm.secret_key.trim()) {
            setIamError('Access Key and Secret Key are required.'); return
        }
        setIamCreating(true)
        try {
            const res = await accountsAPI.createIamUser({
                account_id: parseInt(iamForm.account_id),
                username: iamForm.username.trim(),
                access_key: iamForm.access_key.trim(),
                secret_key: iamForm.secret_key.trim(),
                region: iamForm.region,
            })
            setIamSuccess('IAM user added successfully!')
            const iamData = res.data?.iam_user
            if (iamData) setTimeout(() => { connect({ ...iamData, account_type: 'iam' }); navigate('/panel') }, 1200)
        } catch (err) {
            setIamError(err.response?.data?.detail || 'Failed to add IAM user.')
        } finally { setIamCreating(false) }
    }

    function getInitials(account) {
        return (account.profile_name || account.aws_account_id || '?').slice(0, 2).toUpperCase()
    }

    const tabs = [
        { id: 'new', label: 'Add Account', icon: <Plus size={14} /> },
        { id: 'existing', label: 'Sign In', icon: <User size={14} /> },
        { id: 'iam', label: 'IAM User', icon: <Key size={14} /> },
    ]

    return (
        <div style={s.page}>
            {/* AWS-style warm bg blobs */}
            <div style={s.blobTL} />
            <div style={s.blobBR} />

            {/* Back button — visible, AWS-style */}
            <button
                onClick={() => navigate('/')}
                style={s.backBtn}
                onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#aab7b8' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(35,47,62,0.25)' }}
            >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M13 8H3M7 4L3 8L7 12" stroke="#414d5c" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Back to Home
            </button>

            <div style={s.wrapper}>
                {/* AWS Logo top */}
                <div style={s.logoTop}>
                    <svg viewBox="0 0 120 50" width="100" height="42">
                        <text x="60" y="34" textAnchor="middle" fill="#232F3E"
                            fontSize="36" fontWeight="bold" fontFamily="Arial, sans-serif">aws</text>
                        <path d="M18 40 Q60 54 102 40" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round" />
                        <path d="M97 36 L102 40 L97 44" fill="none" stroke="#FF9900" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                {/* Main card */}
                <div style={s.card}>
                    <h1 style={s.title}>
                        {tab === 'existing' ? 'Sign in to Security Panel' :
                            tab === 'new' ? 'Add AWS Account' : 'Add IAM User'}
                    </h1>
                    <div style={s.titleDivider} />

                    {/* Tabs */}
                    <div style={s.tabs}>
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
                                onClick={() => { setTab(t.id); setError(''); setRootError(''); setIamError('') }}
                                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.background = '#f8f9fa' }}
                                onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.background = 'transparent' }}
                            >
                                {t.icon}
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── EXISTING / SIGN IN ── */}
                    {tab === 'existing' && (
                        <div style={s.tabContent}>
                            {loading && (
                                <div style={s.loadingWrap}>
                                    <div style={s.spinner} />
                                    <span style={{ color: '#687078', fontSize: 13 }}>Loading accounts...</span>
                                </div>
                            )}

                            {!loading && accounts.length === 0 && (
                                <div style={s.emptyState}>
                                    <Cloud size={32} color="#aab7b8" />
                                    <p style={{ color: '#687078', fontSize: 13, marginTop: 10, textAlign: 'center' }}>
                                        No accounts found.<br />Use "Add Account" to get started.
                                    </p>
                                </div>
                            )}

                            {!loading && accounts.length > 0 && (
                                <div style={s.accountList}>
                                    {accounts.map(account => {
                                        const isSelected = selectedId === account.aws_account_id
                                        const isHovered = hoveredId === account.aws_account_id
                                        return (
                                            <button
                                                key={account.aws_account_id}
                                                onClick={() => handleSelect(account.aws_account_id)}
                                                onMouseEnter={() => setHoveredId(account.aws_account_id)}
                                                onMouseLeave={() => setHoveredId(null)}
                                                style={{
                                                    ...s.accountRow,
                                                    ...(isSelected ? s.accountRowSelected : {}),
                                                    ...(isHovered && !isSelected ? s.accountRowHover : {}),
                                                }}
                                            >
                                                <div style={{
                                                    ...s.avatar,
                                                    background: isSelected ? '#232F3E' : '#f0ebe4',
                                                    border: isSelected ? '2px solid #FF9900' : '2px solid transparent',
                                                }}>
                                                    <span style={{
                                                        ...s.avatarText,
                                                        color: isSelected ? '#FF9900' : '#414d5c',
                                                    }}>
                                                        {getInitials(account)}
                                                    </span>
                                                </div>
                                                <div style={s.accountInfo}>
                                                    <span style={s.accountIdText}>{account.aws_account_id}</span>
                                                    <span style={s.accountMeta}>
                                                        {account.profile_name || 'default'} · {account.region}
                                                    </span>
                                                </div>
                                                <div>
                                                    {isSelected ? (
                                                        <div style={s.checkBadge}>
                                                            <Check size={12} color="#fff" strokeWidth={3} />
                                                        </div>
                                                    ) : (
                                                        <ChevronRight size={16}
                                                            color={isHovered ? '#FF9900' : '#aab7b8'}
                                                            style={{ transition: 'color 0.15s' }} />
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {error && <div style={s.errorBox}><span>⚠</span> {error}</div>}

                            <button
                                onClick={handleConnect}
                                disabled={!selectedId || connecting}
                                style={{ ...s.primaryBtn, opacity: selectedId ? 1 : 0.5, cursor: selectedId ? 'pointer' : 'not-allowed' }}
                                onMouseEnter={e => { if (selectedId) e.currentTarget.style.background = '#ec8a00' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}
                            >
                                {connecting
                                    ? <><div style={s.spinnerBtn} /> Connecting...</>
                                    : <>Sign in <ChevronRight size={16} /></>
                                }
                            </button>

                            <div style={s.orDivider}>
                                <div style={s.orLine} /><span style={s.orText}>OR</span><div style={s.orLine} />
                            </div>

                            <button style={s.secondaryBtn}
                                onClick={() => setTab('new')}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#0073bb'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(35,47,62,0.3)'}
                            >
                                Add new AWS account
                            </button>
                        </div>
                    )}

                    {/* ── NEW ACCOUNT ── */}
                    {tab === 'new' && (
                        <form onSubmit={handleCreateRoot} style={s.tabContent}>
                            <Field label="AWS account ID or account alias" required>
                                <input style={s.input} placeholder="123456789012"
                                    value={rootForm.aws_account_id} maxLength={12}
                                    onChange={e => setRootForm(f => ({ ...f, aws_account_id: e.target.value }))} />
                            </Field>
                            <Field label="Profile name">
                                <input style={s.input} placeholder="default"
                                    value={rootForm.profile_name}
                                    onChange={e => setRootForm(f => ({ ...f, profile_name: e.target.value }))} />
                            </Field>
                            <Field label="Default region" required>
                                <select style={s.input} value={rootForm.region}
                                    onChange={e => setRootForm(f => ({ ...f, region: e.target.value }))}>
                                    {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </Field>

                            <div style={s.sectionLabel}>
                                <span>Credentials</span>
                                <span style={s.sectionHint}> — optional if using IAM role</span>
                            </div>

                            <Field label="Access key ID">
                                <input style={s.input} placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={rootForm.access_key}
                                    onChange={e => setRootForm(f => ({ ...f, access_key: e.target.value }))} />
                            </Field>
                            <Field label="Secret access key">
                                <input style={s.input} type="password" placeholder="••••••••••••••••••••"
                                    value={rootForm.secret_key}
                                    onChange={e => setRootForm(f => ({ ...f, secret_key: e.target.value }))} />
                            </Field>

                            {rootError && <div style={s.errorBox}><span>⚠</span> {rootError}</div>}
                            {rootSuccess && <div style={s.successBox}><span>✓</span> {rootSuccess}</div>}

                            <button type="submit" disabled={rootCreating} style={s.primaryBtn}
                                onMouseEnter={e => { if (!rootCreating) e.currentTarget.style.background = '#ec8a00' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}
                            >
                                {rootCreating
                                    ? <><div style={s.spinnerBtn} /> Adding account...</>
                                    : <>Add account <ChevronRight size={16} /></>
                                }
                            </button>
                        </form>
                    )}

                    {/* ── IAM USER ── */}
                    {tab === 'iam' && (
                        <form onSubmit={handleCreateIam} style={s.tabContent}>
                            <div style={s.infoBox}>
                                <Key size={13} color="#0073bb" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ color: '#414d5c', fontSize: 13 }}>
                                    IAM users sign in with their own credentials and scan the parent account's resources.
                                </span>
                            </div>

                            <Field label="Parent AWS account" required>
                                {loading ? <div style={s.loadingWrap}><div style={s.spinner} /></div>
                                    : accounts.length === 0
                                        ? <p style={{ color: '#d13212', fontSize: 13 }}>No accounts found. Add one first.</p>
                                        : (
                                            <select style={s.input} value={iamForm.account_id}
                                                onChange={e => setIamForm(f => ({ ...f, account_id: e.target.value }))}>
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.aws_account_id} — {acc.profile_name || 'default'}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                            </Field>
                            <Field label="IAM username" required>
                                <input style={s.input} placeholder="e.g. varun-dev"
                                    value={iamForm.username}
                                    onChange={e => setIamForm(f => ({ ...f, username: e.target.value }))} />
                            </Field>
                            <Field label="Region" required>
                                <select style={s.input} value={iamForm.region}
                                    onChange={e => setIamForm(f => ({ ...f, region: e.target.value }))}>
                                    {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </Field>
                            <Field label="Access key ID" required>
                                <input style={s.input} placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={iamForm.access_key}
                                    onChange={e => setIamForm(f => ({ ...f, access_key: e.target.value }))} />
                            </Field>
                            <Field label="Secret access key" required>
                                <input style={s.input} type="password" placeholder="••••••••••••••••••••"
                                    value={iamForm.secret_key}
                                    onChange={e => setIamForm(f => ({ ...f, secret_key: e.target.value }))} />
                            </Field>

                            {iamError && <div style={s.errorBox}><span>⚠</span> {iamError}</div>}
                            {iamSuccess && <div style={s.successBox}><span>✓</span> {iamSuccess}</div>}

                            <button type="submit"
                                disabled={iamCreating || accounts.length === 0}
                                style={{ ...s.primaryBtn, opacity: accounts.length === 0 ? 0.5 : 1, cursor: accounts.length === 0 ? 'not-allowed' : 'pointer' }}
                                onMouseEnter={e => { if (accounts.length > 0) e.currentTarget.style.background = '#ec8a00' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FF9900' }}
                            >
                                {iamCreating
                                    ? <><div style={s.spinnerBtn} /> Signing in...</>
                                    : <>Sign in <ChevronRight size={16} /></>
                                }
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div style={s.footer}>
                    <span style={s.footerText}>AWS Cloud Security Panel</span>
                    <span style={s.footerDot}>·</span>
                    <span style={s.footerText}>v0.1.0</span>
                    <span style={s.footerDot}>·</span>
                    <span style={s.footerText}>FastAPI + React</span>
                </div>
            </div>
        </div>
    )
}

function Field({ label, required, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ color: '#16191f', fontSize: 13, fontWeight: 600 }}>
                {label}
                {required && <span style={{ color: '#d13212', marginLeft: 3 }}>*</span>}
            </label>
            {children}
        </div>
    )
}

const s = {
    page: {
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8f4f0',
        position: 'relative', overflow: 'hidden',
        fontFamily: 'DM Sans, sans-serif',
        padding: '40px 16px',
    },
    blobTL: {
        position: 'absolute', top: -80, left: -80,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,153,0,0.12) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none',
    },
    blobBR: {
        position: 'absolute', bottom: -80, right: -80,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,153,0,0.10) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none',
    },
    backBtn: {
        position: 'absolute', top: 20, left: 20, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent',
        border: '1px solid rgba(35,47,62,0.25)',
        color: '#414d5c', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', padding: '8px 14px',
        borderRadius: 4,
        transition: 'background 0.15s, border-color 0.15s',
        fontFamily: 'DM Sans, sans-serif',
        boxShadow: '0 1px 4px rgba(0,28,36,0.08)',
    },
    wrapper: {
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: 440,
    },
    logoTop: {
        marginBottom: 20, textAlign: 'center',
    },
    card: {
        background: '#ffffff',
        border: '1px solid rgba(35,47,62,0.18)',
        borderRadius: 8,
        padding: '32px 36px',
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,28,36,0.1)',
        animation: 'fadeIn 0.4s ease both',
    },
    title: {
        fontSize: 20, fontWeight: 700, color: '#16191f',
        margin: '0 0 8px', textAlign: 'left',
    },
    titleDivider: {
        height: 1, background: 'rgba(35,47,62,0.1)', marginBottom: 20,
    },
    tabs: {
        display: 'flex',
        border: '1px solid rgba(35,47,62,0.15)',
        borderRadius: 4, overflow: 'hidden',
        marginBottom: 20,
    },
    tab: {
        flex: 1, padding: '9px 8px',
        border: 'none', borderRight: '1px solid rgba(35,47,62,0.12)',
        background: 'transparent',
        color: '#414d5c', fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        transition: 'background 0.12s',
        fontFamily: 'DM Sans, sans-serif',
    },
    tabActive: {
        background: '#232F3E', color: '#FF9900',
        borderRight: '1px solid rgba(35,47,62,0.12)',
    },
    tabContent: {
        display: 'flex', flexDirection: 'column', gap: 14,
    },
    loadingWrap: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '16px 0',
    },
    spinner: {
        width: 18, height: 18, borderRadius: '50%',
        border: '2px solid rgba(255,153,0,0.2)',
        borderTopColor: '#FF9900',
        animation: 'spin 0.7s linear infinite',
    },
    spinnerBtn: {
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid rgba(35,47,62,0.2)',
        borderTopColor: '#232F3E',
        animation: 'spin 0.7s linear infinite',
    },
    emptyState: {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '24px 0',
    },
    accountList: {
        display: 'flex', flexDirection: 'column', gap: 6,
        maxHeight: 280, overflowY: 'auto',
    },
    accountRow: {
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fafafa',
        border: '1px solid rgba(35,47,62,0.12)',
        borderRadius: 6, padding: '11px 14px',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.12s',
        fontFamily: 'DM Sans, sans-serif',
    },
    accountRowSelected: {
        background: '#fdf6e3',
        border: '1px solid #FF9900',
        boxShadow: '0 0 0 2px rgba(255,153,0,0.15)',
    },
    accountRowHover: {
        background: '#f8f4f0',
        border: '1px solid rgba(255,153,0,0.4)',
    },
    avatar: {
        width: 38, height: 38, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'all 0.15s',
    },
    avatarText: {
        fontSize: 12, fontWeight: 700,
        fontFamily: 'Space Mono, monospace',
    },
    accountInfo: {
        display: 'flex', flexDirection: 'column', gap: 2,
        flex: 1, minWidth: 0,
    },
    accountIdText: {
        color: '#16191f', fontSize: 13, fontWeight: 600,
        fontFamily: 'Space Mono, monospace',
    },
    accountMeta: {
        color: '#687078', fontSize: 11,
    },
    checkBadge: {
        width: 20, height: 20, borderRadius: '50%',
        background: '#067340',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    primaryBtn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', padding: '11px 20px',
        background: '#FF9900', color: '#232F3E',
        border: '2px solid #FF9900', borderRadius: 4,
        fontSize: 14, fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(255,153,0,0.2)',
        transition: 'background 0.12s',
        fontFamily: 'DM Sans, sans-serif',
    },
    secondaryBtn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', padding: '11px 20px',
        background: '#fff', color: '#16191f',
        border: '1px solid rgba(35,47,62,0.3)', borderRadius: 4,
        fontSize: 14, fontWeight: 600,
        cursor: 'pointer',
        transition: 'border-color 0.12s',
        fontFamily: 'DM Sans, sans-serif',
    },
    orDivider: {
        display: 'flex', alignItems: 'center', gap: 12,
    },
    orLine: {
        flex: 1, height: 1, background: 'rgba(35,47,62,0.12)',
    },
    orText: {
        color: '#687078', fontSize: 12, fontWeight: 600,
        fontFamily: 'Space Mono, monospace',
    },
    input: {
        background: '#ffffff',
        border: '1px solid #aab7b8',
        borderRadius: 4, padding: '9px 12px',
        color: '#16191f', fontSize: 14,
        outline: 'none', width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'DM Sans, sans-serif',
        transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    sectionLabel: {
        fontSize: 13, fontWeight: 600, color: '#414d5c',
        borderBottom: '1px solid rgba(35,47,62,0.1)',
        paddingBottom: 8, marginTop: 2,
    },
    sectionHint: {
        color: '#687078', fontWeight: 400, fontSize: 12,
    },
    infoBox: {
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: '#f0f7ff',
        border: '1px solid #b3d1f7',
        borderRadius: 4, padding: '10px 14px',
    },
    errorBox: {
        background: '#fdf3f1',
        border: '1px solid #f5bcb3',
        borderRadius: 4, padding: '10px 14px',
        color: '#d13212', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 6,
    },
    successBox: {
        background: '#f2f8f4',
        border: '1px solid #a8d5b5',
        borderRadius: 4, padding: '10px 14px',
        color: '#067340', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 6,
    },
    footer: {
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 20,
    },
    footerText: {
        color: '#687078', fontSize: 12,
    },
    footerDot: {
        color: '#aab7b8', fontSize: 12,
    },
}
