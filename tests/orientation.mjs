// Yönelim testi: src/orientation.js'in NAIF modelini doğru uyguladığını, sonucu bilinen gerçeklerle karşılaştırarak sınar.
// Doğru yönler (Güneş, Dünya) Horizons'tan alınır; yalnızca yönelim hesabı bizimdir.
//
// Kriterler (sonuçlar görülmeden önce belirlendi, 3 Kasım 2026):
//   1) Dünya: 2026 Mart ekinoksu (20 Mart, 14:46 UTC) anında Güneş'in tepede olduğu noktanın enlemi |enlem| ≤ 0,5°.
//      Aynı gün UTC 12:00'de Güneş'in tepede olduğu boylam 0° ± 5° (zaman denklemi ≈ −7,5 dk ≈ 1,9°).
//   2) Ay: Dünya'nın Ay'da tepede göründüğü nokta (optik librasyon) 2025–2035 içindeki 40 rastgele anda
//      |boylam| ≤ 8°, |enlem| ≤ 7°. (Ay hep aynı yüzünü gösterir; librasyon yaklaşık ±7,9° boylam, ±6,7° enlem.)
//   3) Jüpiter: yörüngesi ekvatoruna göre ~3° eğik; 2025–2035 içinde Güneş'in tepedeki enlemi |enlem| ≤ 3,5°.
//      Satürn: eksen eğikliği ~26,7°; Güneş'in tepedeki enlemi |enlem| ≤ 27°.
//
//   node tests/orientation.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA, horizonsVectors } from '../tools/lib.mjs';
import { bodyAxes, directionToLonLat } from '../src/orientation.js';

const O = JSON.parse(await readFile(join(DATA, 'orientation.json'), 'utf8')).bodies;
const vec = async (target, center, jds) => (await horizonsVectors({ command: target, center, units: 'KM-D', time: { tlist: jds } })).rows;
let fail = 0;
const check = (label, ok, detail) => { if (!ok) fail++; console.log(`${ok ? 'GEÇTİ' : 'KALDI'} │ ${label} │ ${detail}`); };

// 1) Dünya. UTC → TDB: 2026'da TT − UTC = 69,184 sn (37 artık saniye + 32,184 sn); TDB ≈ TT (fark < 2 ms).
const UTC2TDB = 69.184 / 86400;
const JD_2026_03_20 = 2461119.5;                                // 2026-01-01 = 2461041.5, +78 gün
const jdEquinox = JD_2026_03_20 + (14 + 46 / 60) / 24 + UTC2TDB;  // 14:46 UTC
const jdNoon = JD_2026_03_20 + 12 / 24 + UTC2TDB;                  // 12:00 UTC
// Horizons TLIST yanıtı sıralı döner; satırlar JD ile eşleştirilir.
const sunE = await vec('10', '500@399', [jdEquinox, jdNoon]);
const at = jd => sunE.find(r => Math.abs(r[0] - jd) < 1e-6);
const e1 = directionToLonLat(bodyAxes(O['399'], O['3'], jdEquinox), at(jdEquinox).slice(1, 4));
const e2 = directionToLonLat(bodyAxes(O['399'], O['3'], jdNoon), at(jdNoon).slice(1, 4));
check('Dünya, ekinoks anında Güneş enlemi', Math.abs(e1.lat) <= 0.5, `${e1.lat.toFixed(3)}°`);
check('Dünya, UTC 12:00 Güneş boylamı', Math.abs(e2.lon) <= 5, `${e2.lon.toFixed(2)}°`);

// 2) Ay librasyonu
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const jds = Array.from({ length: 40 }, () => 2460676.5 + rnd() * 3653).sort((a, b) => a - b);
const earthFromMoon = await vec('399', '500@301', jds);
let maxLon = 0, maxLat = 0;
for (const r of earthFromMoon){
  const ll = directionToLonLat(bodyAxes(O['301'], O['3'], r[0]), r.slice(1, 4));
  maxLon = Math.max(maxLon, Math.abs(ll.lon)); maxLat = Math.max(maxLat, Math.abs(ll.lat));
}
check('Ay librasyonu (40 an)', maxLon <= 8 && maxLat <= 7, `en büyük |boylam| ${maxLon.toFixed(2)}°, |enlem| ${maxLat.toFixed(2)}°`);

// 3) Jüpiter ve Satürn: Güneş'in tepedeki enlemi
for (const [name, id, bary, lim] of [['Jüpiter', '599', '5', 3.5], ['Satürn', '699', '6', 27]]){
  const rows = await vec('10', `500@${id}`, jds.filter((_, i) => i % 4 === 0));
  const lats = rows.map(r => directionToLonLat(bodyAxes(O[id], O[bary], r[0]), r.slice(1, 4)).lat);
  const m = Math.max(...lats.map(Math.abs));
  check(`${name}, Güneş'in tepedeki enlemi`, m <= lim, `en büyük |enlem| ${m.toFixed(2)}° (sınır ${lim}°)`);
}
console.log(fail ? `\n${fail} kontrol KALDI.` : '\nTüm yönelim kontrolleri geçti.');
process.exit(fail ? 1 : 0);
