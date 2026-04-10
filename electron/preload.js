const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  checkUpdate:      ()         => ipcRenderer.send("check-update"),
  showNativeNotif:  (title, body, sev) => ipcRenderer.send("show-native-notif", { title, body, sev }),
  onTriggerScan:    (cb)       => ipcRenderer.on("trigger-scan", cb),
  appVersion:       ()         => require("../package.json").version,
});
