// Konum tablosu testi: src/ephemeris.js'in ara değerle bulduğu konum, Horizons'un aynı an için doğrudan
// verdiği konumla karşılaştırılır.
//
// Kriter (sonuçlar görülmeden önce belirlendi, 3 Kasım 2026): her tabloda, tablo satırlarının arasına düşen
// 200 rastgele anda konum farkı en fazla 1 km olmalı. Rastgele anlar sabit tohumla üretilir (tekrarlanabilir).
// Ayrıca dosyanın SHA-256 özeti index.json'daki kayıtla tutmalı.
//
//   node tests/ephemeris.mjs            (hepsi)
//   node tests/ephemeris.mjs Io Titan   (yalnızca adı verilenler)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, DATA, horizonsVectors, sha256 } from '../tools/lib.mjs';
import { EphemerisTable } from '../src/ephemeris.js';

const LIMIT_KM = 1, SAMPLES = 200;
const index = JSON.parse(await readFile(join(DATA, 'ephem', 'index.json'), 'utf8')).tables;
const only = new Set(process.argv.slice(2));

// mulberry32: küçük, tohumlu rastgele sayı üreteci
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

let failed = 0, tested = 0;
console.log('tablo                              │ örnek │ en büyük hata │ ortalama   │ sonuç');
for (const [key, e] of Object.entries(index)){
  if (only.size && !only.has(e.name)) continue;
  if (e.omitted){ console.log(`${key.padEnd(34)} │ tablo yok: ${e.reason}`); continue; }
  const bytes = await readFile(join(ROOT, e.file));
  if (sha256(bytes) !== e.file_sha256){ console.log(`${key.padEnd(34)} │ DOSYA ÖZETİ TUTMUYOR → KALDI`); failed++; continue; }
  const table = new EphemerisTable(e, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  // satır aralarına düşen anlar (ızgaradan en az %5 uzakta)
  const r = rng([...key].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7));
  const jds = Array.from({ length: SAMPLES }, () => {
    const i = Math.floor(r() * (e.n - 1));
    return e.jd0 + (i + 0.05 + 0.9 * r()) * e.step_days;
  }).sort((a, b) => a - b);
  const truth = [];
  for (let k = 0; k < jds.length; k += 50)
    truth.push(...(await horizonsVectors({ command: e.horizons_command, center: e.center, units: 'KM-D', time: { tlist: jds.slice(k, k + 50) } })).rows);
  if (truth.length !== jds.length) throw new Error(`${key}: Horizons ${jds.length} yerine ${truth.length} satır verdi`);

  let max = 0, sum = 0;
  truth.forEach(t => {
    const p = table.position(t[0]);
    const d = Math.hypot(p[0] - t[1], p[1] - t[2], p[2] - t[3]);
    max = Math.max(max, d); sum += d;
  });
  const ok = max <= LIMIT_KM;
  if (!ok) failed++;
  tested++;
  console.log(`${key.padEnd(34)} │ ${String(SAMPLES).padStart(5)} │ ${max.toFixed(4).padStart(10)} km │ ${(sum / SAMPLES).toFixed(4).padStart(7)} km │ ${ok ? 'GEÇTİ' : 'KALDI'}`);
}
console.log(failed ? `\n${failed}/${tested} tablo KALDI.` : `\n${tested} tablonun hepsi ${LIMIT_KM} km sınırı içinde.`);
process.exit(failed ? 1 : 0);
