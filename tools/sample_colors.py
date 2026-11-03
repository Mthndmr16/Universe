# Haritası olmayan cisimler için ortalama renk: NASA'nın renkli fotoğraflarından, aydınlık disk piksellerinin
# doğrusal (lineer) ortalaması. Yalnızca renk ORANI kullanılır; parlaklık JPL geometrik albedosundan gelir.
# Siyah-beyaz ya da tek filtreli fotoğraflardan renk çıkarılmaz.
#
#   python tools/sample_colors.py
import hashlib, io, json, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
P = 'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia'
SOURCES = [
  dict(body='Uranus', url=f'{P}/pia01/pia01391/PIA01391.jpg', page='https://science.nasa.gov/3d-resources/uranus/',
       desc='Voyager 2; üç renk filtresiyle çekilip birleştirilmiş renkli görüntü (PIA01391)'),
  dict(body='Venus', url=f'{P}/pia23/pia23791/PIA23791.jpg', page='https://photojournal.jpl.nasa.gov/catalog/PIA23791',
       desc='Mariner 10, Venüs\'ün bulut katmanı (PIA23791)'),
  dict(body='SaturnRings', url=f'{P}/pia06/pia06485/PIA06485.jpg', page='https://science.nasa.gov/photojournal/musical-rings/',
       desc='Cassini, halka sisteminin neredeyse tamamı; kırmızı, yeşil ve mavi filtrelerle doğal renk (PIA06485)'),
]

def srgb_to_lin(c):
  c = c / 255.0
  return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

out = {}
for s in SOURCES:
  data = urllib.request.urlopen(urllib.request.Request(s['url'], headers={'User-Agent': 'evren'}), timeout=120).read()
  a = np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.float64)
  lin = srgb_to_lin(a)
  lum = lin @ np.array([0.2126, 0.7152, 0.0722])
  mask = lum > 0.25 * np.percentile(lum, 99.5)          # aydınlık disk (arka plan ve gece tarafı hariç)
  mean = lin[mask].mean(axis=0)
  ratio = mean / mean.max()
  out[s['body']] = dict(linear_rgb_ratio=[round(float(x), 4) for x in ratio], pixels=int(mask.sum()), source_url=s['url'],
                        page=s['page'], description=s['desc'], source_sha256=hashlib.sha256(data).hexdigest(),
                        retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                        method='Aydınlık disk pikselleri (parlaklık > %99,5 yüzdeliğin %25\'i), doğrusal RGB ortalaması, en büyük kanala bölünmüş')
  print(s['body'], out[s['body']]['linear_rgb_ratio'], out[s['body']]['pixels'], 'piksel')

(ROOT / 'data' / 'body_colors.json').write_text(json.dumps({'_note': 'tools/sample_colors.py ile üretildi.', 'colors': out}, ensure_ascii=False, indent=2) + '\n', 'utf-8')
