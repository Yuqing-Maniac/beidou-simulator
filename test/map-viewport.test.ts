import test from 'node:test';
import assert from 'node:assert/strict';
import {fitMapView,mapScaleText} from '../src/map-viewport.ts';
import {latLonToMeters,metersToLatLon} from '../src/track.ts';
test('automatic map fit contains the entire motion and keeps slow movements readable',()=>{
 const origin={lat:39.9,lon:116.4},points=[origin,metersToLatLon(origin,200,-50),metersToLatLon(origin,-80,200)];
 const v=fitMapView(origin,points,1000,400,{automatic:true,zoom:1,speed:10});
 for(const p of points){const m=latLonToMeters(origin,p),x=v.ox+m.east*v.scale,y=v.oy-m.north*v.scale;assert.ok(x>=30&&x<=970&&y>=30&&y<=370);}
 const slow=fitMapView(origin,[origin],1000,400,{automatic:true,zoom:1,speed:.027});
 const manual=fitMapView(origin,[origin],1000,400,{automatic:false,zoom:1,speed:.027});assert.ok(slow.scale>manual.scale*20);
 assert.match(mapScaleText(slow.scale),/米/);
});
test('map fit tolerates empty and invalid coordinates and crossing longitude boundary',()=>{
 const origin={lat:20,lon:179.999},p={lat:20,lon:-179.999};
 const v=fitMapView(origin,[p,{lat:NaN,lon:0}],800,400,{automatic:true,zoom:1,speed:3});assert.ok(v.scale>1&&Number.isFinite(v.ox));
 const empty=fitMapView(origin,[],0,0,{automatic:true,zoom:1,speed:0});assert.ok(Number.isFinite(empty.scale)&&empty.scale>0);
});
