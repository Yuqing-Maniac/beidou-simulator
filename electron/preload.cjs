const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beidou", {
  nics: () => ipcRenderer.invoke("beidou:nics"),
  listen: (cfg) => ipcRenderer.invoke("beidou:listen", cfg),
  send: (cfg) => ipcRenderer.invoke("beidou:send", cfg),
  onPacket: (cb) => {
    ipcRenderer.on("beidou:packet", (_event, packet) => cb(packet));
  },
  onStatus: (cb) => {
    ipcRenderer.on("beidou:status", (_event, status) => cb(status));
  },
});
