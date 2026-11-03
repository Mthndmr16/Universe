// JPL Horizons'tan konum tabloları üretir: data/ephem/<ad>.bin + data/ephem/index.json
//
// Neden tablo? JPL, uyduların ortalama elemanlarının konum hesabı için kullanılmamasını söylüyor ve
// Horizons API tarayıcıdan doğrudan çağrılamıyor (CORS yok). Bu yüzden konumlar önceden indirilir;
// tarayıcı yalnızca ara değer hesaplar (src/ephemeris.js).
//
// Yapı (iç içe sistemler):
//   • Gezegen sistemlerinin kütle merkezi → Güneş etrafında: src/kepler.js (JPL yaklaşık elemanları)
//   • Gezegenin kendisi → kendi sistem kütle merkezine göre (Dünya ~4700 km, Plüton ~2100 km kayar)
//   • Uydular → gezegenin merkezine göre
//   • Cüce gezegenler (Plüton için sistem kütle merkezi) → Güneş merkezine göre
//
// Örnekleme adımı NASA verisinden türetilir. Kübik Hermite hatası yaklaşık h⁴/384 · r · ω⁴ olduğundan
// h = (HEDEF · 384 / (r · ω⁴ · f(e)))^(1/4) seçilir. HEDEF = 0,2 km. Testin sınırı 1 km; bu, ölçülen
// sapmalar için pay bırakır. f(e), dış merkezli yörüngelerde en yakın noktadaki hızlanmayı hesaba katar.
//
//   node tools/build_ephemeris.mjs            (hepsi)
//   node tools/build_ephemeris.mjs Io Titan   (yalnızca adı verilenler)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA, horizonsVectors, sha256 } from './lib.mjs';
import { AU_KM } from '../src/kepler.js';

const OUT = join(DATA, 'ephem');
const TARGET_KM = 0.2;
const MAX_ROWS = 60000;              // Horizons'un tek sorgu sınırının altında
const MOON_WINDOW = { jd0: 2460676.5, jd1: 2464329.5, label: '2025-01-01 – 2035-01-01 TDB' };  // kullanıcının seçimi
const HELIO_WINDOW = { jd0: 2378496.5, jd1: 2470171.5, label: '1800-01-01 – 2050-12-31 TDB' }; // gezegen testiyle aynı

const satElem = JSON.parse(await readFile(join(DATA, 'satellites_mean_elements.json'), 'utf8')).satellites;
const planetPhys = JSON.parse(await readFile(join(DATA, 'planets_physical.json'), 'utf8')).tables;

// Gezegen merkezleri (Horizons): uydular bunlara göre, gezegenler de kendi sistem kütle merkezine göre
const SYSTEMS = [
  { planet: 'Earth', body: '399', bary: '3', moons: ['Moon'] },
  { planet: 'Mars', body: '499', bary: '4', moons: ['Phobos', 'Deimos'] },
  { planet: 'Jupiter', body: '599', bary: '5', moons: ['Io', 'Europa', 'Ganymede', 'Callisto'] },
  { planet: 'Saturn', body: '699', bary: '6', moons: ['Mimas', 'Enceladus', 'Tethys', 'Dione', 'Rhea', 'Titan', 'Hyperion', 'Iapetus'] },
  { planet: 'Uranus', body: '799', bary: '7', moons: ['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon'] },
  { planet: 'Neptune', body: '899', bary: '8', moons: ['Triton'] },
  { planet: 'Pluto', body: '999', bary: '9', moons: ['Charon'] },
];
// Cüce gezegenler: Horizons'ta küçük cisimler "numara;" ile sorgulanır. Plüton için sistem kütle merkezi (9).
// smallBody: Horizons bu cismi DE441 dosyasından değil, sorgu anında integrasyonla hesaplıyor → kısa parçalar.
const DWARFS = [
  { name: 'Ceres', command: '1;', smallBody: true }, { name: 'Pluto', command: '9', note: 'Plüton sistem kütle merkezi (DE441)' },
  { name: 'Eris', command: '136199;', smallBody: true }, { name: 'Makemake', command: '136472;', smallBody: true },
  { name: 'Haumea', command: '136108;', smallBody: true },
];
const SMALL_BODY_CHUNK_YEARS = 10;

const ecc = e => (1 - e) * ((1 + e) ** 2 / (1 - e * e) ** 1.5) ** 4;
const stepFor = (r_km, P_days, e = 0) => (TARGET_KM * 384 / (r_km * (2 * Math.PI / P_days) ** 4 * ecc(e))) ** 0.25;

function moonElem(name){
  const s = satElem.find(x => x.name === name);
  if (!s || !s.a_km || !s.P_days) throw new Error(`${name}: JPL ortalama elemanlarında a veya P yok`);
  return s;
}

// Eşit aralıklı tabloyu parça parça indirir; satır zamanlarının beklenen ızgarada olduğunu doğrular.
// chunkRows: tek sorgudaki en fazla satır. Küçük cisimlerde (Horizons bunları sorgu anında sayısal integrasyonla
// hesaplıyor) uzun bir sorgu hatayı yıllar boyunca biriktiriyor: Haumea'da tek 1800–2050 sorgusu, kısa sorgulara
// göre 2046'da 13 km fark verdi. Bu yüzden küçük cisimler kısa parçalar hâlinde indirilir.
async function fetchTable({ name, command, center, jd0, jd1, stepMin, stepDays, chunkRows = MAX_ROWS }){
  const unit = stepMin ? `${stepMin} m` : `${stepDays} d`;
  const step = stepMin ? stepMin / 1440 : stepDays;
  const n = Math.floor((jd1 - jd0) / step + 1e-9) + 1;
  const rows = [], sources = [];
  for (let k = 0; k < n; k += chunkRows){
    const m = Math.min(chunkRows, n - k);
    const a = jd0 + k * step, b = jd0 + (k + m - 1) * step;
    const h = await horizonsVectors({ command, center, units: 'KM-D', time: { start: `JD${a.toFixed(8)}`, stop: `JD${b.toFixed(8)}`, step: unit } });
    if (h.rows.length !== m) throw new Error(`${name}: ${m} satır bekleniyordu, ${h.rows.length} geldi`);
    h.rows.forEach((r, j) => { if (Math.abs(r[0] - (jd0 + (k + j) * step)) > 1e-6) throw new Error(`${name}: zaman ızgarası kaydı (JD ${r[0]})`); });
    rows.push(...h.rows);
    sources.push({ url: h.meta.url.split('?')[0], query: h.meta.query, retrieved_utc: h.meta.retrieved_utc, sha256: h.meta.sha256, header: h.header });
    process.stdout.write(`\r  ${name}: ${rows.length}/${n} satır`);
  }
  process.stdout.write('\n');
  return { rows, sources, step, n };
}

async function writeTable(index, spec, t, dtype){
  const Arr = dtype === 'float32' ? Float32Array : Float64Array;
  const buf = new Arr(t.n * 6);
  t.rows.forEach((r, i) => buf.set(r.slice(1), i * 6));
  const file = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + (spec.kind === 'planet_offset' ? '_offset' : '') + '.bin';
  const bytes = Buffer.from(buf.buffer);
  await writeFile(join(OUT, file), bytes);
  index[spec.name + (spec.kind === 'planet_offset' ? ' (kütle merkezine göre)' : '')] = {
    name: spec.name, kind: spec.kind, horizons_command: spec.command, center: spec.center, center_name: spec.centerName,
    frame: 'J2000 ekliptiği (Horizons REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF)', time_scale: 'TDB', units: 'km, km/gün',
    columns: ['x', 'y', 'z', 'vx', 'vy', 'vz'], dtype, jd0: t.rows[0][0], step_days: t.step, n: t.n, window: spec.window,
    file: 'data/ephem/' + file, file_sha256: sha256(bytes), step_rule: spec.stepRule, note: spec.note ?? null, sources: t.sources,
  };
  console.log(`  → ${file}: ${(bytes.length / 1e6).toFixed(2)} MB, adım ${(t.step * 1440).toFixed(0)} dk`);
}

await mkdir(OUT, { recursive: true });
const indexFile = join(OUT, 'index.json');
let index = {};
try { index = JSON.parse(await readFile(indexFile, 'utf8')).tables ?? {}; } catch { /* ilk çalıştırma */ }
const only = new Set(process.argv.slice(2));
const want = n => only.size === 0 || only.has(n);
const save = () => writeFile(indexFile, JSON.stringify({ _note: 'tools/build_ephemeris.mjs ile üretildi. Her kaydın sources alanı Horizons sorgusunu, zamanını ve yanıtın SHA-256 özetini tutar.', tables: index }, null, 2) + '\n');

for (const sys of SYSTEMS){
  const moons = sys.moons.map(moonElem);
  for (const s of moons){
    if (!want(s.name)) continue;
    const h = stepFor(s.a_km, s.P_days, s.e);
    const stepMin = Math.max(1, Math.floor(h * 1440));
    console.log(`${s.name} (${sys.planet} merkezli): a=${s.a_km} km, P=${s.P_days} g, e=${s.e} → adım ${stepMin} dk`);
    const t = await fetchTable({ name: s.name, command: s.horizons_id, center: `500@${sys.body}`, ...MOON_WINDOW, stepMin });
    await writeTable(index, { name: s.name, kind: 'moon', command: s.horizons_id, center: `500@${sys.body}`, centerName: sys.planet,
      window: MOON_WINDOW.label, stepRule: `h = (${TARGET_KM}·384 / (a·ω⁴·f(e)))^¼; a, P, e: JPL uydu ortalama elemanları` }, t, 'float32');
    await save();
  }

  // Gezegenin kendi sistem kütle merkezine göre kayması. Önce genliği ölçülür (60 gün, 30 dk adım);
  // 0,5 km'den küçükse tablo gerekmez (ör. Mars).
  if (!want(sys.planet)) continue;
  const probe = await horizonsVectors({ command: sys.body, center: `500@${sys.bary}`, units: 'KM-D',
    time: { start: `JD${MOON_WINDOW.jd0}`, stop: `JD${MOON_WINDOW.jd0 + 60}`, step: '30 m' } });
  const R = Math.max(...probe.rows.map(r => Math.hypot(r[1], r[2], r[3])));
  if (R < 0.5){
    console.log(`${sys.planet}: kütle merkezinden en fazla ${R.toFixed(4)} km uzak → tablo gerekmiyor`);
    index[sys.planet + ' (kütle merkezine göre)'] = { name: sys.planet, kind: 'planet_offset', omitted: true,
      reason: `Ölçülen en büyük uzaklık ${R.toFixed(4)} km < 0,5 km (60 günlük Horizons yoklaması)`, probe_source: { query: probe.meta.query, sha256: probe.meta.sha256 } };
    await save();
    continue;
  }
  // En hızlı uydunun açısal hızı ve toplam genlik ile tutucu adım
  const fastest = moons.reduce((a, b) => a.P_days < b.P_days ? a : b);
  const stepMin = Math.max(1, Math.floor(stepFor(R, fastest.P_days, fastest.e) * 1440));
  console.log(`${sys.planet} → kütle merkezine göre: en fazla ${R.toFixed(1)} km, en hızlı uydu ${fastest.name} → adım ${stepMin} dk`);
  const t = await fetchTable({ name: sys.planet, command: sys.body, center: `500@${sys.bary}`, ...MOON_WINDOW, stepMin });
  await writeTable(index, { name: sys.planet, kind: 'planet_offset', command: sys.body, center: `500@${sys.bary}`,
    centerName: `${sys.planet} sistem kütle merkezi`, window: MOON_WINDOW.label,
    stepRule: `h = (${TARGET_KM}·384 / (R·ω⁴·f(e)))^¼; R = ölçülen en büyük kayma (${R.toFixed(1)} km), ω: ${fastest.name}` }, t, 'float32');
  await save();
}

// Cüce gezegenler: Güneş merkezli, float64 (uzaklıklar ~10¹⁰ km). a, Kepler'in 3. yasasıyla JPL yörünge periyodundan.
const dwarfPhys = planetPhys.find(t => t.label === 'Dwarf Planet').bodies;
for (const d of DWARFS){
  if (!want(d.name)) continue;
  const P_yr = dwarfPhys[d.name]?.['Sidereal Orbital Period']?.value;
  if (!P_yr) throw new Error(`${d.name}: JPL fiziksel tabloda yörünge periyodu yok`);
  const a_km = P_yr ** (2 / 3) * AU_KM;
  // Güneş'in kütle merkezi etrafındaki salınımı (Jüpiter, ~12 yıl) uzak cisimlerde baskın; 20 günden uzun adım alınmaz.
  const stepDays = Math.max(1, Math.min(20, Math.floor(stepFor(a_km, P_yr * 365.25))));
  console.log(`${d.name}: P=${P_yr} yıl → a≈${(a_km / AU_KM).toFixed(2)} au → adım ${stepDays} gün`);
  const chunkRows = d.smallBody ? Math.floor(SMALL_BODY_CHUNK_YEARS * 365.25 / stepDays) : MAX_ROWS;
  const t = await fetchTable({ name: d.name, command: d.command, center: '500@10', ...HELIO_WINDOW, stepDays, chunkRows });
  await writeTable(index, { name: d.name, kind: 'heliocentric', command: d.command, center: '500@10', centerName: 'Güneş',
    window: HELIO_WINDOW.label,
    note: d.smallBody ? `Horizons küçük cisim integrasyonu; ${SMALL_BODY_CHUNK_YEARS} yıllık parçalar hâlinde indirildi` : d.note,
    stepRule: `h = min(20 g, (${TARGET_KM}·384 / (a·ω⁴))^¼); P: JPL fiziksel parametreler, a = P^(2/3) au` }, t, 'float64');
  await save();
}
console.log('bitti: data/ephem/index.json');
