// ScanContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Global scan state shared between Overview and Scanner sections.
// The actual axios POST lives here so it survives navigation.
// Both pages subscribe to the same state — no duplication, no cancellation.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000'

const SCAN_REGIONS = [
    'us-east-1',
    'us-west-2',
    'eu-west-1',
    'ap-northeast-1',
    'eu-central-1',
    'eu-north-1',
]

const ScanCtx = createContext(null)

export function ScanProvider({ children }) {
    // status: 'idle' | 'scanning' | 'done' | 'error'
    const [status, setStatus] = useState('idle')
    const [findings, setFindings] = useState([])
    const [scanId, setScanId] = useState(null)
    const [elapsed, setElapsed] = useState(0)
    const [scanLineIdx, setScanLineIdx] = useState(0)
    const [factIdx, setFactIdx] = useState(0)
    const [factVisible, setFactVisible] = useState(true)

    // Which account triggered the scan (cache key)
    const [scanMeta, setScanMeta] = useState(null) // { awsId, dbId, cacheKey }

    // Finding to highlight in Scanner when navigating from Overview
    const [highlightFindingId, setHighlightFindingId] = useState(null)

    const timerRef  = useRef(null)
    const lineRef   = useRef(null)
    const factRef   = useRef(null)
    const abortRef  = useRef(null)  // AbortController
    const wsRef     = useRef(null)  // WebSocket for push events
    const scanMetaRef = useRef(null) // always up-to-date copy for WS closure

    // Increments every time the backend signals a refresh is needed.
    // Components subscribe: useEffect(() => { reload() }, [refreshToken])
    const [refreshToken, setRefreshToken]       = useState(0)
    // Last scheduled scan info pushed from backend — used by Overview to
    // reload findings without requiring a full manual scan.
    const [latestScheduledScan, setLatestScheduledScan] = useState(null)

    // ── WebSocket — receive push events from backend ───────────────
    useEffect(() => {
        function connect() {
            try {
                const ws = new WebSocket('ws://localhost:8000/ws/alerts')
                wsRef.current = ws

                ws.onmessage = (e) => {
                    try {
                        const msg = JSON.parse(e.data)

                        if (msg.event === 'scan_complete') {
                            const currentMeta = scanMetaRef.current
                            // Only auto-inject findings if this event is for the
                            // currently signed-in account
                            if (currentMeta && msg.account_id === currentMeta.dbId) {
                                // Pull the latest findings from the backend and
                                // inject them into ScanContext so Overview updates
                                axios.get(`${API}/api/scan/history`)
                                    .then(r => {
                                        const latest = r.data?.data?.scans?.[0]
                                        if (latest && latest.scan_id === msg.scan_id) {
                                            setFindings(latest.findings || [])
                                            setScanId(latest.scan_id)
                                            setStatus('done')
                                        }
                                    })
                                    .catch(() => {})
                            }
                            setLatestScheduledScan({
                                scan_id:        msg.scan_id,
                                account_id:     msg.account_id,
                                findings_count: msg.findings_count,
                            })
                            setRefreshToken(t => t + 1)
                        }

                        if (msg.event === 'execution_complete') {
                            setRefreshToken(t => t + 1)
                        }
                    } catch { /* ignore malformed messages */ }
                }

                ws.onclose  = () => { setTimeout(connect, 3000) } // auto-reconnect
                ws.onerror  = () => { ws.close() }
            } catch { /* WS not available during SSR / test */ }
        }
        connect()
        return () => { try { wsRef.current?.close() } catch {} }
    }, []) // mount-once — closure refs are stable


    useEffect(() => {
        if (status === 'scanning') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
        } else {
            clearInterval(timerRef.current)
        }
        return () => clearInterval(timerRef.current)
    }, [status])

    // ── Scan line rotation ─────────────────────────────────────────
    useEffect(() => {
        if (status !== 'scanning') { clearInterval(lineRef.current); return }
        lineRef.current = setInterval(() => {
            setScanLineIdx(i => (i + 1) % 20)
        }, 1100)
        return () => clearInterval(lineRef.current)
    }, [status])

    // ── Fact rotation ──────────────────────────────────────────────
    useEffect(() => {
        if (status !== 'scanning') { clearInterval(factRef.current); return }
        factRef.current = setInterval(() => {
            setFactVisible(false)
            setTimeout(() => {
                setFactIdx(i => (i + 1) % 12)
                setFactVisible(true)
            }, 400)
        }, 4000)
        return () => clearInterval(factRef.current)
    }, [status])

    // ── Start scan ─────────────────────────────────────────────────
    const startScan = useCallback(async ({ dbId, awsId, cacheKey }) => {
        if (status === 'scanning') return   // already running — do nothing

        // Cancel any prior request
        if (abortRef.current) abortRef.current.abort()
        const ctrl = new AbortController()
        abortRef.current = ctrl

        setStatus('scanning')
        setFindings([])
        setScanId(null)
        setElapsed(0)
        setScanLineIdx(0)
        setFactIdx(0)
        setFactVisible(true)
        setScanMeta({ awsId, dbId, cacheKey })
        scanMetaRef.current = { awsId, dbId, cacheKey }

        try {
            const r = await axios.post(
                `${API}/api/scan/`,
                { account_id: dbId, mode: 'DRY_RUN', regions: [] },
                { signal: ctrl.signal }
            )
            const data = r.data?.data || r.data
            const found = data?.findings || []
            const id = data?.scan_id

            setFindings(found)
            setScanId(id)
            setStatus('done')

            // Write to localStorage so scan survives F5 / Electron window reload
            // (sessionStorage is cleared on refresh by browser spec)
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    scan_id: id, findings: found, aws_id: awsId, db_id: dbId
                }))
            } catch { }
        } catch (err) {
            if (axios.isCancel(err) || err?.name === 'CanceledError') {
                setStatus('idle')
            } else {
                setStatus('error')
            }
        }
    }, [status])

    // ── Stop scan ──────────────────────────────────────────────────
    const stopScan = useCallback(() => {
        if (abortRef.current) abortRef.current.abort()
        clearInterval(timerRef.current)
        clearInterval(lineRef.current)
        clearInterval(factRef.current)
        setStatus('idle')
    }, [])

    // ── Reset ──────────────────────────────────────────────────────
    const resetScan = useCallback(() => {
        stopScan()
        setFindings([])
        setScanId(null)
        setElapsed(0)
        setScanMeta(null)
    }, [stopScan])

    // ── Restore from localStorage cache after F5 / Electron reload ──────────
    // Call this with the current cacheKey from Overview or ScannerSection on mount.
    // Only restores if the context is still in 'idle' (i.e. no active / fresh scan).
    const restoreFromCache = useCallback((cacheKey) => {
        if (status !== 'idle') return  // active or completed scan already in state
        try {
            const raw = localStorage.getItem(cacheKey)
            if (!raw) return
            const { scan_id, findings: f, aws_id, db_id } = JSON.parse(raw)
            if (Array.isArray(f) && f.length > 0) {
                setFindings(f)
                setScanId(scan_id)
                setStatus('done')
                setScanMeta({ awsId: aws_id, dbId: db_id, cacheKey })
            }
        } catch { }
    }, [status])

    // ── Inject a scan externally (used by WS handler / tests) ──────
    const injectScan = useCallback((scan_id, foundList, meta) => {
        setFindings(foundList)
        setScanId(scan_id)
        setStatus('done')
        if (meta) { setScanMeta(meta); scanMetaRef.current = meta }
    }, [])

    const value = {
        status, findings, scanId, elapsed,
        scanLineIdx, factIdx, factVisible,
        scanMeta, SCAN_REGIONS,
        highlightFindingId, setHighlightFindingId,
        refreshToken, latestScheduledScan,
        startScan, stopScan, resetScan, restoreFromCache, injectScan,
    }

    return <ScanCtx.Provider value={value}>{children}</ScanCtx.Provider>
}

export const useScan = () => useContext(ScanCtx)
