"""Bake DataSF ynuv-fyni building footprints and LiDAR roof heights (PDDL).
Usage: python scripts/bake-sf-survey.py /path/to/sf-lidar.csv
2016 survey; modern landmarks are explicitly identified, not silently inferred.
"""
import csv,json,math,sys
from pathlib import Path
from shapely import wkt
from shapely.geometry import Polygon,Point
from shapely.ops import transform
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]/'public/geodata/sf';T=Transformer.from_crs(4326,3310,always_xy=True);ox,oy=T.transform(-119.685,34.410)
def proj(x,y,z=None):
 a,b=T.transform(x,y);return a-ox,oy-b
cells={};sky=[];count=0
for row in csv.DictReader(open(sys.argv[1])):
 if not row['shape']:continue
 shape=wkt.loads(row['shape']);center=shape.centroid
 if not(-122.56<center.x<-122.32 and 37.68<center.y<37.90):continue
 median=float(row['hgt_median_m'] or 0);peak=float(row['hgt_maxcm'] or 0)/100
 if median<1.5:continue
 for part,poly in enumerate(shape.geoms):
  geom=transform(proj,poly).simplify(.18,preserve_topology=True)
  if geom.area<12:continue
  h=max(2.5,median);style='survey';name=None
  # The pyramid's median roof pixel is low on its sloping sides, not its apex.
  if abs(center.x+122.402775)<.00012 and abs(center.y-37.79518)<.00012:h=853*.3048;style='pyramid';name='Transamerica Pyramid'
  b={'id':int(row['area_id'])*10+part,'p':[[round(x,2),round(z,2)] for x,z in geom.exterior.coords],'h':round(h,2),'style':style,'estimated':False,'heightSource':'LiDAR roof median' if not name else 'published architectural height'}
  if name:b['name']=name
  c=geom.centroid;key=f'{math.floor(c.x/512)},{math.floor(c.y/512)}';cells.setdefault(key,[]).append(b);count+=1
# Completed after the survey. Stylized rounded shaft at its geographic location,
# 1,070 ft architectural height. The footprint is an approximation in metres.
x,z=proj(-122.39658,37.78977);radius=27
poly=[[round(x+math.cos(a/24*math.tau)*radius,2),round(z+math.sin(a/24*math.tau)*radius,2)] for a in range(25)]
for items in cells.values():items[:]=[b for b in items if not Polygon(b['p']).contains(Point(x,z))]
b={'id':9900001,'p':poly,'h':1070*.3048,'style':'salesforce','name':'Salesforce Tower','estimated':False,'heightSource':'published architectural height; stylized footprint'}
cells.setdefault(f'{math.floor(x/512)},{math.floor(z/512)}',[]).append(b)
for key,items in cells.items():
 (root/'cells'/f'{key}.json').write_text(json.dumps(items,separators=(',',':')))
 sky.extend(b for b in items if b['h']>=35)
(root/'skyline.json').write_text(json.dumps(sky,separators=(',',':')))
(root/'index.json').write_text(json.dumps({'id':'sf','cell':512,'cells':list(cells),'buildings':sum(map(len,cells.values())),'skyline':len(sky),'crs':'EPSG:3310','unit':'metre','source':'DataSF ynuv-fyni: 2016 footprints and LiDAR roof heights, PDDL; modern landmark supplement','sourceUrl':'https://data.sfgov.org/d/ynuv-fyni'},separators=(',',':')))
print('SF surveyed buildings',sum(map(len,cells.values())),'cells',len(cells),'skyline',len(sky),flush=True)
