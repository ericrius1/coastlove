"""Reproducible metre-scale California data bake.

pip install numpy pillow requests pyproj shapely
python scripts/build-real-coast.py --cache /path/to/cache --sf /path/to/sanfrancisco
OSM-derived output is ODbL; terrain attribution is in public/geodata/ATTRIBUTION.md.
Downloads are cached, bounded, and retried; no runtime Overpass requests.
"""
import argparse, concurrent.futures, io, json, math, time
from pathlib import Path
import numpy as np
import requests
from PIL import Image
from pyproj import Transformer
from shapely.geometry import Polygon

P = argparse.ArgumentParser()
P.add_argument('--cache', required=True)
P.add_argument('--sf', required=True)
P.add_argument('--part', choices=['cities', 'terrain', 'all'], default='all')
A = P.parse_args()
CACHE = Path(A.cache); CACHE.mkdir(parents=True, exist_ok=True)
OUT = Path(__file__).resolve().parents[1] / 'public/geodata'; OUT.mkdir(parents=True, exist_ok=True)
PROJ = Transformer.from_crs(4326, 3310, always_xy=True)
INV = Transformer.from_crs(3310, 4326, always_xy=True)
OX, OY = PROJ.transform(-119.685, 34.410)
def project(lon, lat):
    x, y = PROJ.transform(lon, lat)
    return x - OX, OY - y
def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(',', ':')))
def osm(query, label):
    path = CACHE / (label + '.json')
    if path.exists(): return json.loads(path.read_text())['elements']
    endpoints = ['https://overpass-api.de/api/interpreter']
    for i in range(3):
        try:
            r = requests.post(endpoints[i % len(endpoints)], data={'data': query}, timeout=90,
                              headers={'User-Agent': 'Coastlove-open-world-data-bake/1.0'})
            r.raise_for_status(); data = r.json()
            if 'remark' in data: raise RuntimeError(data['remark'])
            write(path, data); print(label, len(data['elements']), flush=True)
            return data['elements']
        except Exception as e:
            print(label, 'retry', i, str(e)[:150], flush=True); time.sleep(3 * (i + 1))
    raise RuntimeError('Could not download ' + label)

CITIES = {'sf': (37.705, -122.525, 37.875, -122.35), 'la': (33.955, -118.58, 34.18, -118.215)}
CLASSES = 'motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
def roads(city, bb):
    rows = osm(f'[out:json][timeout:180];way["highway"~"^({CLASSES})$"]({",".join(map(str,bb))});out tags geom;', city+'-roads')
    out=[]
    for row in rows:
        tags=row.get('tags',{}); geom=row.get('geometry',[])
        if len(geom)<2 or tags.get('access')=='private' or tags.get('service') in ['parking_aisle','driveway']: continue
        pts=[list(map(lambda v:round(v,2),project(p['lon'],p['lat']))) for p in geom]
        kind=tags['highway']; lanes=tags.get('lanes','')
        try: width=float(tags.get('width','').split(' ')[0])
        except ValueError: width=max(5.5, min(24, int(lanes)*3.25 if lanes.isdigit() else {'motorway':11,'trunk':11,'primary':12,'secondary':10,'tertiary':9,'service':5.5}.get(kind,8)))
        out.append({'id':row['id'],'p':pts,'w':round(width,1),'name':tags.get('name',tags.get('ref','')),'k':kind,
                    'one':-1 if tags.get('oneway')=='-1' else int(tags.get('oneway')=='yes' or kind=='motorway'),
                    'bridge':tags.get('bridge','no')!='no','tunnel':tags.get('tunnel','no')!='no','layer':int(tags.get('layer','0')) if tags.get('layer','0').lstrip('-').isdigit() else 0})
    write(OUT/city/'roads.json',out)
    return out

def buildings(city, bb):
    result=[]; seen=set()
    if city=='sf':
        source=json.loads((Path(A.sf)/'public/citygen/buildings.json').read_text())
        meta=json.loads((Path(A.sf)/'public/data/meta.json').read_text())
        for cell in source['cells'].values():
            for b in cell:
                poly=[]
                for x,z in b['poly']:
                    px,pz=project(meta['origin']['lon']+x/meta['mPerDegLon'],meta['origin']['lat']-z/meta['mPerDegLat'])
                    poly.append([round(px,2),round(pz,2)])
                result.append({'id':b['id'],'p':poly,'h':round(b['h'],1),'style':b.get('archetype','residential'),'estimated':True})
    else:
        s,w,n,e=bb
        for j in range(3):
            for i in range(5):
                box=(s+(n-s)*j/3,w+(e-w)*i/5,s+(n-s)*(j+1)/3,w+(e-w)*(i+1)/5)
                label=f'{city}-buildings-{i}-{j}'
                if (CACHE/(label+'.json')).exists():
                    rows=json.loads((CACHE/(label+'.json')).read_text())['elements']
                else:
                    rows=[]
                    for suby in range(3):
                        for subx in range(3):
                            ss,ww,nn,ee=box
                            small=(ss+(nn-ss)*suby/3,ww+(ee-ww)*subx/3,ss+(nn-ss)*(suby+1)/3,ww+(ee-ww)*(subx+1)/3)
                            rows.extend(osm(f'[out:json][timeout:60];way["building"]({",".join(map(str,small))});out tags geom;',label+f'-{subx}-{suby}'))
                            time.sleep(.7)
                    write(CACHE/(label+'.json'),{'elements':rows})
                for b in rows:
                    if b['id'] in seen: continue
                    seen.add(b['id']); g=b.get('geometry',[]); tags=b.get('tags',{})
                    if len(g)<4: continue
                    poly=[[round(v,2) for v in project(p['lon'],p['lat'])] for p in g]
                    shape=Polygon(poly)
                    if not shape.is_valid: shape=shape.buffer(0)
                    if shape.geom_type!='Polygon' or shape.area<12: continue
                    poly=[[round(x,2),round(z,2)] for x,z in shape.simplify(.3,preserve_topology=True).exterior.coords]
                    try: h=float(tags.get('height','').split(' ')[0]); estimated=False
                    except ValueError:
                        try: h=float(tags.get('building:levels',''))*3.2; estimated=True
                        except ValueError: h=6.5 if tags.get('building') in ['house','detached','residential'] else 9.6; estimated=True
                    result.append({'id':b['id'],'p':poly,'h':round(max(2.5,min(400,h)),1),'style':tags.get('building','yes'),'estimated':estimated})
                time.sleep(1)
    cells={}; skyline=[]
    for b in result:
        p=b['p']; cx=sum(v[0] for v in p)/len(p); cz=sum(v[1] for v in p)/len(p)
        key=f'{math.floor(cx/512)},{math.floor(cz/512)}'
        cells.setdefault(key,[]).append(b)
        if b['h']>=35: skyline.append(b)
    for key,items in cells.items(): write(OUT/city/'cells'/f'{key}.json',items)
    write(OUT/city/'skyline.json',skyline)
    write(OUT/city/'index.json',{'id':city,'bbox':bb,'cell':512,'cells':list(cells),'buildings':len(result),'skyline':len(skyline),'crs':'EPSG:3310','unit':'metre'})
    print(city,'buildings',len(result),'cells',len(cells),flush=True)

def tile(z,x,y):
    path=CACHE/'terrarium'/f'{z}-{x}-{y}.png'; path.parent.mkdir(exist_ok=True)
    if not path.exists():
        for attempt in range(5):
            try:
                r=requests.get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',timeout=40);r.raise_for_status()
                Image.open(io.BytesIO(r.content)).verify();path.write_bytes(r.content);break
            except Exception:
                if attempt==4: raise
                time.sleep(attempt+1)
    rgb=np.array(Image.open(path).convert('RGB'),dtype=np.float32)
    return rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768

def terrain(label,bb,step,zoom):
    s,w,n,e=bb; corners=[project(lon,lat) for lon in [w,e] for lat in [s,n]]
    xmin=math.floor(min(p[0] for p in corners)/step)*step; zmin=math.floor(min(p[1] for p in corners)/step)*step
    width=math.ceil((max(p[0] for p in corners)-xmin)/step)+1; height=math.ceil((max(p[1] for p in corners)-zmin)/step)+1
    xs=xmin+np.arange(width)*step; zs=zmin+np.arange(height)*step
    lon,lat=INV.transform(xs[None,:]+np.zeros((height,1))+OX, OY-zs[:,None]+np.zeros((1,width)))
    u=(lon+180)/360*2**zoom*256-.5; v=(1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*2**zoom*256-.5
    tx0=int(np.floor(u.min()/256)); ty0=int(np.floor(v.min()/256)); tx1=int(np.floor(u.max()/256))+1; ty1=int(np.floor(v.max()/256))+1
    atlas=np.zeros(((ty1-ty0+1)*256,(tx1-tx0+1)*256),dtype=np.float32)
    jobs=[(x,y) for y in range(ty0,ty1+1) for x in range(tx0,tx1+1)]
    def load(t): return t,tile(zoom,*t)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for k,((x,y),data) in enumerate(pool.map(load,jobs)):
            atlas[(y-ty0)*256:(y-ty0+1)*256,(x-tx0)*256:(x-tx0+1)*256]=data
            if k%50==0: print(label,'elevation tiles',k,'/',len(jobs),flush=True)
    u-=tx0*256;v-=ty0*256;i=u.astype(int);j=v.astype(int);a=u-i;b=v-j
    data=(atlas[j,i]*(1-a)+atlas[j,i+1]*a)*(1-b)+(atlas[j+1,i]*(1-a)+atlas[j+1,i+1]*a)*b
    # Decimetres preserve vertical scale; bathymetry capped at 150 m below sea.
    encoded=np.rint(np.clip(data,-150,3200)*10).astype('<i2')
    encoded.tofile(OUT/f'{label}-height.bin')
    write(OUT/f'{label}-height.json',{'x':xmin,'z':zmin,'width':width,'height':height,'step':step,'scale':.1,'sourceZoom':zoom,'crs':'EPSG:3310','origin':[-119.685,34.410]})
    print(label,'height grid',width,height,'MB',round(encoded.nbytes/1e6,1),flush=True)

if A.part in ['cities','all']:
    for name,bb in CITIES.items():
        roads(name,bb);buildings(name,bb)
if A.part in ['terrain','all']:
    terrain('california',(32.3,-124.7,42.15,-116.75),512,9)
    terrain('sf',(37.68,-122.56,37.90,-122.32),8,13)
    terrain('la',(33.92,-118.73,34.24,-118.19),16,12)
    terrain('harbor',(34.35,-119.77,34.47,-119.60),8,13)
