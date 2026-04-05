import axios from 'axios'

const api = axios.create({
    baseURL: 'http://localhost:8000',
    headers: { 'Content-Type': 'application/json' }
})

export const scanAPI = {
    runScan: (data) => api.post('/api/scan/', data),
}

export const threatAPI = {
    runThreatMonitor: (data) => api.post('/api/threats/', data),
    startMonitor: (data) => api.post('/api/threats/monitor/start', data),
    stopMonitor: (data) => api.post('/api/threats/monitor/stop', data),
    getStatus: () => api.get('/api/threats/monitor/status'),
}

export const executeAPI = {
    executeFix: (data) => api.post('/api/execute/', data),
}

export const rollbackAPI = {
    rollback: (data) => api.post('/api/rollback/', data),
}

export const historyAPI = {
    getAll: () => api.get('/api/history/'),
    getSummary: () => api.get('/api/history/summary'),
    getByResource: (id) => api.get(`/api/history/resource/${id}`),
}

export const analyticsAPI = {
    getRiskScore: () => api.get('/api/analytics/risk-score'),
    getRiskTrend: () => api.get('/api/analytics/risk-trend'),
    getAuditReport: () => api.get('/api/analytics/audit-report'),
    getPolicyViolations: () => api.get('/api/analytics/policy-violations'),
    enforcePolicies: (data) => api.post('/api/analytics/enforce-policies', data),
}

export const accountsAPI = {
    list: () => api.get('/api/accounts/'),
    create: (data) => api.post('/api/accounts/', data),
    createIamUser: (data) => api.post('/api/accounts/iam-users/', data),
    listIamUsers: () => api.get('/api/accounts/iam-users/'),
}

export const alertsAPI = {
    getAlerts: () => api.get('/api/alerts/'),
}

export default api