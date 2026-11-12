import type { ReplayRecord } from './workspace.ts';
export const SPEED_STOPS=[.25,.5,1,2,4,10,20,25,40,50,100,200,500];
const MIN=.25,MAX=500,SPAN=Math.log(MAX/MIN);
export function speedToSlider(speed:number):number {return Math.round(Math.log(Math.max(MIN,Math.min(MAX,speed))/MIN)/SPAN*1000);}
export function sliderToSpeed(position:number):number {
 const value=MIN*Math.exp(Math.max(0,Math.min(1000,position))/1000*SPAN);
 const snap=SPEED_STOPS.find(x=>Math.abs(Math.log(value/x))<.035);
 return snap??Number(value.toPrecision(3));
}
export function replayTimeline(records:ReplayRecord[],fallbackRate:number):number[] {
 const result:number[]=[];let elapsed=0;
 for(let i=0;i<records.length;i++){
  if(i){const a=records[i-1].timestamp,b=records[i].timestamp;elapsed+=a!==null&&b!==null&&b>=a?b-a:1000/Math.max(.1,fallbackRate);}
  result.push(elapsed);
 }
 return result;
}
/** Monotonic virtual clock. Changing speed preserves the already consumed original time. */
export class ReplayClock {
 private original=0;
 private lastReal:number;
 private speed:number;
 constructor(now:number,speed=1){this.lastReal=now;this.speed=speed;}
 time(now:number):number {this.original+=Math.max(0,now-this.lastReal)*this.speed;this.lastReal=now;return this.original;}
 setSpeed(speed:number,now:number){this.time(now);this.speed=speed;}
}
