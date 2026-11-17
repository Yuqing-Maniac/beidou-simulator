import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FaultInjector,DEFAULT_FAULT_SETTINGS,FAULT_KINDS,validateFaultSettings} from '../src/fault-injection.ts';
import {OFFICIAL_SENTENCE,decodeSentence,encodeSentence} from '../src/gpchc.ts';
import {applyOutgoingTime} from '../src/global-time.ts';
const sentence=OFFICIAL_SENTENCE+'\r\n';

test('ratio injection distributes the exact configured fraction and cycles selected fault kinds',()=>{
  const engine=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:10,kinds:['checksum','no-fix']});
  const results=Array.from({length:100},()=>engine.apply(sentence));
  assert.equal(results.filter(r=>r.injected).length,10);
  assert.deepEqual(results.flatMap((r,i)=>r.injected?[i+1]:[]),[10,20,30,40,50,60,70,80,90,100]);
  assert.equal(engine.stats().perKind.checksum,5);assert.equal(engine.stats().perKind['no-fix'],5);
  const fractional=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:2.5});
  for(let n=1;n<=200;n++){fractional.apply(sentence);assert.equal(fractional.stats().injected,Math.floor(n*.025+1e-9));}
});

test('random faults and their kinds replay from a seed; settings and returned stats are isolated',()=>{
  const config={...DEFAULT_FAULT_SETTINGS,enabled:true,mode:'random' as const,percent:30,kinds:FAULT_KINDS.map(x=>x.id),seed:0};
  const a=new FaultInjector(config),b=new FaultInjector(config);
  const run=(e:FaultInjector)=>Array.from({length:200},()=>e.apply(sentence));
  const first=run(a);assert.deepEqual(first,run(b));assert.ok(a.stats().injected>30&&a.stats().injected<100);
  a.reset();assert.deepEqual(run(a),first);
  const stats=a.stats();stats.perKind.checksum=999;assert.notEqual(a.stats().perKind.checksum,999);
  config.kinds.length=0;assert.ok(a.apply(sentence));
});

test('faults affect only the outgoing copy after global time and retain valid framing',()=>{
  const tokens=decodeSentence(sentence).tokens,original={...tokens};
  const stamped=applyOutgoingTime(encodeSentence(tokens),{week:'2500',sow:'5.00'});
  for(const {id} of FAULT_KINDS){
    const e=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100,kinds:[id]});
    const result=e.apply(stamped),d=decodeSentence(result.sentence);
    assert.equal(result.kind,id);assert.equal(result.injected,true);assert.equal(d.fieldCount,24);assert.equal(result.sentence.endsWith('\r\n'),true);
    assert.equal(d.sumOk,id!=='checksum');
    if(id==='no-fix'){assert.equal(d.tokens.status,'03');assert.equal(d.tokens.nsv1,'0');assert.equal(parseInt(d.tokens.warning,16)&5,5);}
    if(id==='position-jump'){assert.equal(d.tokens.lat,(Number(tokens.lat)+.01).toFixed(8));assert.equal(d.tokens.heading,tokens.heading);}
    if(id==='stale-time'){assert.equal(d.tokens.week,'2499');assert.equal(d.tokens.sow,'604795.00');}
    if(id==='velocity-spike')assert.ok(Math.abs(Number(d.tokens.v2d)-Math.hypot(Number(d.tokens.ve),Number(d.tokens.vn)))<.001);
  }
  assert.deepEqual(tokens,original);assert.equal(decodeSentence(stamped).tokens.sow,'5.00');
});

test('disabled/zero proportion preserve input exactly; malformed and incompatible inputs are explicitly skipped',()=>{
  for(const settings of [{...DEFAULT_FAULT_SETTINGS},{...DEFAULT_FAULT_SETTINGS,enabled:true,percent:0}]){
    const e=new FaultInjector(settings);assert.equal(e.apply(sentence).sentence,sentence);assert.equal(e.stats().injected,0);
  }
  const e=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100});
  const malformed='$GPCHC,bad*00\r\n';assert.deepEqual(e.apply(malformed),{sentence:malformed,injected:false,reason:'报文结构不完整，已保留原文并跳过故障注入'});
  assert.equal(e.stats().skipped,1);assert.equal(e.stats().eligible,0);
  const missingChecksum=sentence.slice(0,sentence.indexOf('*'));
  assert.equal(e.apply(missingChecksum).sentence,missingChecksum);assert.equal(e.stats().skipped,2);assert.equal(e.stats().eligible,0);
  e.configure({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100,kinds:['position-jump']});
  const invalid=encodeSentence({...decodeSentence(sentence).tokens,lat:'95.00000000'});
  assert.equal(e.apply(invalid).injected,false);assert.equal(e.stats().skipped,1);
  const p=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100,kinds:['position-jump']});
  const edge=decodeSentence(p.apply(encodeSentence({...decodeSentence(sentence).tokens,lat:'90.00000000',lon:'179.99900000'})).sentence);
  assert.ok(Number(edge.tokens.lat)<=90);assert.ok(Number(edge.tokens.lon)<0);
});

test('input checksum faults remain faulty when a semantic fault is added',()=>{
  const e=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100,kinds:['no-fix']});
  assert.equal(decodeSentence(e.apply(sentence.replace('*4A','*00')).sentence).sumOk,false);
});

test('an inapplicable fault type does not block later selected types in the ratio sequence',()=>{
  const e=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:100,kinds:['position-jump','stale-time']});
  const invalidPosition=encodeSentence({...decodeSentence(sentence).tokens,lat:'95.00000000'});
  assert.equal(e.apply(invalidPosition).injected,false);
  const next=e.apply(invalidPosition);assert.equal(next.injected,true);assert.equal(next.kind,'stale-time');
  assert.equal(e.stats().skipped,1);assert.equal(e.stats().injected,1);
  e.reset();assert.equal(e.apply(invalidPosition).injected,false);
});

test('invalid settings are rejected and unchanged settings preserve counters',()=>{
  for(const change of [{percent:-1},{percent:101},{percent:NaN},{mode:'other'},{seed:-1},{seed:1.5},{seed:4294967296},{kinds:[]},{kinds:['unknown']},{kinds:['checksum','checksum']},{enabled:'true'}])assert.throws(()=>validateFaultSettings({...DEFAULT_FAULT_SETTINGS,...change}));
  const e=new FaultInjector({...DEFAULT_FAULT_SETTINGS,enabled:true});e.apply(sentence);e.configure({...DEFAULT_FAULT_SETTINGS,enabled:true});assert.equal(e.stats().total,1);
  e.configure({...DEFAULT_FAULT_SETTINGS,enabled:true,percent:20});assert.equal(e.stats().total,0);
});
