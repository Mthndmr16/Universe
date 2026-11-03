# Satürn halkalarının radyal optik derinlik profili: NASA PDS Rings düğümü, Cassini Radyo Bilimi (RSS)
# Rev007 X bandı (3,6 cm) çıkış örtülmesi, 1 km çözünürlük (CORSS_8001).
#
# İşlem: 0,25 km aralıklı 288 954 ölçüm, eşit genişlikte N bölmeye indirilir. Her bölmede GEÇİRGENLİK (e^−τ)
# ortalaması alınır ve τ_bölme = −ln(ortalama geçirgenlik) yazılır; böylece boşluklar ve ince yapı korunur.
# τ, ölçüm eşiğini (NORMAL OPTICAL DEPTH THRESHOLD) aşan noktalarda güvenilir değil; o noktalarda τ eşik değerine
# eşitlenir (alt sınır; B halkasının çekirdeği pratikte saydam değil) ve "doymuş" oranı kaydedilir.
# Not: radyo dalga boyundaki optik derinlik, görünür ışıktakinden küçük parçacıkların çok olduğu yerlerde
# (C halkası, F halkası) farklı olabilir.
#
#   python tools/build_ring_profile.py
import hashlib, json, math, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://pds-rings.seti.org/holdings/volumes/CORSS_8xxx/CORSS_8001/data/Rev007/Rev007E/Rev007E_RSS_2005_123_X43_E/'
NAME = 'RSS_2005_123_X43_E_TAU_01KM'
N = 8192
CACHE = ROOT / 'data' / 'raw' / 'rings'

def get(name):
  CACHE.mkdir(parents=True, exist_ok=True)
  p = CACHE / name
  if not p.exists():
    p.write_bytes(urllib.request.urlopen(urllib.request.Request(BASE + name, headers={'User-Agent': 'evren'}), timeout=600).read())
  return p.read_bytes()

lbl = get(NAME + '.LBL').decode('ascii', 'replace')
tab = get(NAME + '.TAB')
# Etiketteki sütun sırası: yarıçap, iki düzeltme, boylam, azimut, güç, normal optik derinlik, faz, eşik, zamanlar
for k in ['"RING RADIUS"', '"NORMAL OPTICAL DEPTH"', '"NORMAL OPTICAL DEPTH THRESHOLD"']:
  if k not in lbl: raise SystemExit('etiket beklenen sütunu içermiyor: ' + k)
rows = [l.split(',') for l in tab.decode('ascii').strip().splitlines()]
a = np.array([[float(r[0]), float(r[6]), float(r[8])] for r in rows])
rad, tau, thr = a[:, 0], a[:, 1], a[:, 2]
sat = tau >= thr
tau_c = np.where(sat, thr, tau)
r0, r1 = float(rad.min()), float(rad.max())
edges = np.linspace(r0, r1, N + 1)
idx = np.clip(np.searchsorted(edges, rad, side='right') - 1, 0, N - 1)
T = np.exp(-tau_c)
sumT = np.bincount(idx, T, N); cnt = np.bincount(idx, None, N)
satc = np.bincount(idx, sat.astype(float), N)
if (cnt == 0).any(): raise SystemExit('boş bölme var; N çok büyük')
meanT = sumT / cnt
tau_bin = -np.log(np.clip(meanT, 1e-9, 1))
out = {
  '_source': dict(title='NASA PDS Rings Node — Cassini RSS Rev007 X43 çıkış örtülmesi, normal optik derinlik (CORSS_8001)',
                  url=BASE + NAME + '.TAB', label=BASE + NAME + '.LBL', retrieved_utc=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                  sha256=hashlib.sha256(tab).hexdigest(), rows=len(rows),
                  method=f'{N} eşit bölme; bölme başına geçirgenlik ortalaması, τ = −ln(ort. e^−τ). Eşiği aşan ölçümlerde τ = eşik (alt sınır).',
                  note='X bandı (3,6 cm) optik derinliği; görünür ışıkta küçük parçacıklı bölgelerde farklı olabilir.'),
  'radius_min_km': r0, 'radius_max_km': r1, 'bins': N,
  'tau': [round(float(x), 4) for x in tau_bin],
  'saturated_fraction': [round(float(x), 3) for x in satc / cnt],
}
(ROOT / 'data' / 'saturn_ring_profile.json').write_text(json.dumps(out, ensure_ascii=False) + '\n', 'utf-8')
print(f'{len(rows)} ölçüm, {r0:.1f}–{r1:.1f} km → {N} bölme ({(r1 - r0) / N:.2f} km); doymuş ölçüm oranı %{100 * sat.mean():.1f}')
for name, r in [('C halkası', 85000), ('B halkası iç', 95000), ('B halkası çekirdek', 110000), ('Cassini boşluğu', 119500), ('A halkası', 128000), ('Encke boşluğu', 133590)]:
  i = int((r - r0) / (r1 - r0) * N); print(f'  {name:20s} {r} km: τ = {tau_bin[i]:.3f}')
