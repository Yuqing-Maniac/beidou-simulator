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
