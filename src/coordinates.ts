export type CoordinateFormat = 'dd'|'dms'|'dm';
export function coordinate(value: number, axis: 'lat'|'lon', format: CoordinateFormat): string {
  if(!Number.isFinite(value)||Math.abs(value)>(axis==='lat'?90:180))return '坐标无效';
  const hemi=axis==='lat'?(value<0?'S':'N'):(value<0?'W':'E');
  if(format==='dd')return `${value.toFixed(8)}°`;
  const precision=format==='dm'?60000:3600000;
  const total=Math.round(Math.abs(value)*precision);
  const degrees=Math.floor(total/precision);const rest=total%precision;
  if(format==='dm')return `${degrees}°${(rest/1000).toFixed(3).padStart(6,'0')}′ ${hemi}`;
  const minutes=Math.floor(rest/60000);const seconds=(rest%60000)/1000;
  return `${degrees}°${String(minutes).padStart(2,'0')}′${seconds.toFixed(3).padStart(6,'0')}″ ${hemi}`;
}
