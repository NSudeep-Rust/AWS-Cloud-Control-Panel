/**
 * CloudShield — Linux Electron Main Process
 * Separate from main.js (Windows). Linux-specific paths, process management,
 * and icon handling. Windows main.js is NEVER touched by this file.
 */

const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, dialog } = require("electron");
const path   = require("path");
const { spawn, execSync } = require("child_process");
const http   = require("http");
const fs     = require("fs");

const isDev  = !app.isPackaged;

// ── Performance flags ─────────────────────────────────────────────────────────
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-frame-rate-limit");

// ── Error Reporting ───────────────────────────────────────────────────────────
const GITHUB_ISSUES = "https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel/issues/new";
const APP_VERSION   = (() => { try { return require("../package.json").version } catch { return "1.0.1" } })()

function submitCrashReport(type, error, extra = '') {
  try {
    const os      = require("os");
    const errText = error?.stack || error?.message || String(error);
    const logPath = path.join(process.env.HOME, ".local", "share", "CloudSecurityPanel", "logs", "backend_out.log");
    const logTail = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").slice(-800)
      : "No backend log found.";
    const body = encodeURIComponent(
`**CloudShield Crash Report**

**Type:** ${type}
**Version:** ${APP_VERSION}
**OS:** ${os.platform()} ${os.release()} (${os.arch()})
**Electron:** ${process.versions.electron}  |  **Node:** ${process.versions.node}

**Error:**
\`\`\`
${errText}
\`\`\`

**Extra context:** ${extra}

**Backend log (last 800 chars):**
\`\`\`
${logTail}
\`\`\`
`
    );
    const title = encodeURIComponent(`[Bug] ${type}: ${String(error).slice(0, 80)}`);
    shell.openExternal(`${GITHUB_ISSUES}?title=${title}&body=${body}&labels=bug`);
  } catch (_) {}
}

process.on("uncaughtException", (error) => {
  console.error("[CloudShield] uncaughtException:", error);
  try {
    const choice = dialog.showMessageBoxSync({
      type: "error",
      title: "CloudShield — Unexpected Error",
      message: "CloudShield encountered an unexpected error.",
      detail:
        `${error.message}\n\n` +
        `Would you like to submit a bug report?\n` +
        `This opens GitHub in your browser with the error details pre-filled.`,
      buttons: ["Submit Report", "Ignore & Continue", "Quit CloudShield"],
      defaultId: 0, cancelId: 1,
    });
    if (choice === 0) submitCrashReport("Main Process Exception", error);
    if (choice === 2) app.exit(1);
  } catch (_) { app.exit(1); }
});

const BACKEND_PORT = 8000;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow  = null;
let tray        = null;
let backendProc = null;
let splashWin   = null;
let appIcon     = null;

// ── Log directory (XDG-compliant: ~/.local/share/CloudSecurityPanel/logs) ─────
const LOG_DIR = path.join(process.env.HOME || "/tmp", ".local", "share", "CloudSecurityPanel", "logs");

function startBackend() {
  // Backend is bundled inside Electron's resources directory on Linux
  const exePath = isDev ? null
    : path.join(process.resourcesPath, "cloudshield-backend", "cloudshield-backend");

  if (!exePath || !fs.existsSync(exePath)) {
    console.log("[Backend] Dev mode — expecting backend already running on :8000");
    return;
  }

  // Kill any leftover backend process from a previous session
  try { execSync("pkill -f cloudshield-backend", { stdio: "ignore" }); } catch (_) {}

  // Ensure log directory exists and open log file
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const outLog = path.join(LOG_DIR, "backend_out.log");
  const outFd  = fs.openSync(outLog, "a");

  // Make sure binary is executable
  try { fs.chmodSync(exePath, 0o755); } catch (_) {}

  backendProc = spawn(exePath, [], {
    detached: false,
    stdio: ["ignore", outFd, outFd],
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  backendProc.on("error", (e) => console.error("[Backend] spawn error:", e));
  backendProc.on("exit",  (c) => console.log("[Backend] exited:", c));
}

function waitForBackend(cb, retries = 60) {
  http.get(`${BACKEND_URL}/`, (res) => {
    if (res.statusCode < 500) { cb(null); return; }
    retry(retries);
  }).on("error", () => retry(retries));
  function retry(n) {
    if (n <= 0) { cb(new Error("Backend did not start after 30s")); return; }
    setTimeout(() => waitForBackend(cb, n - 1), 500);
  }
}

function createSplash() {
  splashWin = new BrowserWindow({
    width: 480, height: 320, frame: false, transparent: true,
    alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { nodeIntegration: false },
  });
  splashWin.loadFile(path.join(__dirname, "splash.html"));
  splashWin.center();
}

function getIconPath() {
  const candidates = [
    path.join(process.resourcesPath, "app", "icon.png"),
    path.join(__dirname, "..", "installer", "images", "icon.png"),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function createMainWindow(err) {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    show: false, frame: true,
    title: "CloudShield — AWS Cloud Control Panel",
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  if (err) {
    const logPath = path.join(LOG_DIR, "backend.log");
    const logContent = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").slice(-2000).replace(/</g,"&lt;")
      : "No log file found.";
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#0a1628;color:#fff;font-family:sans-serif;padding:40px;margin:0}
h1{color:#FF9900}pre{background:#0d1f38;padding:16px;border-radius:8px;font-size:12px;
overflow:auto;color:#aef;white-space:pre-wrap;max-height:400px}
.tip{background:#1a3a1a;border:1px solid #2a5a2a;padding:12px;border-radius:8px;margin-top:16px;font-size:13px}
</style></head><body>
<h1>CloudShield — Backend Error</h1>
<p style="color:#f88">The backend engine failed to start. See log below:</p>
<pre>${logContent}</pre>
<div class="tip">
<b>Log file:</b> ~/.local/share/CloudSecurityPanel/logs/backend.log<br>
<b>Try:</b> Run <code>cloudshield</code> from terminal to see full error output
</div></body></html>`;
    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
  }

  mainWindow.once("ready-to-show", () => {
    if (splashWin) { splashWin.destroy(); splashWin = null; }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[CloudShield] Renderer crashed:", details);
    try {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "error",
        title: "CloudShield — UI Crashed",
        message: "The interface process crashed and needs to reload.",
        detail: `Reason: ${details.reason}\n\nSubmit a bug report?`,
        buttons: ["Submit Report & Reload", "Reload", "Quit"],
        defaultId: 1, cancelId: 1,
      });
      if (choice === 0) { submitCrashReport("Renderer Crashed", new Error(details.reason), JSON.stringify(details)); mainWindow.reload(); }
      else if (choice === 1) mainWindow.reload();
      else app.exit(1);
    } catch (_) { mainWindow.reload(); }
  });

  mainWindow.webContents.on("unresponsive", () => {
    try {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "warning",
        title: "CloudShield — Not Responding",
        message: "CloudShield is not responding.",
        buttons: ["Wait", "Reload UI", "Quit"],
        defaultId: 0, cancelId: 0,
      });
      if (choice === 1) mainWindow.reload();
      else if (choice === 2) app.exit(1);
    } catch (_) {}
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault(); mainWindow.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: "deny" };
  });
}

function createTray() {
  const iconPath = getIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  appIcon = icon;

  tray = new Tray(icon);
  tray.setToolTip("CloudShield — AWS Security Panel");
  const ctx = Menu.buildFromTemplate([
    { label: "Open CloudShield",  click: () => { mainWindow.show(); mainWindow.focus(); }},
    { label: "Check for Updates", click: () => launchUpdater() },
    { type: "separator" },
    { label: "Quit CloudShield",  click: () => {
        app.isQuiting = true;
        try { if (backendProc) { backendProc.kill(); } } catch (_) {}
        try { execSync("pkill -f cloudshield-backend", { stdio: "ignore" }); } catch (_) {}
        backendProc = null;
        setTimeout(() => { app.exit(0); }, 500);
    }},
  ]);
  tray.setContextMenu(ctx);
  tray.on("click",        () => { mainWindow.show(); mainWindow.focus(); });
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

function launchUpdater() {
  // No separate updater binary on Linux — open GitHub releases page
  shell.openExternal("https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest");
}

ipcMain.on("check-update", () => launchUpdater());

// Native notifications via Electron (libnotify on Linux)
ipcMain.on("show-native-notif", (_, { title, body }) => {
  const { Notification: ElectronNotif } = require("electron");
  if (!ElectronNotif.isSupported()) return;
  const n = new ElectronNotif({
    title: title || "AWS CloudShield",
    body:  body  || "",
    icon:  getIconPath() || undefined,
  });
  n.on("click", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  n.show();
});

ipcMain.on("app-quit", () => {
  app.isQuiting = true;
  try { if (backendProc) backendProc.kill(); } catch (_) {}
  try { execSync("pkill -f cloudshield-backend", { stdio: "ignore" }); } catch (_) {}
  backendProc = null;
  setTimeout(() => { app.exit(0); }, 500);
});

ipcMain.on("app-show", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createSplash();
  startBackend();
  waitForBackend((err) => {
    createTray();
    createMainWindow(err);
  });
});

app.on("window-all-closed", (e) => {
  if (!app.isQuiting) e.preventDefault();
});
app.on("before-quit", () => {
  try { if (backendProc) { backendProc.kill(); backendProc = null; } } catch (_) {}
});
