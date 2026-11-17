import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {REGIONS, pointInRegion, regionById, validateRegionMap} from '../src/regions.ts';

test('all four offline regions contain bounded attributed real OSM geographic features',()=>{
  assert.deepEqual(REGIONS.map(r=>r.id),['beijing','damao','zhanjiang','guangzhou']);
  for(const region of REGIONS){
    const map=validateRegionMap(JSON.parse(readFileSync(new URL(`../src/map-data/${region.id}.json`,import.meta.url),'utf8')),region.id);
    assert.ok(map.features.length>=50,region.name+' has a useful road network');
    assert.ok(map.features.some(f=>f.properties.kind==='road'&&f.properties.name));
    assert.ok(map.features.some(f=>f.properties.kind!=='road'));
    assert.match(map.source.endpoint,/^https:\/\/api\.openstreetmap\.org\/api\/0\.6\/map\?bbox=/);
    assert.ok(Number.isFinite(Date.parse(map.source.timestamp)));
    assert.ok(Number.isFinite(Date.parse(map.source.retrieved)));
    assert.ok(pointInRegion(region,region.center));
    for(const f of map.features){
      assert.match(f.id,/^way\/\d+/);
      const positions=f.geometry.type==='Polygon'?(f.geometry.coordinates as number[][][]).flat():f.geometry.coordinates as number[][];
      for(const [lon,lat] of positions)assert.ok(pointInRegion(region,{lon,lat}),`${region.id} has out-of-range geometry`);
      if(f.geometry.type==='Polygon'){
        const ring=(f.geometry.coordinates as number[][][])[0];assert.deepEqual(ring[0],ring.at(-1));assert.ok(new Set(ring.map(p=>p.join(','))).size>=3);
      }
    }
  }
});

test('region bounds do not pretend to cover the whole city and reject malformed maps',()=>{
  const beijing=regionById('beijing')!;
  assert.equal(pointInRegion(beijing,{lat:31.2,lon:121.5}),false);
  assert.equal(regionById('unknown'),undefined);
  assert.throws(()=>validateRegionMap({type:'FeatureCollection',region:'beijing',features:[]},'beijing'),/无效/);
  const map=JSON.parse(readFileSync(new URL('../src/map-data/beijing.json',import.meta.url),'utf8'));
  map.features[0].geometry.coordinates=[[Infinity,90],[0,0]];
  map.features[0].geometry.type='LineString';
  assert.throws(()=>validateRegionMap(map,'beijing'),/坐标无效/);
});
