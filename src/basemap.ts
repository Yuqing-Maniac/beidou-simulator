/** Offline synthetic proving ground. Coordinates are local metres relative to scenario origin. */
export function drawBasemap(ctx: CanvasRenderingContext2D, ox:number, oy:number, scale:number,w:number,h:number) {
  ctx.fillStyle='#e6eadf';ctx.fillRect(0,0,w,h);
  const p=(x:number,y:number)=>({x:ox+x*scale,y:oy-y*scale});
  const rect=(x:number,y:number,dx:number,dy:number,color:string)=>{const q=p(x,y);ctx.fillStyle=color;ctx.fillRect(q.x,q.y,dx*scale,dy*scale);};
  // Vegetation, retention pond and demonstration blocks.
  rect(-650,650,520,1000,'#d0dfc5');rect(160,650,460,280,'#c4d9b8');rect(340,-80,250,390,'#b3d5dd');
  const road=(pts:number[][],width:number)=>{ctx.beginPath();pts.forEach(([x,y],i)=>{const q=p(x,y);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.strokeStyle='#c4c9bf';ctx.lineWidth=width*scale+2;ctx.lineJoin='round';ctx.stroke();ctx.strokeStyle='#fbfaf1';ctx.lineWidth=width*scale;ctx.stroke();ctx.strokeStyle='#d6be78';ctx.lineWidth=1;ctx.setLineDash([8,8]);ctx.stroke();ctx.setLineDash([]);};
  road([[-900,0],[900,0]],22);road([[0,-900],[0,900]],18);road([[-450,-280],[260,-280],[260,380],[-450,380],[-450,-280]],14);road([[-800,-500],[-350,-500],[500,550]],12);
  for(const [x,y,dx,dy] of [[60,210,100,65],[60,110,70,50],[-260,220,90,60],[-270,100,100,50],[-350,-90,100,85],[60,-80,130,110]]) {rect(x+4,y-4,dx,dy,'#b7c2bb');rect(x,y,dx,dy,'#d0d6d0');const q=p(x,y);ctx.strokeStyle='#a8b7b0';ctx.lineWidth=1;ctx.strokeRect(q.x,q.y,dx*scale,dy*scale);}
  ctx.font='12px sans-serif';ctx.fillStyle='#6b8178';
  for(const [name,x,y] of [['导航试验路',80,15],['北向测试道',12,300],['设备区',65,230],['停车测试区',-270,240],['环形试验区',-420,410],['水域',360,-40]] as const){const q=p(x,y);if(q.x>0&&q.x<w&&q.y>0&&q.y<h)ctx.fillText(name,q.x,q.y);}
  ctx.fillStyle='#284c58';ctx.fillText('N ↑',w-40,25);
  const metres=Math.max(10,Math.round(100/scale/10)*10);ctx.fillRect(20,h-32,metres*scale,3);ctx.fillText(`${metres} m`,20,h-42);
}
