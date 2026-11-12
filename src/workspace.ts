export type SavedWorkspace = { version: 1; datasetId: string; tokens: Record<string,string>; controls: Record<string,string|boolean>; path: {lat:number;lon:number}[]; checksumOverride?: string };
export function parseWorkspace(text: string): SavedWorkspace {
  const v = JSON.parse(text);
  if(v.version !== 1 || !v.tokens || !v.controls || !Array.isArray(v.path) || typeof v.datasetId !== 'string') throw new Error('配置文件格式不正确');
  if(!Object.values(v.tokens).every(x=>typeof x==='string') || !Object.values(v.controls).every(x=>typeof x==='string'||typeof x==='boolean')) throw new Error('配置字段格式不正确');
  validatePath(v.path);
  if(v.checksumOverride !== undefined && !/^[0-9a-f]{2}$/i.test(v.checksumOverride)) throw new Error('校验覆盖值无效');
  return v;
}
export function validatePath(points: unknown): asserts points is {lat:number;lon:number}[] {
  if(!Array.isArray(points) || points.length>10000 || !points.every(p=>p && Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180)) throw new Error('路径应包含有效经纬度，最多 10000 点');
}
export function replaySentences(text: string): string[] {
  const rows=text.split(/\r?\n/).filter(x=>x.trim()).map(line=>{
    if(line.trim().startsWith('{')) { const row=JSON.parse(line); if(typeof row.sentence!=='string') throw new Error('日志行缺少 sentence'); return row.sentence; }
    return line;
  }).map(x=>x.replace(/[\r\n]+$/,'')+'\r\n');
  if(!rows.length || rows.length>100000) throw new Error('报文文件应包含 1 至 100000 条报文');
  return rows;
}

export type ReplayRecord = {sentence:string; timestamp:number|null};
export function replayRecords(text: string): ReplayRecord[] {
  const lines=text.split(/\r?\n/).filter(x=>x.trim());
  const sentences=replaySentences(text);
  return sentences.map((sentence,i)=>{const line=lines[i].trim();let timestamp=null;
    if(line.startsWith('{')){const row=JSON.parse(line);const t=Date.parse(row.timestamp);if(Number.isFinite(t))timestamp=t;}
    return {sentence,timestamp};
  });
}
