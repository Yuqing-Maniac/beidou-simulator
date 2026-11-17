// Immutable update bootstrap, shipped with the full runtime. Application deltas never replace this file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const IMMUTABLE = ['electron/main.cjs', 'electron/update-runtime.cjs', 'electron/update-storage.cjs'];
const MAX_BYTES = 128 * 1024 * 1024;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function safePath(name) {
  if (typeof name !== 'string' || name.length > 240 || (/[\\:\x00-\x1f<>\"|?*]/.test(name)) || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('升级包包含非法路径');
  if (name !== 'package.json' && !name.startsWith('dist/') && !name.startsWith('electron/')) throw new Error('升级包文件超出应用目录');
  return name;
}
function inventory(root) {
  const result = {};
  function visit(rel) {
    const file = path.join(root, rel);const info = fs.lstatSync(file);
    if (info.isSymbolicLink()) throw new Error('应用目录不允许符号链接');
    if (info.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(rel ? rel + '/' + name : name);
    else if (info.isFile()) result[safePath(rel)] = hash(fs.readFileSync(file));
  }
  for (const rel of ['package.json', 'dist', 'electron']) visit(rel);
  return result;
}
function fingerprint(files) { return hash(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))); }
function version(root) { const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));if (typeof meta.version !== 'string' || !/^[\w.+-]{1,80}$/.test(meta.version)) throw new Error('应用版本无效');return meta.version; }
function writeJson(file, value) {fs.mkdirSync(path.dirname(file), {recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp, JSON.stringify(value), {flag:'wx'});fs.renameSync(tmp,file);}
function readState(home) {try {const state=JSON.parse(fs.readFileSync(path.join(home,'state.json'),'utf8'));for(const key of ['active','previous','pending'])if(state[key]!==null&&state[key]!==undefined&&!/^[a-f0-9]{32}$/.test(state[key]))throw new Error('升级状态无效');return state;}catch(error){if(error.code==='ENOENT')return {active:null,previous:null,pending:null,attempted:false};throw error;}}
function releaseRoot(home,id) {if(!/^[a-f0-9]{32}$/.test(id))throw new Error('升级目录标识无效');return path.join(home,'releases',id);}
function validateManifest(manifest) {
  if (!manifest || manifest.format !== 'beichen-delta-1' || !manifest.files || !manifest.baseFiles || !Array.isArray(manifest.removed) || typeof manifest.baseVersion !== 'string' || typeof manifest.version !== 'string' || !['win32','linux','darwin'].includes(manifest.platform) || !['x64','arm64','ia32'].includes(manifest.arch) || !Number.isInteger(manifest.electronMajor)) throw new Error('不支持的升级包格式');
  for(const files of [manifest.files,manifest.baseFiles]){const keys=Object.keys(files);if(keys.length>20000||!keys.includes('package.json')||!keys.includes('dist/index.html')||!keys.includes('electron/app-entry.cjs'))throw new Error('升级包文件清单不完整');const folded=new Set();for(const [name,sum] of Object.entries(files)){safePath(name);if(folded.has(name.toLowerCase()))throw new Error('升级包含重复或大小写冲突路径');folded.add(name.toLowerCase());if(!/^[a-f0-9]{64}$/.test(sum))throw new Error('升级包校验值无效');}}
  for(const name of manifest.removed)safePath(name);
  if (manifest.baseVersion === manifest.version) throw new Error('目标版本必须与当前版本不同');
  for (const name of IMMUTABLE) if (!manifest.files[name] || manifest.files[name] !== manifest.baseFiles[name]) throw new Error('引导程序发生变化，请使用完整安装包');
}
function readPackage(file) {
  if(fs.statSync(file).size>MAX_BYTES)throw new Error('升级包过大');
  let body;try {body=JSON.parse(zlib.gunzipSync(fs.readFileSync(file),{maxOutputLength:MAX_BYTES}).toString('utf8'));}catch{throw new Error('升级包损坏或格式不正确');}
  const {manifest,changes}=body;validateManifest(manifest);
  if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('升级包缺少变更内容');
  const expected=Object.keys(manifest.files).filter(name=>manifest.files[name]!==manifest.baseFiles[name]).sort();
  if(JSON.stringify(Object.keys(changes).sort())!==JSON.stringify(expected))throw new Error('升级包变更清单不匹配');
  let bytes=0;for(const [name,value] of Object.entries(changes)){safePath(name);if(typeof value!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('升级包文件编码无效');const data=Buffer.from(value,'base64');bytes+=data.length;if(bytes>MAX_BYTES||hash(data)!==manifest.files[name])throw new Error('升级包文件校验失败：'+name);}
  const removed=Object.keys(manifest.baseFiles).filter(name=>!manifest.files[name]).sort();if(JSON.stringify([...manifest.removed].sort())!==JSON.stringify(removed))throw new Error('升级包删除清单不匹配');
  return {manifest,changes,bytes,sha256:hash(fs.readFileSync(file))};
}
function checkBase(bundle,root,runtime) {
  const m=bundle.manifest;
  if(m.platform!==runtime.platform||m.arch!==runtime.arch||m.electronMajor!==runtime.electronMajor)throw new Error('升级包与当前操作系统、架构或 Electron 运行时不兼容');
  if(version(root)!==m.baseVersion)throw new Error('需要先安装基础版本 '+m.baseVersion+'，当前版本为 '+version(root));
  const actual=inventory(root);if(fingerprint(actual)!==fingerprint(m.baseFiles))throw new Error('当前应用文件与升级基础版本不一致，请使用对应的增量包或完整安装包');
}
function baseIdentity(root,runtime) {return hash(JSON.stringify({version:version(root),files:fingerprint(inventory(root)),platform:runtime.platform,arch:runtime.arch,electronMajor:runtime.electronMajor,electronVersion:runtime.electronVersion||String(runtime.electronMajor)}));}
function stage(bundle,root,home,runtime) {
  checkBase(bundle,root,runtime);
  fs.mkdirSync(home,{recursive:true});let lock;const lockPath=path.join(home,'install.lock');
  try {lock=fs.openSync(lockPath,'wx');fs.writeSync(lock,String(process.pid));}catch{let alive=true;try{const pid=Number(fs.readFileSync(lockPath,'utf8'));if(!Number.isInteger(pid)||pid<=0)alive=false;else process.kill(pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}if(alive)throw new Error('另一个升级任务正在进行');fs.rmSync(lockPath,{force:true});lock=fs.openSync(lockPath,'wx');fs.writeSync(lock,String(process.pid));}
  const id=crypto.randomBytes(16).toString('hex');const tmp=path.join(home,'staging-'+id);const dest=releaseRoot(home,id);
  try {
    const state=readState(home);if(!state.baseIdentity)state.baseIdentity=baseIdentity(root,runtime);if(state.pending)throw new Error('已有待重启升级，请先重启');
    fs.mkdirSync(tmp,{recursive:true});
    for(const name of Object.keys(bundle.manifest.files)) {const target=path.join(tmp,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Object.hasOwn(bundle.changes,name)?Buffer.from(bundle.changes[name],'base64'):fs.readFileSync(path.join(root,name)));}
    if(fingerprint(inventory(tmp))!==fingerprint(bundle.manifest.files)||version(tmp)!==bundle.manifest.version)throw new Error('升级暂存目录校验失败');
    writeJson(path.join(tmp,'integrity.json'),{files:bundle.manifest.files});fs.mkdirSync(path.dirname(dest),{recursive:true});fs.renameSync(tmp,dest);
    writeJson(path.join(home,'state.json'),{...state,pending:id,attempted:false});
    return {version:bundle.manifest.version,restartRequired:true};
  } finally {fs.rmSync(tmp,{recursive:true,force:true});fs.closeSync(lock);fs.rmSync(lockPath,{force:true});}
}
function resolveStartup(baseRoot,home,runtime={platform:process.platform,arch:process.arch,electronMajor:22}) {
  let state=readState(home);let rolledBack=false;let baseChanged=false;const identity=baseIdentity(baseRoot,runtime);if(state.baseIdentity!==identity){const changed=Boolean(state.baseIdentity||state.active||state.pending);state={active:null,previous:null,pending:null,attempted:false,baseIdentity:identity};writeJson(path.join(home,'state.json'),state);baseChanged=changed;}
  if(state.pending&&state.attempted){state.pending=null;state.attempted=false;rolledBack=true;writeJson(path.join(home,'state.json'),state);}
  let id=state.pending||state.active;
  if(id){try {const root=releaseRoot(home,id);const integrity=JSON.parse(fs.readFileSync(path.join(root,'integrity.json'),'utf8'));if(fingerprint(inventory(root))!==fingerprint(integrity.files))throw new Error('应用文件校验失败');}catch(error){if(state.pending){state.pending=null;state.attempted=false;id=state.active;rolledBack=true;}else{state.active=state.previous||null;state.previous=null;id=state.active;rolledBack=true;}writeJson(path.join(home,'state.json'),state);if(id){const root=releaseRoot(home,id),integrity=JSON.parse(fs.readFileSync(path.join(root,'integrity.json'),'utf8'));if(fingerprint(inventory(root))!==fingerprint(integrity.files))throw error;}}}
  if(state.pending){state.attempted=true;writeJson(path.join(home,'state.json'),state);}
  return {root:id?releaseRoot(home,id):baseRoot,candidate:state.pending||null,rolledBack,baseChanged};
}
function markHealthy(home,candidate) {if(!candidate)return;const state=readState(home);if(state.pending!==candidate)throw new Error('升级状态已变化');const next={active:candidate,previous:state.active,pending:null,attempted:false,baseIdentity:state.baseIdentity};writeJson(path.join(home,'state.json'),next);const releases=path.join(home,'releases');for(const id of fs.readdirSync(releases)){if(/^[a-f0-9]{32}$/.test(id)&&![next.active,next.previous].includes(id)){try{fs.rmSync(path.join(releases,id),{recursive:true,force:true});}catch{/* Cleanup must never make a healthy activation fail. */}}}}
function rollback(home) {const state=readState(home);if(state.pending){state.pending=null;state.attempted=false;}else if(state.active){const old=state.active;state.active=state.previous||null;state.previous=old;}else throw new Error('当前没有可回退版本');writeJson(path.join(home,'state.json'),state);}
module.exports={IMMUTABLE,MAX_BYTES,hash,safePath,inventory,fingerprint,version,writeJson,readState,readPackage,checkBase,stage,resolveStartup,markHealthy,rollback,validateManifest,baseIdentity};
