import data from './tutorial-data.json';
import manualText from '../docs/tutorial.txt?raw';
import type { TutorialChapter } from './tutorial-types.ts';
const chapters=data as TutorialChapter[];
type View='board'|'proto'|'track';
type Hooks={navigate:(view:View)=>void;mode:(simple:boolean)=>void};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export function mountTutorial(hooks:Hooks) {
  let index=0,active=false,token=0,timer=0,left=false,collapsed=false;
  let original:{simple:boolean;view:View;details:boolean;scroll:number}|null=null;
  let prefs={voice:true,cues:true,auto:false,volume:.8,speed:1};let completed=new Set<string>();
  try{const stored=JSON.parse(localStorage.getItem('beichen-tutorial')??'{}');
    if(typeof stored.voice==='boolean')prefs.voice=stored.voice;if(typeof stored.cues==='boolean')prefs.cues=stored.cues;
    if(typeof stored.auto==='boolean')prefs.auto=stored.auto;
    if(Number.isFinite(stored.volume))prefs.volume=Math.max(0,Math.min(1,stored.volume));
    if([.75,1,1.25,1.5].includes(stored.speed))prefs.speed=stored.speed;
    completed=new Set((Array.isArray(stored.completed)?stored.completed:[]).filter((id:string)=>chapters.some(c=>c.id===id)));
    const at=chapters.findIndex(c=>c.id===stored.last);if(at>=0)index=at;
  }catch{/* Fresh tutorial preferences. */}
  const save=()=>{try{localStorage.setItem('beichen-tutorial',JSON.stringify({...prefs,completed:[...completed],last:chapters[index].id}));}catch{/* Text and audio remain available without storage. */}};
  const panel=el('section');panel.id='tutorial-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','北辰逐步语音教程');
  panel.innerHTML=`<header class="tutorial-header"><div><small>北辰 · 离线语音教程</small><h2 id="tutorial-title"></h2></div><button id="tutorial-collapse" aria-label="收起教程面板">收起</button><button id="tutorial-close" aria-label="关闭教程">×</button></header>
  <div class="tutorial-progress"><progress id="tutorial-progress" max="24" value="1"></progress><span id="tutorial-count"></span></div>
  <div class="tutorial-audio-controls"><button id="tutorial-play">播放讲解</button><button id="tutorial-restart">重播</button><label><input id="tutorial-voice" type="checkbox"/>语音</label><label><input id="tutorial-cues" type="checkbox"/>提示音</label><label>音量<input id="tutorial-volume" aria-label="教程音量" type="range" min="0" max="100"/></label><label>语速<select id="tutorial-speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div>
  <p id="tutorial-audio-status" role="status" aria-live="polite"></p><div class="tutorial-playback"><progress id="tutorial-audio-progress" max="1" value="0"></progress><span id="tutorial-audio-time">0:00 / —</span></div>
  <div id="tutorial-body"><label class="tutorial-chapter-label">跳转章节<select id="tutorial-chapter"></select></label><p id="tutorial-overview"></p><details class="tutorial-transcript" open><summary>本章语音讲解原文</summary><p id="tutorial-transcript"></p></details><h3>按步骤操作与检查</h3><ol id="tutorial-steps"></ol><h3>常见问题与说明</h3><ul id="tutorial-tips"></ul><p class="tutorial-note">教程只定位控件，不会代你改参数或发报。当前任务状态保留。</p><button id="tutorial-side">面板移到左侧</button><button id="tutorial-manual">查看详细文字教程</button></div>
  <footer><button id="tutorial-prev">上一章</button><button id="tutorial-complete">标记已学</button><button id="tutorial-next">下一章</button><label><input id="tutorial-auto" type="checkbox"/>讲完自动下一章</label></footer>`;
  const audio=el('audio');audio.id='tutorial-audio';audio.preload='metadata';panel.appendChild(audio);
  const cue=new Audio(new URL('tutorial/cue.wav',document.baseURI).href);cue.volume=prefs.volume*.3;
  const highlight=el('div');highlight.id='tutorial-highlight';highlight.hidden=true;highlight.setAttribute('aria-hidden','true');
  document.body.append(highlight,panel);
  let targetSelector='';
  const status=(text:string)=>{byId('tutorial-audio-status').textContent=text;};
  const formatTime=(value:number)=>Number.isFinite(value)?`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`:'—';
  const updateAudio=()=>{
    byId('tutorial-play').textContent=audio.paused?'播放讲解':'暂停讲解';
    (byId('tutorial-audio-progress') as HTMLProgressElement).value=Number.isFinite(audio.duration)&&audio.duration>0?audio.currentTime/audio.duration:0;
    byId('tutorial-audio-time').textContent=`${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  };
  const positionHighlight=()=>{
    const target=targetSelector?document.querySelector<HTMLElement>(targetSelector):null;
    if(!active||!target){highlight.hidden=true;return;}
    const r=target.getBoundingClientRect();if(r.width===0||r.height===0||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth){highlight.hidden=true;return;}
    highlight.hidden=false;highlight.style.left=`Math.max(2,r.left-5)}px`;highlight.style.top=`Math.max(2,r.top-5)}px`;
    highlight.style.width=`Math.min(innerWidth-4,r.width+10)}px`;highlight.style.height=`Math.min(innerHeight-4,r.height+10)}px`;
  };
  const locate=(selector:string)=>{
    hooks.navigate(chapters[index].view);if(chapters[index].advanced)hooks.mode(false);
    const target=document.querySelector<HTMLElement>(selector);
    if(!target){status('当前控件不可见，可按文字步骤切换界面后再次定位。');return;}
    const details=target.closest('details');if(details)details.open=true;
    targetSelector=selector;target.scrollIntoView({behavior:'instant' as ScrollBehavior,block:'center'});positionHighlight();
  };
  const updateChapterOptions=()=>{
    const select=byId<HTMLSelectElement>('tutorial-chapter');select.replaceChildren();
    chapters.forEach((chapter,i)=>{const option=el('option',`${completed.has(chapter.id)?'✓ ':''}${i+1}. ${chapter.title}`);option.value=String(i);select.appendChild(option);});select.value=String(index);
  };
  const play=async()=>{
    if(!active)return;if(!prefs.voice){status('当前只看文字，勾选“语音”即可播放离线讲解。');return;}
    const request=token;audio.volume=prefs.volume;audio.playbackRate=prefs.speed;
    try{await audio.play();if(request===token&&active){status('正在播放离线合成语音，讲解原文见下方。');updateAudio();}}
    catch{if(request===token&&active)status('语音未能播放。请点击“播放讲解”重试；文字教程仍可完整阅读。');}
  };
  const render=(autoPlay:boolean)=>{
    token++;clearTimeout(timer);audio.pause();cue.pause();
    const chapter=chapters[index];save();updateChapterOptions();
    byId('tutorial-title').textContent=chapter.title;byId('tutorial-count').textContent=`${index+1} / ${chapters.length} · 已学 ${completed.size}`;
    const progress=byId<HTMLProgressElement>('tutorial-progress');progress.max=chapters.length;progress.value=index+1;
    byId('tutorial-overview').textContent=chapter.overview;byId('tutorial-transcript').textContent=chapter.narration;
    const steps=byId('tutorial-steps');steps.replaceChildren();
    chapter.steps.forEach(step=>{const item=el('li');item.append(el('strong',step.label),el('p',step.action),el('p',`应看到：${step.expect}`));const button=el('button','定位此操作');button.type='button';button.onclick=()=>locate(step.target);item.appendChild(button);steps.appendChild(item);});
    const tips=byId('tutorial-tips');tips.replaceChildren(...chapter.tips.map(t=>el('li',t)));
    (byId('tutorial-prev') as HTMLButtonElement).disabled=index===0;(byId('tutorial-next') as HTMLButtonElement).disabled=index===chapters.length-1;
    audio.src=new URL(`tutorial/audio/${chapter.id}.mp3`,document.baseURI).href;audio.load();updateAudio();
    status(prefs.voice?'本章附带离线中文讲解；可暂停、重播或只看文字。':'只看文字模式，操作步骤与讲解原文均可阅读。');
    locate(chapter.target);
    if(prefs.cues){cue.currentTime=0;void cue.play().catch(()=>{});}
    const current=token;if(autoPlay&&prefs.voice)timer=window.setTimeout(()=>{if(current===token)void play();},prefs.cues?220:0);
  };
  const open=(chapterIndex?:number)=>{
    if(!active){original={simple:document.body.classList.contains('simple'),view:byId('proto').hidden?'board':'proto',details:document.querySelector<HTMLDetailsElement>('.more')?.open??false,scroll:scrollY};}
    if(Number.isInteger(chapterIndex))index=Math.max(0,Math.min(chapters.length-1,chapterIndex!));
    const help=byId<HTMLDialogElement>('help-dialog');if(help.open)help.close();
    byId('tutorial-invite')?.remove();try{localStorage.setItem('beichen-tutorial-intro','seen');}catch{}
    active=true;panel.hidden=false;render(true);byId('tutorial-play').focus({preventScroll:true});
  };
  const close=()=>{
    active=false;token++;clearTimeout(timer);audio.pause();cue.pause();panel.hidden=true;highlight.hidden=true;targetSelector='';save();
    if(original){hooks.mode(original.simple);hooks.navigate(original.view);const details=document.querySelector<HTMLDetailsElement>('.more');if(details)details.open=original.details;window.scrollTo(0,original.scroll);original=null;}
    byId('tutorial-open').focus({preventScroll:true});
  };
  audio.addEventListener('timeupdate',updateAudio);audio.addEventListener('loadedmetadata',updateAudio);audio.addEventListener('pause',updateAudio);audio.addEventListener('play',updateAudio);
  audio.addEventListener('error',()=>{if(active)status('本章音频未能读取。请重播或重新下载完整安装包；文字步骤仍可使用。');});
  audio.addEventListener('ended',()=>{
    if(!active)return;completed.add(chapters[index].id);save();updateChapterOptions();updateAudio();
    status(completed.size===chapters.length?'全部章节已学过，可按目录重学或查看文字教程。':index===chapters.length-1?'已到最后一章，可按目录检查尚未学习的章节。':'本章讲解结束，请完成步骤检查，再继续下一章。');
    byId('tutorial-count').textContent=`${index+1} / ${chapters.length} · 已学 ${completed.size}`;
    if(prefs.auto&&index<chapters.length-1){const current=token;timer=window.setTimeout(()=>{if(active&&prefs.auto&&current===token){index++;render(true);}},1100);}
  });
  byId('tutorial-open').onclick=()=>open();byId('tutorial-close').onclick=close;
  byId('tutorial-play').onclick=()=>{token++;clearTimeout(timer);if(!audio.paused)audio.pause();else void play();};
  byId('tutorial-restart').onclick=()=>{token++;clearTimeout(timer);audio.currentTime=0;void play();};
  byId('tutorial-prev').onclick=()=>{if(index>0){index--;render(true);}};byId('tutorial-next').onclick=()=>{if(index<chapters.length-1){index++;render(true);}};
  byId<HTMLSelectElement>('tutorial-chapter').onchange=event=>{index=Number((event.target as HTMLSelectElement).value);render(true);};
  byId('tutorial-complete').onclick=()=>{completed.add(chapters[index].id);save();updateChapterOptions();byId('tutorial-count').textContent=`${index+1} / ${chapters.length} · 已学 ${completed.size}`;status('本章已标记学过，可继续下一章。');};
  for(const [id,key] of [['tutorial-voice','voice'],['tutorial-cues','cues'],['tutorial-auto','auto']] as const){const input=byId<HTMLInputElement>(id);input.checked=prefs[key];input.onchange=()=>{prefs[key]=input.checked;save();if(key==='cues'&&!prefs.cues)cue.pause();if(key==='voice'){token++;clearTimeout(timer);if(!prefs.voice){audio.pause();status('只看文字模式。');}else void play();}};}
  const volume=byId<HTMLInputElement>('tutorial-volume');volume.value=String(prefs.volume*100);volume.oninput=()=>{prefs.volume=Number(volume.value)/100;audio.volume=prefs.volume;cue.volume=prefs.volume*.3;save();};
  const speed=byId<HTMLSelectElement>('tutorial-speed');speed.value=String(prefs.speed);speed.onchange=()=>{prefs.speed=Number(speed.value);audio.playbackRate=prefs.speed;save();};
  byId('tutorial-side').onclick=()=>{left=!left;panel.classList.toggle('tutorial-left',left);byId('tutorial-side').textContent=left?'面板移到右侧':'面板移到左侧';};
  byId('tutorial-collapse').onclick=()=>{collapsed=!collapsed;panel.classList.toggle('tutorial-collapsed',collapsed);byId('tutorial-collapse').textContent=collapsed?'展开':'收起';};
  byId('tutorial-manual').onclick=()=>{close();byId<HTMLDialogElement>('help-dialog').showModal();};
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  window.addEventListener('scroll',positionHighlight,true);window.addEventListener('resize',positionHighlight);
  // Detailed manual with chapter search and an export that remains usable outside the app.
  const manual=byId('help-content');manual.replaceChildren();
  const heading=el('h1','北辰 0.6.0-test · 详细使用教程');const introduction=el('p',`共 ${chapters.length} 章，包含详细步骤、预期结果、常见问题与离线中文讲解。`);
  const tools=el('div');tools.className='manual-tools';
  const search=el('input');search.id='manual-search';search.type='search';search.placeholder='搜索：组播、经纬度、回放、故障……';search.setAttribute('aria-label','搜索详细教程');
  const start=el('button','从第一章开始语音教程');start.onclick=()=>open(0);
  const download=el('button','下载完整文字教程');download.onclick=()=>{const url=URL.createObjectURL(new Blob(['\uFEFF',manualText],{type:'text/plain;charset=utf-8'}));const a=el('a');a.href=url;a.download='北辰-0.6.0-test-详细使用教程.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  tools.append(search,start,download);const results=el('div');results.id='manual-results';manual.append(heading,introduction,tools,results);
  const renderManual=()=>{
    const query=search.value.trim().toLowerCase();results.replaceChildren();let found=0;
    chapters.forEach((chapter,i)=>{if(query&&!JSON.stringify(chapter).toLowerCase().includes(query))return;found++;
      const block=el('details');block.className='manual-chapter';block.open=Boolean(query)||i===0;
      block.appendChild(el('summary',`${i+1}. ${chapter.title}`));block.appendChild(el('p',chapter.overview));
      const listen=el('button','听本章讲解并定位');listen.onclick=()=>open(i);block.appendChild(listen);
      block.append(el('h3','讲解原文'),el('p',chapter.narration),el('h3','详细操作'));
      const list=el('ol');chapter.steps.forEach(step=>{const item=el('li');item.append(el('strong',step.label),el('p',`操作：${step.action}`),el('p',`应看到：${step.expect}`));list.appendChild(item);});block.appendChild(list);
      block.appendChild(el('h3','常见问题与说明'));const tips=el('ul');tips.append(...chapter.tips.map(t=>el('li',t)));block.appendChild(tips);results.appendChild(block);
    });
    if(!found)results.appendChild(el('p','没有匹配章节，请试试“网卡”“声音”或“回放”等关键词。'));
  };
  search.oninput=renderManual;renderManual();
  let showInvite=true;try{showInvite=localStorage.getItem('beichen-tutorial-intro')!=='seen';}catch{}
  if(showInvite){
    const invite=el('aside');invite.id='tutorial-invite';invite.append(el('strong','第一次使用？24 章中文语音教程已内置'),el('span','可离线听讲、查看详细步骤，并定位真实操作控件。'));
    const begin=el('button','开始学习');begin.onclick=()=>open(0);
    const later=el('button','稍后再看');later.onclick=()=>{invite.remove();try{localStorage.setItem('beichen-tutorial-intro','seen');}catch{}};
    invite.append(begin,later);document.querySelector('.workspace-bar')?.after(invite);
  }
}
