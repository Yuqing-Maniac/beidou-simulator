// Persist saved renderer preferences independently of file:// paths and portable extraction directories.
const fs=require('node:fs');const path=require('node:path');
const {writeJson}=require('./update-runtime.cjs');
const MAX_STORAGE=16*1024*1024;
function clean(values){if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('保存的本机设置格式无效');let bytes=0;const result={};for(const [key,value] of Object.entries(values)){if(!/^beichen-[a-z0-9-]{1,80}$/.test(key)||typeof value!=='string')continue;bytes+=Buffer.byteLength(value);if(bytes>MAX_STORAGE)throw new Error('保存的本机设置超过限制');result[key]=value;}return result;}
function storageFile(userData){return path.join(userData,'beichen-preferences.json');}
function load(userData,initial){const file=storageFile(userData);try{return clean(JSON.parse(fs.readFileSync(file,'utf8')).values);}catch(error){if(error.code!=='ENOENT'&&fs.existsSync(file))fs.renameSync(file,file+'.invalid-'+Date.now());const values=clean(initial);writeJson(file,{version:1,values});return values;}}
function save(userData,values){const result=clean(values);writeJson(storageFile(userData),{version:1,values:result});return true;}
module.exports={clean,load,save};
