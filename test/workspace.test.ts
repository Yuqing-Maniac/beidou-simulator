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
