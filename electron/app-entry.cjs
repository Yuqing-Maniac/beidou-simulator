const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { createSession, listNics } = require("./multicast.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const session = createSession();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    autoHideMenuBar: true,
    title: "北辰 · 导航模拟器",
    icon: path.join(__dirname, "../dist/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.key==='F11'){event.preventDefault();win.setFullScreen(!win.isFullScreen());}
  });
  session.onPacket((packet) => {
    if (!win.isDestroyed()) win.webContents.send("beidou:packet", packet);
  });
  session.onStatus((status) => {
    if (!win.isDestroyed()) win.webContents.send("beidou:status", status);
  });
  win.loadFile(path.join(__dirname, "../dist/index.html"));
}

ipcMain.handle('beidou:fullscreen', (event,toggle) => {const win=BrowserWindow.fromWebContents(event.sender);if(!win)return false;if(toggle)win.setFullScreen(!win.isFullScreen());return win.isFullScreen();});
ipcMain.handle("beidou:nics", () => listNics());
ipcMain.handle("beidou:listen", (_event, cfg) => session.listen(cfg || {}));
ipcMain.handle("beidou:send", (_event, cfg) => session.send(cfg.sentence, cfg));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  session.close();
  app.quit();
});
