"""
CloudShield Updater v2 — checks GitHub Releases for a newer version,
downloads the installer and applies it silently, then restarts the app.

Strategy (in priority order):
  1. If a Setup installer (.exe) is in the release assets → download & run /VERYSILENT
  2. If an update zip (.zip with "update" in name) → extract, write a helper .bat,
     exit the updater, let the bat copy files and restart CloudShield
  3. Nothing found → show error

Compiled separately:
    pyinstaller updater.spec
"""
import sys, os, json, subprocess, zipfile, shutil, time, threading, ctypes
from pathlib import Path
from tkinter import Tk, ttk, messagebox, Label, Frame, Button, StringVar

import ssl
import urllib.request
import urllib.error

# ── Elevation ─────────────────────────────────────────────────────────────────
def _is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False

def _relaunch_as_admin():
    """Re-launch this executable with UAC elevation and exit current process."""
    ctypes.windll.shell32.ShellExecuteW(
        None, "runas", sys.executable,
        " ".join(f'"{a}"' for a in sys.argv), None, 1
    )
    sys.exit(0)

# ── SSL-tolerant request helper ───────────────────────────────────────────────
def _open_url(url: str, headers: dict | None = None, timeout: int = 30):
    req = urllib.request.Request(url, headers=headers or {})
    for verify in (True, False):
        try:
            ctx = ssl.create_default_context() if verify else ssl._create_unverified_context()
            if not verify:
                ctx.check_hostname = False
                ctx.verify_mode   = ssl.CERT_NONE
            return urllib.request.urlopen(req, timeout=timeout, context=ctx)
        except Exception as e:
            last_exc = e
            if verify:
                continue
    raise last_exc

# ── Constants ─────────────────────────────────────────────────────────────────
GITHUB_API  = "https://api.github.com/repos/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest"
APP_EXE     = "CloudShield.exe"

# PyInstaller --onefile: sys.executable IS CloudShield-Updater.exe in install dir.
INSTALL_DIR = Path(os.path.dirname(sys.executable))

# ── Version helpers ───────────────────────────────────────────────────────────
def _parse_version(v: str):
    try:
        return tuple(int(x) for x in v.strip().lstrip("v").split("."))
    except Exception:
        return (0, 0, 0)

def current_version() -> str:
    candidates = [
        INSTALL_DIR / "VERSION",
        INSTALL_DIR / "cloudshield-backend" / "VERSION",
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
def fetch_latest() -> tuple:
    """Returns (tag, body, url, asset_type).
    asset_type: 'installer' | 'zip' | None
    """
    with _open_url(GITHUB_API, headers={"User-Agent": "CloudShield-Updater/2.0"}) as r:
        data = json.loads(r.read())

    tag    = data.get("tag_name", "0.0.0").lstrip("v")
    body   = data.get("body", "").strip() or "No release notes provided."
    assets = data.get("assets", [])

    # Priority 1 — Setup installer exe (most reliable update method)
    installer_url = next(
        (a["browser_download_url"] for a in assets
         if "setup" in a["name"].lower() and a["name"].lower().endswith(".exe")),
        None
    )
    if installer_url:
        return tag, body, installer_url, "installer"

    # Priority 2 — Update zip (contains raw files)
    zip_url = next(
        (a["browser_download_url"] for a in assets
         if "update" in a["name"].lower() and a["name"].endswith(".zip")),
        None
    ) or next(
        (a["browser_download_url"] for a in assets if a["name"].endswith(".zip")),
        None
    )
    if zip_url:
        return tag, body, zip_url, "zip"

    return tag, body, None, None

# ── File download helper ──────────────────────────────────────────────────────
def _download(url: str, dest: Path, progress_cb, status_cb):
    status_cb("Downloading update…")
    CHUNK = 65536
    with _open_url(url, headers={"User-Agent": "CloudShield-Updater/2.0"}, timeout=180) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        done  = 0
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                if total > 0:
                    progress_cb(min(int(done * 95 / total), 95))
    progress_cb(100)

# ── Kill running app ──────────────────────────────────────────────────────────
def _kill_main_app():
    for exe in ("CloudShield.exe", "cloudshield-backend.exe"):
        try:
            subprocess.run(["taskkill", "/F", "/IM", exe, "/T"],
                           capture_output=True, timeout=10)
        except Exception:
            pass
    time.sleep(3.0)

# ── Apply: installer (Setup.exe) ──────────────────────────────────────────────
def apply_installer(url: str, progress_cb, status_cb) -> None:
    """Download Setup.exe and run it silently. Blocks until the installer finishes."""
    tmp = Path(os.environ.get("TEMP", ".")) / "CloudShield-Setup-update.exe"

    _download(url, tmp, progress_cb, status_cb)

    status_cb("Closing CloudShield to apply update…")
    _kill_main_app()

    status_cb("Running installer silently…")
    try:
        result = subprocess.run(
            [str(tmp), "/VERYSILENT", "/NORESTART",
             "/CLOSEAPPLICATIONS", "/FORCECLOSEAPPLICATIONS"],
            timeout=300
        )
    finally:
        try:
            tmp.unlink()
        except Exception:
            pass

    if result.returncode not in (0, 1):   # Inno Setup: 0=ok, 1=ok+restart needed
        raise RuntimeError(f"Installer exited with code {result.returncode}")

    status_cb("Update applied successfully!")

# ── Apply: zip (helper-bat method) ───────────────────────────────────────────
def apply_zip(url: str, progress_cb, status_cb) -> Path:
    """
    Download + extract the update zip, write a helper .bat that:
     1. Waits for the updater to exit (timeout 5 s)
     2. xcopy's all files into the install dir
     3. Restarts CloudShield.exe
    Returns the bat path so the caller can launch it before exiting.
    """
    tmp        = Path(os.environ.get("TEMP", ".")) / "cloudshield_update.zip"
    extract_dir = Path(os.environ.get("TEMP", ".")) / "cloudshield_update_tmp"

    _download(url, tmp, progress_cb, status_cb)

    status_cb("Extracting archive…")
    if extract_dir.exists():
        shutil.rmtree(extract_dir, ignore_errors=True)
    with zipfile.ZipFile(tmp, "r") as z:
        z.extractall(extract_dir)

    # Unwrap single top-level folder if zip uses one
    children = list(extract_dir.iterdir())
    source_root = extract_dir
    if len(children) == 1 and children[0].is_dir():
        source_root = children[0]

    status_cb("Closing CloudShield to apply update…")
    _kill_main_app()

    # Write helper bat — runs AFTER updater exits (no file-lock conflicts)
    bat = Path(os.environ.get("TEMP", ".")) / "cloudshield_apply.bat"
    install_str  = str(INSTALL_DIR).rstrip("\\")
    source_str   = str(source_root).rstrip("\\")
    app_exe_path = str(INSTALL_DIR / APP_EXE)
    bat_content = (
        "@echo off\r\n"
        "timeout /t 4 /nobreak > nul\r\n"
        f'xcopy /S /Y /Q /I "{source_str}\\*" "{install_str}\\"\r\n'
        f'del /F /Q "{tmp}"\r\n'
        f'rmdir /S /Q "{extract_dir}"\r\n'
        f'start "" "{app_exe_path}"\r\n'
        'del "%~f0"\r\n'
    )
    bat.write_text(bat_content, encoding="ascii")

    status_cb("Update ready — CloudShield will restart automatically.")
    return bat

# ── GUI ───────────────────────────────────────────────────────────────────────
BG     = "#0a1628"
BG2    = "#0d1f38"
ORANGE = "#FF9900"
GRAY   = "#8d9191"
WHITE  = "#e6edf3"

class UpdaterUI:
    def __init__(self):
        self._tag       = None
        self._dl_url    = None
        self._asset_type = None

        self.root = Tk()
        self.root.title("CloudShield Updater")
        self.root.geometry("520x360")
        self.root.resizable(False, False)
        self.root.configure(bg=BG)
        try:
            icon_path = INSTALL_DIR / "resources" / "app" / "icon.ico"
            if icon_path.exists():
                self.root.iconbitmap(str(icon_path))
        except Exception:
            pass
        self._build_ui()
        self.root.after(300, self._check)

    def _build_ui(self):
        hdr = Frame(self.root, bg=BG, pady=10)
        hdr.pack(fill="x", padx=24, pady=(20, 0))

        Label(hdr, text="CloudShield Updater",
              bg=BG, fg=ORANGE,
              font=("Segoe UI", 15, "bold")).pack(anchor="w")

        cur = current_version()
        Label(hdr, text=f"Installed version: v{cur}",
              bg=BG, fg=GRAY,
              font=("Segoe UI", 9)).pack(anchor="w", pady=(2, 0))

        self.status_var = StringVar(value="Checking for updates…")
        Label(self.root, textvariable=self.status_var,
              bg=BG, fg=WHITE,
              font=("Segoe UI", 10)).pack(pady=(14, 4))

        import tkinter as tk
        self.notes = tk.Text(
            self.root, height=6, width=60,
            bg=BG2, fg="#ccc", relief="flat",
            font=("Segoe UI", 9), wrap="word",
            state="disabled", borderwidth=0,
            highlightbackground=BG2
        )
        self.notes.pack(padx=24)

        style = ttk.Style()
        style.theme_use("clam")
        style.configure("orange.Horizontal.TProgressbar",
                         troughcolor=BG2, background=ORANGE, bordercolor=BG2)
        self.bar = ttk.Progressbar(
            self.root, length=472, mode="determinate",
            style="orange.Horizontal.TProgressbar"
        )
        self.bar.pack(pady=14, padx=24)

        self.btn = Button(
            self.root, text="Update Now", state="disabled",
            bg=ORANGE, fg="#0a1628", activebackground="#e07b00",
            font=("Segoe UI", 11, "bold"),
            relief="flat", cursor="hand2", padx=20, pady=8,
            command=self._do_update
        )
        self.btn.pack()

        Label(self.root,
              text="CloudShield will close briefly and relaunch automatically after updating.",
              bg=BG, fg=GRAY, font=("Segoe UI", 8)).pack(pady=(8, 0))

    def _set_notes(self, text: str):
        self.notes.configure(state="normal")
        self.notes.delete("1.0", "end")
        self.notes.insert("end", text)
        self.notes.configure(state="disabled")

    def _check(self):
        def run():
            try:
                tag, notes, url, asset_type = fetch_latest()
                cur = current_version()
                if _parse_version(tag) > _parse_version(cur):
                    self._tag       = tag
                    self._dl_url    = url
                    self._asset_type = asset_type
                    self.root.after(0, lambda: self.status_var.set(
                        f"New version available: v{tag}  (you have v{cur})"
                    ))
                    self.root.after(0, lambda: self._set_notes(notes))
                    can_update = url is not None
                    self.root.after(0, lambda: self.btn.configure(
                        state="normal" if can_update else "disabled",
                        text="Update Now" if can_update else "No download asset found"
                    ))
                    if not can_update:
                        self.root.after(0, lambda: self.status_var.set(
                            f"v{tag} is available but has no download asset on GitHub."
                        ))
                else:
                    self.root.after(0, lambda: self.status_var.set(
                        f"You are up to date  (v{cur})"
                    ))
                    self.root.after(0, lambda: self._set_notes(
                        f"Version {cur} is the latest release.\n\nNo updates available."
                    ))
            except urllib.error.HTTPError as e:
                msg = "No releases on GitHub yet." if e.code == 404 else f"GitHub API error {e.code}: {e.reason}"
                self.root.after(0, lambda: self.status_var.set(msg))
                self.root.after(0, lambda: self._set_notes(msg))
            except Exception as e:
                msg = f"Could not check for updates:\n{e}"
                self.root.after(0, lambda: self.status_var.set("Check failed — see details below"))
                self.root.after(0, lambda: self._set_notes(msg))
        threading.Thread(target=run, daemon=True).start()

    def _do_update(self):
        if not self._dl_url:
            messagebox.showerror("No Download", "No download asset found in the latest GitHub release.")
            return
        self.btn.configure(state="disabled", text="Updating…")

        def run():
            try:
                p = lambda v: self.root.after(0, lambda: self.bar.configure(value=v))
                s = lambda t: self.root.after(0, lambda: self.status_var.set(t))

                if self._asset_type == "installer":
                    # Installer approach: runs Setup.exe silently, blocks until done
                    apply_installer(self._dl_url, p, s)
                    self.root.after(0, self._on_success_installer)
                else:
                    # Zip approach: writes helper bat, exits updater, bat does the rest
                    bat_path = apply_zip(self._dl_url, p, s)
                    self.root.after(0, lambda: self._on_success_zip(bat_path))

            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Update Failed", str(e)))
                self.root.after(0, lambda: self.btn.configure(state="normal", text="Retry"))

        threading.Thread(target=run, daemon=True).start()

    def _on_success_installer(self):
        """Installer already applied everything — just restart the app."""
        messagebox.showinfo(
            "CloudShield Updated",
            f"Successfully updated to v{self._tag}!\n\nCloudShield will now restart."
        )
        app_exe = INSTALL_DIR / APP_EXE
        if app_exe.exists():
            try:
                subprocess.Popen(
                    [str(app_exe)],
                    creationflags=0x00000008 | 0x08000000  # DETACHED | NO_WINDOW
                )
            except Exception:
                pass
        self.root.after(800, self.root.destroy)

    def _on_success_zip(self, bat_path: Path):
        """Helper bat will copy files + restart after we exit."""
        messagebox.showinfo(
            "CloudShield Updated",
            f"Update to v{self._tag} is being applied.\n\nCloudShield will restart automatically."
        )
        # Launch the helper bat DETACHED — it waits for us to exit then does the copy
        try:
            subprocess.Popen(
                ["cmd.exe", "/C", str(bat_path)],
                creationflags=0x00000008 | 0x08000000
            )
        except Exception:
            pass
        # Exit immediately so the bat can overwrite all files (including this exe)
        self.root.after(300, self.root.destroy)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    # Always require admin — writing to Program Files needs elevation
    if not _is_admin():
        _relaunch_as_admin()
    UpdaterUI().run()
