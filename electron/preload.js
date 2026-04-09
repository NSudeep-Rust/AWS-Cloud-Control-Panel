const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  checkUpdate:  ()  => ipcRenderer.send("check-update"),
  onTriggerScan: (cb) => ipcRenderer.on("trigger-scan", cb),
  appVersion:   ()  => require("../package.json").version,
});
