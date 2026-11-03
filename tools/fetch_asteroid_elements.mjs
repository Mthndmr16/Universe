// Büyük asteroitler için yıllık oskülatör elemanlar (JPL Horizons).
//
// Neden? SBDB'nin tek bir epoch'taki (2026-05) elemanlarıyla iki cisim konumu yalnızca ±1 yıl içinde yeterli
// (tests/asteroids.mjs). Jüpiter'in çekimi yörüngeleri büküyor. Her yılın 1 Ocak'ındaki elemanlar kullanılınca
// herhangi bir an en yakın epoch'a en fazla yarım yıl uzak olur.
//
// Küme: data/asteroids_mba.json içinde mutlak parlaklığı H < 12 olanlar (çapı ölçülmüş ana kuşağın en büyükleri).
// Aralık: 2025-01-01 – 2035-01-01 (TDB), yılda bir; 10 yıllık tek sorgu (küçük cisim integrasyonu için
// doğrulanmış parça uzunluğu, bkz. PLAN.md).
//
// Kaldığı yerden devam eder: ara sonuçlar data/asteroids_large_yearly.json dosyasına yazılır.
//
//   node tools/fetch_asteroid_elements.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA, saveJSON, horizonsElements } from './lib.mjs';

// Horizons eşzamanlı sorgulara 503 ile yanıt veriyor; sorgular tek tek gönderilir.
const H_MAX = 12, START = '2025-01-01', STOP = '2035-01-01', STEP = '1y', PARALLEL = 1;
const OUT = 'asteroids_large_yearly.json';

const { fields, rows } = JSON.parse(await readFile(join(DATA, 'asteroids_mba.json'), 'utf8'));
const c = Object.fromEntries(fields.map((f, i) => [f, i]));
const targets = rows.filter(r => r[c.H] !== null && r[c.H] < H_MAX).map(r => ({ spkid: r[c.spkid], name: r[c.name] }));

let done = {};
try { done = JSON.parse(await readFile(join(DATA, OUT), 'utf8')).bodies; } catch { /* ilk çalıştırma */ }
const todo = targets.filter(t => !done[t.spkid]);
console.log(`${targets.length} asteroit (H < ${H_MAX}); ${targets.length - todo.length} hazır, ${todo.length} indirilecek`);

const save = () => saveJSON(OUT, {
  _source: { title: 'JPL Horizons — Güneş merkezli oskülatör elemanlar, yılda bir (J2000 ekliptiği, au, derece, TDB)',
    selection: `data/asteroids_mba.json içinde H < ${H_MAX}`, window: `${START} – ${STOP}, adım ${STEP}`,
    columns: ['jd_tdb', 'a_au', 'e', 'i_deg', 'om_deg', 'w_deg', 'ma_deg', 'n_deg_per_day'],
    note: 'Her cismin sources alanı: [sorgu zamanı, yanıtın SHA-256 özeti]. Sorgu biçimi tools/lib.mjs → horizonsElements.' },
  bodies: done,
}, true);

let next = 0, finished = 0;
async function worker(){
  while (next < todo.length){
    const t = todo[next++];
    const h = await horizonsElements({ command: `DES=${t.spkid};`, start: START, stop: STOP, step: STEP });
    if (h.rows.length !== 11) throw new Error(`${t.name}: 11 epoch bekleniyordu, ${h.rows.length} geldi`);
    if (!h.target || !h.target.includes(t.name.split(' (')[0].replace(/^\d+\s+/, ''))) // ad eşleşmesi: doğru cisim mi?
      throw new Error(`${t.name}: Horizons farklı bir cisim döndürdü (${h.target})`);
    done[t.spkid] = { name: t.name, rows: h.rows, source: [h.meta.retrieved_utc, h.meta.sha256] };
    if (++finished % 50 === 0){ await save(); process.stdout.write(`\r  ${finished}/${todo.length}`); }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
await save();
console.log(`\nbitti: ${Object.keys(done).length} asteroit`);
