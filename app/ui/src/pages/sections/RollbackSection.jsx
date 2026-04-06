import { useState, useEffect, useCallback } from 'react'
import { useScan } from '@/context/ScanContext'
import axios from 'axios'
import { RotateCcw, CheckCircle, AlertTriangle, Clock } from 'lucide-react'

const API = 'http://localhost:8000'

const SEV = {
    CRITICAL: { border: '#d13212', badge: '#d13212', badgeBg: 'rgba(209,50,18,0.1)',  light: 'rgba(209,50,18,0.06)',  stripe: '#d13212' },
    HIGH:     { border: '#e07b00', badge: '#e07b00', badgeBg: 'rgba(224,123,0,0.08)', light: 'rgba(255,153,0,0.07)',  stripe: '#e07b00' },
    MEDIUM:   { border: '#d4a017', badge: '#9a7009', badgeBg: 'rgba(212,160,23,0.1)', light: 'rgba(212,160,23,0.06)', stripe: '#c8960c' },
    LOW:      { border: '#3ea97c', badge: '#1d6a4a', badgeBg: 'rgba(62,169,124,0.1)', light: 'rgba(62,169,124,0.06)', stripe: '#3ea97c' },
    INFO:     { border: '#5b9bd5', badge: '#1a6296', badgeBg: 'rgba(91,155,213,0.1)', light: 'rgba(91,155,213,0.06)', stripe: '#5b9bd5' },
}
const sevOr = s => SEV[s?.toUpperCase()] || SEV.INFO

function fmtAction(a) { return (a || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function fmtType(t)   { return (t || 'Unknown').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }
function fmtTime(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const STATUS_STYLE = {
    EXECUTED:          { color: '#1d8102', bg: 'rgba(29,128,2,0.1)',    label: '✓ Executed'  },
    DRY_RUN:           { color: '#5b9bd5', bg: 'rgba(91,155,213,0.1)', label: '▶ Dry Run'   },
    REQUIRE_APPROVAL:  { color: '#e07b00', bg: 'rgba(224,123,0,0.1)',  label: '🔐 Approval' },
    BLOCKED_BY_POLICY: { color: '#d13212', bg: 'rgba(209,50,18,0.1)',  label: '⛔ Blocked'  },
    MANUAL_REQUIRED:   { color: '#5b9bd5', bg: 'rgba(91,155,213,0.1)', label: '📋 Manual'  },
    FAILED:            { color: '#d13212', bg: 'rgba(209,50,18,0.1)',  label: '✗ Failed'   },
    SKIPPED:           { color: '#8d9191', bg: 'rgba(141,145,145,0.1)',label: '— Skipped'  },
}
const statStyle = s => STATUS_STYLE[s] || { color: '#8d9191', bg: 'rgba(0,0,0,0.05)', label: s || 'Unknown' }

const SERVICE_ICONS = {
    IAM: '🔑', S3: '📦', EC2: '💻', VPC: '🌐', RDS: '🗄️',
    KMS: '🔒', CLOUDTRAIL: '📋', EBS: '💾', SG: '🛡️', DEFAULT: '↩️',
}
function getServiceIcon(type) {
    if (!type) return SERVICE_ICONS.DEFAULT
    const t = type.toUpperCase()
    for (const [k, v] of Object.entries(SERVICE_ICONS)) {
        if (t.includes(k)) return v
    }
    return SERVICE_ICONS.DEFAULT
}

// ── Premium confirmation modal ────────────────────────────────────────────────
function ConfirmModal({ action, resource, onConfirm, onCancel, dark }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(10,14,26,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
            animation: 'modalFadeIn 0.18s ease',
        }}>
            <style>{`
                @keyframes modalFadeIn { 0%{opacity:0} 100%{opacity:1} }
                @keyframes modalSlideUp { 0%{opacity:0;transform:translateY(20px) scale(0.97)} 100%{opacity:1;transform:none} }
            `}</style>
            <div style={{
                background: dark ? '#1a2133' : '#ffffff',
                border: '1.5px solid rgba(91,155,213,0.3)',
                borderTop: '4px solid #5b9bd5',
                borderRadius: 16,
                padding: '32px 36px 28px',
                maxWidth: 420, width: '90%',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',
                animation: 'modalSlideUp 0.22s cubic-bezier(0.34,1.3,0.64,1)',
            }}>
                {/* Icon */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'rgba(91,155,213,0.12)',
                        border: '2px solid rgba(91,155,213,0.25)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28,
                    }}>↩️</div>
                </div>

                {/* Title */}
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: dark ? '#e6edf3' : '#0f1111', marginBottom: 6 }}>
                        Confirm Rollback
                    </div>
                    <div style={{ fontSize: 12.5, color: dark ? '#8b949e' : '#565959', lineHeight: 1.6 }}>
                        You are about to undo the AWS change for:
                    </div>
                </div>

                {/* Action box */}
                <div style={{
                    background: dark ? 'rgba(91,155,213,0.08)' : 'rgba(9,114,211,0.05)',
                    border: '1.5px solid rgba(91,155,213,0.22)',
                    borderRadius: 10, padding: '14px 18px',
                    margin: '16px 0 20px',
                }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: dark ? '#93c5fd' : '#1a6296', marginBottom: 6 }}>
                        {action}
                    </div>
                    <div style={{ fontSize: 11, color: dark ? '#8b949e' : '#565959', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {resource}
                    </div>
                </div>

                {/* Warning */}
                <div style={{
                    fontSize: 11, color: '#e07b00', background: 'rgba(224,123,0,0.08)',
                    border: '1px solid rgba(224,123,0,0.22)',
                    borderRadius: 7, padding: '9px 12px', marginBottom: 22,
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                    <span>This will make <strong>real changes</strong> to your AWS account to restore the previous state. This action cannot be easily undone.</span>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1, padding: '11px 0', borderRadius: 9,
                            border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#e5e8ed'}`,
                            background: 'transparent',
                            color: dark ? '#8b949e' : '#565959',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            flex: 1.6, padding: '11px 0', borderRadius: 9, border: 'none',
                            background: 'linear-gradient(135deg, #1a6296, #5b9bd5)',
                            color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(91,155,213,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        }}>
                        <RotateCcw size={14} /> Confirm Rollback
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function RollbackEmptyState() {
    const POINTS = [
        { time: 'T-0', label: 'IAM policy detached',       resource: 'iam::user/admin',  color: '#e07b00' },
        { time: 'T-1', label: 'S3 public ACL removed',     resource: 's3::prod-bucket',  color: '#0972d3' },
        { time: 'T-2', label: 'VPC flow logs enabled',     resource: 'vpc::vpc-09a3b',   color: '#1d8102' },
        { time: 'T-3', label: 'Security group restricted', resource: 'ec2::sg-af33e',    color: '#8d4004' },
        { time: 'T-4', label: 'KMS key rotation enabled',  resource: 'kms::key-0f9e3',   color: '#0972d3' },
        { time: 'T-5', label: 'RDS public access off',     resource: 'rds::db-prod-3a',  color: '#1d8102' },
    ]

    return (
        <div style={{
            background: '#f4f8ff',
            border: '1px solid rgba(9,114,211,0.2)',
            borderLeft: '4px solid #0972d3',
            borderRadius: 14, padding: '44px 48px',
            boxShadow: '0 4px 20px rgba(9,114,211,0.09)',
            display: 'flex', gap: 52,
            minHeight: 'calc(100vh - 190px)',
        }}>
            <style>{`
                @keyframes clockHand  { to { transform: rotate(360deg) } }
                @keyframes rbSlide    { 0% { opacity:0; transform:translateX(-10px) } 100% { opacity:1; transform:translateX(0) } }
                @keyframes rbDot      { 0%,100% { opacity:0.3; transform:scale(0.8) } 50% { opacity:1; transform:scale(1) } }
                @keyframes rbPulseRing{ 0% { transform:scale(0.9); opacity:0.7 } 100% { transform:scale(1.5); opacity:0 } }
            `}</style>

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, minWidth: 140 }}>
                <div style={{ position: 'relative', width: 134, height: 134 }}>
                    <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1.5px solid rgba(9,114,211,0.18)', animation: 'rbPulseRing 2.2s ease-out infinite' }} />
                    <div style={{ width: 134, height: 134, borderRadius: '50%', background: 'linear-gradient(135deg, #e4eeff, #d4e4ff)', border: '2.5px solid rgba(9,114,211,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 20px rgba(9,114,211,0.18)' }}>
                        {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
                            <div key={deg} style={{ position: 'absolute', top: '50%', left: '50%', width: deg%90===0?3:2, height: deg%90===0?12:8, background: `rgba(9,114,211,${deg%90===0?0.5:0.2})`, transformOrigin: '50% calc(-48px)', transform: `translate(-50%,-100%) rotate(${deg}deg)`, borderRadius: 2 }} />
                        ))}
                        <div style={{ position: 'absolute', width: 4, height: 34, borderRadius: 3, background: '#0950a1', bottom: '50%', left: 'calc(50% - 2px)', transformOrigin: 'bottom center', animation: 'clockHand 12s linear infinite reverse' }} />
                        <div style={{ position: 'absolute', width: 2.5, height: 46, borderRadius: 2, background: '#0972d3', bottom: '50%', left: 'calc(50% - 1.25px)', transformOrigin: 'bottom center', animation: 'clockHand 3s linear infinite reverse' }} />
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0972d3', position: 'absolute', zIndex: 2, boxShadow: '0 0 6px rgba(9,114,211,0.5)' }} />
                        <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 14, color: '#0972d3', opacity: 0.5, fontWeight: 700 }}>↺</div>
                    </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0950a1', letterSpacing: 1.6, textTransform: 'uppercase' }}>Restore Points</div>
                    <div style={{ fontSize: 10, color: '#8d9191', marginTop: 4, lineHeight: 1.5 }}>Waiting for executions<br/>to create history</div>
                </div>
            </div>

            <div style={{ width: 1.5, background: 'linear-gradient(180deg, rgba(9,114,211,0.25), rgba(9,114,211,0.05))', flexShrink: 0, borderRadius: 2 }} />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0972d3', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 28 }}>
                    What restore points look like:
                </div>
                <div style={{ position: 'relative', paddingLeft: 26, flex: 1 }}>
                    <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'linear-gradient(180deg, #0972d3, rgba(9,114,211,0.08))', borderRadius: 2 }} />
                    {POINTS.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, opacity: 0.5 + i * 0.08, animation: `rbSlide 0.4s ease ${i * 0.1}s both` }}>
                            <div style={{ position: 'absolute', left: 3, width: 11, height: 11, borderRadius: '50%', background: p.color, border: '2px solid #f4f8ff', animation: `rbDot 2s ease ${i * 0.5}s infinite`, boxShadow: `0 0 6px ${p.color}55` }} />
                            <div style={{ fontSize: 9.5, color: '#8d9191', fontFamily: 'monospace', flexShrink: 0, width: 32, textAlign: 'right', fontWeight: 600 }}>{p.time}</div>
                            <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: `${p.color}09`, border: `1px dashed ${p.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#3d4f60', marginBottom: 2 }}>{p.label}</div>
                                    <div style={{ fontSize: 10, color: '#8d9191', fontFamily: 'monospace' }}>{p.resource}</div>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: p.color, background: `${p.color}12`, borderRadius: 5, padding: '4px 10px', border: `1px solid ${p.color}25` }}>↩ Recover</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 12, color: '#8d9191', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    Execute a fix in <strong style={{ color: '#0972d3' }}>Remediation</strong> to create real restore points here.
                </div>
            </div>
        </div>
    )
}

// ── ExecutionCard — rich card ─────────────────────────────────────────────────
function ExecutionCard({ execution, onRolledBack, dark }) {
    const s = sevOr(execution.finding_severity)
    const st = statStyle(execution.status)
    const [phase, setPhase] = useState('idle')  // idle | confirm | rolling | done | error
    const [hovered, setHovered] = useState(false)

    const text  = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#565959'
    const icon  = getServiceIcon(execution.finding_type || execution.action)

    // ── FIX: once done, call parent immediately & remove self ──────────────────
    useEffect(() => {
        if (phase === 'done') {
            // Brief "Recovered!" flash then remove from list permanently
            const t = setTimeout(() => onRolledBack(execution.execution_id), 1400)
            return () => clearTimeout(t)
        }
    }, [phase])

    async function doRollback() {
        setPhase('rolling')
        try {
            await axios.post(`${API}/api/rollback/`, { execution_id: execution.execution_id })
            setPhase('done')
        } catch {
            setPhase('error')
        }
    }

    const accent = s.stripe

    return (
        <>
            <style>{`
                @keyframes ecSpin   { to { transform: rotate(360deg) } }
                @keyframes ecPop    { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
                @keyframes ecShine  { 0%{left:-80px} 100%{left:calc(100% + 80px)} }
                @keyframes ecFadeOut{ 0%{opacity:1;transform:none} 100%{opacity:0;transform:translateX(40px) scale(0.97)} }
            `}</style>

            {/* Confirm modal */}
            {phase === 'confirm' && (
                <ConfirmModal
                    action={fmtAction(execution.action)}
                    resource={execution.resource_name}
                    onConfirm={doRollback}
                    onCancel={() => setPhase('idle')}
                    dark={dark}
                />
            )}

            <div
                style={{
                    borderRadius: 14, overflow: 'hidden',
                    background: dark ? '#1a2133' : '#ffffff',
                    border: `1.5px solid ${hovered && phase === 'idle' ? accent + 'aa' : accent + '30'}`,
                    boxShadow: hovered && phase === 'idle'
                        ? `0 8px 28px rgba(91,155,213,0.15), 0 2px 8px rgba(0,0,0,0.08)`
                        : '0 2px 8px rgba(15,17,17,0.06)',
                    transition: phase === 'done' ? 'none' : 'all 0.22s ease',
                    transform: hovered && phase === 'idle' ? 'translateY(-2px)' : 'none',
                    animation: phase === 'done' ? 'ecFadeOut 0.35s ease forwards' : 'none',
                    pointerEvents: phase === 'done' ? 'none' : 'auto',
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {/* Severity color bar */}
                <div style={{
                    height: 4,
                    background: `linear-gradient(90deg, ${accent}, ${accent}66)`,
                    position: 'relative', overflow: 'hidden',
                }}>
                    {hovered && phase === 'idle' && (
                        <div style={{ position: 'absolute', top: 0, width: 80, height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)', animation: 'ecShine 0.65s ease forwards' }} />
                    )}
                </div>

                {/* Card body */}
                <div style={{ padding: '14px 18px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* Service icon */}
                    <div style={{
                        width: 46, height: 46, borderRadius: 10, flexShrink: 0,
                        background: s.light,
                        border: `1.5px solid ${accent}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22,
                        transition: 'transform 0.2s',
                        transform: hovered ? 'scale(1.07)' : 'none',
                    }}>
                        {icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Row 1: title + badges */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 800,
                                    color: text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    marginBottom: 3,
                                }}>
                                    {fmtAction(execution.action)}
                                </div>
                                {execution.finding_type && (
                                    <div style={{ fontSize: 11, color: text2, marginBottom: 2 }}>
                                        {fmtType(execution.finding_type)}
                                    </div>
                                )}
                            </div>

                            {/* Status + Severity badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                {execution.finding_severity && (
                                    <span style={{
                                        fontSize: 9, fontWeight: 800, color: s.badge,
                                        background: s.badgeBg, borderRadius: 4, padding: '3px 7px',
                                        textTransform: 'uppercase', letterSpacing: 0.7,
                                        border: `1px solid ${s.badge}30`,
                                    }}>
                                        {execution.finding_severity}
                                    </span>
                                )}
                                <span style={{
                                    fontSize: 9, fontWeight: 700, color: st.color,
                                    background: st.bg, borderRadius: 4, padding: '3px 7px',
                                }}>
                                    {st.label}
                                </span>
                            </div>
                        </div>

                        {/* Resource + scan info */}
                        <div style={{
                            fontSize: 11, color: text2, fontFamily: 'monospace',
                            background: dark ? 'rgba(255,255,255,0.04)' : s.light,
                            border: `1px solid ${accent}18`,
                            borderRadius: 6, padding: '7px 10px', marginBottom: 8,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            📍 {execution.resource_name || '—'}
                            {execution.scan_id && <span style={{ opacity: 0.5, marginLeft: 8 }}>· scan:{execution.scan_id.slice(0,8)}…</span>}
                        </div>

                        {/* Timestamp */}
                        <div style={{ fontSize: 10, color: text2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={9} />
                            {fmtTime(execution.created_at)}
                        </div>
                    </div>
                </div>

                {/* Footer action bar */}
                <div style={{
                    padding: '10px 18px',
                    borderTop: `1px solid ${accent}18`,
                    background: dark ? 'rgba(255,255,255,0.02)' : `${accent}05`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ fontSize: 10, color: text2, fontFamily: 'monospace' }}>
                        {(execution.action || '').replace(/_/g,' ').toUpperCase()}
                    </div>

                    {/* Rollback button / phase states */}
                    <div>
                        {execution.status === 'EXECUTED' && phase === 'idle' && (
                            <button
                                onClick={() => setPhase('confirm')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '8px 18px', borderRadius: 8,
                                    border: '1.5px solid rgba(91,155,213,0.4)',
                                    background: 'rgba(91,155,213,0.1)',
                                    color: '#1a6296', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.14s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,155,213,0.18)'; e.currentTarget.style.borderColor = '#5b9bd5' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,155,213,0.1)'; e.currentTarget.style.borderColor = 'rgba(91,155,213,0.4)' }}
                            >
                                <RotateCcw size={12} /> ↩ Recover
                            </button>
                        )}
                        {execution.status !== 'EXECUTED' && phase === 'idle' && (
                            <div style={{
                                fontSize: 10.5, color: '#8d9191', fontStyle: 'italic',
                                padding: '5px 12px', borderRadius: 7,
                                background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e5e8ed'}`,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                ⛔ Cannot rollback
                            </div>
                        )}
                        {phase === 'rolling' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5b9bd5', fontWeight: 600 }}>
                                <div style={{ width: 14, height: 14, border: '2.5px solid #5b9bd5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'ecSpin 0.75s linear infinite' }} />
                                Rolling back to AWS...
                            </div>
                        )}
                        {phase === 'done' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1d8102', fontWeight: 700 }}>
                                <CheckCircle size={14} style={{ animation: 'ecPop 0.35s ease' }} />
                                Recovered! Moving back…
                            </div>
                        )}
                        {phase === 'error' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11.5, color: '#d13212', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <AlertTriangle size={13} /> Rollback failed
                                </span>
                                <button onClick={() => setPhase('idle')} style={{ fontSize: 10.5, fontWeight: 700, color: accent, background: `${accent}12`, border: `1px solid ${accent}30`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Main section ─────────────────────────────────────────────────────────────
export default function RollbackSection({ dark, onNav }) {
    const { scanId: ctxScanId } = useScan()

    const [executions, setExecutions]   = useState([])
    const [loading, setLoading]         = useState(true)
    const [rolledBackIds, setRolledBackIds] = useState(new Set())
    const [filter, setFilter]           = useState('executed')
    const [scanId, setScanId]           = useState(null)

    useEffect(() => { loadExecutions() }, [ctxScanId])

    async function loadExecutions() {
        setLoading(true)
        try {
            let sid = ctxScanId
            if (!sid) {
                const h = await axios.get(`${API}/api/scan/history`).catch(() => null)
                sid = h?.data?.data?.scan_id || h?.data?.data?.scans?.[0]?.scan_id || null
            }
            setScanId(sid)

            if (!sid) { setExecutions([]); setLoading(false); return }

            const r = await axios.get(`${API}/api/execute/executions?scan_id=${sid}`)
            const all = r.data?.data?.executions || []

            const latestExecuted = {}
            const others = []
            for (const e of all) {
                if (e.status === 'EXECUTED') {
                    const prev = latestExecuted[e.finding_id]
                    if (!prev || new Date(e.created_at) > new Date(prev.created_at)) {
                        latestExecuted[e.finding_id] = e
                    }
                } else {
                    others.push(e)
                }
            }
            setExecutions([...Object.values(latestExecuted), ...others])
        } catch {
            setExecutions([])
        }
        setLoading(false)
    }

    // ── FIX: permanently remove rolled-back card from this list ───────────────
    const handleRolledBack = useCallback((execId) => {
        setRolledBackIds(s => new Set([...s, execId]))
    }, [])

    const visible      = executions.filter(e => !rolledBackIds.has(e.execution_id))
    const executedList = visible.filter(e => e.status === 'EXECUTED')
    const otherList    = visible.filter(e => e.status !== 'EXECUTED')
    const filtered     = filter === 'executed' ? executedList
                       : filter === 'other'    ? otherList
                       : visible

    const text  = dark ? '#e6edf3' : '#0f1111'
    const text2 = dark ? '#8b949e' : '#565959'
    const border= dark ? 'rgba(255,255,255,0.08)' : '#e5e8ed'

    return (
        <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #1a6296, #5b9bd5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RotateCcw size={16} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 800, color: text, margin: 0 }}>Rollback</h1>
                        <div style={{ fontSize: 11, color: text2 }}>Undo executed fixes and restore AWS resources</div>
                    </div>
                </div>
                {visible.length > 0 && (
                    <button onClick={loadExecutions} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: text2, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <RotateCcw size={11} /> Refresh
                    </button>
                )}
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 80, color: text2, gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 18, height: 18, border: '2.5px solid #5b9bd5', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    Loading executions...
                </div>
            )}

            {/* Empty */}
            {!loading && visible.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
                    <div style={{ width: '100%' }}><RollbackEmptyState /></div>
                </div>
            )}

            {/* Has data */}
            {!loading && visible.length > 0 && (
                <>
                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${border}` }}>
                        {[
                            { key: 'executed', label: `✓ Executed (${executedList.length})` },
                            { key: 'other',    label: `Other (${otherList.length})` },
                            { key: 'all',      label: `All (${visible.length})` },
                        ].map(t => (
                            <button key={t.key} onClick={() => setFilter(t.key)} style={{
                                padding: '7px 14px', border: 'none', background: 'transparent',
                                cursor: 'pointer', fontSize: 12.5, fontWeight: filter === t.key ? 700 : 400,
                                color: filter === t.key ? '#5b9bd5' : text2,
                                borderBottom: filter === t.key ? '2.5px solid #5b9bd5' : '2.5px solid transparent',
                                marginBottom: -1, transition: 'all 0.12s',
                            }}>{t.label}</button>
                        ))}
                    </div>

                    {filtered.length === 0
                        ? <div style={{ textAlign: 'center', padding: 40, color: text2, fontSize: 13 }}>No records in this filter.</div>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {filtered.map(e => (
                                <ExecutionCard key={e.execution_id} execution={e} onRolledBack={handleRolledBack} dark={dark} />
                            ))}
                        </div>
                    }
                </>
            )}
        </div>
    )
}
