import { checksumOf, decodeSentence, encodeSentence, payloadFromTokens } from './gpchc.ts';

export const FAULT_KINDS = [
  { id: 'checksum', name: '校验错误', description: '故意破坏异或校验，测试接收端校验与丢弃。' },
  { id: 'no-fix', name: '失去定位', description: '卫星数归零，切为不定位纯惯导，并设置 GNSS/PPS 中断告警。' },
  { id: 'position-jump', name: '位置跳变', description: '在发送副本的经纬度上偏移约 0.01°，测试位置异常识别。' },
  { id: 'stale-time', name: '时间滞后', description: '发送副本的 GPS 时间回退 10 秒，测试过期数据处理。' },
  { id: 'velocity-spike', name: '速度突增', description: '东、北速度各增加 50 m/s，测试速度异常识别。' },
] as const;
export type FaultKind = typeof FAULT_KINDS[number]['id'];
export type FaultSettings = { enabled: boolean; mode: 'ratio'|'random'; percent: number; kinds: FaultKind[]; seed: number };
export const DEFAULT_FAULT_SETTINGS: FaultSettings = { enabled: false, mode: 'ratio', percent: 10, kinds: ['checksum'], seed: 2026 };
export type FaultResult = { sentence: string; injected: boolean; kind?: FaultKind; reason?: string };
export type FaultStats = { total: number; eligible: number; injected: number; skipped: number; perKind: Record<FaultKind,number> };

export function validateFaultSettings(value: unknown): FaultSettings {
  if (!value || typeof value !== 'object') throw new Error('故障注入配置无效');
  const v=value as FaultSettings;
  if(typeof v.enabled!=='boolean'||!['ratio','random'].includes(v.mode)||!Number.isFinite(v.percent)||v.percent<0||v.percent>100||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!Array.isArray(v.kinds)||v.kinds.length===0||v.kinds.length>FAULT_KINDS.length||new Set(v.kinds).size!==v.kinds.length||v.kinds.some(k=>!FAULT_KINDS.some(f=>f.id===k)))throw new Error('故障比例应为 0–100%，至少选择一种故障，随机种子须为 0–4294967295 的整数');
  // Copy and canonicalize the choice order so a caller cannot mutate live settings.
  return {enabled:v.enabled,mode:v.mode,percent:v.percent,kinds:FAULT_KINDS.map(f=>f.id).filter(k=>v.kinds.includes(k)),seed:v.seed};
}

/** Inject into outgoing copies only. Ratio mode schedules floor(N*percent/100) faults among N eligible frames. */
export class FaultInjector {
  private settings: FaultSettings;
  private randomState=0;
  private selectedCount=0;
  private counters!: FaultStats;
  constructor(settings: FaultSettings=DEFAULT_FAULT_SETTINGS){this.settings=validateFaultSettings(settings);this.reset();}
  configure(settings: FaultSettings){const next=validateFaultSettings(settings);if(JSON.stringify(next)!==JSON.stringify(this.settings)){this.settings=next;this.reset();}}
  reset(){this.randomState=this.settings.seed;this.selectedCount=0;this.counters={total:0,eligible:0,injected:0,skipped:0,perKind:{checksum:0,'no-fix':0,'position-jump':0,'stale-time':0,'velocity-spike':0}};}
  stats(): FaultStats {return {...this.counters,perKind:{...this.counters.perKind}};}
  private random(){
    // Mulberry32 accepts every uint32 seed, including zero, and does not use Math.random.
    let t=this.randomState=(this.randomState+0x6d2b79f5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;
  }
  apply(sentence:string): FaultResult {
    this.counters.total++;
    if(!this.settings.enabled)return {sentence,injected:false};
    const decoded=decodeSentence(sentence);
    if(!sentence.startsWith('$')||decoded.fieldCount!==24||decoded.tokens.header!=='GPCHC'||decoded.statedSum===null){
      this.counters.skipped++;return {sentence,injected:false,reason:'报文结构不完整，已保留原文并跳过故障注入'};
    }
    const n=++this.counters.eligible,p=this.settings.percent;
    const selected=this.settings.mode==='ratio'?Math.floor(n*p/100+1e-9)>Math.floor((n-1)*p/100+1e-9):this.random()<p/100;
    if(!selected)return {sentence,injected:false};
    const kinds=this.settings.kinds;
    // An inapplicable kind must not block every later kind in a proportional sequence.
    const kind=kinds[this.settings.mode==='ratio'?this.selectedCount%kinds.length:Math.floor(this.random()*kinds.length)];
    this.selectedCount++;
    const tokens={...decoded.tokens};
    if(kind==='no-fix'){
      tokens.status='03';tokens.nsv1='0';tokens.nsv2='0';
      tokens.warning=((/^[\da-f]{4}$/i.test(tokens.warning)?parseInt(tokens.warning,16):0)|5).toString(16).toUpperCase().padStart(4,'0');
    }else if(kind==='position-jump'){
      const lat=Number(tokens.lat),lon=Number(tokens.lon);
      if(!tokens.lat.trim()||!tokens.lon.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return this.skip(sentence,'坐标无效，未叠加位置跳变');
      tokens.lat=(lat+(lat>89.99?-.01:.01)).toFixed(8);
      tokens.lon=(((lon+.01+180)%360+360)%360-180).toFixed(8);
    }else if(kind==='stale-time'){
      const week=Number(tokens.week),sow=Number(tokens.sow);
      if(!tokens.week.trim()||!tokens.sow.trim()||!Number.isInteger(week)||week<0||!Number.isFinite(sow)||sow<0||sow>=604800||!Number.isSafeInteger(week*604800))return this.skip(sentence,'GPS 时间无效，未叠加时间滞后');
      const seconds=Math.max(0,week*604800+sow-10);
      tokens.week=String(Math.floor(seconds/604800));tokens.sow=(seconds%604800).toFixed(2);
    }else if(kind==='velocity-spike'){
      const ve=Number(tokens.ve),vn=Number(tokens.vn);
      if(!tokens.ve.trim()||!tokens.vn.trim()||!Number.isFinite(ve)||!Number.isFinite(vn))return this.skip(sentence,'速度无效，未叠加速度突增');
      tokens.ve=(ve+50).toFixed(3);tokens.vn=(vn+50).toFixed(3);tokens.v2d=Math.hypot(ve+50,vn+50).toFixed(3);
    }
    let result:string;
    if(kind==='checksum'){
      // Always differ from the correct checksum, even when the input already has a bad checksum.
      const bad=(parseInt(decoded.computedSum,16)^1).toString(16).toUpperCase().padStart(2,'0');
      const ending=sentence.endsWith('\r\n')?'\r\n':sentence.endsWith('\n')?'\n':'';
      result='$'+decoded.payload+'*'+bad+ending;
    }else{
      // Preserve a pre-existing deliberate checksum error instead of silently repairing a fault dataset.
      const valid=checksumOf(payloadFromTokens(tokens));
      const override=decoded.sumOk?undefined:decoded.statedSum!==null&&/^[\da-f]{2}$/i.test(decoded.statedSum)?(parseInt(valid,16)^parseInt(decoded.computedSum,16)^parseInt(decoded.statedSum,16)).toString(16).toUpperCase().padStart(2,'0'):decoded.statedSum??undefined;
      result=encodeSentence(tokens,override);
    }
    this.counters.injected++;this.counters.perKind[kind]++;
    return {sentence:result,injected:true,kind};
  }
  private skip(sentence:string,reason:string):FaultResult{this.counters.skipped++;return {sentence,injected:false,reason};}
}
