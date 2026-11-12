const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { createSession, listNics } = require("./multicast.cjs");

const session = createSession();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "北斗模拟器",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  session.onPacket((packet) => {
    if (!win.isDestroyed()) win.webContents.send("beidou:packet", packet);
  });
  session.onStatus((status) => {
    if (!win.isDestroyed()) win.webContents.send("beidou:status", status);
  });
  win.loadFile(path.join(__dirname, "../dist/index.html"));
}

ipcMain.handle("beidou:nics", () => listNics());
ipcMain.handle("beidou:listen", (_event, cfg) => session.listen(cfg || {}));
ipcMain.handle("beidou:send", (_event, cfg) => session.send(cfg.sentence, cfg));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  session.close();
  app.quit();
});
