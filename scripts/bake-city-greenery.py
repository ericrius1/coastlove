"""Deterministic ornamental trees placed clear of OSM buildings and streets.
These are art-directed plantings, not a surveyed tree inventory. Geometry metres.
"""
import json,random,math
from pathlib import Path
from shapely.geometry import Polygon,Point
from shapely.strtree import STRtree
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]/'public/geodata';rng=random.Random(714)
T=Transformer.from_crs(4326,3310,always_xy=True);ox,oy=T.transform(-119.685,34.410)
def project(lon,lat):
 x,y=T.transform(lon,lat);return x-ox,oy-y
result=[]
for city in ['sf','la']:
 index=json.loads((root/city/'index.json').read_text());polys=[]
 for key in index['cells']:
  for b in json.loads((root/city/'cells'/f'{key}.json').read_text()):
   p=Polygon(b['p']);polys.append(p if p.is_valid else p.buffer(0))
 tree=STRtree(polys);roads=json.loads((root/city/'roads.json').read_text());rng.shuffle(roads);count=0
 def clear(x,z,r):return len(tree.query(Point(x,z).buffer(r),predicate='intersects'))==0
 for road in roads:
  if road['bridge'] or road['tunnel'] or road['k'] in ['motorway','motorway_link','trunk','trunk_link']:continue
  for a,b in zip(road['p'],road['p'][1:]):
   dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
   if length<35:continue
   for d in range(20,int(length)-10,65):
    side=1 if rng.random()<.5 else -1;width=road['w']/2+2.5
    x=a[0]+dx*d/length+dz/length*width*side;z=a[1]+dz*d/length-dx/length*width*side
    palm=city=='la' and rng.random()<.55
    if count>=1500 or not clear(x,z,1.8 if palm else 2.9):continue
    result.append([round(x,2),round(z,2),'palms' if palm else 'trees',round(rng.uniform(.65,1.1),2)]);count+=1
 # Recognizable green areas: the park bounds guide ornamental planting, while
 # real building polygons leave museums, observatory and park facilities clear.
 park=(-122.509,37.765,-122.455,37.771) if city=='sf' else (-118.31,34.122,-118.285,34.148)
 west,south,east,north=park
 for _ in range(450):
  x,z=project(rng.uniform(west,east),rng.uniform(south,north))
  if clear(x,z,5):result.append([round(x,2),round(z,2),'trees',round(rng.uniform(.8,1.5),2)])
 print(city,count,'street trees',flush=True)
(root/'city-greenery.json').write_text(json.dumps(result,separators=(',',':')))
print('total',len(result),flush=True)
