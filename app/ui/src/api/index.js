import axios from 'axios'

const BASE = 'http://127.0.0.1:8000'

const api = axios.create({ baseURL: BASE })

export const accountsAPI = {
    list: () => api.get('/api/accounts/'),
    create: (data) => api.post('/api/accounts/', data),
    listIamUsers: () => api.get('/api/accounts/iam-users/'),
    createIamUser: (data) => api.post('/api/accounts/iam-users/', data),
}

export const scanAPI = {
    run: (data) => api.post('/api/scan/', data),
    findings: (accountId) => api.get('/api/scan/findings', { params: accountId ? { account_id: accountId } : {} }),
}

export const threatAPI = {
    analyze: (data) => api.post('/api/threats/', data),
    startMonitor: (data) => api.post('/api/threats/monitor/start', data),
    stopMonitor: () => api.post('/api/threats/monitor/stop'),
    monitorStatus: () => api.get('/api/threats/monitor/status'),
}

export const executeAPI = {
    run: (data) => api.post('/api/execute/', data),
    list: (accountId) => api.get('/api/execute/executions', { params: accountId ? { account_id: accountId } : {} }),
}

export const rollbackAPI = {
    run: (data) => api.post('/api/rollback/', data),
    list: (accountId) => api.get('/api/rollback/list', { params: accountId ? { account_id: accountId } : {} }),
}

export const historyAPI = {
    all: (accountId) => api.get('/api/history/', { params: accountId ? { account_id: accountId } : {} }),
    summary: (accountId) => api.get('/api/history/summary', { params: accountId ? { account_id: accountId } : {} }),
    byResource: (resourceId) => api.get(`/api/history/resource/${resourceId}`),
}

export const analyticsAPI = {
    riskScore:        (accountId) => api.get('/api/analytics/risk-score',        { params: accountId ? { account_id: accountId } : {} }),
    riskTrend:        (accountId) => api.get('/api/analytics/risk-trend',        { params: accountId ? { account_id: accountId } : {} }),
    auditReport:      (accountId) => api.get('/api/analytics/audit-report',      { params: accountId ? { account_id: accountId } : {} }),
    policyViolations: (accountId) => api.get('/api/analytics/policy-violations', { params: accountId ? { account_id: accountId } : {} }),
    breakdown:        (accountId) => api.get('/api/analytics/breakdown',         { params: accountId ? { account_id: accountId } : {} }),
    enforcePolicies:  (account_id) => api.post('/api/analytics/enforce-policies', null, { params: { account_id } }),
    complianceScore:  (accountId) => api.get('/api/analytics/compliance-score',  { params: accountId ? { account_id: accountId } : {} }),
}

export const driftAPI = {
    get:     (accountId) => api.get('/api/drift/',         { params: accountId ? { account_id: accountId } : {} }),
    history: (accountId, limit = 10) => api.get('/api/drift/history', { params: { ...(accountId ? { account_id: accountId } : {}), limit } }),
}

export const alertsAPI = {
    all: (accountId) => api.get('/api/alerts/', { params: accountId ? { account_id: accountId } : {} }),
    acknowledge: (alertId) => api.post(`/api/alerts/${alertId}/acknowledge`),
}

export const scheduleAPI = {
    get:     (accountDbId)         => api.get('/api/schedule/',         { params: { account_db_id: accountDbId } }),
    save:    (data)                => api.post('/api/schedule/',        data),
    runNow:  (accountDbId)         => api.post('/api/schedule/run-now', null, { params: { account_db_id: accountDbId } }),
    disable: (accountDbId)         => api.delete('/api/schedule/',      { params: { account_db_id: accountDbId } }),
}

export const emailAPI = {
    getConfig:   (accountId) => api.get('/api/email/config',     { params: accountId ? { account_id: accountId } : {} }),
    saveConfig:  (data)      => api.post('/api/email/config',    data),
    sendTest:    (accountId) => api.post('/api/email/test',      null, { params: accountId ? { account_id: accountId } : {} }),
    sendAlert:   (accountId) => api.post('/api/email/send-alert',null, { params: accountId ? { account_id: accountId } : {} }),
}

export default api
