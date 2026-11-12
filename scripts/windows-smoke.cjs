// Validate the packaged renderer and fullscreen IPC through loopback-only CDP.
async function main() {
  const targets=await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target=targets.find(x=>x.type==='page'&&x.url.startsWith('file:'));
  if(!target)throw new Error('Packaged application page not found');
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const pending=new Map();let id=0;
  ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);const cb=pending.get(msg.id);if(cb){pending.delete(msg.id);cb(msg);}});
  const evaluate=expression=>new Promise((resolve,reject)=>{
    const next=++id;const timer=setTimeout(()=>reject(new Error('Renderer evaluation timed out')),15000);
    pending.set(next,message=>{clearTimeout(timer);if(message.error||message.result?.exceptionDetails)reject(new Error(JSON.stringify(message)));else resolve(message.result.result.value);});
    ws.send(JSON.stringify({id:next,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  try {
    const initial=await evaluate(`(async()=>({fullscreen:await window.beidou.fullscreen(), ready:document.querySelectorAll('#dataset-list .set').length===13&&typeof document.getElementById('replay-normal')?.onclick==='function'&&typeof document.getElementById('fullscreen-toggle')?.onclick==='function', splashClosed:!document.getElementById('splash')}))()`);
    if(!initial.fullscreen||!initial.ready||!initial.splashClosed)throw new Error('Startup validation failed: '+JSON.stringify(initial));
    const toggles=await evaluate(`(async()=>{await window.beidou.fullscreen(true);await new Promise(r=>setTimeout(r,700));const windowed=!await window.beidou.fullscreen();await window.beidou.fullscreen(true);await new Promise(r=>setTimeout(r,700));return {windowed,restored:await window.beidou.fullscreen()};})()`);
    if(!toggles.windowed||!toggles.restored)throw new Error('Fullscreen toggle failed: '+JSON.stringify(toggles));
    const tutorial=await evaluate(`(async()=>{
      document.getElementById('tutorial-open').click();
      const audio=document.getElementById('tutorial-audio');
      await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('Offline narration failed to load')),{once:true});setTimeout(()=>reject(new Error('Offline narration metadata timeout')),10000);});
      const result={visible:!document.getElementById('tutorial-panel').hidden,chapters:document.getElementById('tutorial-chapter').options.length,duration:audio.duration,offline:audio.currentSrc.startsWith('file:'),transcript:document.getElementById('tutorial-transcript').textContent.length>80};
      document.getElementById('tutorial-close').click();return result;
    })()`);
    if(!tutorial.visible||tutorial.chapters!==24||tutorial.duration<5||!tutorial.offline||!tutorial.transcript)throw new Error('Tutorial validation failed: '+JSON.stringify(tutorial));
    console.log('Packaged offline tutorial checks passed:',JSON.stringify(tutorial));
    console.log('Packaged UI and fullscreen checks passed:' ,JSON.stringify({initial,toggles}));
  } finally {ws.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
