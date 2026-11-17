import type { Tokens } from './gpchc.ts';
import { sampleTrack } from './track.ts';
/** Advance only position using the original ENU velocity; preserve every other protocol field. */
export function datasetPosition(tokens: Tokens, elapsedSeconds: number): {lat:string;lon:string}|null {
  if(!['lat','lon','ve','vn'].every(k=>tokens[k]?.trim()!==''&&Number.isFinite(Number(tokens[k]))))return null;
  const lat=Number(tokens.lat),lon=Number(tokens.lon),ve=Number(tokens.ve),vn=Number(tokens.vn);
  if(Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const speed=Math.hypot(ve,vn);if(speed===0||elapsedSeconds<=0)return {lat:tokens.lat,lon:tokens.lon};
  const sample=sampleTrack({kind:'line',lat,lon,headingDeg:Math.atan2(ve,vn)*180/Math.PI,speedMps:speed,radiusM:1},Math.max(0,elapsedSeconds));
  return {lat:sample.lat.toFixed(8),lon:sample.lon.toFixed(8)};
}
