const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage } = require("electron");
const path   = require("path");
const { spawn } = require("child_process");
const http   = require("http");
const fs     = require("fs");

const isDev  = !app.isPackaged;
const BACKEND_PORT = 8000;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow  = null;
let tray        = null;
let backendProc = null;
let splashWin   = null;

function getAppDir() {
  return path.dirname(app.getPath("exe"));
}

function startBackend() {
  const exePath = isDev ? null
    : path.join(getAppDir(), "cloudshield-backend", "cloudshield-backend.exe");
  if (!exePath || !fs.existsSync(exePath)) {
    console.log("[Backend] Dev mode — expecting backend on :8000");
    return;
  }
  backendProc = spawn(exePath, [], {
    detached: false, stdio: "ignore", windowsHide: false,
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
      nodeIntegration: false, contextIsolation: true,
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
  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault(); mainWindow.hide();
      tray && tray.displayBalloon({
        title: "CloudShield running in background",
        content: "Click the tray icon to reopen", iconType: "info",
      });
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: "deny" };
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("CloudShield — AWS Security Panel");
  const ctx = Menu.buildFromTemplate([
    { label: "Open CloudShield",  click: () => { mainWindow.show(); mainWindow.focus(); }},
    { label: "Check for Updates", click: () => launchUpdater() },
    { type: "separator" },
    { label: "Quit",              click: () => { app.isQuiting = true; app.quit(); }},
  ]);
  tray.setContextMenu(ctx);
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createSplash();
  startBackend();
  waitForBackend((err) => {
    createTray();
    createMainWindow(err);
  });
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("before-quit", () => {
  if (backendProc) { backendProc.kill(); backendProc = null; }
});
