# Yükseklik verisinden yüzey normal haritası (kabartma). Gerçek ölçek: abartma yok.
#   • Ay: NASA SVS CGI Moon Kit, LOLA yüksekliği ldem_16_uint.tif (yarım metre, +20 000 kaydırmalı, 16 piksel/derece)
#   • Mars: NASA PDS Geosciences, MGS MOLA MEGDR megt90n000eb.img (metre, 16 bit MSB, 16 piksel/derece, 0–360° doğu)
# Çıktı: her pikselde yerel doğu/kuzey/yukarı eksenlerinde birim normal, RGB = n·0,5 + 0,5. Haritanın sol kenarı −180°.
#
#   python tools/build_normals.py
import hashlib, io, json, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'data' / 'raw' / 'textures'
SOURCES = [
  dict(id='moon_normal', body='Moon', radius_km=1737.4, width=4096,
       url='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif', page='https://svs.gsfc.nasa.gov/4720',
       credit='NASA SVS CGI Moon Kit — LRO LOLA yükseklik modeli (16 piksel/derece)', fmt='svs_uint'),
  dict(id='mars_normal', body='Mars', radius_km=3396.0, width=5760,
       url='https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
       page='https://pds-geosciences.wustl.edu/missions/mgs/megdr.html',
       credit='NASA PDS Geosciences — MGS MOLA MEGDR yükseklik modeli (16 piksel/derece)', fmt='mola_msb'),
]

def cached(url, name):
  CACHE.mkdir(parents=True, exist_ok=True); p = CACHE / name
  if not p.exists(): p.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'evren'}), timeout=900).read())
  return p.read_bytes()

meta_path = ROOT / 'data/textures.json'; meta = json.loads(meta_path.read_text('utf-8'))
for s in SOURCES:
  data = cached(s['url'], s['id'] + Path(s['url']).suffix)
  if s['fmt'] == 'svs_uint':
    h = (tifffile.imread(io.BytesIO(data)).astype(np.float64) - 20000) * 0.5 / 1000      # km; sol kenar −180°
  else:
    h = np.frombuffer(data, '>i2').reshape(2880, 5760).astype(np.float64) / 1000          # km; sol kenar 0°
    h = np.roll(h, h.shape[1] // 2, axis=1)                                               # sol kenar −180° olsun
  H, W = h.shape
  lat = np.deg2rad(90 - (np.arange(H) + 0.5) * 180 / H)[:, None]
  dlon = 2 * np.pi / W; dlat = np.pi / H
  R = s['radius_km']
  dhdx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * dlon * R * np.maximum(np.cos(lat), 0.01))   # doğuya eğim
  hp = np.vstack([h[:1], h, h[-1:]])
  dhdy = (hp[:-2] - hp[2:]) / (2 * dlat * R)                                                         # kuzeye eğim (satır 0 = kuzey)
  n = np.dstack([-dhdx, -dhdy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
  img = Image.fromarray((n * 127.5 + 127.5).clip(0, 255).astype(np.uint8), 'RGB')
  if img.width != s['width']: img = img.resize((s['width'], s['width'] // 2), Image.LANCZOS)
  out = ROOT / 'assets/textures' / f'{s["id"]}.png'; img.save(out, optimize=True)
  meta['textures'][s['id']] = dict(id=s['id'], body=s['body'], derived=True, credit=s['credit'], page=s['page'], url=s['url'],
    source_sha256=hashlib.sha256(data).hexdigest(), lon_left_edge_deg=-180, source_size=[W, H], size=[img.width, img.height],
    file=f'assets/textures/{s["id"]}.png', file_sha256=hashlib.sha256(out.read_bytes()).hexdigest(),
    retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'),
    steps=['yükseklik (km) → merkezi farklarla doğu ve kuzey eğimi', 'normal = norm(−∂h/∂x, −∂h/∂y, 1), yerel doğu/kuzey/yukarı', 'gerçek ölçek, abartma yok'],
    height_range_km=[round(float(h.min()), 2), round(float(h.max()), 2)])
  print(f'{s["id"]}: {W}x{H} yükseklik {h.min():.1f}…{h.max():.1f} km → {out.name} {img.width}x{img.height}, {out.stat().st_size / 1e6:.1f} MB')
meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', 'utf-8')
