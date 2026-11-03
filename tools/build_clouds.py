# Dünya bulut katmanı (TÜRETİLMİŞ veri). Kaynaklar tamamen NASA'nın:
#   • Gözlem: NASA GIBS — VIIRS gerçek renkli günlük görüntü (Suomi NPP, NOAA-20, NOAA-21), aynı gün.
#   • Bulutsuz yüzey: NASA Blue Marble Next Generation (assets/textures/earth_day.jpg).
#
# Yöntem: üç uydunun pikselleri için ORTANCA alınır (deniz yansıması her uyduda başka yerde olduğundan elenir).
# Gözlenen parlaklık ≈ (1 − a)·yüzey + a·bulut kabulüyle örtü a = (Y_gözlem − Y_yüzey) / (Y_bulut − Y_yüzey).
# Y: doğrusal parlaklık. Y_bulut ve gürültü eşiği görselleştirme tercihidir (aşağıda); bu yüzden katman "türetilmiş"
# diye etiketlenir. Gece tarafı ve veri olmayan yerler (siyah) bulutsuz sayılır. Mevsim farkı: Blue Marble
# Nisan ayına ait; kar ve buz değişen yerlerde hata olabilir.
#
#   python tools/build_clouds.py [tarih]
import hashlib, io, json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
DATE = sys.argv[1] if len(sys.argv) > 1 else '2026-10-30'
SATS = ['VIIRS_SNPP_CorrectedReflectance_TrueColor', 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS_NOAA21_CorrectedReflectance_TrueColor']
LEVEL, TW, TH, OUTW = 3, 10, 5, 4096          # 250m matris kümesinde düzey 3: 10x5 döşeme = 5120x2560 = tam dünya
Y_CLOUD = 0.75                                  # kalın bulutun doğrusal parlaklığı (görsel tercih)
NOISE = 0.06                                    # yüzey farkı gürültüsü için eşik (görsel tercih)

def fetch(url, tries=5):
  for i in range(tries):
    try:
      with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'evren'}), timeout=120) as r: return r.read()
    except Exception as e:
      if i == tries - 1: raise
      time.sleep(3 * (i + 1))

lin = lambda a: np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
lum = lambda rgb: rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)

obs, metas = [], []
for layer in SATS:
  h = hashlib.sha256(); img = np.zeros((TH * 512, TW * 512, 3), np.uint8)
  urls = [(r, c, f'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{DATE}/250m/{LEVEL}/{r}/{c}.jpg') for r in range(TH) for c in range(TW)]
  with ThreadPoolExecutor(6) as ex: datas = list(ex.map(lambda u: fetch(u[2]), urls))
  for (r, c, _), d in zip(urls, datas):
    h.update(d); img[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512] = np.asarray(Image.open(io.BytesIO(d)).convert('RGB'))
  y = lum(lin(img.astype(np.float32) / 255))
  y[img.max(axis=2) < 8] = np.nan                     # siyah = veri yok / gece
  obs.append(y); metas.append(dict(layer=layer, date=DATE, level=LEVEL, tiles_sha256=h.hexdigest()))
  print(f'{layer}: veri olan piksel oranı %{100 * np.isfinite(y).mean():.1f}')

Y = np.nanmedian(np.stack(obs), axis=0)
surf = np.asarray(Image.open(ROOT / 'assets/textures/earth_day.jpg').convert('RGB').resize((TW * 512, TH * 512), Image.LANCZOS)).astype(np.float32) / 255
S = lum(lin(surf))
a = (Y - S - NOISE) / np.maximum(Y_CLOUD - S, 0.05)
a = np.where(np.isfinite(a), np.clip(a, 0, 1), 0)
# Parlak kar ve buz üzerinde (yüzey parlaklığı > ICE) bulut bu yöntemle ayırt edilemez: örtü bilinmiyor → 0.
ICE = 0.35
a[S > ICE] = 0
out = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'L').resize((OUTW, OUTW // 2), Image.LANCZOS)
dest = ROOT / 'assets/textures/earth_clouds.png'; out.save(dest, optimize=True)

meta_path = ROOT / 'data/textures.json'; meta = json.loads(meta_path.read_text('utf-8'))
meta['textures']['earth_clouds'] = dict(
  id='earth_clouds', body='Earth', derived=True, lon_left_edge_deg=-180, page='https://nasa-gibs.github.io/gibs-api-docs/',
  credit=f'Türetilmiş: NASA GIBS VIIRS gerçek renkli görüntüler ({DATE}; Suomi NPP, NOAA-20, NOAA-21) ve NASA Blue Marble yüzeyi',
  note=f'Tek bir günün ({DATE}) bulutları; tarih değişse de aynı kalır. Bulut örtüsü parlaklık farkından hesaplandı (Y_bulut={Y_CLOUD}, eşik={NOISE}; görsel tercih).',
  layers=metas, file='assets/textures/earth_clouds.png', size=[OUTW, OUTW // 2], retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'),
  steps=['üç uydunun ortancası', 'a = (Y − Y_yüzey − eşik) / (Y_bulut − Y_yüzey), 0–1',
         f'kar/buz üzerinde (Y_yüzey > {ICE}) örtü bilinmiyor → 0', f'Lanczos ile {OUTW}x{OUTW // 2}'],
  file_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(), mean_cover=round(float(a.mean()), 3))
meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print(f'→ earth_clouds.png {OUTW}x{OUTW // 2}; ortalama örtü %{100 * a.mean():.0f}')
