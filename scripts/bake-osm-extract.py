"""Bake the LA metro from a Geofabrik Southern California PBF (ODbL).
Usage: python scripts/bake-osm-extract.py /path/to/socal.osm.pbf
Requires osmium, pyproj, shapely. Never contacts Overpass.
"""
import sys,json,math
from pathlib import Path
import osmium
from pyproj import Transformer
from shapely.geometry import Polygon
OUT=Path(__file__).resolve().parents[1]/'public/geodata/la'
OUT.mkdir(parents=True,exist_ok=True)
T=Transformer.from_crs(4326,3310,always_xy=True);OX,OY=T.transform(-119.685,34.410)
BBOX=(33.955,-118.73,34.22,-118.215)
def project(lon,lat):
 x,y=T.transform(lon,lat);return[round(x-OX,2),round(OY-y,2)]
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,separators=(',',':')))
class Bake(osmium.SimpleHandler):
 def __init__(self):
  super().__init__();self.cells={};self.skyline=[];self.roads=[];self.count=0
 def way(self,w):
  building=w.tags.get('building');highway=w.tags.get('highway')
  if not building and highway not in ['motorway','trunk','primary','secondary','tertiary','residential','unclassified','living_street','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link']:return
  if not w.nodes or not w.nodes[0].location.valid():return
  s,west,n,east=BBOX;first=w.nodes[0].location
  if not (west<=first.lon<=east and s<=first.lat<=n):return
  if any(not p.location.valid() for p in w.nodes):return
  poly=[project(p.lon,p.lat) for p in w.nodes]
  tags={t.k:t.v for t in w.tags}
  if building and len(poly)>=4:
   shape=Polygon(poly)
   if not shape.is_valid:shape=shape.buffer(0)
   if shape.geom_type!='Polygon' or shape.area<12:return
   poly=[[round(x,2),round(z,2)] for x,z in shape.simplify(.25,preserve_topology=True).exterior.coords]
   try:h=float(tags.get('height','').split(' ')[0]);estimated=False
   except ValueError:
    try:h=float(tags.get('building:levels',''))*3.2;estimated=True
    except ValueError:h=3.2 if shape.area<50 or building in ['garage','garages','shed','carport'] else 6.5 if shape.area<250 or building in ['house','detached','residential'] else 9.6;estimated=True
   b={'id':w.id,'p':poly,'h':round(max(2.5,min(400,h)),1),'style':building,'estimated':estimated}
   center=shape.centroid;key=f'{math.floor(center.x/512)},{math.floor(center.y/512)}';self.cells.setdefault(key,[]).append(b)
   if b['h']>=35:self.skyline.append(b)
   self.count+=1
   if self.count%100000==0:print('LA footprints',self.count,flush=True)
  elif highway and len(poly)>=2 and tags.get('access')!='private':
   lanes=tags.get('lanes','')
   try:width=float(tags.get('width','').split(' ')[0])
   except ValueError:width=max(5.5,min(24,int(lanes)*3.25 if lanes.isdigit() else {'motorway':11,'trunk':11,'primary':12,'secondary':10,'tertiary':9}.get(highway,8)))
   self.roads.append({'id':w.id,'p':poly,'w':round(width,1),'name':tags.get('name',tags.get('ref','')),'k':highway,'one':-1 if tags.get('oneway')=='-1' else int(tags.get('oneway')=='yes' or highway=='motorway'),'bridge':tags.get('bridge','no')!='no','tunnel':tags.get('tunnel','no')!='no','layer':int(tags.get('layer','0')) if tags.get('layer','0').lstrip('-').isdigit() else 0})
 def save(self):
  for key,buildings in self.cells.items():write(OUT/'cells'/f'{key}.json',buildings)
  write(OUT/'roads.json',self.roads);write(OUT/'skyline.json',self.skyline)
  write(OUT/'index.json',{'id':'la','bbox':BBOX,'cell':512,'cells':list(self.cells),'buildings':self.count,'skyline':len(self.skyline),'crs':'EPSG:3310','unit':'metre','source':'OpenStreetMap / Geofabrik socal-260923'})
  print('LA complete',self.count,'buildings',len(self.roads),'roads',len(self.cells),'cells',flush=True)
bake=Bake();bake.apply_file(sys.argv[1],locations=True,idx='flex_mem');bake.save()
