// DataSections.jsx — History, Analytics, Alerts section stubs

function ComingSoon({ title, icon, desc, color = '#FF9900' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>{icon}</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text3)', maxWidth: 400, lineHeight: 1.6 }}>{desc}</p>
            <div style={{ fontSize: 12, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 6, padding: '6px 16px', fontWeight: 600 }}>
                Coming in next build phase
            </div>
        </div>
    )
}

export function HistorySection({ onNav }) {
    return <ComingSoon title="History" icon="📋" desc="Full remediation history with event log, resource-level drill-down, and execution timeline." color="#8B5CF6" />
}

export function AnalyticsSection({ onNav }) {
    return <ComingSoon title="Analytics" icon="📊" desc="Risk score trends, audit reports, policy violation analysis, and compliance ratings." color="#0972d3" />
}

export function AlertsSection({ onNav }) {
    return <ComingSoon title="Alerts" icon="🔔" desc="Real-time alerts from the threat monitor — CRITICAL and HIGH severity findings trigger instant notifications." color="#d13212" />
}
