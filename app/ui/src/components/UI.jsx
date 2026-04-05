import React, { useState } from 'react'

export function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', ...style }}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{children}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text2)' }}>{subtitle}</p>}
    </div>
  )
}

export function Field({ label, children, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
        {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export function PrimaryBtn({ children, onClick, loading, disabled, danger, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 22px', borderRadius: 8,
        background: danger ? 'var(--danger)' : 'var(--accent)',
        color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--sans)',
        opacity: (disabled || loading) ? 0.6 : 1,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        boxShadow: danger ? '0 2px 12px rgba(239,68,68,0.25)' : '0 2px 12px rgba(59,130,246,0.25)',
        transition: 'opacity 0.2s',
        ...style,
      }}>
      {loading && <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />}
      {children}
    </button>
  )
}

export function SecondaryBtn({ children, onClick, style }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 22px', borderRadius: 8,
        background: 'var(--bg4)', color: 'var(--text2)',
        border: '1px solid var(--border2)',
        fontSize: 14, fontWeight: 500, fontFamily: 'var(--sans)',
        transition: 'background 0.2s',
        ...style,
      }}>
      {children}
    </button>
  )
}

export function Badge({ children, type = 'default' }) {
  const colors = {
    default: { bg: 'var(--bg4)', color: 'var(--text2)', border: 'var(--border)' },
    success: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', border: 'rgba(16,185,129,0.25)' },
    danger: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' },
    warn: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
    info: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  }
  const c = colors[type] || colors.default
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)',
      padding: '3px 8px', borderRadius: 4,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
    }}>
      {children}
    </span>
  )
}

export function ResponseBox({ data, error }) {
  if (!data && !error) return null
  return (
    <div style={{
      marginTop: 16,
      background: error ? 'rgba(239,68,68,0.06)' : 'var(--bg)',
      border: `1px solid ${error ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
      borderRadius: 8, padding: '14px 16px',
      fontFamily: 'var(--mono)', fontSize: 12,
      color: error ? '#f87171' : 'var(--text2)',
      maxHeight: 200, overflowY: 'auto',
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }}>
      {error || JSON.stringify(data, null, 2)}
    </div>
  )
}

export function StatCard({ label, value, sub, type = 'default' }) {
  const accent = {
    default: 'var(--accent)',
    danger: 'var(--danger)',
    success: 'var(--accent3)',
    warn: 'var(--warn)',
  }[type]
  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px',
      borderTop: `2px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: 'var(--mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
