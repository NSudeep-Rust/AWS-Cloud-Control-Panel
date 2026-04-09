"""
CloudShield Updater — checks GitHub Releases for a newer version,
downloads the zip, extracts into install folder, restarts the app.

Compiled separately: pyinstaller updater_entry.py -F -n CloudShield-Updater
"""
import sys, os, json, subprocess, zipfile, shutil, time
from pathlib import Path
from tkinter import Tk, ttk, messagebox, Label, Frame, Button
import urllib.request
import threading

GITHUB_API  = "https://api.github.com/repos/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest"
APP_EXE     = "CloudShield.exe"
INSTALL_DIR = Path(os.path.dirname(sys.executable))

VERSION_FILE = INSTALL_DIR / "cloudshield-backend" / "VERSION"

def current_version():
    try:
        return VERSION_FILE.read_text().strip()
    except Exception:
        return "0.0.0"

def fetch_latest():
    req = urllib.request.Request(GITHUB_API, headers={"User-Agent": "CloudShield-Updater"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    tag     = data.get("tag_name", "0.0.0").lstrip("v")
    body    = data.get("body", "")
    assets  = data.get("assets", [])
    dl_url  = next((a["browser_download_url"] for a in assets
                   if a["name"].endswith(".zip")), None)
    return tag, body, dl_url

def download_and_apply(url, progress_cb, status_cb):
    tmp = Path(os.environ.get("TEMP", ".")) / "cloudshield_update.zip"
    status_cb("Downloading update...")

    def report(block, block_size, total):
        if total > 0:
            pct = min(int(block * block_size * 100 / total), 100)
            progress_cb(pct)

    urllib.request.urlretrieve(url, tmp, reporthook=report)
    status_cb("Extracting...")
    extract_dir = Path(os.environ.get("TEMP", ".")) / "cloudshield_update_tmp"
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile(tmp, "r") as z:
        z.extractall(extract_dir)

    status_cb("Applying update...")
    time.sleep(0.5)
    for item in extract_dir.rglob("*"):
        rel  = item.relative_to(extract_dir)
        dest = INSTALL_DIR / rel
        if item.is_dir():
            dest.mkdir(parents=True, exist_ok=True)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(item, dest)
            except PermissionError:
                pass

    shutil.rmtree(extract_dir, ignore_errors=True)
    tmp.unlink(missing_ok=True)
    status_cb("Done!")

# ── GUI ───────────────────────────────────────────────────────────────────────
class UpdaterUI:
    def __init__(self):
        self.root = Tk()
        self.root.title("CloudShield Updater")
        self.root.geometry("460x320")
        self.root.resizable(False, False)
        self.root.configure(bg="#0a1628")
        self._build_ui()
        self.root.after(200, self._check)

    def _build_ui(self):
        Label(self.root, text="🛡️ CloudShield Updater",
              bg="#0a1628", fg="#FF9900",
              font=("Segoe UI", 16, "bold")).pack(pady=(24,4))
        Label(self.root, text=f"Current version: {current_version()}",
              bg="#0a1628", fg="#aaa",
              font=("Segoe UI", 10)).pack()
        self.status_var = __import__("tkinter").StringVar(value="Checking for updates...")
        Label(self.root, textvariable=self.status_var,
              bg="#0a1628", fg="#ccc",
              font=("Segoe UI", 10)).pack(pady=12)
        self.notes = __import__("tkinter").Text(self.root, height=6, width=52,
              bg="#0d1f38", fg="#ccc", relief="flat",
              font=("Segoe UI", 9), wrap="word", state="disabled",
              borderwidth=0)
        self.notes.pack(padx=20)
        self.bar = ttk.Progressbar(self.root, length=400, mode="determinate")
        self.bar.pack(pady=14)
        self.btn = Button(self.root, text="Update Now", state="disabled",
                          bg="#FF9900", fg="#0a1628",
                          font=("Segoe UI", 11, "bold"),
                          relief="flat", cursor="hand2", padx=20, pady=6,
                          command=self._do_update)
        self.btn.pack()

    def _set_notes(self, text):
        self.notes.configure(state="normal")
        self.notes.delete("1.0", "end")
        self.notes.insert("end", text)
        self.notes.configure(state="disabled")

    def _check(self):
        def run():
            try:
                tag, notes, url = fetch_latest()
                cur = current_version()
                if tag > cur:
                    self.status_var.set(f"New version available: {tag}")
                    self._set_notes(notes or "No release notes.")
                    self._dl_url = url
                    self.btn.configure(state="normal")
                else:
                    self.status_var.set(f"You are up to date (v{cur})")
                    self._set_notes("No updates available.")
            except Exception as e:
                self.status_var.set(f"Could not check: {e}")
        threading.Thread(target=run, daemon=True).start()

    def _do_update(self):
        self.btn.configure(state="disabled")
        def run():
            try:
                download_and_apply(
                    self._dl_url,
                    progress_cb=lambda p: self.root.after(0, lambda: self.bar.configure(value=p)),
                    status_cb=lambda s: self.root.after(0, lambda: self.status_var.set(s)),
                )
                self.root.after(0, lambda: messagebox.showinfo(
                    "CloudShield Updated",
                    "Update applied! CloudShield will restart now."))
                app_exe = INSTALL_DIR / APP_EXE
                if app_exe.exists():
                    subprocess.Popen([str(app_exe)], creationflags=0x00000008)
                self.root.after(500, self.root.destroy)
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Update Failed", str(e)))
                self.root.after(0, lambda: self.btn.configure(state="normal"))
        threading.Thread(target=run, daemon=True).start()

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    UpdaterUI().run()
