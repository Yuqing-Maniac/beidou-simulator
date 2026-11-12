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

/** Accept signed decimal degrees or separated degrees/minutes(/seconds), with optional hemisphere. */
export function parseCoordinate(text: string, axis: 'lat'|'lon', format: CoordinateFormat): number {
  const raw=text.trim().toUpperCase();
  if(!raw)throw new Error('请输入经纬度');
  const hemispheres=raw.match(/[NSEW]/g)??[];
  if(hemispheres.length>1 || hemispheres.some(h=>!(axis==='lat'?['N','S']:['E','W']).includes(h)))throw new Error('经纬度方向不正确');
  const h=hemispheres[0];
  const clean=raw.replace(/[NSEW]/g,'').trim();
  if(!/^[+\-\d.\s°º度′’'分″”"秒:：]+$/.test(clean))throw new Error('坐标格式不正确');
  const parts=clean.split(/[\s°º度′’'分″”"秒:：]+/).filter(Boolean);
  const expected=format==='dd'?1:format==='dm'?2:3;
  if(parts.length!==expected)throw new Error(format==='dd'?'请输入小数度，例如 31.15960455':format==='dm'?'请输入度和分，例如 31 09.576 N':'请输入度分秒，例如 31 09 34.576 N');
  if(!parts.every(p=>/^[+-]?\d+(?:\.\d+)?$/.test(p)))throw new Error('坐标数字不正确');
  const numbers=parts.map(Number);const [degrees,minutes=0,seconds=0]=numbers;
  if(parts.slice(1).some(p=>/^[+-]/.test(p)) || minutes<0||minutes>=60||seconds<0||seconds>=60)throw new Error('分和秒必须在 0 至 60 之间');
  if(expected===3&&!Number.isInteger(minutes))throw new Error('度分秒格式的分必须为整数');
  if(expected>1&&!Number.isInteger(degrees))throw new Error('度分格式的度必须为整数');
  const negative=/^-/.test(parts[0]);
  if(h && (negative&&(h==='N'||h==='E') || /^\+/.test(parts[0])&&(h==='S'||h==='W')))throw new Error('正负号与方向冲突');
  const sign=h?(h==='S'||h==='W'?-1:1):(negative?-1:1);
  const value=sign*(Math.abs(degrees)+minutes/60+seconds/3600);
  if(Math.abs(value)>(axis==='lat'?90:180))throw new Error(axis==='lat'?'纬度范围为 -90 至 90':'经度范围为 -180 至 180');
  return value;
}
