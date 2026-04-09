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
let backendReady = false;

// ── 1. Start PyInstaller backend ─────────────────────────────────────────────
function startBackend() {
  const exePath = isDev
    ? null
    : path.join(path.dirname(app.getPath("exe")), "cloudshield-backend", "cloudshield-backend.exe");

  if (!exePath || !fs.existsSync(exePath)) {
    console.log("[Backend] Dev mode — expecting backend already running on :8000");
    return;
  }

  backendProc = spawn(exePath, [], {
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });

  backendProc.on("error", (e) => console.error("[Backend] spawn error:", e));
  backendProc.on("exit",  (c) => console.log("[Backend] exited with code:", c));
}

// ── 2. Poll until backend is ready ───────────────────────────────────────────
function waitForBackend(cb, retries = 40) {
  http.get(`${BACKEND_URL}/`, (res) => {
    if (res.statusCode < 500) { cb(); return; }
    retry(cb, retries);
  }).on("error", () => retry(cb, retries));

  function retry(cb, n) {
    if (n <= 0) { cb(new Error("Backend did not start")); return; }
    setTimeout(() => waitForBackend(cb, n - 1), 500);
  }
}

// ── 3. Splash screen ─────────────────────────────────────────────────────────
function createSplash() {
  splashWin = new BrowserWindow({
    width: 480, height: 320,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false },
  });
  splashWin.loadFile(path.join(__dirname, "splash.html"));
  splashWin.center();
}

// ── 4. Main window ───────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 900, minHeight: 600,
    show: false,
    frame: true,
    title: "CloudShield — AWS Cloud Control Panel",
    icon: path.join(__dirname, "..", "installer", "images", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const uiPath = isDev
    ? "http://localhost:5173"
    : `http://127.0.0.1:${BACKEND_PORT}`;

  mainWindow.loadURL(uiPath);

  mainWindow.once("ready-to-show", () => {
    if (splashWin) { splashWin.destroy(); splashWin = null; }
    mainWindow.show();
    mainWindow.focus();
  });

  // Minimize to tray instead of closing
  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      tray && tray.displayBalloon({
        title: "CloudShield running in background",
        content: "Click the tray icon to reopen",
        iconType: "info",
      });
    }
  });

  // Open external links in real browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── 5. System Tray ───────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "..", "installer", "images", "tray_icon.ico");
  const icon     = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("CloudShield — AWS Security Panel");

  const ctx = Menu.buildFromTemplate([
    { label: "Open CloudShield",   click: () => { mainWindow.show(); mainWindow.focus(); }},
    { label: "Run Scan Now",        click: () => { mainWindow.show(); mainWindow.webContents.send("trigger-scan"); }},
    { label: "Check for Updates",   click: () => launchUpdater() },
    { type: "separator" },
    { label: "Quit CloudShield",    click: () => { app.isQuiting = true; app.quit(); }},
  ]);

  tray.setContextMenu(ctx);
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

// ── 6. Updater launcher ───────────────────────────────────────────────────────
function launchUpdater() {
  const updaterPath = path.join(path.dirname(app.getPath("exe")), "CloudShield-Updater.exe");
  if (fs.existsSync(updaterPath)) {
    spawn(updaterPath, [], { detached: true, stdio: "ignore" }).unref();
  } else {
    shell.openExternal("https://github.com/NSudeep-Rust/AWS-Cloud-Control-Panel/releases/latest");
  }
}

// ── IPC: updater trigger from renderer ────────────────────────────────────────
ipcMain.on("check-update", () => launchUpdater());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplash();
  startBackend();

  waitForBackend((err) => {
    if (err) { console.error("[Backend] Failed to start:", err); }
    createTray();
    createMainWindow();
  });
});

app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", () => {
  if (backendProc) {
    backendProc.kill();
    backendProc = null;
  }
});
