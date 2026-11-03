// Uyduların görsel geometrik albedosu: NASA NSSDCA uydu bilgi kartları.
// Değerler metin olarak da saklanır; aralıklar (ör. Iapetus "0.05 - 0.5") en küçük/en büyük olarak ayrılır.
//
//   node tools/fetch_moon_albedo.mjs
import { get, saveJSON, strip } from './lib.mjs';

const PAGES = ['joviansatfact', 'saturniansatfact', 'uraniansatfact', 'neptuniansatfact', 'marsfact', 'plutofact'];
const out = {}, sources = [];
for (const p of PAGES){
  const url = `https://nssdc.gsfc.nasa.gov/planetary/factsheet/${p}.html`;
  const { text, meta } = await get(url, `${p}.html`, 'latin1');
  sources.push({ ...meta, page: p });
  // 3) düz metin blokları: "<h2>Charon (P1)</h2> <pre> … Geometric Albedo 0.42 …"
  for (const m of text.matchAll(/<h2>([^<]+)<\/h2>\s*<pre>([\s\S]*?)<\/pre>/g)){
    const a = strip(m[2]).match(/Geometric Albedo\s+(\d*\.?\d+)/i);
    const name = m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (a && !/^(Pluto|Mars)$/i.test(name)) out[name] = { text: a[1], min: Number(a[1]), max: Number(a[1]), page: p, column: 'Geometric Albedo' };
  }
  for (const t of text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)){
    const rows = [...t[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => strip(c[1])));
    const isValue = s => /^[~<>]?\s*\d*\.?\d+(\s*[-\/]\s*\d*\.?\d+)?$/.test(s);   // yalnızca sayı ya da sayı aralığı
    const add = (rawName, txt, label) => {
      const name = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!name || !isValue(txt)) return;
      const nums = txt.match(/\d*\.?\d+/g).map(Number);
      out[name] = { text: txt, min: Math.min(...nums), max: Math.max(...nums), page: p, column: label };
    };
    // 1) sütun düzeni: başlık satırında "albedo" sütunu, her satır bir uydu
    const head = rows.find(r => r.slice(1).some(c => /albedo/i.test(c)));
    if (head){
      const col = head.findIndex(c => /albedo/i.test(c));
      for (const r of rows) if (r !== head && r.length === head.length) add(r[0], r[col], head[col]);
    }
    // 2) satır düzeni (Mars, Plüton sayfaları): ilk sütunda "albedo" satırı, uydular sütun başlıklarında
    const arow = rows.find(r => /geometric albedo/i.test(r[0] ?? ''));
    if (arow){
      const names = rows[0];
      for (let i = 1; i < arow.length; i++) if (names[i] && !/^(Ratio|Earth|Mars|Pluto)/i.test(names[i])) add(names[i], arow[i], arow[0]);
    }
  }
}
for (const n of ['Callisto', 'Mimas', 'Titan', 'Iapetus', 'Miranda', 'Triton']) if (!out[n]) throw new Error('albedo bulunamadı: ' + n);
await saveJSON('moon_albedo.json', { _source: { title: 'NASA NSSDCA — uydu bilgi kartları (görsel geometrik albedo)', pages: sources }, albedo: out });
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.text}`).join(' · '));
