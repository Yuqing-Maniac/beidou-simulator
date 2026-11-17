/** Small offline OpenStreetMap extracts. Coordinates and simulation positions use WGS84. */
export type GeoPoint={lat:number;lon:number};
export type RegionId='beijing'|'damao'|'zhanjiang'|'guangzhou';
export type Region={id:RegionId;name:string;center:GeoPoint;bounds:[number,number,number,number];defaultSpanM:number};
export const REGIONS:readonly Region[]=[
  {id:'beijing',name:'北京',center:{lat:39.9093,lon:116.3974},bounds:[116.3874,39.8993,116.4074,39.9193],defaultSpanM:1500},
  {id:'damao',name:'达茂旗（百灵庙镇）',center:{lat:41.6975,lon:110.4385},bounds:[110.4235,41.6825,110.4535,41.7125],defaultSpanM:2000},
  {id:'zhanjiang',name:'湛江',center:{lat:21.2707,lon:110.3594},bounds:[110.3444,21.2557,110.3744,21.2857],defaultSpanM:1800},
  {id:'guangzhou',name:'广州',center:{lat:23.1291,lon:113.2644},bounds:[113.2494,23.1141,113.2794,23.1441],defaultSpanM:1800},
];
export type MapFeature={type:'Feature';id:string;properties:{kind:'road'|'water'|'park'|'rail'|'place';class:string;name?:string};geometry:{type:'LineString'|'Polygon'|'Point';coordinates:number[][]|number[][][]|number[]}};
export type RegionMap={type:'FeatureCollection';region:RegionId;attribution:string;source:{endpoint:string;timestamp:string;retrieved:string;license:string};features:MapFeature[]};
export function regionById(id:string){return REGIONS.find(r=>r.id===id);}
export function pointInRegion(region:Region,p:GeoPoint){const [w,s,e,n]=region.bounds;return p.lon>=w&&p.lon<=e&&p.lat>=s&&p.lat<=n;}
export function validateRegionMap(value:unknown,id:RegionId):RegionMap{
  const map=value as RegionMap;
  if(map?.type!=='FeatureCollection'||map.region!==id||!Array.isArray(map.features)||!map.features.length||!map.attribution?.includes('OpenStreetMap')||!map.source?.license?.includes('ODbL'))throw new Error('离线地图数据格式或许可信息无效');
  for(const f of map.features){
    if(f.type!=='Feature'||!['road','water','park','rail','place'].includes(f.properties?.kind)||!['LineString','Polygon','Point'].includes(f.geometry?.type))throw new Error('离线地图图形无效');
    const positions=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.type==='Polygon'?(f.geometry.coordinates as number[][][]).flat():f.geometry.coordinates;
    if(!positions.length||!(positions as number[][]).every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90))throw new Error('离线地图坐标无效');
  }
  return map;
}
const maps=new Map<RegionId,Promise<RegionMap>>();
/** Vite emits local JS chunks for these JSON imports, including in packaged file:// builds. */
export function loadRegionMap(id:RegionId):Promise<RegionMap>{
  if(!regionById(id))return Promise.reject(new Error('未知离线区域'));
  let promise=maps.get(id);
  if(!promise){const loaders=import.meta.glob('./map-data/*.json',{import:'default'});const loader=loaders[`./map-data/${id}.json`];if(!loader)return Promise.reject(new Error('离线地图未随软件打包'));promise=loader().then(v=>validateRegionMap(v,id)).catch(e=>{maps.delete(id);throw e;});maps.set(id,promise);}
  return promise;
}
/** Caller supplies the exact projection also used by the vehicle and its trail. */
export function drawRegionMap(ctx:CanvasRenderingContext2D,map:RegionMap,project:(point:GeoPoint)=>{x:number;y:number},w:number,h:number){
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.fillStyle='#eef0e7';ctx.fillRect(0,0,w,h);
  const xy=(p:number[])=>project({lon:p[0],lat:p[1]});
  const path=(positions:number[][])=>{ctx.beginPath();positions.forEach((p,i)=>{const q=xy(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});};
  const labels:{name:string;x:number;y:number;kind:string}[]=[];
  for(const f of [...map.features].sort((a,b)=>Number(a.properties.kind==='road')-Number(b.properties.kind==='road'))){
    const {kind,name}=f.properties;
    if(f.geometry.type==='Polygon'){
      const rings=f.geometry.coordinates as number[][][];ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>{const q=xy(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();}
      ctx.fillStyle=kind==='water'?'#b4d7e2':'#d3e1c7';ctx.fill('evenodd');
    }else if(f.geometry.type==='LineString'){
      const pts=f.geometry.coordinates as number[][];path(pts);ctx.lineJoin='round';ctx.lineCap='round';
      const major=['motorway','trunk','primary','secondary'].includes(f.properties.class);
      ctx.strokeStyle=kind==='water'?'#b4d7e2':kind==='rail'?'#b4b8b3':'#d0cbbb';ctx.lineWidth=kind==='water'?3:major?6:3;ctx.stroke();
      if(kind==='road'){ctx.strokeStyle=major?'#fff8dc':'#ffffff';ctx.lineWidth=major?4:1.7;ctx.stroke();}
    }
    if(name){const coordinates=f.geometry.type==='Point'?f.geometry.coordinates as number[]:f.geometry.type==='Polygon'?(f.geometry.coordinates as number[][][])[0][0]:(f.geometry.coordinates as number[][])[Math.floor((f.geometry.coordinates as number[][]).length/2)];const q=xy(coordinates);if(q.x>15&&q.x<w-100&&q.y>30&&q.y<h-50)labels.push({name,x:q.x,y:q.y,kind});}
  }
  ctx.font='11px sans-serif';ctx.textBaseline='middle';const used:{x:number;y:number}[]=[];
  for(const label of labels.sort((a,b)=>Number(a.kind==='road')-Number(b.kind==='road'))){if(used.length>=40)break;if(used.some(p=>Math.abs(p.x-label.x)<90&&Math.abs(p.y-label.y)<24))continue;ctx.lineWidth=3;ctx.strokeStyle='#f4f6ef';ctx.strokeText(label.name,label.x,label.y);ctx.fillStyle=label.kind==='water'?'#4e7f96':'#657467';ctx.fillText(label.name,label.x,label.y);used.push(label);}
  ctx.font='11px sans-serif';ctx.fillStyle='#fafbf7';ctx.fillRect(0,h-20,w,20);ctx.fillStyle='#465e64';ctx.fillText('© OpenStreetMap contributors · ODbL 1.0 · 离线简化矢量底图',9,h-10);ctx.fillText('N ↑',w-35,18);ctx.restore();
}
