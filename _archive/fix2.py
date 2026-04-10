import re

path = "p:/CloudSecurityPanel/app/ui/src/pages/AccountSetupPage.jsx"
with open(path, encoding="utf-8") as f:
    src = f.read()

# ?? Fix PANELS array icons (garbled emoji ? remove, keep service name) ?????
# Replace any icon field value containing non-ASCII chars with empty string
src = re.sub(r"icon:\s*'[^']*[^\x00-\x7F][^']*'", "icon: ''", src)

# ?? Fix tab labels (garbled prefix chars removed) ??????????????????????????
src = re.sub(r"label:\s*'[^']*[^\x00-\x7F][^']*Sign In[^']*'", "label: 'Sign In'", src)
src = re.sub(r"label:\s*'[^']*[^\x00-\x7F][^']*IAM User[^']*'", "label: 'IAM User'", src)
src = re.sub(r"label:\s*'[^']*[^\x00-\x7F][^']*Add Account[^']*'", "label: 'Add Account'", src)

# ?? Fix any remaining non-ASCII in string literals ?????????????????????????
# Replace garbled chars in PANELS 'desc' and 'facts' and 'title' (rare but belt+suspenders)
def clean_string_literal(m):
    s = m.group(0)
    cleaned = "".join(c if ord(c) < 128 else "" for c in s)
    return cleaned

# Only fix strings that contain BOTH non-ASCII AND visible garble patterns
# (avoid touching actual user-visible content that has real Unicode like arrows)
for bad in ["??", "??", "??", "??", "??", "???", "??", "??", "??", "??", "??"]:
    if bad in src:
        src = re.sub(re.escape(bad) + r"[^\x00-\x7F]*", "", src)

# ?? Ensure tab '+ Add Account' has correct label ??????????????????????????
src = re.sub(r"\{ id: 'new',\s+label: '[^']*'", "{ id: 'new',      label: '+ Add Account'", src)
src = re.sub(r"\{ id: 'existing',\s+label: '[^']*'", "{ id: 'existing', label: 'Sign In'", src)
src = re.sub(r"\{ id: 'iam',\s+label: '[^']*'", "{ id: 'iam',      label: 'IAM User'", src)

# ?? Final check: any remaining non-ASCII? ?????????????????????????????????
remaining = [(i+1, line) for i, line in enumerate(src.split("\n"))
             if any(ord(c) > 127 for c in line)]

print(f"Chars fixed. Remaining non-ASCII lines: {len(remaining)}")
if remaining:
    for ln, line in remaining[:10]:
        print(f"  Line {ln}: {repr(line[:80])}")

# ?? Write back as clean UTF-8 (no BOM) ???????????????????????????????????
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(src)
print("Written OK")
