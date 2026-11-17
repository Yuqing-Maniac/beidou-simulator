#!/usr/bin/env python3
"""Refresh four small OSM extracts via the public map API; never downloads raster tiles.
Run manually only, not during application startup or normal builds.
"""
import datetime, json, math, pathlib, time, urllib.request, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
REGIONS={
 'beijing':(116.3874,39.8993,116.4074,39.9193),
 'damao':(110.4235,41.6825,110.4535,41.7125),
 'zhanjiang':(110.3444,21.2557,110.3744,21.2857),
 'guangzhou':(113.2494,23.1141,113.2794,23.1441),
}
HIGHWAYS={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street','service','pedestrian'}

def clipline(a,b,bounds):
 x0,y0=a;x1,y1=b;w,s,e,n=bounds;dx=x1-x0;dy=y1-y0;lo=0.;hi=1.
 for p,q in [(-dx,x0-w),(dx,e-x0),(-dy,y0-s),(dy,n-y0)]:
  if p==0:
   if q<0:return None
  elif p<0:lo=max(lo,q/p)
  else:hi=min(hi,q/p)
  if lo>hi:return None
 return [(x0+lo*dx,y0+lo*dy),(x0+hi*dx,y0+hi*dy)]

def lineparts(pts,bounds):
 result=[];part=[]
 for a,b in zip(pts,pts[1:]):
  segment=clipline(a,b,bounds)
  if segment:
   if not part or math.dist(part[-1],segment[0])>1e-9:
    if len(part)>1:result.append(part)
    part=[segment[0]]
   part.append(segment[1])
  elif len(part)>1:result.append(part);part=[]
 if len(part)>1:result.append(part)
 return result

def polygon(pts,bounds):
 result=pts[:-1] if pts[0]==pts[-1] else pts
 w,s,e,n=bounds
 for axis,edge,greater in [(0,w,True),(0,e,False),(1,s,True),(1,n,False)]:
  old=result;result=[]
  if not old:break
  for a,b in zip(old[-1:]+old[:-1],old):
   ia=a[axis]>=edge if greater else a[axis]<=edge;ib=b[axis]>=edge if greater else b[axis]<=edge
   if ia!=ib:
    ratio=(edge-a[axis])/(b[axis]-a[axis]);result.append(tuple(a[i]+ratio*(b[i]-a[i]) for i in range(2)))
   if ib:result.append(b)
 if len(result)>=3:return result+[result[0]]
 return []

def simplify(pts,tolerance=.00005):
 if len(pts)<=2:return pts
 # Degrees are sufficient for a deliberately coarse local map; roughly 4-6 metres.
 a,b=pts[0],pts[-1];dx=b[0]-a[0];dy=b[1]-a[1];ll=dx*dx+dy*dy
 best,index=0,0
 for i,p in enumerate(pts[1:-1],1):
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll)) if ll else 0
  d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
  if d>best:best,index=d,i
 if best>tolerance*tolerance:return simplify(pts[:index+1],tolerance)[:-1]+simplify(pts[index:],tolerance)
 return [a,b]

def extract(region,bounds,raw,endpoint):
 osm=ET.fromstring(raw);nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in osm.findall('node')};features=[]
 for way in osm.findall('way'):
  tags={t.get('k'):t.get('v') for t in way.findall('tag')};highway=tags.get('highway');kind=None
  if highway in HIGHWAYS:kind='road';cl=highway
  elif tags.get('natural')=='water' or tags.get('waterway') in ('river','canal','stream','riverbank'):kind='water';cl=tags.get('waterway','water')
  elif tags.get('leisure') in ('park','garden','nature_reserve') or tags.get('landuse') in ('forest','grass','recreation_ground','meadow'):kind='park';cl=tags.get('leisure',tags.get('landuse'))
  elif tags.get('railway') in ('rail','light_rail'):kind='rail';cl=tags['railway']
  if not kind:continue
  pts=[nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes]
  if len(pts)<2:continue
  props={'kind':kind,'class':cl};name=tags.get('name:zh') or tags.get('name')
  if name:props['name']=name
  closed=pts[0]==pts[-1] and kind in ('water','park')
  parts=[polygon(pts,bounds)] if closed else lineparts(pts,bounds)
  for i,part in enumerate(parts):
   if len(part)<(4 if closed else 2):continue
   coordinates=[[round(x,6),round(y,6)] for x,y in simplify(part)]
   # Closed polygons require at least three distinct vertices; don't simplify away tiny parks.
   if closed and len({tuple(p) for p in coordinates})<3:continue
   features.append({'type':'Feature','id':'way/'+way.get('id')+('/'+str(i) if i else ''),'properties':props,'geometry':{'type':'Polygon' if closed else 'LineString','coordinates':[coordinates] if closed else coordinates}})
 stamp=max((el.get('timestamp','') for el in osm if el.tag in ('node','way')),default='')
 return {'type':'FeatureCollection','region':region,'bounds':bounds,'attribution':'© OpenStreetMap contributors','source':{'endpoint':endpoint,'timestamp':stamp,'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'ODbL-1.0'},'features':features}

def main():
 for region,bounds in REGIONS.items():
  url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(str(v) for v in bounds)
  cache=pathlib.Path('/tmp/beichen-osm-'+region+'.xml')
  if region=='beijing' and pathlib.Path('/tmp/osm-api.xml').exists():cache.write_bytes(pathlib.Path('/tmp/osm-api.xml').read_bytes())
  if not cache.exists():
   request=urllib.request.Request(url,headers={'User-Agent':'BeichenSimulatorOfflineMaps/0.8 (+https://github.com/Yuqing-Maniac/beidou-simulator)'})
   with urllib.request.urlopen(request,timeout=90) as response:cache.write_bytes(response.read())
  data=extract(region,bounds,cache.read_bytes(),url)
  out=ROOT/'src'/'map-data'/(region+'.json');out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
  print(region,len(data['features']),out.stat().st_size,'bytes',flush=True)
if __name__=='__main__':main()
