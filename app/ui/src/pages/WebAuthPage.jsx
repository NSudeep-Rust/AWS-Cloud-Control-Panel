import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const CSS = `
  @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes blobA   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.08) translate(20px,-15px)} }
  @keyframes blobB   { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.05) translate(-15px,20px)} }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  *,*::before,*::after{box-sizing:border-box;font-family:'Amazon Ember','Segoe UI',-apple-system,sans-serif}
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(35,47,62,.15);border-radius:4px}
  input{outline:none} input:focus{border-color:#FF9900 !important; box-shadow:0 0 0 3px rgba(255,153,0,0.12) !important}
`

const FEATURES = [
  { icon: '🔑', label: 'IAM Auditing',     desc: 'Users, roles, policies & access keys' },
  { icon: '🪣', label: 'S3 Security',      desc: 'Bucket ACLs, public access & policies' },
  { icon: '🖥️', label: 'EC2 Scanning',    desc: 'Instances, security groups & EBS' },
  { icon: '🛡️', label: 'VPC Analysis',    desc: 'Flow logs, NACLs & route tables' },
  { icon: '🔐', label: 'Encryption',       desc: 'KMS key rotation & compliance' },
  { icon: '📋', label: 'CloudTrail',       desc: 'Logging, encryption & trail status' },
]

export default function WebAuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab]         = useState('login')   // login | register | forgot | reset
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [pass2, setPass2]     = useState('')
  const [resetToken, setResetToken] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState(null)       // { type:'error'|'success', text }
  const glowOuter = useRef(null)
  const glowInner = useRef(null)

  // Handle OAuth callback token OR oauth_error OR reset_token in URL
  useEffect(() => {
    const token      = searchParams.get('token')
    const email      = searchParams.get('email')
    const oauthErr   = searchParams.get('oauth_error')
    const resetTok   = searchParams.get('reset_token')

    if (token) {
      localStorage.setItem('cloudshield_web_token', token)
      if (email) localStorage.setItem('cloudshield_web_email', email)
      navigate('/')
    } else if (oauthErr) {
      setMsg({ type: 'error', text: decodeURIComponent(oauthErr) })
    } else if (resetTok) {
      setResetToken(resetTok)
      setTab('reset')
    }
  }, [])

  // UFL mouse glow
  useEffect(() => {
    let raf = null
    const move = e => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        glowOuter.current?.style && (glowOuter.current.style.transform = `translate(${e.clientX-250}px,${e.clientY-250}px)`)
        glowInner.current?.style && (glowInner.current.style.transform = `translate(${e.clientX-70}px,${e.clientY-70}px)`)
        raf = null
      })
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => { window.removeEventListener('mousemove', move); if (raf) cancelAnimationFrame(raf) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    if (tab === 'register' && pass !== pass2) return setMsg({ type:'error', text:'Passwords do not match' })
    if (pass.length < 8 && tab !== 'forgot' && tab !== 'reset') return setMsg({ type:'error', text:'Password must be at least 8 characters' })
    setLoading(true)
    try {
      if (tab === 'forgot') {
        const r = await fetch(`${API}/api/auth/forgot-password`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Error')
        setMsg({ type:'success', text:'Reset link sent! Check your email inbox.' })
      } else if (tab === 'reset') {
        if (pass !== pass2) return setMsg({ type:'error', text:'Passwords do not match' })
        const r = await fetch(`${API}/api/auth/reset-password`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token: resetToken, new_password: pass })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Error')
        setMsg({ type:'success', text:'Password reset! You can now sign in.' })
        setTab('login'); setPass(''); setPass2('')
      } else if (tab === 'register') {
        const r = await fetch(`${API}/api/auth/register`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email, password: pass })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Registration failed')
        localStorage.setItem('cloudshield_web_token', d.access_token)
        localStorage.setItem('cloudshield_web_email', d.email)
        navigate('/setup')
      } else {
        const form = new FormData()
        form.append('username', email); form.append('password', pass)
        const r = await fetch(`${API}/api/auth/login`, { method:'POST', body: form })
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || 'Login failed')
        localStorage.setItem('cloudshield_web_token', d.access_token)
        localStorage.setItem('cloudshield_web_email', d.email)
        navigate('/')
      }
    } catch(err) { setMsg({ type:'error', text: err.message }) }
    finally { setLoading(false) }
  }

  // OAuth — check if configured first, then redirect
  async function handleOAuth(provider) {
    setMsg(null)
    try {
      const r = await fetch(`${API}/api/auth/${provider}/check`)
      const d = await r.json()
      if (!d.configured) {
        setMsg({ type:'error', text: `${provider.charAt(0).toUpperCase()+provider.slice(1)} OAuth is not configured yet on the server. Use email/password for now.` })
        return
      }
      window.location.href = `${API}/api/auth/${provider}`
    } catch {
      setMsg({ type:'error', text: 'Could not reach the server. Try again.' })
    }
  }

  return (
    <div style={s.root}>
      <style>{CSS}</style>

      {/* Background */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:'radial-gradient(circle,rgba(180,110,0,0.18) 1.5px,transparent 1.5px)',
        backgroundSize:'22px 22px' }} />
      <div style={{ position:'absolute', bottom:-180, left:-140, width:680, height:680, borderRadius:'50%',
        pointerEvents:'none', animation:'blobA 9s ease-in-out infinite',
        background:'radial-gradient(circle,rgba(255,153,0,0.07) 0%,rgba(255,153,0,0.02) 45%,transparent 70%)' }} />
      <div style={{ position:'absolute', top:-140, right:-120, width:560, height:560, borderRadius:'50%',
        pointerEvents:'none', animation:'blobB 12s ease-in-out infinite',
        background:'radial-gradient(circle,rgba(255,180,40,0.05) 0%,transparent 70%)' }} />
      <div ref={glowOuter} style={{ position:'absolute', left:0, top:0, width:500, height:500, borderRadius:'50%',
        background:'radial-gradient(circle,rgba(255,180,0,0.20) 0%,rgba(255,160,0,0.10) 30%,transparent 80%)',
        pointerEvents:'none', zIndex:0, willChange:'transform' }} />
      <div ref={glowInner} style={{ position:'absolute', left:0, top:0, width:140, height:140, borderRadius:'50%',
        background:'radial-gradient(circle,rgba(255,210,50,0.38) 0%,transparent 70%)',
        pointerEvents:'none', zIndex:0, willChange:'transform' }} />

      {/* Layout */}
      <div style={s.layout}>

        {/* LEFT — Features */}
        <div style={{ ...s.sideCard, animation:'fadeUp 0.4s ease 0.1s both' }}>
          <div style={s.sideTitle}>🛡️ What We Protect</div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={s.featureRow}>
                <span style={{ fontSize:15 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:'#16191f' }}>{f.label}</div>
                  <div style={{ fontSize:9, color:'#687078', lineHeight:1.4 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={s.divLine} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
            {[['52+','Checks'],['9','Regions'],['32','AZs'],['100%','Free']].map(([v,l]) => (
              <div key={l} style={{ textAlign:'center', padding:'6px 4px', borderRadius:6,
                background:'rgba(255,153,0,0.06)', border:'1px solid rgba(255,153,0,0.18)' }}>
                <div style={{ fontSize:15, fontWeight:900, color:'#FF9900', fontFamily:'monospace',
                  background:'linear-gradient(90deg,#FF9900,#ffb84d,#FF9900)', backgroundSize:'200%',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'shimmer 3s linear infinite' }}>{v}</div>
                <div style={{ fontSize:9, color:'#687078', textTransform:'uppercase', letterSpacing:.6 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — Auth Card */}
        <div style={{ ...s.card, animation:'fadeUp 0.4s ease both' }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <svg viewBox="0 0 130 52" width="130" height="52" style={{ display:'inline-block' }}>
              <text x="65" y="36" textAnchor="middle" fill="#232F3E" fontSize="38" fontWeight="bold" fontFamily="Arial,sans-serif">aws</text>
              <path d="M20 43 Q65 57 110 43" fill="none" stroke="#FF9900" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M105 39 L110 43 L105 47" fill="none" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ height:1, background:'rgba(255,153,0,0.2)', margin:'10px 0 12px' }} />
            <div style={{ fontSize:22, fontWeight:900, color:'#16191f', letterSpacing:-.5 }}>CloudShield</div>
            <div style={{ fontSize:12, color:'#687078', marginTop:4 }}>AWS Security Monitoring & Remediation</div>
          </div>

          {/* Tabs (not for forgot) */}
          {tab !== 'forgot' && tab !== 'reset' && (
            <div style={{ display:'flex', background:'rgba(35,47,62,0.05)', borderRadius:8, padding:3, marginBottom:18 }}>
              {['login','register'].map(t => (
                <button key={t} onClick={() => { setTab(t); setMsg(null) }}
                  style={{ flex:1, padding:'8px 0', borderRadius:6, border:'none', cursor:'pointer', fontSize:12,
                    fontWeight:700, transition:'all 0.18s',
                    background: tab===t ? '#fff' : 'transparent',
                    color: tab===t ? '#FF9900' : '#687078',
                    boxShadow: tab===t ? '0 1px 6px rgba(0,0,0,0.1)' : 'none' }}>
                  {t === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          {tab === 'forgot' && (
            <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={() => { setTab('login'); setMsg(null) }}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#687078', fontSize:18, padding:0 }}>←</button>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:'#16191f' }}>Reset Password</div>
                <div style={{ fontSize:11, color:'#687078' }}>Enter your email to receive a reset link</div>
              </div>
            </div>
          )}

          {tab === 'reset' && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#16191f' }}>Set New Password</div>
              <div style={{ fontSize:11, color:'#687078' }}>Choose a strong password for your account</div>
            </div>
          )}

          {/* Error / Success */}
          {msg && (
            <div style={{ padding:'9px 12px', borderRadius:7, marginBottom:14, fontSize:12, fontWeight:600,
              background: msg.type==='error' ? 'rgba(209,50,18,0.08)' : 'rgba(6,115,64,0.08)',
              border: `1px solid ${msg.type==='error' ? 'rgba(209,50,18,0.25)' : 'rgba(6,115,64,0.25)'}`,
              color: msg.type==='error' ? '#d13212' : '#067340' }}>
              {msg.type==='error' ? '⚠ ' : '✓ '}{msg.text}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <Label>Email address</Label>
            <input id="auth-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@example.com" style={s.input} />

            {tab !== 'forgot' && tab !== 'reset' && (
              <>
                <Label>Password</Label>
                <div style={{ position:'relative' }}>
                  <input id="auth-password" type={showPw?'text':'password'} required value={pass}
                    onChange={e=>setPass(e.target.value)} placeholder="Min. 8 characters" style={s.input} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer', color:'#687078', fontSize:12 }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </>
            )}

            {(tab === 'reset') && (
              <>
                <Label>New Password</Label>
                <input id="auth-new-pass" type={showPw?'text':'password'} required value={pass}
                  onChange={e=>setPass(e.target.value)} placeholder="Min. 8 characters" style={s.input} />
                <Label>Confirm New Password</Label>
                <input id="auth-confirm-new" type={showPw?'text':'password'} required value={pass2}
                  onChange={e=>setPass2(e.target.value)} placeholder="Repeat password" style={s.input} />
              </>
            )}

            {tab === 'register' && (
              <>
                <Label>Confirm password</Label>
                <input id="auth-confirm" type={showPw?'text':'password'} required value={pass2}
                  onChange={e=>setPass2(e.target.value)} placeholder="Repeat password" style={s.input} />
              </>
            )}

            {tab === 'login' && (
              <div style={{ textAlign:'right', marginBottom:14, marginTop:-8 }}>
                <button type="button" onClick={() => { setTab('forgot'); setMsg(null) }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#687078',
                    fontSize:11, fontWeight:600, textDecoration:'underline' }}>
                  Forgot password?
                </button>
              </div>
            )}

            <button id="auth-submit" type="submit" disabled={loading}
              style={{ ...s.btnPrimary, opacity: loading ? 0.75 : 1 }}>
              {loading
                ? <span style={{ display:'inline-block', width:16, height:16, border:'2.5px solid #232F3E',
                    borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                : tab==='login'    ? 'Sign In →'
                : tab==='register' ? 'Create Account →'
                : tab==='reset'    ? 'Set New Password →'
                : 'Send Reset Link →'}
            </button>
          </form>

          {/* OAuth divider */}
          {tab !== 'forgot' && tab !== 'reset' && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
                <div style={{ flex:1, height:1, background:'rgba(35,47,62,0.12)' }} />
                <span style={{ fontSize:11, color:'#8a9aaa', fontWeight:600 }}>or continue with</span>
                <div style={{ flex:1, height:1, background:'rgba(35,47,62,0.12)' }} />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button id="oauth-google" type="button" onClick={() => handleOAuth('google')} style={s.oauthBtn}>
                  <svg width="16" height="16" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.3 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13 17.8 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.1z"/>
                    <path fill="#FBBC05" d="M10.6 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z"/>
                    <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.6-5.9c-2 1.4-4.7 2.2-7.6 2.2-6.2 0-11.4-4.2-13.3-9.9l-8.1 6.2C6.6 42.6 14.6 48 24 48z"/>
                  </svg>
                  Google
                </button>
                <button id="oauth-github" type="button" onClick={() => handleOAuth('github')} style={s.oauthBtn}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#24292e">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.4.6.1.82-.26.82-.58v-2.2c-3.34.72-4.04-1.6-4.04-1.6-.54-1.38-1.33-1.74-1.33-1.74-1.08-.74.08-.73.08-.73 1.2.09 1.83 1.23 1.83 1.23 1.06 1.82 2.8 1.3 3.48.99.1-.77.41-1.3.75-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.28-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  GitHub
                </button>
              </div>
            </>
          )}

          {/* Footer note */}
          {tab === 'register' && (
            <p style={{ fontSize:10, color:'#8a9aaa', textAlign:'center', marginTop:14, lineHeight:1.5 }}>
              By creating an account you agree to our Terms of Service.<br/>
              Your AWS credentials are encrypted and stored securely.
            </p>
          )}

          <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:14, flexWrap:'wrap' }}>
            {['cloudshield.me','FastAPI','PostgreSQL'].map(b => (
              <span key={b} style={{ fontSize:10, fontFamily:'monospace', color:'#687078',
                background:'rgba(35,47,62,0.05)', border:'1px solid rgba(35,47,62,0.12)',
                borderRadius:3, padding:'2px 7px' }}>{b}</span>
            ))}
          </div>
        </div>

        {/* RIGHT — Trust signals */}
        <div style={{ ...s.sideCard, animation:'fadeUp 0.4s ease 0.2s both' }}>
          <div style={s.sideTitle}>✅ Why CloudShield</div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { icon:'🔒', title:'Your keys, your control', desc:'AWS credentials are encrypted with Fernet AES-128. We never share them.' },
              { icon:'🚀', title:'30-second full scan', desc:'Parallel multi-region scanning across 9 regions and 32 AZs simultaneously.' },
              { icon:'🤖', title:'Auto-remediation', desc:'One-click fixes for misconfigurations with full rollback support.' },
              { icon:'📧', title:'Real-time alerts', desc:'Email notifications for critical findings and security drift detection.' },
              { icon:'📊', title:'Compliance reports', desc:'CIS, PCI-DSS & NIST frameworks with downloadable HTML reports.' },
            ].map(item => (
              <div key={item.title} style={s.featureRow}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:'#16191f', marginBottom:2 }}>{item.title}</div>
                  <div style={{ fontSize:9, color:'#687078', lineHeight:1.4 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={s.divLine} />
          <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(6,115,64,0.06)',
            border:'1px solid rgba(6,115,64,0.2)', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#067340', fontWeight:700 }}>🌐 cloudshield.me</div>
            <div style={{ fontSize:9, color:'#687078', marginTop:3 }}>Secured with HTTPS · DigitalOcean hosting</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:'#414d5c', marginBottom:5, marginTop:12 }}>{children}</div>
}

const s = {
  root: {
    height:'100vh', width:'100vw', display:'flex', alignItems:'center', justifyContent:'center',
    background:'linear-gradient(160deg,#fafaf8 0%,#f8f8f6 50%,#f6f6f4 100%)',
    overflow:'hidden', position:'relative',
  },
  layout: {
    display:'grid', gridTemplateColumns:'1fr 1.4fr 1fr', gap:18, alignItems:'center',
    padding:'0 28px', width:'100%', maxWidth:960, position:'relative', zIndex:1,
  },
  card: {
    background:'rgba(255,255,255,0.88)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
    border:'1.5px solid rgba(255,153,0,0.22)', borderRadius:12, padding:'24px 26px',
    boxShadow:'0 8px 40px rgba(180,100,0,0.13)',
  },
  sideCard: {
    background:'rgba(255,255,255,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
    border:'1.5px solid rgba(255,153,0,0.16)', borderRadius:12, padding:'16px 14px',
    boxShadow:'0 4px 20px rgba(180,100,0,0.09)', display:'flex', flexDirection:'column', gap:0,
  },
  sideTitle: {
    fontSize:11, fontWeight:800, color:'#232F3E', textTransform:'uppercase',
    letterSpacing:1, marginBottom:12, display:'flex', alignItems:'center', gap:6,
  },
  divLine: { height:1, background:'rgba(180,100,0,0.11)', margin:'12px 0' },
  featureRow: {
    display:'flex', alignItems:'flex-start', gap:9, padding:'8px 9px', borderRadius:7,
    background:'rgba(35,47,62,0.03)', border:'1px solid rgba(35,47,62,0.07)', transition:'all 0.15s',
  },
  input: {
    width:'100%', padding:'9px 12px', borderRadius:7, fontSize:13,
    border:'1.5px solid rgba(35,47,62,0.18)', background:'rgba(255,255,255,0.9)',
    color:'#16191f', marginBottom:4, transition:'all 0.15s', display:'block',
  },
  btnPrimary: {
    display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%',
    padding:'11px 18px', background:'#FF9900', color:'#232F3E', border:'2px solid #FF9900',
    borderRadius:7, fontSize:13, fontWeight:800, cursor:'pointer', marginTop:6,
    boxShadow:'0 3px 14px rgba(255,153,0,0.38)', transition:'all 0.15s',
  },
  oauthBtn: {
    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    padding:'9px 14px', borderRadius:7, border:'1.5px solid rgba(35,47,62,0.18)',
    background:'rgba(255,255,255,0.8)', color:'#16191f', fontSize:12, fontWeight:700,
    cursor:'pointer', textDecoration:'none', transition:'all 0.15s',
  },
}
