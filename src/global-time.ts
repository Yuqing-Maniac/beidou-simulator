import { gpsWeekTimeFromUtc, decodeSentence, encodeSentence, checksumOf, payloadFromTokens } from './gpchc.ts';
export type ClockSource='original'|'system'|'manual';
export class DebugClock {
  source:ClockSource='original';rate=1;private baseUtc=0;private baseMono=0;
  utc(systemUtc:number,mono:number):number|null {return this.source==='original'?null:this.source==='system'?systemUtc:this.baseUtc+Math.max(0,mono-this.baseMono)*this.rate;}
  system(){this.source='system';}
  original(){this.source='original';}
  manual(utc:number,mono:number,rate=this.rate){if(!Number.isFinite(utc)||!Number.isFinite(rate)||rate<0||rate>100)throw new Error('调试时间或时间倍率无效');this.baseUtc=utc;this.baseMono=mono;this.rate=rate;this.source='manual';}
  changeRate(rate:number,systemUtc:number,mono:number){this.manual(this.utc(systemUtc,mono)??systemUtc,mono,rate);}
  stamp(systemUtc:number,mono:number){const utc=this.utc(systemUtc,mono);return utc===null?null:gpsWeekTimeFromUtc(utc);}
}
/** Rewrite only GPS time; preserve an existing deliberate checksum error. Malformed frames fail explicitly. */
export function applyOutgoingTime(raw:string,stamp:{week:string;sow:string}|null):string {
  if(!stamp)return raw;
  const d=decodeSentence(raw);
  if(d.fieldCount!==24||d.tokens.header!=='GPCHC')throw new Error('本条报文字段不完整，无法应用全局时间；需逐字发送时请选择“保留原始时间”');
  const tokens={...d.tokens,...stamp};let override:string|undefined;
  if(!d.sumOk&&d.statedSum!==null){
    override=/^[0-9a-f]{2}$/i.test(d.statedSum)?(parseInt(checksumOf(payloadFromTokens(tokens)),16)^parseInt(d.computedSum,16)^parseInt(d.statedSum,16)).toString(16).toUpperCase().padStart(2,'0'):d.statedSum;
  }
  return encodeSentence(tokens,override);
}
