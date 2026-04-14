import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

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
    const [status, setStatus] = useState('idle')
    const [findings, setFindings] = useState([])
    const [scanId, setScanId] = useState(null)
    const [elapsed, setElapsed] = useState(0)
    const [scanLineIdx, setScanLineIdx] = useState(0)
    const [factIdx, setFactIdx] = useState(0)
    const [factVisible, setFactVisible] = useState(true)

    const [scanMeta, setScanMeta] = useState(null) // { awsId, dbId, cacheKey }

    const [highlightFindingId, setHighlightFindingId] = useState(null)

    const timerRef  = useRef(null)
    const factRef   = useRef(null)
    const abortRef  = useRef(null)  // AbortController
    const wsRef     = useRef(null)  // WebSocket for push events
    const scanMetaRef = useRef(null) // always up-to-date copy for WS closure

    const [refreshToken, setRefreshToken]       = useState(0)
    const [latestScheduledScan, setLatestScheduledScan] = useState(null)

    useEffect(() => {
        function connect() {
            try {
                const ws = new WebSocket('ws://127.0.0.1:8000/ws/alerts')
                wsRef.current = ws

                ws.onmessage = (e) => {
                    try {
                        const msg = JSON.parse(e.data)

                        if (msg.event === 'scan_complete') {
                            // Update findings for BOTH manual and scheduled scans.
                            // Previously only updated when currentMeta was set (manual scan only).
                            // scan_id equality check guards against cross-account contamination.
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

    // scanLineIdx is derived from elapsed — no separate interval needed.
    // This keeps it perfectly in sync with the real elapsed timer.

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

    const startScan = useCallback(async ({ dbId, awsId, cacheKey }) => {
        if (status === 'scanning') return   // already running — do nothing

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

    const stopScan = useCallback(() => {
        if (abortRef.current) abortRef.current.abort()
        clearInterval(timerRef.current)
        clearInterval(factRef.current)
        setStatus('idle')
    }, [])

    const resetScan = useCallback(() => {
        stopScan()
        setFindings([])
        setScanId(null)
        setElapsed(0)
        setScanMeta(null)
    }, [stopScan])

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

    const injectScan = useCallback((scan_id, foundList, meta) => {
        setFindings(foundList)
        setScanId(scan_id)
        setStatus('done')
        if (meta) { setScanMeta(meta); scanMetaRef.current = meta }
    }, [])

    const value = {
        status, findings, scanId, elapsed,
        // scanLineIdx derived from elapsed — always in sync, no drift
        scanLineIdx: Math.min(24, Math.floor(elapsed / 4)),
        factIdx, factVisible,
        scanMeta, SCAN_REGIONS,
        highlightFindingId, setHighlightFindingId,
        refreshToken, latestScheduledScan,
        startScan, stopScan, resetScan, restoreFromCache, injectScan,
    }

    return <ScanCtx.Provider value={value}>{children}</ScanCtx.Provider>
}

export const useScan = () => useContext(ScanCtx)
