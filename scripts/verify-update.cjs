// Verify an exact published baseline delta reconstructs the exact packaged target.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const asar=require('@electron/asar'),u=require('../electron/update-runtime.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'beichen-verify-delta-'));
try{
 const [baseFile,targetFile,deltaFile]=process.argv.slice(2);if(!deltaFile)throw new Error('Usage: node scripts/verify-update.cjs base.asar target.asar update.bcu');
 const base=path.join(temp,'base'),target=path.join(temp,'target'),home=path.join(temp,'updates');asar.extractAll(baseFile,base);asar.extractAll(targetFile,target);
 const bundle=u.readPackage(deltaFile),m=bundle.manifest,runtime={platform:m.platform,arch:m.arch,electronMajor:m.electronMajor};
 u.stage(bundle,base,home,runtime);const startup=u.resolveStartup(base,home,runtime);
 assert.equal(u.fingerprint(u.inventory(startup.root)),u.fingerprint(u.inventory(target)));assert.equal(u.version(startup.root),u.version(target));
 u.markHealthy(home,startup.candidate);assert.equal(u.resolveStartup(base,home,runtime).root,startup.root);
 console.log('Published baseline delta reconstructs the exact packaged target:',u.version(target));
}catch(error){console.error(error);process.exitCode=1;}finally{fs.rmSync(temp,{recursive:true,force:true});}
