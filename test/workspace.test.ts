import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkspace,validatePath,replaySentences} from '../src/workspace.ts';
import {sampleDynamics} from '../src/track.ts';
test('workspace round trip preserves fault override and path',()=>{
 const v={version:1,datasetId:'fault',tokens:{warning:'ZZZZ'},controls:{'udp-on':true},path:[{lat:31,lon:121}],checksumOverride:'00'};
 assert.deepEqual(parseWorkspace(JSON.stringify(v)),v);
 assert.throws(()=>validatePath([{lat:91,lon:0}]));
 assert.throws(()=>parseWorkspace('{}'));
});
test('replay preserves invalid sentence and normalizes line endings',()=>{
 assert.deepEqual(replaySentences('$GPCHC,bad*00\n'),['$GPCHC,bad*00\r\n']);
 assert.deepEqual(replaySentences(JSON.stringify({sentence:'$GPCHC*00\r\n'})),['$GPCHC*00\r\n']);
 assert.throws(()=>replaySentences(''));
});
test('dynamics accelerates from rest and couples turning acceleration',()=>{
 const spec={kind:'circle' as const,lat:31,lon:121,headingDeg:0,speedMps:10,radiusM:50};
 assert.equal(sampleDynamics(spec,0).v2d,0);
 const mid=sampleDynamics(spec,2,2);assert.ok(Math.abs(mid.v2d-4)<1e-8);assert.ok(mid.ay>0);assert.ok(mid.roll<0);assert.ok(mid.ax>0);
 const cruise=sampleDynamics(spec,10,2);assert.ok(Math.abs(cruise.v2d-10)<1e-8);assert.equal(cruise.ay,0);
});

import {coordinate} from '../src/coordinates.ts';
test('coordinate display supports eight decimals, signed hemispheres and carry',()=>{
 assert.equal(coordinate(31.15960455,'lat','dd'),'31.15960455°');
 assert.equal(coordinate(-31.15960455,'lat','dm'),'31°09.576′ S');
 assert.equal(coordinate(12.999999999,'lon','dms'),'13°00′00.000″ E');
 assert.equal(coordinate(91,'lat','dd'),'坐标无效');
});

import {parseCoordinate} from '../src/coordinates.ts';
test('coordinate inputs convert DD, DMS and DM into protocol decimal degrees',()=>{
 assert.equal(parseCoordinate('31.15960455°','lat','dd').toFixed(8),'31.15960455');
 assert.equal(parseCoordinate('31°09′34.576″ N','lat','dms').toFixed(8),'31.15960444');
 assert.equal(parseCoordinate('121 10.709 W','lon','dm').toFixed(8),'-121.17848333');
 assert.equal(parseCoordinate('-0 30 00','lat','dms'),-.5);
 for(const [text,axis,format] of [['31 60 N','lat','dm'],['91 00 N','lat','dm'],['-31 09 N','lat','dm'],['31 09 E','lat','dm'],['31 09 60','lat','dms'],['','lat','dd']])assert.throws(()=>parseCoordinate(text,axis,format));
});

import {replayRecords} from '../src/workspace.ts';
import {ReplayClock,replayTimeline,sliderToSpeed,speedToSlider} from '../src/replay.ts';
test('replay uses original timestamp gaps and a fallback rate for text',()=>{
 const records=replayRecords([0,100,1000].map(ms=>JSON.stringify({sentence:'$GPCHC*00',timestamp:new Date(ms).toISOString()})).join('\n'));
 assert.deepEqual(replayTimeline(records,10),[0,100,1000]);
 assert.deepEqual(replayTimeline(replayRecords('a\nb\nc'),20),[0,50,100]);
});
test('speed changes preserve elapsed original time and requested slider stops are reachable',()=>{
 const clock=new ReplayClock(0,1);assert.equal(clock.time(200),200);clock.setSpeed(4,200);assert.equal(clock.time(250),400);clock.setSpeed(.25,250);assert.equal(clock.time(650),500);
 for(const speed of [.25,1,10,20,25,40,50,100,200,500])assert.equal(sliderToSpeed(speedToSlider(speed)),speed);
});

import { DebugClock,applyOutgoingTime } from '../src/global-time.ts';
import {decodeSentence,encodeSentence} from '../src/gpchc.ts';
import {DATASETS} from '../src/datasets.ts';
test('shared debug clock survives scene changes, pause, step and rate changes',()=>{
 const clock=new DebugClock();const now=Date.UTC(2026,0,1);clock.manual(now,0,1);
 assert.equal(clock.utc(now,1000),now+1000);clock.changeRate(0,now,1000);assert.equal(clock.utc(now,9000),now+1000);
 clock.manual(clock.utc(now,9000)!+1000,9000,0);assert.equal(clock.utc(now,12000),now+2000);
 clock.changeRate(2,now,12000);assert.equal(clock.utc(now,12500),now+3000);
 for(const scene of DATASETS.slice(0,3)){const stamped=decodeSentence(applyOutgoingTime(encodeSentence(scene.tokens),clock.stamp(now,12500)));assert.equal(stamped.tokens.week,clock.stamp(now,12500)!.week);assert.equal(stamped.sumOk,true);}
});
test('outgoing replay uses global time, retains deliberate checksum error and refuses malformed overrides',()=>{
 const original=encodeSentence(DATASETS[0].tokens);const stamp={week:'2500',sow:'123.00'};
 const updated=decodeSentence(applyOutgoingTime(original,stamp));assert.equal(updated.tokens.week,'2500');assert.equal(updated.tokens.sow,'123.00');assert.equal(updated.sumOk,true);
 assert.equal(applyOutgoingTime(original,null),original);
 const bad=encodeSentence(DATASETS[0].tokens,'00');assert.equal(decodeSentence(applyOutgoingTime(bad,stamp)).sumOk,false);
 assert.throws(()=>applyOutgoingTime('$GPCHC,1*00\r\n',stamp));assert.equal(applyOutgoingTime('$GPCHC,1*00\r\n',null),'$GPCHC,1*00\r\n');
});

import {parameterSpec} from '../src/parameter-controls.ts';
test('parameter sliders preserve precise input and use local coordinate adjustment windows',()=>{
 const lat=parameterSpec('lat',31.15960455)!;assert.ok(Math.abs(lat.min-31.15860455)<1e-10);assert.equal(lat.step,.00000001);assert.equal(lat.digits,8);
 assert.equal(parameterSpec('lat',95),null);assert.equal(parameterSpec('heading',400)!.max,359.99);assert.ok(parameterSpec('alt',50000)!.max>=50000);assert.equal(parameterSpec('status',61),null);
});
