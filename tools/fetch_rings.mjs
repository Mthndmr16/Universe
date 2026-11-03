// Satürn halkaları: NASA NSSDCA "Saturnian Rings Fact Sheet".
// Halka sınırları (km), optik derinlik ve albedo aralıkları. Aralıklar olduğu gibi saklanır (en küçük/en büyük);
// görselde hangi değerin kullanıldığı src tarafında ayrıca belirtilir.
//
//   node tools/fetch_rings.mjs
import { get, saveJSON, strip, numLoose } from './lib.mjs';

const URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html';
const { text, meta } = await get(URL, 'satringfact.html', 'latin1');
const table = text.slice(text.indexOf('<table'), text.indexOf('</table>'));
const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => {
  const cells = [];
  for (const c of m[1].matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)){
    const span = Number((c[2].match(/colspan="(\d+)"/) || [])[1] || 1);
    cells.push(strip(c[3]));
    for (let i = 1; i < span; i++) cells.push('');
  }
  return cells;
});
const head = rows[0];
const expect = ['', 'Radius (km)', 'Radius/ Eq. radius', 'Optical Depth', 'Albedo', 'Thickness (m)', 'Surf. Density (g/cm^2)', 'Eccentricity'];
if (head.join('|') !== expect.join('|')) throw new Error('halka tablosu: sütunlar değişmiş: ' + head.join('|'));

// "0.05 - 0.35", "0.2", "10^-5" → { min, max, text }
const range = s => {
  if (!s) return null;
  const p = s.replace(/10\s*\^\s*(-?\d+)/g, '1e$1').split(/\s+-\s+/).map(numLoose);
  return { min: p[0], max: p[p.length - 1], text: s };
};
const out = rows.slice(1).map(c => ({
  name: c[0], radius_km: c[1] ? numLoose(c[1]) : null, radius_per_eq: c[2] ? numLoose(c[2]) : null,
  optical_depth: range(c[3]), albedo: range(c[4]), thickness_m: c[5] || null, surface_density_g_cm2: c[6] || null, eccentricity: c[7] || null,
}));
for (const k of ['C inner edge', 'B inner edge', 'B outer edge', 'A inner edge', 'A outer edge', 'Cassini division'])
  if (!out.find(r => r.name === k)) throw new Error('halka tablosu: eksik satır ' + k);

await saveJSON('saturn_rings.json', { _source: { ...meta, title: 'NASA NSSDCA — Saturnian Rings Fact Sheet (D. R. Williams)' }, rows: out });
console.log(out.length + ' satır');
