import {latLonToMeters,type LatLon} from './track.ts';

/** Fit the actual route, preview and vehicle with readable margins in CSS pixels. */
export function fitMapView(origin:LatLon,points:LatLon[],width:number,height:number,options:{automatic:boolean;zoom:number;speed:number;regional?:boolean}) {
  const meters=points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180).map(p=>latLonToMeters(origin,p));
  if(!meters.length)meters.push({east:0,north:0});
  let minE=Infinity,maxE=-Infinity,minN=Infinity,maxN=-Infinity;
  for(const p of meters){minE=Math.min(minE,p.east);maxE=Math.max(maxE,p.east);minN=Math.min(minN,p.north);maxN=Math.max(maxN,p.north);}
  const moving=Number.isFinite(options.speed)&&options.speed>.001;
  const minimum=options.automatic?(moving?Math.max(12,Math.min(600,options.speed*20)):options.regional?600:160):700/Math.max(1,options.zoom);
  const spanE=Math.max(minimum,(maxE-minE)*1.18),spanN=Math.max(minimum,(maxN-minN)*1.18);
  const scale=Math.max(.000001,Math.min(Math.max(1,width-64)/spanE,Math.max(1,height-64)/spanN));
  return {origin,scale,ox:width/2-(minE+maxE)/2*scale,oy:height/2+(minN+maxN)/2*scale};
}

export function mapScaleText(scale:number){
  const metres=100/Math.max(.000001,scale);
  return `100 像素 ≈ ${metres<10?metres.toFixed(2):metres.toFixed(0)} 米`;
}
