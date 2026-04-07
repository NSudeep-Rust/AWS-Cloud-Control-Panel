// ToastSystem.jsx
// Windows Defender-style security alert toasts.
// Polls /api/alerts/ and shows a popup for each new alert.
// Tracks seen IDs in sessionStorage so refreshes don't re-show old alerts.

import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '@/context/AuthContext'
import { ShieldAlert, AlertTriangle, Info, X, ChevronRight, Shield } from 'lucide-react'

const API = 'http://localhost:8000'
const POLL_MS = 15_000          // poll every 15 seconds
const AUTO_DISMISS_MS = 12_000   // toast stays for 12 seconds
const MAX_TOASTS = 4            // max visible at once

const SEV_CONFIG = {
    CRITICAL: {
        color: '#d13212', bg: '#1a0800', border: 'rgba(209,50,18,0.6)',
        glow: 'rgba(209,50,18,0.35)', icon: AlertTriangle, label: 'CRITICAL THREAT',
        barColor: '#d13212', sound: [880, 660, 880],
    },
    HIGH: {
        color: '#e67e22', bg: '#1a0f00', border: 'rgba(230,126,34,0.55)',
        glow: 'rgba(230,126,34,0.25)', icon: ShieldAlert, label: 'HIGH SEVERITY',
        barColor: '#e67e22', sound: [660, 440],
    },
    MEDIUM: {
        color: '#f59e0b', bg: '#1a1200', border: 'rgba(245,158,11,0.45)',
        glow: 'rgba(245,158,11,0.15)', icon: Shield, label: 'MEDIUM RISK',
        barColor: '#f59e0b', sound: [520],
    },
    LOW: {
        color: '#0972d3', bg: '#000d1a', border: 'rgba(9,114,211,0.45)',
        glow: 'rgba(9,114,211,0.12)', icon: Info, label: 'LOW PRIORITY',
        barColor: '#0972d3', sound: [440],
    },
}

// ── Web Audio beep ─────────────────────────────────────────────────────────
function playSound(severity) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const cfg = SEV_CONFIG[severity] || SEV_CONFIG.LOW
        const freqs = cfg.sound

        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)

            const start = ctx.currentTime + i * 0.22
            osc.frequency.setValueAtTime(freq, start)
            osc.type = severity === 'CRITICAL' ? 'sawtooth' : 'sine'
            gain.gain.setValueAtTime(0, start)
            gain.gain.linearRampToValueAtTime(0.18, start + 0.04)
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
            osc.start(start)
            osc.stop(start + 0.32)
        })
    } catch { /* AudioContext blocked by browser policy — silent fallback */ }
}

// ── Single toast card ─────────────────────────────────────────────────────
function Toast({ toast, onDismiss, onNav }) {
    const [progress, setProgress] = useState(100)
    const [visible, setVisible] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const cfg = SEV_CONFIG[toast.severity] || SEV_CONFIG.LOW
    const Icon = cfg.icon

    // Slide-in on mount
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 30)
        return () => clearTimeout(t)
    }, [])

    // Progress bar countdown
    useEffect(() => {
        const start = Date.now()
        const iv = setInterval(() => {
            const elapsed = Date.now() - start
            const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100)
            setProgress(pct)
            if (pct <= 0) {
                clearInterval(iv)
                dismiss()
            }
        }, 80)
        return () => clearInterval(iv)
    }, [])

    function dismiss() {
        setLeaving(true)
        setTimeout(() => onDismiss(toast.id), 320)
    }

    function handleClick() {
        dismiss()
        onNav('threats')
    }

    return (
        <div
            onClick={handleClick}
            style={{
                position: 'relative',
                width: 340,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 8,
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 24px ${cfg.glow}`,
                transform: visible && !leaving ? 'translateX(0)' : 'translateX(380px)',
                opacity: leaving ? 0 : visible ? 1 : 0,
                transition: leaving
                    ? 'transform 0.3s ease-in, opacity 0.3s ease-in'
                    : 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
                userSelect: 'none',
            }}
        >
            {/* Header row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px 6px 12px',
            }}>
                {/* Severity icon */}
                <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: `${cfg.color}20`,
                    border: `1px solid ${cfg.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={14} color={cfg.color} />
                </div>

                {/* Title */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 9, fontWeight: 800, color: cfg.color,
                        textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 1,
                        fontFamily: 'monospace',
                    }}>{cfg.label}</div>
                    <div style={{
                        fontSize: 11, fontWeight: 700, color: '#e6edf3',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {(toast.type || '').replace(/_/g, ' ')}
                    </div>
                </div>

                {/* Dismiss X */}
                <button
                    onClick={e => { e.stopPropagation(); dismiss() }}
                    style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.3)', padding: 3, flexShrink: 0,
                        borderRadius: 4, display: 'flex', alignItems: 'center',
                        transition: 'color 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                >
                    <X size={12} />
                </button>
            </div>

            {/* Body */}
            <div style={{ padding: '0 12px 8px 12px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {toast.resourceId}
                </div>
                <div style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
                }}>
                    {toast.message || 'New security issue detected'}
                </div>
            </div>

            {/* Footer CTA */}
            <div style={{
                padding: '6px 12px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                    Cloud Security Panel
                </span>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 9, fontWeight: 700, color: cfg.color,
                }}>
                    View in Threats <ChevronRight size={9} />
                </div>
            </div>

            {/* Progress bar */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0,
                height: 2,
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}88)`,
                transition: 'width 0.08s linear',
            }} />
        </div>
    )
}

// ── Main ToastSystem — mount once inside PanelPage ────────────────────────
// Severities that trigger popups — MEDIUM and LOW are silently ignored
const NOTIFY_SEVERITIES = new Set(['CRITICAL', 'HIGH'])

export default function ToastSystem({ onNav }) {
    const { account } = useAuth()
    const [toasts, setToasts] = useState([])
    const [notifPermission, setNotifPermission] = useState('default')
    const seenRef = useRef(null)

    // ── Request OS notification permission on mount ──────────────────────
    useEffect(() => {
        if (!('Notification' in window)) return
        if (Notification.permission === 'granted') {
            setNotifPermission('granted')
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
                setNotifPermission(perm)
            })
        } else {
            setNotifPermission(Notification.permission)
        }
    }, [])

    // ── Load seen IDs from localStorage (persists across logout/login) ──
    // FIX: was sessionStorage — got cleared on every logout, causing all
    // old alerts to re-fire as "new" after every login.
    useEffect(() => {
        try {
            const raw = localStorage.getItem('seen_alert_ids')
            seenRef.current = new Set(raw ? JSON.parse(raw) : [])
        } catch {
            seenRef.current = new Set()
        }
    }, [])

    const dbId = account?.account_type === 'iam' ? account?.account_id : account?.id

    const dismiss = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    // ── Fire OS-level system notification ───────────────────────────────
    const fireNativeNotif = useCallback((alert, displayType) => {
        // Only fire OS notification for CRITICAL and HIGH
        if (!NOTIFY_SEVERITIES.has(alert.severity)) return
        if (!('Notification' in window) || Notification.permission !== 'granted') return
        const sevLabel = { CRITICAL: '🔴 CRITICAL', HIGH: '🟠 HIGH', MEDIUM: '🟡 MEDIUM', LOW: '🔵 LOW' }
        const title = `${sevLabel[alert.severity] || '⚠️'} AWS Security Alert`
        const body = `${displayType.replace(/_/g, ' ')}: ${alert.message || 'New issue detected'}`
        try {
            const notif = new Notification(title, {
                body,
                tag: String(alert.id),
                requireInteraction: alert.severity === 'CRITICAL' || alert.severity === 'HIGH',
                silent: false,
            })
            notif.onclick = () => {
                window.focus()
                notif.close()
                onNav('threats')
            }
        } catch { /* ignore */ }
    }, [onNav])

    // ── Build and show a toast from an alert payload ─────────────────────
    // Only CRITICAL and HIGH fire popups — MEDIUM/LOW are silently ignored
    const showAlert = useCallback((alert) => {
        if (!seenRef.current) return
        const idStr = String(alert.id)
        if (seenRef.current.has(idStr)) return   // already seen → skip

        // ── Severity gate: only CRITICAL and HIGH get popups ──────────────
        if (!NOTIFY_SEVERITIES.has(alert.severity)) {
            seenRef.current.add(idStr)  // mark seen so it doesn't re-check
            return
        }

        seenRef.current.add(idStr)
        try {
            // Persist to localStorage so it survives logout/login
            localStorage.setItem('seen_alert_ids', JSON.stringify([...seenRef.current]))
        } catch { }

        // Build display strings
        const parts = (alert.finding_id || alert.type || '').split('-')
        const typeWords = []
        for (const p of parts) {
            if (/^[0-9a-f]{8,}$/i.test(p)) break
            if (p.startsWith('vpc') || p.startsWith('sg') || p.startsWith('i-') || p.startsWith('snap') || p.startsWith('vol')) break
            typeWords.push(p.toUpperCase())
        }
        const displayType = alert.type || typeWords.slice(0, 4).join('_') || alert.finding_id || 'SECURITY_ALERT'
        const resourceId  = alert.resource_id || (alert.finding_id || '').slice(0, 26)

        playSound(alert.severity)
        fireNativeNotif(alert, displayType)

        setToasts(prev => {
            const newToast = {
                id:         alert.id,
                type:       displayType,
                resourceId: resourceId,
                message:    alert.message,
                severity:   alert.severity,
                _key:       `${alert.id}-${Date.now()}`,
            }
            return [newToast, ...prev].slice(0, MAX_TOASTS)
        })
    }, [fireNativeNotif])

    // ── ⚡ WebSocket — primary real-time channel ──────────────────────────
    // Connects to ws://localhost:8000/ws/alerts
    // When monitor fires an alert → instantly pushed here → toast shown
    // Total latency: < 200ms (vs 15,000ms with polling)
    const wsRef = useRef(null)

    const connectWS = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return

        try {
            const ws = new WebSocket('ws://localhost:8000/ws/alerts')
            wsRef.current = ws

            ws.onopen = () => {
                console.log('⚡ Alert WebSocket connected')
                // Send a ping every 25s to keep connection alive
                const pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send('ping')
                    else clearInterval(pingInterval)
                }, 25000)
            }

            ws.onmessage = (evt) => {
                try {
                    const payload = JSON.parse(evt.data)
                    if (payload.event === 'new_alert') {
                        console.log('⚡ Instant alert received:', payload.severity, payload.type)
                        showAlert(payload)
                    }
                } catch { /* ignore non-JSON */ }
            }

            ws.onclose = () => {
                console.log('⚡ Alert WebSocket closed — reconnecting in 5s')
                setTimeout(connectWS, 5000)   // auto-reconnect
            }

            ws.onerror = () => {
                ws.close()   // triggers onclose → reconnect
            }
        } catch (e) {
            console.log('⚡ WebSocket unavailable — falling back to polling')
        }
    }, [showAlert])

    useEffect(() => {
        // Small delay so seenRef loads from localStorage first
        const t = setTimeout(connectWS, 500)
        return () => {
            clearTimeout(t)
            wsRef.current?.close()
        }
    }, [connectWS])

    // ── HTTP polling — fallback / initial load of existing alerts ────────
    // Runs on mount + every POLL_MS to catch any alerts missed while WS was down
    const poll = useCallback(async () => {
        if (!seenRef.current) return
        try {
            // Pass account_id so we only get THIS account's alerts (not global)
            const params = dbId ? { account_id: dbId } : {}
            const r = await axios.get(`${API}/api/alerts/`, { params })
            const alerts = r.data?.data?.alerts || r.data?.alerts || []
            alerts.forEach(a => showAlert(a))
        } catch { /* silent */ }
    }, [showAlert, dbId])

    useEffect(() => {
        const init = setTimeout(poll, 2000)
        const iv = setInterval(poll, POLL_MS)
        return () => { clearTimeout(init); clearInterval(iv) }
    }, [poll])

    if (toasts.length === 0) return null

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: 10,
            pointerEvents: 'none',
        }}>
            {toasts.map(t => (
                <div key={t._key} style={{ pointerEvents: 'all' }}>
                    <Toast toast={t} onDismiss={dismiss} onNav={onNav} />
                </div>
            ))}
        </div>
    )
}
