import compass from "./compass.svg?raw";
export function mountStartup() {
  const splash=document.getElementById('splash')!;
  splash.innerHTML=`<div class="opening-stars"></div><div class="opening-emblem"><div class="opening-square"></div><div class="opening-orbit"></div>${compass.replace('<g id="compass-pointer"','<g class="animated-pointer" id="compass-pointer"')}<div class="opening-needle"></div></div><div class="opening-title"><span>NORTH STAR · NAVIGATION LAB</span><h1>北 辰</h1><p>循迹而行 · 定向未来</p></div><div class="opening-controls"><button id="startup-sound">开启启动音</button><button id="skip-splash">进入工作台 →</button><label><input id="startup-auto" type="checkbox"/> 下次自动播放声音</label></div><div class="opening-progress"><i></i></div>`;
  const audio=new Audio('./startup.wav');audio.volume=.32;
  let enabled=false;try{enabled=localStorage.getItem('beichen-startup-sound')!=='false';}catch{}
  const toggle=document.getElementById('startup-auto') as HTMLInputElement;toggle.checked=enabled;
  toggle.onchange=()=>{try{localStorage.setItem('beichen-startup-sound',String(toggle.checked));}catch{}};
  const sound=document.getElementById('startup-sound')!;
  const play=()=>{audio.currentTime=0;void audio.play().then(()=>{sound.textContent='启动音播放中 ♪';}).catch(()=>{sound.textContent='点击播放启动音 ♪';});};
  sound.onclick=play;if(enabled)play();
  let timer=0;
  const close=()=>{clearTimeout(timer);audio.pause();splash.remove();};
  document.getElementById('skip-splash')!.onclick=close;
  // Leave time to see the complete compass assembly and title reveal.
  timer=window.setTimeout(close,8500);
}
