export type SliderSpec={min:number;max:number;step:number;digits:number;hint:string};
export function parameterSpec(key:string,value:number):SliderSpec|null {
  if(!Number.isFinite(value))return null;
  if(key==='lat'||key==='lon'){
    const bound=key==='lat'?90:180;if(Math.abs(value)>bound)return null;
    return {min:Number(Math.max(-bound,value-.001).toFixed(8)),max:Number(Math.min(bound,value+.001).toFixed(8)),step:.00000001,digits:8,hint:'附近位置微调（±0.001°）；可直接输入精确坐标'};
  }
  const specs:Record<string,[number,number,number,number,string]>={
    week:[0,9999,1,0,'GPS 周，修改后作为全局指定时间'],sow:[0,604799.99,.01,2,'GPS 周内秒，修改后作为全局指定时间'],
    heading:[0,359.99,.01,2,'航向：正北为 0°，顺时针增加'],pitch:[-90,90,.01,2,'俯仰角'],roll:[-180,180,.01,2,'横滚角'],
    gx:[-180,180,.01,2,'工具建议拖动范围；协议未规定单位'],gy:[-180,180,.01,2,'工具建议拖动范围；协议未规定单位'],gz:[-180,180,.01,2,'工具建议拖动范围；协议未规定单位'],
    ax:[-2,2,.0001,4,'工具建议拖动范围，单位 g'],ay:[-2,2,.0001,4,'工具建议拖动范围，单位 g'],az:[-2,2,.0001,4,'工具建议拖动范围，单位 g'],
    alt:[-500,10000,.01,2,'工具建议拖动范围，单位米'],ve:[-100,100,.001,3,'工具建议拖动范围，东向速度 m/s'],vn:[-100,100,.001,3,'工具建议拖动范围，北向速度 m/s'],vu:[-100,100,.001,3,'工具建议拖动范围，天向速度 m/s'],v2d:[0,150,.001,3,'工具建议拖动范围，平面速度 m/s'],
    nsv1:[0,99,1,0,'主天线可见卫星数'],nsv2:[0,99,1,0,'副天线可见卫星数'],age:[0,999,1,0,'工具建议拖动范围，协议未规定单位'],
  };
  const s=specs[key];const fixed=['week','sow','heading','pitch','roll','nsv1','nsv2'].includes(key);return s?{min:fixed?s[0]:Math.min(s[0],value),max:fixed?s[1]:Math.max(s[1],value),step:s[2],digits:s[3],hint:s[4]}:null;
}
