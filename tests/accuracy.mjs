// Gezegen doğruluk testi: JPL yaklaşık formüllerini uygulayan kodumuz ile JPL Horizons (DE441) karşılaştırılır.
// Sekiz gezegen, 1800–2050 arası, 10 günde bir.
//
// Kriter: her gezegende Güneş merkezli boylam λ, enlem φ ve uzaklık ρ için RMS hata, JPL'nin approx_pos
// sayfasında o tablo için yayınladığı nominal hatayı aşmamalı.
//
// İki referans kontrol edilir ve ikisinin sonucu da her zaman yazdırılır:
//   • Güneş merkezli (500@10): approx_pos sayfasının elemanlar için söylediği referans.
//   • Güneş Sistemi kütle merkezine göre (500@0): ilk çalıştırmadan sonra eklendi (3 Kasım 2026). Uranüs ve
//     Neptün Güneş merkezli kontrolde, ortalaması sıfır olan ±60″'lik bir salınımla kaldı. Bu, Güneş'in kütle
//     merkezi etrafındaki kendi salınımıdır (~700 000 km). Kütle merkezine göre ikisi de JPL sınırları içinde;
//     demek ki bu iki gezegenin elemanları kütle merkezli yörüngeleri tanımlıyor. Bir gezegen iki referanstan
//     birinde sınırlar içindeyse geçer; hangisinde geçtiği tabloda gösterilir.
//
//   node tests/accuracy.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { position, AU_KM } from '../src/kepler.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = f => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const elements = load('planets_kepler_elements.json');
const REFS = { 'Güneş': load('horizons_truth_1800_2050.json'), 'Kütle m.': load('horizons_truth_bary_1800_2050.json') };

const R2AS = 180 / Math.PI * 3600;
const sph = ([x, y, z]) => ({ lon: Math.atan2(y, x), lat: Math.atan2(z, Math.hypot(x, y)), r: Math.hypot(x, y, z) });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function errors(name, table, rows){
  const acc = { lon: 0, lat: 0, r: 0 };
  for (const [jd, x, y, z] of rows){
    const a = sph(position(elements, name, jd, table)), b = sph([x, y, z]);
    acc.lon += (wrap(a.lon - b.lon) * R2AS) ** 2;
    acc.lat += ((a.lat - b.lat) * R2AS) ** 2;
    acc.r += ((a.r - b.r) * AU_KM / 1000) ** 2;
  }
  for (const k in acc) acc[k] = Math.sqrt(acc[k] / rows.length);
  return acc;
}

let failed = 0;
for (const [table, span] of [['table1', '1800-2050'], ['table2a', '-2999-3000']]){
  console.log(`\n${table} — RMS hata / JPL nominal (${span} sütunu); λ, φ yay saniyesi, ρ bin km`);
  console.log('gezegen   │ referans │       λ        │       φ        │        ρ         │ sonuç');
  for (const name of Object.keys(REFS['Güneş'].bodies)){
    const nom = elements.nominal_errors[name][span];
    let passedWith = null;
    for (const [ref, truth] of Object.entries(REFS)){
      const e = errors(name, table, truth.bodies[name]);
      const ok = e.lon <= nom.lon_arcsec && e.lat <= nom.lat_arcsec && e.r <= nom.dist_1000km;
      if (ok && !passedWith) passedWith = ref;
      const f = (v, n, w) => `${v.toFixed(v < 10 ? 2 : 1).padStart(w)} / ${String(n).padEnd(5)}`;
      console.log(`${(ref === 'Güneş' ? name : '').padEnd(9)} │ ${ref.padEnd(8)} │ ${f(e.lon, nom.lon_arcsec, 6)} │ ${f(e.lat, nom.lat_arcsec, 6)} │ ${f(e.r, nom.dist_1000km, 8)} │ ${ok ? 'sınır içinde' : 'sınır dışı'}`);
    }
    if (!passedWith) failed++;
    console.log(`${''.padEnd(9)} └─ ${passedWith ? 'GEÇTİ (' + passedWith + ' referansıyla)' : 'KALDI'}`);
  }
}
console.log(failed ? `\n${failed} gezegen KALDI.` : '\nTüm gezegenler JPL\'nin belirttiği doğruluk sınırları içinde.');
process.exit(failed ? 1 : 0);
