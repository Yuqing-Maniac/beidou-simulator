// Stable entry point: keep byte-for-byte compatible across incremental releases.
const {app,dialog,ipcMain,BrowserWindow}=require('electron');
const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto');
const updates=require('./update-runtime.cjs');
if(!app.requestSingleInstanceLock()){app.quit();}else{
  const baseRoot=path.join(__dirname,'..');const home=path.join(app.getPath('userData'),'application-updates');
  const runtime={platform:process.platform,arch:process.arch,electronMajor:Number(process.versions.electron.split('.')[0]),electronVersion:process.versions.electron};
  let startup;
  try{startup=updates.resolveStartup(baseRoot,home,runtime);}catch(error){startup={root:baseRoot,candidate:null,rolledBack:true};if(fs.existsSync(path.join(home,'state.json')))fs.renameSync(path.join(home,'state.json'),path.join(home,'state-corrupt-'+Date.now()+'.json'));}
  let preview=null;let healthy=false;let timer=null;
  const restart=()=>{app.relaunch({execPath:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath});app.exit(0);};
  const info=()=>{const state=updates.readState(home);return{version:updates.version(startup.root),runtimeVersion:app.getVersion(),platform:runtime.platform,arch:runtime.arch,electronMajor:runtime.electronMajor,pending:state.pending&&!startup.candidate?true:false,canRollback:Boolean(state.previous||state.active||state.pending),rolledBack:startup.rolledBack,baseChanged:Boolean(startup.baseChanged)};};
  function requireOwnWindow(event){const win=BrowserWindow.fromWebContents(event.sender);if(!win||event.sender.getURL().split(/[?#]/)[0]!==require('node:url').pathToFileURL(path.join(startup.root,'dist/index.html')).href)throw new Error('拒绝来自非应用页面的升级请求');return win;}
  const storage=require('./update-storage.cjs');
  ipcMain.on('beidou:storage-load',(event,values)=>{try{requireOwnWindow(event);event.returnValue={values:storage.load(app.getPath('userData'),values)};}catch(error){event.returnValue={error:error.message};}});
  ipcMain.on('beidou:storage-save',(event,values)=>{try{requireOwnWindow(event);event.returnValue={ok:storage.save(app.getPath('userData'),values)};}catch(error){event.returnValue={error:error.message};}});
  ipcMain.handle('beidou:update-info',event=>{requireOwnWindow(event);return info();});
  ipcMain.handle('beidou:update-preview',async event=>{
    const win=requireOwnWindow(event);const selected=await dialog.showOpenDialog(win,{title:'选择北辰增量升级包',properties:['openFile'],filters:[{name:'北辰增量升级包',extensions:['bcu']}]});
    if(selected.canceled)return null;
    const bundle=updates.readPackage(selected.filePaths[0]);updates.checkBase(bundle,startup.root,runtime);
    const token=crypto.randomUUID();preview={bundle,token,expires:Date.now()+10*60*1000};
    return{token,baseVersion:bundle.manifest.baseVersion,version:bundle.manifest.version,changedFiles:Object.keys(bundle.changes).length,removedFiles:bundle.manifest.removed.length,bytes:bundle.bytes,sha256:bundle.sha256};
  });
  ipcMain.handle('beidou:update-apply',(event,token)=>{requireOwnWindow(event);if(!preview||preview.token!==token||preview.expires<Date.now())throw new Error('升级预览已失效，请重新选择升级包');const result=updates.stage(preview.bundle,startup.root,home,runtime);preview=null;return result;});
  ipcMain.handle('beidou:update-restart',event=>{requireOwnWindow(event);restart();return true;});
  ipcMain.handle('beidou:update-rollback',event=>{requireOwnWindow(event);updates.rollback(home);restart();return true;});
  ipcMain.handle('beidou:update-healthy',event=>{requireOwnWindow(event);if(!healthy){updates.markHealthy(home,startup.candidate);healthy=true;clearTimeout(timer);}return true;});
  app.on('second-instance',()=>{const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.focus();}});
  if(startup.candidate){app.whenReady().then(()=>{timer=setTimeout(()=>{if(!healthy)restart();},30000);});}
  try{require(path.join(startup.root,'electron/app-entry.cjs'));}catch(error){if(startup.candidate){restart();}else{app.whenReady().then(()=>dialog.showErrorBox('北辰启动失败',error.message)).finally(()=>app.quit());}}
}
