import os, re, py_compile

ROOT = r"p:/CloudSecurityPanel"
JSX_PATH = ROOT + "/app/ui/src/pages/AccountSetupPage.jsx"

# Read stripping BOM
raw = open(JSX_PATH, "rb").read()
if raw[:3] == b"\xef\xbb\xbf":
    raw = raw[3:]
    print("BOM stripped")
src = raw.decode("utf-8")

# ?? Replace all emojis with safe text equivalents ????????????????????????????
emoji_map = {
    "\U0001f511": "",   # key icon - remove (text label already there)
    "\U0001f5a5\ufe0f": "", # monitor
    "\U0001fab3": "",   # bucket
    "\U0001f6e1\ufe0f": "", # shield
    "\U0001f512": "",   # lock
    "\U0001f4a1": "",   # lightbulb
    "\u2299": "",       # circled dot (sign in tab)
    "\u26bf": "",       # iam user symbol
}
for em, rep in emoji_map.items():
    src = src.replace(em, rep)

# Fix tab labels to plain text (no symbol prefix)
src = src.replace("'+ Add Account'", "'+ Add Account'")   # already ok
src = src.replace("' Sign In'", "'Sign In'")
src = src.replace("' IAM User'", "'IAM User'")
src = src.replace("'? Sign In'", "'Sign In'")
src = src.replace("'? IAM User'", "'IAM User'")
# Also remove any remaining non-ASCII in label strings (belt+suspenders)
import unicodedata
def safe_label(s):
    # keep printable ASCII and common unicode, strip emoji
    return "".join(c for c in s if unicodedata.category(c)[0] != "So" and ord(c) < 0x1F900)

# ?? Fix FI component: add eye toggle (rewrite the whole FI function) ??????????
old_fi = """function FI({ value, onChange, placeholder, type = 'text' }) {
    const [show, setShow] = useState(false)
    const inputStyle = {
        background:'rgba(255,255,255,0.85)', border:'1.5px solid rgba(35,47,62,0.18)',
        borderRadius:6, padding:'8px 11px', color:'#16191f', fontSize:13, width:'100%',
        transition:'border-color 0.15s, box-shadow 0.15s',
        paddingRight: type === 'password' ? 38 : 11,
    }
    if (type !== 'password') return (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={inputStyle} />
    )
    return (
        <div style={{ position:'relative' }}>
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
                placeholder={placeholder} style={inputStyle} />
            <button type="button" onClick={() => setShow(s => !s)}
                style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)',
                         background:'none', border:'none', cursor:'pointer', padding:2,
                         color:'#687078', display:'flex', alignItems:'center' }}>
                {show ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
        </div>
    )
}"""

new_fi = """function FI({ value, onChange, placeholder, type = 'text' }) {
    const [show, setShow] = useState(false)
    const base = {
        background:'rgba(255,255,255,0.85)', border:'1.5px solid rgba(35,47,62,0.18)',
        borderRadius:6, color:'#16191f', fontSize:13, width:'100%',
        transition:'border-color 0.15s, box-shadow 0.15s',
    }
    if (type !== 'password') return (
        <input type="text" value={value} onChange={onChange} placeholder={placeholder}
            style={{ ...base, padding:'8px 11px' }} />
    )
    return (
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
                placeholder={placeholder}
                style={{ ...base, padding:'8px 38px 8px 11px', flex:1 }} />
            <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
                title={show ? 'Hide' : 'Show'}
                style={{ position:'absolute', right:8, background:'none', border:'none',
                         cursor:'pointer', padding:4, color:'#687078',
                         display:'flex', alignItems:'center', borderRadius:4,
                         transition:'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color='#FF9900'}
                onMouseLeave={e => e.currentTarget.style.color='#687078'}>
                {show
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
            </button>
        </div>
    )
}"""

# Check if old (correct) FI exists vs old (corrupted) FI
if "function FI(" in src:
    # Extract current FI function
    fi_start = src.index("function FI(")
    fi_end = src.index("\nfunction FS(")
    current_fi = src[fi_start:fi_end]
    print("Current FI length:", len(current_fi))
    src = src[:fi_start] + new_fi + "\n" + src[fi_end:]
    print("FI replaced with eye toggle SVG version")
else:
    print("WARNING: FI function not found!")

# ?? Write back UTF-8 without BOM ?????????????????????????????????????????????
out_bytes = src.encode("utf-8")  # no BOM
with open(JSX_PATH, "wb") as f:
    f.write(out_bytes)
print("Written UTF-8 no-BOM:", len(out_bytes), "bytes")

# Verify no BOM
check = open(JSX_PATH, "rb").read(3)
print("BOM check:", "CLEAN" if check != b"\xef\xbb\xbf" else "STILL HAS BOM")

# Also strip BOM from any other JSX/JS files that may have gotten it
import glob
for p in glob.glob(ROOT + "/app/ui/src/**/*.jsx", recursive=True) + \
         glob.glob(ROOT + "/app/ui/src/**/*.js", recursive=True):
    b = open(p, "rb").read()
    if b[:3] == b"\xef\xbb\xbf":
        open(p, "wb").write(b[3:])
        print("BOM stripped:", p.split("src/")[-1])

print("All done")
