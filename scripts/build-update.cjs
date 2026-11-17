#!/usr/bin/env node
// Build from the two exact packaged app.asar files, or equivalent unpacked application roots.
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const zlib=require('node:zlib');
const u=require('../electron/update-runtime.cjs');
function buildUpdate(base,target,{platform,arch,electronMajor},output){
  const baseFiles=u.inventory(base),files=u.inventory(target);
  const manifest={format:'beichen-delta-1',baseVersion:u.version(base),version:u.version(target),platform,arch,electronMajor,baseFiles,files,removed:Object.keys(baseFiles).filter(name=>!files[name])};u.validateManifest(manifest);
  const changes={};for(const name of Object.keys(files))if(files[name]!==baseFiles[name])changes[name]=fs.readFileSync(path.join(target,name)).toString('base64');
  const compressed=zlib.gzipSync(JSON.stringify({manifest,changes}),{level:9});if(compressed.length>u.MAX_BYTES)throw new Error('升级包过大，请使用完整安装包');fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,compressed);
  const sum=u.hash(compressed);fs.writeFileSync(output+'.sha256',sum+'  '+path.basename(output)+'\n');return{baseVersion:manifest.baseVersion,version:manifest.version,files:Object.keys(changes).length,bytes:compressed.length,sha256:sum};
}
if(require.main===module){const args=process.argv.slice(2);const get=name=>{const index=args.indexOf('--'+name);if(index<0||!args[index+1])throw new Error('缺少 --'+name);return args[index+1];};const temp=fs.mkdtempSync(path.join(os.tmpdir(),'beichen-delta-'));try{const root=(file,label)=>{if(fs.statSync(file).isDirectory())return file;const out=path.join(temp,label);require('@electron/asar').extractAll(file,out);return out;};const result=buildUpdate(root(get('base'),'base'),root(get('target'),'target'),{platform:get('platform'),arch:get('arch'),electronMajor:Number(get('electron-major'))},get('out'));console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}finally{fs.rmSync(temp,{recursive:true,force:true});}}
module.exports={buildUpdate};
