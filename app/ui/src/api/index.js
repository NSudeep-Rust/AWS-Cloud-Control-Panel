import axios from 'axios'

const BASE = 'http://localhost:8000'

const api = axios.create({ baseURL: BASE })

// ── Accounts API ─────────────────────────────────────────────────
export const accountsAPI = {
    // GET /api/accounts/ — list all root accounts
    list: () => api.get('/api/accounts/'),

    // POST /api/accounts/ — create root account
    create: (data) => api.post('/api/accounts/', data),

    // GET /api/accounts/iam-users/ — list all IAM users
    // ── FIX: This was missing — was why IAM users never showed in Sign In ──
    listIamUsers: () => api.get('/api/accounts/iam-users/'),

    // POST /api/accounts/iam-users/ — create IAM user
    createIamUser: (data) => api.post('/api/accounts/iam-users/', data),
}

// ── Scan API ────────────────────────────────────────────────────
export const scanAPI = {
    run: (data) => api.post('/api/scan/', data),
}

// ── Threat API ──────────────────────────────────────────────────
export const threatAPI = {
    analyze: (data) => api.post('/api/threats/', data),
    startMonitor: (data) => api.post('/api/threats/monitor/start', data),
    stopMonitor: () => api.post('/api/threats/monitor/stop'),
    monitorStatus: () => api.get('/api/threats/monitor/status'),
}

// ── Execute API ─────────────────────────────────────────────────
export const executeAPI = {
    run: (data) => api.post('/api/execute/', data),
}

// ── Rollback API ────────────────────────────────────────────────
export const rollbackAPI = {
    run: (data) => api.post('/api/rollback/', data),
}

// ── History API ─────────────────────────────────────────────────
export const historyAPI = {
    all: () => api.get('/api/history/'),
    summary: () => api.get('/api/history/summary'),
    byResource: (resourceId) => api.get(`/api/history/resource/${resourceId}`),
}

// ── Analytics API ───────────────────────────────────────────────
export const analyticsAPI = {
    riskScore: () => api.get('/api/analytics/risk-score'),
    riskTrend: () => api.get('/api/analytics/risk-trend'),
    auditReport: () => api.get('/api/analytics/audit-report'),
    policyViolations: () => api.get('/api/analytics/policy-violations'),
    enforcePolicies: (account_id) => api.post('/api/analytics/enforce-policies', null, { params: { account_id } }),
}

// ── Alerts API ──────────────────────────────────────────────────
export const alertsAPI = {
    all: () => api.get('/api/alerts/'),
}

export default api
