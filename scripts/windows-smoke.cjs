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
    let initial;
    for(let attempt=0;attempt<80;attempt++){
      initial=await evaluate(`(async()=>({fullscreen:await window.beidou.fullscreen(), ready:document.querySelectorAll('#dataset-list .set').length===15&&typeof document.getElementById('replay-normal')?.onclick==='function'&&typeof document.getElementById('fullscreen-toggle')?.onclick==='function', splashClosed:!document.getElementById('splash')}))()`);
      if(initial.splashClosed)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!initial.fullscreen||!initial.ready||!initial.splashClosed)throw new Error('Startup validation failed: '+JSON.stringify(initial));
    const controls=await evaluate(`(()=>({simple:document.body.classList.contains('simple'),source:document.getElementById('clock-source').value,scenes:[...document.querySelectorAll('#dataset-list .set')].filter(e=>e.getClientRects().length).length,sliders:document.querySelectorAll('.parameter-slider').length,preview:typeof document.getElementById('preview-run').onclick==='function'}))()`);
    if(!controls.simple||controls.source!=='system'||controls.scenes!==8||controls.sliders<15||!controls.preview)throw new Error('Quick controls validation failed: '+JSON.stringify(controls));
    const clock=await evaluate(`(()=>{
      const input=document.getElementById('clock-week');input.value='2500';input.dispatchEvent(new Event('change',{bubbles:true}));
      const seconds=document.getElementById('clock-sow');seconds.value='123.00';seconds.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('[data-scenario="reverse"]').click();
      const parts=document.getElementById('sentence').textContent.split(',');
      const result={source:document.getElementById('clock-source').value,week:parts[1],seconds:parts[2]};
      document.getElementById('clock-now').click();document.querySelector('[data-scenario="motion-line"]').click();return result;
    })()`);
    if(clock.source!=='manual'||clock.week!=='2500'||clock.seconds!=='123.00')throw new Error('Global clock did not survive scene change: '+JSON.stringify(clock));
    console.log('Packaged quick controls and global clock passed:',JSON.stringify({controls,clock}));
    const updater=await evaluate(`window.beidou.updateInfo()`);
    if(updater.version!=='0.8.1-test'||typeof updater.pending!=='boolean')throw new Error('Incremental update bridge did not initialize: '+JSON.stringify(updater));
    const maps=await evaluate(`(async()=>{const results=[];for(const id of ['beijing','damao','zhanjiang','guangzhou']){const input=document.getElementById('map-region');input.value=id;input.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(!document.getElementById('map-status').textContent.includes('加载'))break;}results.push({id,status:document.getElementById('map-status').textContent,attribution:document.getElementById('map-attribution').textContent,lat:Number(document.getElementById('sentence').textContent.split(',')[12])});}document.getElementById('map-region').value='synthetic';document.getElementById('map-region').dispatchEvent(new Event('change',{bubbles:true}));return results;})()`);
    if(maps.some(m=>m.status||!m.attribution.includes('OpenStreetMap'))||maps.length!==4)throw new Error('Packaged offline region loading failed: '+JSON.stringify(maps));
    console.log('Packaged four offline maps and update bridge passed:',JSON.stringify({maps,updater}));
    const toggles=await evaluate(`(async()=>{await window.beidou.fullscreen(true);await new Promise(r=>setTimeout(r,700));const windowed=!await window.beidou.fullscreen();await window.beidou.fullscreen(true);await new Promise(r=>setTimeout(r,700));return {windowed,restored:await window.beidou.fullscreen()};})()`);
    if(!toggles.windowed||!toggles.restored)throw new Error('Fullscreen toggle failed: '+JSON.stringify(toggles));
    const tutorial=await evaluate(`(async()=>{
      document.getElementById('tutorial-open').click();
      const audio=document.getElementById('tutorial-audio');
      await new Promise((resolve,reject)=>{if(audio.readyState>=1)return resolve();audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('Offline narration failed to load')),{once:true});setTimeout(()=>reject(new Error('Offline narration metadata timeout')),10000);});
      const result={visible:!document.getElementById('tutorial-panel').hidden,chapters:document.getElementById('tutorial-chapter').options.length,duration:audio.duration,offline:audio.currentSrc.startsWith('file:'),transcript:document.getElementById('tutorial-transcript').textContent.length>80};
      document.getElementById('tutorial-close').click();return result;
    })()`);
    if(!tutorial.visible||tutorial.chapters!==28||tutorial.duration<5||!tutorial.offline||!tutorial.transcript)throw new Error('Tutorial validation failed: '+JSON.stringify(tutorial));
    console.log('Packaged offline tutorial checks passed:',JSON.stringify(tutorial));
    console.log('Packaged UI and fullscreen checks passed:' ,JSON.stringify({initial,toggles}));
  } finally {ws.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
