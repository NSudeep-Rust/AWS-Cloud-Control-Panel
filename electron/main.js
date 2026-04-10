const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, dialog } = require("electron");
const path   = require("path");
const { spawn, execSync } = require("child_process");
const http   = require("http");
const fs     = require("fs");

const isDev  = !app.isPackaged;

// ── Performance: GPU acceleration + prevent throttling when minimised ────────
// Must be called BEFORE app.whenReady()
app.commandLine.appendSwitch("disable-renderer-backgrounding");         // don't throttle hidden renderer
app.commandLine.appendSwitch("disable-background-timer-throttling");    // keep JS timers full-speed
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows"); // don't slow down covered windows
app.commandLine.appendSwitch("enable-gpu-rasterization");               // GPU-composite CSS layers
app.commandLine.appendSwitch("enable-zero-copy");                       // zero-copy texture upload
app.commandLine.appendSwitch("disable-frame-rate-limit");               // uncap at display refresh rate

// ── Error Reporting ──────────────────────────────────────────────────────────
const GITHUB_ISSUES = "https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel/issues/new";
const APP_VERSION   = (() => { try { return require("../package.json").version } catch { return "1.0.0" } })()

function submitCrashReport(type, error, extra = '') {
  try {
    const os   = require("os");
    const errText = error?.stack || error?.message || String(error);
    const logPath = require("path").join(
      process.env.APPDATA || process.env.HOME,
      "CloudSecurityPanel", "logs", "backend_out.log"
    );
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
  } catch (_) { /* never let the reporter crash the app */ }
}

// Catch unhandled errors in the main (Node) process
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
        `This opens GitHub in your browser with the error details pre-filled — ` +
        `no personal data is sent automatically.`,
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
let appIcon     = null;   // nativeImage stored at module level for IPC notifications

function getAppDir() {
  return path.dirname(app.getPath("exe"));
}

function startBackend() {
  const exePath = isDev ? null
    : path.join(getAppDir(), "cloudshield-backend", "cloudshield-backend.exe");
  if (!exePath || !fs.existsSync(exePath)) {
    console.log("[Backend] Dev mode --- expecting backend on :8000");
    return;
  }

  // Kill any zombie backend from a previous session
  try { execSync("taskkill /F /IM cloudshield-backend.exe /T", { stdio: "ignore" }); } catch (_) {}

  // Redirect stdout+stderr to log file so scanner print() output is captured
  const logDir  = path.join(process.env.APPDATA || process.env.HOME, "CloudSecurityPanel", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const outLog  = path.join(logDir, "backend_out.log");
  const outFd   = fs.openSync(outLog, "a");

  backendProc = spawn(exePath, [], {
    detached: false,
    stdio: ["ignore", outFd, outFd],
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONLEGACYWINDOWSSTDIO: "0" },
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

function createMainWindow(err) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    show: false, frame: true,
    title: "CloudShield — AWS Cloud Control Panel",
    icon: path.join(getAppDir(), "resources", "app", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,   // keep animations smooth when window is hidden to tray
    },
  });

  if (err) {
    const logPath = path.join(
      process.env.APPDATA || process.env.HOME, "CloudSecurityPanel", "logs", "backend.log"
    );
    const logContent = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").slice(-2000).replace(/</g,"&lt;")
      : "No log file found.";
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#0a1628;color:#fff;font-family:Segoe UI;padding:40px;margin:0}
h1{color:#FF9900}pre{background:#0d1f38;padding:16px;border-radius:8px;font-size:12px;
overflow:auto;color:#aef;white-space:pre-wrap;max-height:400px}
.tip{background:#1a3a1a;border:1px solid #2a5a2a;padding:12px;border-radius:8px;margin-top:16px;font-size:13px}
</style></head><body>
<h1>CloudShield — Backend Error</h1>
<p style="color:#f88">The backend engine failed to start. See log below:</p>
<pre>${logContent}</pre>
<div class="tip">
<b>Log file:</b> %APPDATA%\\CloudSecurityPanel\\logs\\backend.log<br>
<b>Try:</b> Right-click CloudShield.exe &rarr; Run as Administrator
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
  // F12 opens DevTools for diagnostics
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });

  // Renderer process crashed — offer reload + report
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

  // UI becomes unresponsive (e.g. heavy scan blocking main thread)
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
      tray && tray.displayBalloon({
        title: "CloudShield running in background",
        content: "Click the tray icon to reopen.", iconType: "info",
      });
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: "deny" };
  });
}

function createTray() {
  // Candidate icon paths — first match wins.
  // Packaged: resources/app/icon.ico (embedded by electron-builder)
  // Dev mode : fall back to source installer images folder
  const iconCandidates = [
    path.join(getAppDir(), "resources", "app", "icon.ico"),
    path.join(getAppDir(), "resources", "app", "tray_icon.ico"),
    path.join(__dirname, "..", "installer", "images", "icon.ico"),
    path.join(__dirname, "..", "installer", "images", "tray_icon.ico"),
  ];
  const iconPath = iconCandidates.find(p => fs.existsSync(p)) || null;
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  appIcon = icon;  // save at module level for IPC notifications
  if (!iconPath) console.warn("[Tray] No tray icon found — tray will show as empty square");

  tray = new Tray(icon);
  tray.setToolTip("CloudShield — AWS Security Panel");
  const ctx = Menu.buildFromTemplate([
    { label: "Open CloudShield",  click: () => { mainWindow.show(); mainWindow.focus(); }},
    { label: "Check for Updates", click: () => launchUpdater() },
    { type: "separator" },
    { label: "Quit CloudShield",  click: () => {
        app.isQuiting = true;
        // Kill backend first, then force-exit. app.quit() can hang; app.exit(0) is reliable.
        try { if (backendProc) { backendProc.kill(); } } catch (_) {}
        try { execSync("taskkill /F /IM cloudshield-backend.exe /T", { stdio: "ignore" }); } catch (_) {}
        backendProc = null;
        setTimeout(() => { app.exit(0); }, 500);
    }},
  ]);
  tray.setContextMenu(ctx);
  tray.on("click",        () => { mainWindow.show(); mainWindow.focus(); });
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

function launchUpdater() {
  const updaterPath = path.join(getAppDir(), "CloudShield-Updater.exe");
  if (fs.existsSync(updaterPath)) {
    spawn(updaterPath, [], { detached: true, stdio: "ignore" }).unref();
  } else {
    shell.openExternal("https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest");
  }
}

ipcMain.on("check-update", () => launchUpdater());

// Route all OS notifications through main process so icon + app name are correct.
// Renderer calls window.electronAPI.showNativeNotif(title, body, sev) — avoids
// the 'electron.app.CloudShield' no-icon issue from renderer window.Notification.
ipcMain.on("show-native-notif", (_, { title, body, sev }) => {
  const { Notification: ElectronNotif } = require("electron");
  if (!ElectronNotif.isSupported()) return;
  const n = new ElectronNotif({
    title: title || "AWS CloudShield",
    body:  body  || "",
    icon:  appIcon || undefined,
    urgency: sev === "CRITICAL" ? "critical" : "normal",
    timeoutType: sev === "CRITICAL" ? "never" : "default",
    appID: "AWS CloudShield",
  });
  n.on("click", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  n.show();
});

// Allow renderer (React Exit button) to fully quit the app
ipcMain.on("app-quit", () => {
  app.isQuiting = true;
  try { if (backendProc) backendProc.kill(); } catch (_) {}
  try { execSync("taskkill /F /IM cloudshield-backend.exe /T", { stdio: "ignore" }); } catch (_) {}
  backendProc = null;
  setTimeout(() => { app.exit(0); }, 500);
});

// Show window when renderer asks (e.g. after being hidden to tray)
ipcMain.on("app-show", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // NOTE: We intentionally do NOT set openAtLogin here.
  // Forcing startup on every user's machine without their consent is bad practice.
  // Users who want startup can enable it via Windows Settings > Apps > Startup.

  createSplash();
  startBackend();
  waitForBackend((err) => {
    createTray();
    createMainWindow(err);
  });
});

app.on("window-all-closed", (e) => {
  // Only prevent close if we are NOT quiting (i.e. minimize-to-tray behavior)
  if (!app.isQuiting) e.preventDefault();
});
app.on("before-quit", () => {
  try { if (backendProc) { backendProc.kill(); backendProc = null; } } catch (_) {}
});
