const { contextBridge, ipcRenderer } = require("electron");

function savedValues(){const result={};try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^beichen-[a-z0-9-]{1,80}$/.test(key))result[key]=localStorage.getItem(key);}}catch{}return result;}
function flushSavedValues(){try{ipcRenderer.sendSync('beidou:storage-save',savedValues());}catch{}}
try{const stored=ipcRenderer.sendSync('beidou:storage-load',savedValues());if(stored?.values){for(const key of Object.keys(savedValues()))localStorage.removeItem(key);for(const [key,value] of Object.entries(stored.values))localStorage.setItem(key,value);}}catch{}
window.addEventListener('beforeunload',flushSavedValues);
let savedFingerprint=JSON.stringify(savedValues());setInterval(()=>{const next=JSON.stringify(savedValues());if(next!==savedFingerprint){flushSavedValues();savedFingerprint=next;}},1000);

contextBridge.exposeInMainWorld("beidou", {
  updateInfo: () => ipcRenderer.invoke("beidou:update-info"),
  previewUpdate: () => ipcRenderer.invoke("beidou:update-preview"),
  applyUpdate: (token) => ipcRenderer.invoke("beidou:update-apply", token),
  restartUpdate: () => {flushSavedValues();return ipcRenderer.invoke("beidou:update-restart");},
  rollbackUpdate: () => {flushSavedValues();return ipcRenderer.invoke("beidou:update-rollback");},
  updateHealthy: () => ipcRenderer.invoke("beidou:update-healthy"),
  fullscreen: (toggle=false) => ipcRenderer.invoke("beidou:fullscreen",toggle),
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
