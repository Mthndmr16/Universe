# Gök cismi dokularını NASA kaynaklarından üretir → assets/textures/*.jpg + data/textures.json
#
# Her doku için kaynak adresi, atıf, özgün boyut, indirilen baytların SHA-256 özeti ve yapılan işlemler kaydedilir.
# İşlem yalnızca birleştirme (Trek döşemeleri), boyutlandırma (Lanczos) ve 16 → 8 bit dönüşümü; renk, kontrast ya da
# içerik değiştirilmez.
#
# Gerekenler: Python 3, Pillow, tifffile.   Çalıştırma: python tools/build_textures.py [kimlik ...]
import hashlib, io, json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'textures'
META = ROOT / 'data' / 'textures.json'
CACHE = ROOT / 'data' / 'raw' / 'textures'

NASA3D = 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image'
# lon0: haritanın sol kenarındaki boylam (doğu pozitif). None: kaynakta belirtilmemiş.
SOURCES = [
  dict(id='earth_day', body='Earth', kind='url', width=8192, lon0=-180,
       url='https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/april/world.topo.bathy.200404.3x21600x10800.jpg',
       page='https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation-w-topography-and-bathymetry',
       credit='NASA Earth Observatory — Blue Marble: Next Generation (Reto Stöckli), Nisan 2004, topoğrafya ve batimetri ile'),
  dict(id='earth_night', body='Earth', kind='url', width=8192, lon0=-180,
       url='https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144875/BlackMarble_2012_3km.jpg',
       page='https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps',
       credit='NASA Earth Observatory — Black Marble 2012 (Suomi NPP VIIRS, NASA/NOAA)'),
  dict(id='earth_water', body='Earth', kind='gibs', width=8192, layers=[('MODIS_Water_Mask', 'default')], tms='250m', level=4,
       tiles=(20, 10), decode='water', colormap=None, page='https://nasa-gibs.github.io/gibs-api-docs/',
       credit='NASA GIBS (EOSDIS) — MODIS Water Mask (Terra MODIS, 250 m)'),
  dict(id='earth_clouds', body='Earth', kind='gibs', width=4096,
       layers=[('MODIS_Terra_Cloud_Fraction_Day', '2026-11-02'), ('MODIS_Aqua_Cloud_Fraction_Day', '2026-11-02')], tms='2km', level=3,
       tiles=(10, 5), decode='cloud', colormap='https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml',
       page='https://nasa-gibs.github.io/gibs-api-docs/',
       credit='NASA GIBS (EOSDIS) — MODIS Terra ve Aqua gündüz bulut oranı, 2 Kasım 2026',
       note='Tek bir günün bulutları; tarih değişse de aynı kalır. Uydu şeritleri arasında ve kutup gecesinde veri yok.'),
  dict(id='moon', body='Moon', kind='tiff16', width=4096, lon0=-180,
       url='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif',
       page='https://svs.gsfc.nasa.gov/4720',
       credit='NASA Scientific Visualization Studio — CGI Moon Kit (LRO LROC WAC renk mozaiği)'),
  dict(id='mercury', body='Mercury', kind='trek', width=8192, lon0=-180,
       trek=('Mercury', 'Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m'),
       page='https://trek.nasa.gov/mercury/',
       credit='NASA Mercury Trek — MESSENGER MDIS BDR küresel mozaik 166 m (tek bant; Merkür gerçekte grimsi)'),
  dict(id='mars', body='Mars', kind='trek', width=8192, lon0=-180,
       trek=('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m'),
       page='https://trek.nasa.gov/mars/',
       credit='NASA Mars Trek — Viking MDIM 2.1 renkli küresel mozaik 232 m (NASA/JPL/USGS)'),
  dict(id='jupiter', body='Jupiter', kind='tiff8', width=None, lon0=None,
       url='https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif',
       page='https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/',
       credit='NASA/JPL/Space Science Institute — PIA07782, Cassini Aralık 2000 silindirik harita',
       note='Sayfada haritanın boylam düzeni belirtilmiyor; Büyük Kırmızı Leke\'nin boylamı temsilîdir.'),
  dict(id='venus', body='Venus', kind='url', width=None, lon0=None, url=f'{NASA3D}/venus/Venus.jpg',
       page='https://science.nasa.gov/3d-resources/venus/', credit='NASA 3D Resources — Venus'),
  dict(id='saturn', body='Saturn', kind='url', width=None, lon0=None, url=f'{NASA3D}/saturn/Saturn.jpg',
       page='https://science.nasa.gov/3d-resources/saturn/', credit='NASA 3D Resources — Saturn'),
  dict(id='neptune', body='Neptune', kind='url', width=None, lon0=None, url=f'{NASA3D}/neptune/Neptune.jpg',
       page='https://science.nasa.gov/3d-resources/neptune/', credit='NASA 3D Resources — Neptune'),
  dict(id='pluto', body='Pluto', kind='url', width=None, lon0=None, url=f'{NASA3D}/pluto/Pluto.jpg',
       page='https://science.nasa.gov/3d-resources/pluto/', credit='NASA 3D Resources — Pluto'),
  dict(id='io', body='Io', kind='trek', width=4096, lon0=-180,
       trek=('Io', 'Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km'), page='https://trek.nasa.gov/io/',
       credit='NASA Io Trek — Voyager ISS ve Galileo SSI renkli küresel mozaik 1 km'),
  dict(id='europa', body='Europa', kind='trek', width=4096, lon0=-180,
       trek=('Europa', '20150218_europa_global_map_20000x10000'), page='https://trek.nasa.gov/europa/',
       credit='NASA Europa Trek — Voyager ve Galileo SSI renk karışımı küresel mozaik 270 m'),
  dict(id='ganymede', body='Ganymede', kind='trek', width=4096, lon0=-180,
       trek=('Ganymede', 'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m'), page='https://trek.nasa.gov/ganymede/',
       credit='NASA Ganymede Trek — Voyager ve Galileo SSI renkli küresel mozaik 1435 m'),
  dict(id='enceladus', body='Enceladus', kind='trek', width=4096, lon0=-180,
       trek=('Enceladus', 'Enceladus_cyl_KH'), page='https://trek.nasa.gov/enceladus/',
       credit='NASA Enceladus Trek — Cassini ISS renkli küresel mozaik 100 m'),
  # Gökyüzü: ekvatoral koordinatlarda eş dikdörtgen HDR harita. Haritanın merkezinde RA 0h var ve RA sola doğru artıyor.
  # Bu yön haritanın kendisinden doğrulandı: en parlak bölge RA ≈ 270°, dik açıklık −29° (Samanyolu merkezi, Yay takımyıldızı).
  dict(id='starmap', body='Sky', kind='raw', width=None, lon0=None, folder='sky',
       url='https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr',
       page='https://svs.gsfc.nasa.gov/4851',
       credit='NASA/Goddard Space Flight Center Scientific Visualization Studio — Deep Star Maps 2020. Gaia DR2: ESA/Gaia/DPAC; Hipparcos-2, Tycho-2: ESA',
       note='Ekvatoral (ICRS) koordinatlar; u = 0,5 − RA/360°, v: dik açıklık +90°\'den −90°\'ye.'),
  dict(id='vesta', body='Vesta', kind='trek', width=4096, lon0=-180,
       trek=('Vesta', 'Vesta_Dawn_HAMO_TrueClr_DLR_global_74ppd_IAU'), page='https://trek.nasa.gov/vesta/',
       credit='NASA Vesta Trek — Dawn FC gerçek renk küresel mozaik (DLR işlemesi)'),
]

def fetch(url, tries=5):
  for i in range(tries):
    try:
      with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'evren-texture-builder'}), timeout=120) as r:
        return r.read()
    except Exception as e:
      if i == tries - 1: raise
      print(f'  tekrar deneniyor ({i + 1}): {e}'); time.sleep(3 * (i + 1))

def cached(url, name):
  CACHE.mkdir(parents=True, exist_ok=True)
  p = CACHE / name
  if not p.exists(): p.write_bytes(fetch(url))
  return p.read_bytes()

def trek_mosaic(body, layer, target):
  base = f'https://trek.nasa.gov/tiles/{body}/EQ/{layer}/1.0.0'
  cap = fetch(base + '/WMTSCapabilities.xml').decode('utf-8', 'replace')
  tmpl = re.search(r'<ResourceURL[^>]*template="([^"]+)"', cap).group(1)
  tms = re.search(r'<TileMatrixSetLink>\s*<TileMatrixSet>([^<]+)</TileMatrixSet>', cap).group(1)
  block = cap[cap.find(f'<ows:Identifier>{tms}</ows:Identifier>'):]
  levels = []
  for m in re.finditer(r'<TileMatrix>(.*?)</TileMatrix>', block, re.S):
    t = m.group(1); g = lambda k: re.search(f'<{k}>([^<]+)</{k}>', t).group(1)
    levels.append((g('ows:Identifier'), int(float(g('TileWidth'))), int(float(g('TileHeight'))), int(float(g('MatrixWidth'))), int(float(g('MatrixHeight')))))
  if not levels: raise RuntimeError(f'{layer}: döşeme düzeyi bulunamadı')
  lvl = next((l for l in levels if l[1] * l[3] >= target), levels[-1])
  ident, tw, th, mw, mh = lvl
  if mw != 2 * mh: raise RuntimeError(f'{layer}: düzey {ident} 2:1 değil ({mw}x{mh})')
  urls = [(r, c, tmpl.replace('{Style}', 'default').replace('{TileMatrixSet}', tms).replace('{TileMatrix}', ident)
           .replace('{TileRow}', str(r)).replace('{TileCol}', str(c))) for r in range(mh) for c in range(mw)]
  h = hashlib.sha256(); img = Image.new('RGB', (tw * mw, th * mh))
  with ThreadPoolExecutor(6) as ex:
    datas = list(ex.map(lambda u: fetch(u[2]), urls))
  for (r, c, _), d in zip(urls, datas):
    h.update(d); img.paste(Image.open(io.BytesIO(d)).convert('RGB'), (c * tw, r * th))
  print(f'  Trek {layer}: düzey {ident}, {mw}x{mh} döşeme → {img.width}x{img.height}')
  return img, dict(trek_level=ident, tiles=f'{mw}x{mh}', tile_template=tmpl, tiles_sha256=h.hexdigest())

# NASA GIBS (EOSDIS) WMTS, EPSG:4326. Paletli PNG döşemeleri renk anahtarıyla veri değerine çevrilir.
GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best'
def gibs_layer(layer, time, tms, level, tiles_w, tiles_h, colormap_url):
  import xml.etree.ElementTree as ET
  cmap = fetch(colormap_url).decode('utf-8')
  rgb2val = {}
  for e in ET.fromstring(cmap).iter('ColorMapEntry'):
    if e.get('transparent') == 'true' or e.get('nodata') == 'true': continue
    rgb2val[tuple(int(c) for c in e.get('rgb').split(','))] = float(e.get('value', e.get('sourceValue')))
  out = np.full((tiles_h * 512, tiles_w * 512), np.nan, np.float32)
  urls = [(r, c, f'{GIBS}/{layer}/default/{time}/{tms}/{level}/{r}/{c}.png') for r in range(tiles_h) for c in range(tiles_w)]
  h = hashlib.sha256()
  with ThreadPoolExecutor(6) as ex:
    datas = list(ex.map(lambda u: fetch(u[2]), urls))
  for (r, c, _), d in zip(urls, datas):
    h.update(d)
    im = Image.open(io.BytesIO(d))
    if im.mode != 'P': raise RuntimeError(f'{layer}: paletli PNG bekleniyordu ({im.mode})')
    pal = np.array(im.getpalette()[:768], np.int32).reshape(-1, 3)
    lut = np.array([rgb2val.get(tuple(p), np.nan) for p in pal], np.float32)
    out[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512] = lut[np.asarray(im)]
  print(f'  GIBS {layer} {time}: düzey {level}, {tiles_w}x{tiles_h} döşeme')
  return out, dict(gibs_layer=layer, gibs_time=time, gibs_level=level, colormap=colormap_url, tiles_sha256=h.hexdigest())

def build_gibs(s):
  info = dict(id=s['id'], body=s['body'], credit=s['credit'], page=s['page'], lon_left_edge_deg=-180, note=s.get('note'),
              retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'), layers=[])
  vals = []
  for layer, time in s['layers']:
    v, meta = gibs_layer(layer, time, s['tms'], s['level'], s['tiles'][0], s['tiles'][1], s['colormap'] or
                         f'https://gibs.earthdata.nasa.gov/colormaps/v1.3/{layer}.xml')
    vals.append(v); info['layers'].append(meta)
  if s['decode'] == 'water':
    g = np.where(np.isfinite(vals[0]), 255, 0).astype(np.uint8)          # su = 255, kara/veri yok = 0
    steps = ['su pikselleri 255, diğerleri 0']
  else:                                                                   # bulut oranı %: uyduların ortalaması, veri yoksa 0
    stack = np.stack(vals); cnt = np.isfinite(stack).sum(0)
    mean = np.where(cnt > 0, np.nansum(stack, 0) / np.maximum(cnt, 1), 0)
    g = np.clip(mean / 100 * 255 + 0.5, 0, 255).astype(np.uint8)
    info['no_data_fraction'] = round(float((cnt == 0).mean()), 4)
    steps = ['bulut oranı (%) → 0–255; birden çok uydu varsa ortalama; veri olmayan yerde 0 (bulutsuz değil, bilinmiyor)']
  img = Image.fromarray(g, 'L'); info['source_size'] = [img.width, img.height]
  if img.width != s['width']:
    img = img.resize((s['width'], s['width'] // 2), Image.LANCZOS); steps.append(f'Lanczos ile {s["width"]}x{s["width"] // 2} boyutuna')
  out = OUT / f'{s["id"]}.png'; img.save(out, optimize=True)
  info.update(file=f'assets/textures/{s["id"]}.png', size=[img.width, img.height], steps=steps,
              file_sha256=hashlib.sha256(out.read_bytes()).hexdigest())
  print(f'  → {out.name}: {img.width}x{img.height}, {out.stat().st_size / 1e6:.1f} MB')
  return info

def build(s):
  if s['kind'] == 'gibs': return build_gibs(s)
  info = dict(id=s['id'], body=s['body'], credit=s['credit'], page=s['page'], lon_left_edge_deg=s['lon0'],
              note=s.get('note'), retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'))
  steps = []
  if s['kind'] == 'raw':  # olduğu gibi kopyalanır (ör. EXR)
    data = cached(s['url'], s['id'] + Path(s['url']).suffix)
    dest = ROOT / 'assets' / s['folder'] / (s['id'] + Path(s['url']).suffix)
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
    info.update(url=s['url'], source_sha256=hashlib.sha256(data).hexdigest(), file=dest.relative_to(ROOT).as_posix(), steps=['değiştirilmeden kopyalandı'])
    print(f'  → {dest.name}: {len(data) / 1e6:.1f} MB')
    return info
  if s['kind'] == 'trek':
    img, extra = trek_mosaic(*s['trek'], s['width']); info.update(extra); steps.append('Trek döşemeleri birleştirildi')
  else:
    data = cached(s['url'], s['id'] + Path(s['url']).suffix)
    info.update(url=s['url'], source_sha256=hashlib.sha256(data).hexdigest())
    if s['kind'] == 'tiff16':
      a = tifffile.imread(io.BytesIO(data))
      if a.dtype != np.uint16: raise RuntimeError(f'{s["id"]}: 16 bit bekleniyordu, {a.dtype}')
      img = Image.fromarray((a[..., :3].astype(np.float32) / 257.0 + 0.5).astype(np.uint8)); steps.append('16 bit → 8 bit (÷257)')
    elif s['kind'] == 'tiff8':
      a = tifffile.imread(io.BytesIO(data)); img = Image.fromarray(a[..., :3].astype(np.uint8))
    else:
      img = Image.open(io.BytesIO(data)).convert('RGB')
  info['source_size'] = [img.width, img.height]
  ratio = img.width / img.height
  if abs(ratio - 2) > 0.01: raise RuntimeError(f'{s["id"]}: eş dikdörtgen harita değil (oran {ratio:.3f})')
  if s['width'] and img.width != s['width']:
    img = img.resize((s['width'], s['width'] // 2), Image.LANCZOS); steps.append(f'Lanczos ile {s["width"]}x{s["width"] // 2} boyutuna')
  OUT.mkdir(parents=True, exist_ok=True)
  out = OUT / f'{s["id"]}.jpg'
  img.save(out, quality=92, optimize=True)
  info.update(file=f'assets/textures/{s["id"]}.jpg', size=[img.width, img.height], steps=steps,
              file_sha256=hashlib.sha256(out.read_bytes()).hexdigest())
  print(f'  → {out.name}: {img.width}x{img.height}, {out.stat().st_size / 1e6:.1f} MB')
  return info

only = set(sys.argv[1:])
meta = json.loads(META.read_text('utf-8'))['textures'] if META.exists() else {}
for s in SOURCES:
  if only and s['id'] not in only: continue
  print(s['id'])
  meta[s['id']] = build(s)
  META.write_text(json.dumps({'_note': 'tools/build_textures.py ile üretildi. Renk ve içerik değiştirilmez; yalnızca birleştirme, boyutlandırma ve bit derinliği dönüşümü.',
                              'textures': meta}, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print('bitti: data/textures.json')
