// Asteroit kuşağı testi: src/asteroids.js'in verdiği konum, Horizons'un aynı an için verdiği konumla
// (gezegen etkileri dahil sayısal integrasyon) karşılaştırılır.
//
// Geçmiş: İlk sürümde tüm asteroitler SBDB'nin tek epoch'taki (2026-05) elemanlarıyla iki cisim yöntemiyle
// hesaplanıyordu. "2025–2035 boyunca ≤ 0,01 au" kriteri KALDI: en büyük hata ±1 yılda 0,0034 au, ±2 yılda 0,018 au,
// ±3 yılda 0,05 au. Kullanıcının kararıyla (3 Kasım 2026) model değişti; kriterin sınırı aynı kaldı:
//
// Kriterler (yeni model için sonuçlar görülmeden önce belirlendi):
//   A) Büyükler (H < 12, yıllık Horizons elemanları): rastgele 100 asteroit × 2025–2035 içinde 5 rastgele an.
//   B) Diğerleri (SBDB elemanları, yalnızca epoch ± 1 yıl gösterilir): rastgele 100 asteroit × o pencerede 5 rastgele an.
//   Her ikisinde de en büyük konum farkı ≤ 0,01 au (≈1,5 milyon km). Bu sınır NASA'nın değil, bizim seçimimiz:
//   kuşak nokta bulutu olarak çiziliyor. Sabit tohum kullanılır (tekrarlanabilir).
//
//   node tests/asteroids.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA, horizonsVectors } from '../tools/lib.mjs';
import { makeAsteroidModel, SMALL_WINDOW_DAYS } from '../src/asteroids.js';

const LIMIT_AU = 0.01, BODIES = 100, TIMES = 5, JD0 = 2460676.5, JD1 = 2464329.5;
const mba = JSON.parse(await readFile(join(DATA, 'asteroids_mba.json'), 'utf8'));
const large = JSON.parse(await readFile(join(DATA, 'asteroids_large_yearly.json'), 'utf8'));
const model = makeAsteroidModel(mba, large);
const c = Object.fromEntries(mba.fields.map((f, i) => [f, i]));

let seed = 20261103;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const idxLarge = [], idxSmall = [];
mba.rows.forEach((r, i) => (model.isLarge(i) ? idxLarge : idxSmall).push(i));
console.log(`büyük: ${idxLarge.length}, diğer: ${idxSmall.length}`);

async function run(label, pool, window){
  let worst = { d: 0 }, errs = [];
  for (let b = 0; b < BODIES; b++){
    const i = pool[Math.floor(rnd() * pool.length)], r = mba.rows[i];
    const [a, z] = window(r);
    const jds = Array.from({ length: TIMES }, () => a + rnd() * (z - a)).sort((x, y) => x - y);
    const truth = (await horizonsVectors({ command: `DES=${r[c.spkid]};`, center: '500@10', units: 'AU-D', time: { tlist: jds } })).rows;
    for (const t of truth){
      const p = model.position(i, t[0]);
      if (!p) throw new Error(`${r[c.name]}: JD ${t[0]} için konum yok (pencere hatası)`);
      const d = Math.hypot(p[0] - t[1], p[1] - t[2], p[2] - t[3]);
      errs.push(d);
      if (d > worst.d) worst = { d, name: r[c.name], jd: t[0] };
    }
    process.stdout.write(`\r  ${label}: ${b + 1}/${BODIES}`);
  }
  errs.sort((x, y) => x - y);
  const ok = worst.d <= LIMIT_AU;
  console.log(`\r${label}: ${errs.length} örnek — ortanca ${errs[errs.length >> 1].toExponential(2)} au, en büyük ${worst.d.toExponential(2)} au` +
    ` (${(worst.d * 149597870.7).toFixed(0)} km, ${worst.name}) → ${ok ? 'GEÇTİ' : 'KALDI'}`);
  return ok;
}

const okA = await run('A) büyükler, 2025–2035', idxLarge, () => [JD0, JD1]);
const okB = await run('B) diğerleri, epoch ± 1 yıl', idxSmall, r => [r[c.epoch] - SMALL_WINDOW_DAYS, r[c.epoch] + SMALL_WINDOW_DAYS]);
console.log(okA && okB ? `\nİki küme de ${LIMIT_AU} au sınırı içinde.` : '\nKALDI.');
process.exit(okA && okB ? 0 : 1);
