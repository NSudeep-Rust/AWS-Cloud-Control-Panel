"""
CloudShield Updater — checks GitHub Releases for a newer version,
downloads the installer zip, extracts into the install folder, restarts the app.

Compiled separately:
    pyinstaller updater.spec
"""
import sys, os, json, subprocess, zipfile, shutil, time, threading
from pathlib import Path
from tkinter import Tk, ttk, messagebox, Label, Frame, Button, StringVar

import ssl
import urllib.request
import urllib.error

# ── SSL-tolerant request helper ───────────────────────────────────────────────
def _open_url(url: str, headers: dict | None = None, timeout: int = 20):
    """Open a URL with proper SSL; falls back to fully unverified SSL for
    environments without a system cert store (e.g. Windows Sandbox, PyInstaller bundles)."""
    req = urllib.request.Request(url, headers=headers or {})
    last_exc = None
    for verify in (True, False):
        try:
            if verify:
                ctx = ssl.create_default_context()
            else:
                ctx = ssl._create_unverified_context()
                ctx.check_hostname = False          # fix SSL error 1001 in Sandbox
                ctx.verify_mode   = ssl.CERT_NONE  # skip cert verification entirely
            return urllib.request.urlopen(req, timeout=timeout, context=ctx)
        except Exception as e:
            last_exc = e
            if verify:
                continue   # retry without SSL verification
    raise last_exc         # surface the real error if both fail

# ── Constants ────────────────────────────────────────────────────────────────
GITHUB_API  = "https://api.github.com/repos/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest"
APP_EXE     = "CloudShield.exe"

# When packaged with PyInstaller --onefile, sys.executable IS CloudShield-Updater.exe.
# Its parent directory is the installation folder (e.g. C:\Program Files\CloudShield\).
INSTALL_DIR = Path(os.path.dirname(sys.executable))

# ── Version helpers ───────────────────────────────────────────────────────────
def _parse_version(v: str):
    """Convert '1.10.3' → (1, 10, 3) for correct numeric comparison."""
    try:
        return tuple(int(x) for x in v.strip().lstrip("v").split("."))
    except Exception:
        return (0, 0, 0)

def current_version() -> str:
    """Read version from install dir.  Checks both possible locations."""
    candidates = [
        INSTALL_DIR / "VERSION",                              # installed by setup.iss
        INSTALL_DIR / "cloudshield-backend" / "VERSION",     # fallback (legacy path)
        INSTALL_DIR / "cloudshield-backend" / "_internal" / "VERSION",
    ]
    for f in candidates:
        try:
            v = f.read_text(encoding="utf-8").strip()
            if v:
                return v
        except Exception:
            pass
    return "1.0.1"

# ── GitHub API ────────────────────────────────────────────────────────────────
def fetch_latest() -> tuple[str, str, str | None]:
    """Returns (tag_str, release_body, zip_download_url_or_None)."""
    with _open_url(GITHUB_API, headers={"User-Agent": "CloudShield-Updater/1.0"}) as r:
        data = json.loads(r.read())

    tag    = data.get("tag_name", "0.0.0").lstrip("v")
    body   = data.get("body", "").strip() or "No release notes provided."
    assets = data.get("assets", [])

    # Prefer an asset whose name contains 'update' and ends with .zip,
    # fall back to any .zip asset.
    dl_url = next(
        (a["browser_download_url"] for a in assets
         if "update" in a["name"].lower() and a["name"].endswith(".zip")),
        None
    )
    if dl_url is None:
        dl_url = next(
            (a["browser_download_url"] for a in assets if a["name"].endswith(".zip")),
            None
        )
    return tag, body, dl_url

# ── Download + apply ──────────────────────────────────────────────────────────
def _kill_main_app():
    """Terminate CloudShield.exe (and its backend) so files can be overwritten."""
    for exe in ("CloudShield.exe", "cloudshield-backend.exe"):
        try:
            subprocess.run(
                ["taskkill", "/F", "/IM", exe, "/T"],
                capture_output=True, timeout=10
            )
        except Exception:
            pass
    time.sleep(3.0)  # give Windows time to fully release file handles

def download_and_apply(url: str, progress_cb, status_cb):
    tmp = Path(os.environ.get("TEMP", ".")) / "cloudshield_update.zip"
    extract_dir = Path(os.environ.get("TEMP", ".")) / "cloudshield_update_tmp"

    # ── 1. Download ──────────────────────────────────────────────────────────
    status_cb("Downloading update…")
    total_bytes = 0
    downloaded  = 0
    CHUNK = 65536  # 64 KB
    with _open_url(url, headers={"User-Agent": "CloudShield-Updater/1.0"}, timeout=120) as resp:
        total_bytes = int(resp.headers.get('Content-Length', 0))
        with open(tmp, 'wb') as f:
            while True:
                chunk = resp.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total_bytes > 0:
                    progress_cb(min(int(downloaded * 99 / total_bytes), 99))
    progress_cb(100)

    # ── 2. Extract ───────────────────────────────────────────────────────────
    status_cb("Extracting archive…")
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile(tmp, "r") as z:
        z.extractall(extract_dir)

    # GitHub releases often wrap everything in a single root folder inside the zip.
    # Detect and unwrap that folder so we copy files directly.
    children = list(extract_dir.iterdir())
    source_root = extract_dir
    if len(children) == 1 and children[0].is_dir():
        source_root = children[0]

    # ── 3. Kill the running app BEFORE overwriting files ────────────────────
    status_cb("Closing CloudShield to apply update…")
    _kill_main_app()

    # ── 4. Copy files into install dir ──────────────────────────────────────
    status_cb("Applying update…")
    errors = []
    for item in source_root.rglob("*"):
        rel  = item.relative_to(source_root)
        dest = INSTALL_DIR / rel
        if item.is_dir():
            dest.mkdir(parents=True, exist_ok=True)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            # Retry up to 3 times for locked files (Windows needs extra time to clear handles)
            for attempt in range(3):
                try:
                    shutil.copy2(item, dest)
                    break
                except PermissionError:
                    if attempt < 2:
                        time.sleep(1.0)   # wait 1s and retry
                    else:
                        errors.append(f"Skipped (locked): {rel}")
                except Exception as e:
                    errors.append(f"Error {rel}: {e}")
                    break

    # ── 5. Cleanup ───────────────────────────────────────────────────────────
    shutil.rmtree(extract_dir, ignore_errors=True)
    try:
        tmp.unlink()
    except Exception:
        pass

    if errors:
        status_cb(f"Done (with {len(errors)} warning(s))")
    else:
        status_cb("Update applied successfully!")

# ── GUI ───────────────────────────────────────────────────────────────────────
BG      = "#0a1628"
BG2     = "#0d1f38"
ORANGE  = "#FF9900"
GRAY    = "#8d9191"
WHITE   = "#e6edf3"
GREEN   = "#1d8102"

class UpdaterUI:
    def __init__(self):
        self.root = Tk()
        self.root.title("CloudShield Updater")
        self.root.geometry("480x340")
        self.root.resizable(False, False)
        self.root.configure(bg=BG)
        try:
            # Use the same icon.ico that's in the installation folder next to this EXE
            icon_path = INSTALL_DIR / "resources" / "app" / "icon.ico"
            if icon_path.exists():
                self.root.iconbitmap(str(icon_path))
        except Exception:
            pass
        self._dl_url = None
        self._build_ui()
        self.root.after(300, self._check)

    def _build_ui(self):
        # ── Header ──────────────────────────────────────────────────────────
        hdr = Frame(self.root, bg=BG, pady=10)
        hdr.pack(fill="x", padx=24, pady=(20, 0))

        Label(hdr, text="🛡️  CloudShield Updater",
              bg=BG, fg=ORANGE,
              font=("Segoe UI", 15, "bold")).pack(anchor="w")

        cur = current_version()
        Label(hdr, text=f"Installed version: v{cur}",
              bg=BG, fg=GRAY,
              font=("Segoe UI", 9)).pack(anchor="w", pady=(2, 0))

        # ── Status line ──────────────────────────────────────────────────────
        self.status_var = StringVar(value="Checking for updates…")
        Label(self.root, textvariable=self.status_var,
              bg=BG, fg=WHITE,
              font=("Segoe UI", 10)).pack(pady=(14, 4))

        # ── Release notes ────────────────────────────────────────────────────
        import tkinter as tk
        self.notes = tk.Text(
            self.root, height=6, width=56,
            bg=BG2, fg="#ccc", relief="flat",
            font=("Segoe UI", 9), wrap="word",
            state="disabled", borderwidth=0,
            highlightbackground=BG2
        )
        self.notes.pack(padx=24)

        # ── Progress bar ─────────────────────────────────────────────────────
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("orange.Horizontal.TProgressbar",
                         troughcolor=BG2, background=ORANGE, bordercolor=BG2)
        self.bar = ttk.Progressbar(
            self.root, length=432, mode="determinate",
            style="orange.Horizontal.TProgressbar"
        )
        self.bar.pack(pady=14, padx=24)

        # ── Button ───────────────────────────────────────────────────────────
        self.btn = Button(
            self.root, text="Update Now", state="disabled",
            bg=ORANGE, fg="#0a1628", activebackground="#e07b00",
            font=("Segoe UI", 11, "bold"),
            relief="flat", cursor="hand2", padx=20, pady=8,
            command=self._do_update
        )
        self.btn.pack()

        Label(self.root,
              text="CloudShield will close briefly during update and relaunch automatically.",
              bg=BG, fg=GRAY, font=("Segoe UI", 8)).pack(pady=(8, 0))

    def _set_notes(self, text: str):
        self.notes.configure(state="normal")
        self.notes.delete("1.0", "end")
        self.notes.insert("end", text)
        self.notes.configure(state="disabled")

    def _check(self):
        def run():
            try:
                tag, notes, url = fetch_latest()
                cur = current_version()
                if _parse_version(tag) > _parse_version(cur):
                    self.root.after(0, lambda: self.status_var.set(
                        f"✅  New version available: v{tag}  (you have v{cur})"
                    ))
                    self.root.after(0, lambda: self._set_notes(notes))
                    self._dl_url = url
                    can_update = url is not None
                    self.root.after(0, lambda: self.btn.configure(
                        state="normal" if can_update else "disabled",
                        text="Update Now" if can_update else "No download available"
                    ))
                    if not can_update:
                        self.root.after(0, lambda: self.status_var.set(
                            f"v{tag} is available but has no .zip download asset on GitHub."
                        ))
                else:
                    self.root.after(0, lambda: self.status_var.set(
                        f"✅  You are up to date  (v{cur})"
                    ))
                    self.root.after(0, lambda: self._set_notes(
                        f"Version {cur} is the latest release.\n\nNo updates available."
                    ))
            except urllib.error.HTTPError as e:
                msg = "No releases published yet on GitHub." if e.code == 404 else f"GitHub API error {e.code}: {e.reason}"
                self.root.after(0, lambda: self.status_var.set(msg))
                self.root.after(0, lambda: self._set_notes(msg))
            except ssl.SSLError as e:
                msg = f"SSL error contacting GitHub:\n{e}\n\nTry running as Administrator or check your internet connection."
                self.root.after(0, lambda: self.status_var.set("SSL error — see details below"))
                self.root.after(0, lambda: self._set_notes(msg))
            except Exception as e:
                msg = f"Could not check for updates:\n{e}"
                self.root.after(0, lambda: self.status_var.set("Check failed — see details below"))
                self.root.after(0, lambda: self._set_notes(msg))
        threading.Thread(target=run, daemon=True).start()

    def _do_update(self):
        if not self._dl_url:
            messagebox.showerror("No Download", "No .zip download asset found in the latest GitHub release.")
            return
        self.btn.configure(state="disabled", text="Updating…")

        def run():
            try:
                download_and_apply(
                    self._dl_url,
                    progress_cb=lambda p: self.root.after(0, lambda: self.bar.configure(value=p)),
                    status_cb=lambda s: self.root.after(0, lambda: self.status_var.set(s)),
                )
                self.root.after(0, self._on_success)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Update Failed", str(e)))
                self.root.after(0, lambda: self.btn.configure(state="normal", text="Retry"))
        threading.Thread(target=run, daemon=True).start()

    def _on_success(self):
        messagebox.showinfo(
            "CloudShield Updated",
            "Update applied successfully!\n\nCloudShield will now restart."
        )
        app_exe = INSTALL_DIR / APP_EXE
        if app_exe.exists():
            try:
                # DETACHED_PROCESS (0x00000008) + CREATE_NO_WINDOW (0x08000000)
                subprocess.Popen(
                    [str(app_exe)],
                    creationflags=0x00000008 | 0x08000000
                )
            except Exception:
                pass
        self.root.after(800, self.root.destroy)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    UpdaterUI().run()
