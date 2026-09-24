"""Build Coastlove's cartographic coast and scenic road from Natural Earth land.
Usage: python scripts/build-coast.py /path/to/ne_10m_land.geojson
Requires shapely. Output is checked in; no GIS dependencies at runtime.
"""
import json, math, sys
from pathlib import Path
from shapely.geometry import shape, box, Point, LineString
from shapely.ops import unary_union, transform
SCALE=32
LON,LAT=-119.685,34.410
MX=111320*math.cos(math.radians(LAT))/SCALE
MZ=111320/SCALE
project=lambda x,y,z=None:((x-LON)*MX,-(y-LAT)*MZ)
data=json.load(open(sys.argv[1]))
clip=box(-125.1,31.8,-113.0,43.0)
land=unary_union([shape(f['geometry']).intersection(clip) for f in data['features'] if shape(f['geometry']).intersects(clip)])
land=transform(project,land).simplify(2.5,preserve_topology=True)
polys=sorted(land.geoms,key=lambda p:-p.area)
rings=[]
for p in polys:
 if p.area<180:continue
 rings.append([[round(x,2),round(z,2)] for x,z in p.exterior.coords])
 for hole in p.interiors:rings.append([[round(x,2),round(z,2)]for x,z in hole.coords])
# The mainland's inward-offset coastline makes a dry, gently winding scenic
# route. It is an artistic road, not a surveyed reproduction of Highway 1.
main=polys[0].buffer(-90,join_style=1)
if main.geom_type=='MultiPolygon':main=max(main.geoms,key=lambda p:p.area)
coords=list(main.exterior.coords)
# At each latitude endpoint select the western (ocean-facing) edge.
def end(lat):
 z=project(0,lat)[1]
 near=sorted(range(len(coords)-1),key=lambda i:abs(coords[i][1]-z))[:10]
 return min(near,key=lambda i:coords[i][0])
a,b=end(32.59),end(41.96)
paths=[coords[min(a,b):max(a,b)+1],coords[max(a,b):]+coords[:min(a,b)+1]]
path=min(paths,key=lambda points:sum(x for x,z in points)/len(points))
if path[0][1]<path[-1][1]:path.reverse()
line=LineString(path).simplify(9)
# Turn-around loop, with a parallel inland return leg. Keep the two carriageways
# separate so traffic can traverse the entire coast without a teleport at an end.
outer=[line.interpolate(i*12) for i in range(int(line.length/12)+1)]
pts=[(p.x,p.y)for p in outer]
back=[]
for i,p in enumerate(pts):
 prev=pts[max(0,i-1)];nxt=pts[min(len(pts)-1,i+1)];dx=nxt[0]-prev[0];dz=nxt[1]-prev[1];l=math.hypot(dx,dz)or 1
 # South-to-north means right of travel is the inland side.
 back.append((p[0]-dz/l*28,p[1]+dx/l*28))
road=pts+list(reversed(back))
out=Path(__file__).resolve().parents[1]/'src/california/Coastline.js'
out.write_text('// Natural Earth 1:10 million land, public domain. See scripts/build-coast.py.\n// Equirectangular around Santa Barbara; 1:32 horizontal travel scale.\nexport const COAST_RINGS = '+json.dumps(rings,separators=(',',':'))+';\nexport const COAST_DRIVE = '+json.dumps([[round(x,2),round(z,2)]for x,z in road],separators=(',',':'))+';\n')
print(len(rings),'rings;',sum(map(len,rings)),'vertices;',round(line.length),'m scenic coast drive;',land.bounds)
