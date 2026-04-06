// Operations.jsx — Scanner (real), Threats/Execute/Rollback (stubs)
export { ScannerSection } from '@/pages/sections/ScannerSection'

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

export function ThreatsSection({ onNav }) {
    return <ComingSoon title="Threat Monitor" icon="🛡️" desc="Live threat monitoring with start/stop control, real-time diff engine, and alert generation." color="#f59e0b" />
}

export function ExecuteSection({ onNav }) {
    return <ComingSoon title="Execute Fix" icon="⚡" desc="Dry-run and live execution engine for all 37 automated remediations with approval token flow." color="#FF9900" />
}

export function RollbackSection({ onNav }) {
    return <ComingSoon title="Rollback" icon="↩️" desc="Revert any executed fix using stored execution metadata. Full rollback for 34 of 37 actions." color="#e67e22" />
}
