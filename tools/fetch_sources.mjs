// Projede kullanılan NASA/JPL tablo kaynaklarını indirir.
// Her kaynak iki kez saklanır: ham yanıt data/raw/ altında, ayrıştırılmış hali data/*.json içinde.
// JSON'daki _source alanı URL'yi, indirme zamanını ve ham yanıtın SHA-256 özetini tutar; böylece her sayı geriye izlenebilir.
// Ayrıştırıcılar beklenmeyen bir biçim görünce hata verir, sessizce devam etmez.
//
//   node tools/fetch_sources.mjs
import { get, saveJSON, decode, strip, num, numLoose, horizonsVectors } from './lib.mjs';

const SRC = {
  approx: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
  physPar: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  satPhys: 'https://ssd.jpl.nasa.gov/sats/phys_par/',
  satElem: 'https://ssd.jpl.nasa.gov/sats/elem/',
  sun: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',
};

// Yaklaşık elemanların tanımladığı cisimlerin Horizons kimlikleri.
// Dünya'nın elemanları Dünya–Ay kütle merkezine (3) aittir; diğerleri sistem kütle merkezleridir.
const PLANETS = [
  { name: 'Mercury', id: '1' }, { name: 'Venus', id: '2' }, { name: 'EM Bary', id: '3' }, { name: 'Mars', id: '4' },
  { name: 'Jupiter', id: '5' }, { name: 'Saturn', id: '6' }, { name: 'Uranus', id: '7' }, { name: 'Neptune', id: '8' },
];

const cellsOf = (row, tag = 't[hd]') => [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1]);

// ---------- 1. Gezegenlerin yaklaşık konumları (Standish & Williams) ----------
function parseApprox(html){
  const pres = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(m => decode(m[1]));
  if (pres.length !== 3) throw new Error('approx_pos: 3 tablo bekleniyordu, bulunan ' + pres.length);
  const elemTable = pre => {
    const lines = pre.split('\n').map(l => l.trim()).filter(l => /^-?[A-Za-z0-9]/.test(l) && !/^(a |au|EM Bary =)/.test(l));
    const out = {};
    for (let i = 0; i < lines.length; i++){
      const m = lines[i].match(/^([A-Za-z]+(?: Bary)?)\s+(.*)$/);
      if (!m || !PLANETS.some(p => p.name === m[1])) continue;
      const v0 = m[2].split(/\s+/).map(num), v1 = lines[i + 1].split(/\s+/).map(num);
      if (v0.length !== 6 || v1.length !== 6) throw new Error('approx_pos: eksik eleman, ' + m[1]);
      const k = ['a', 'e', 'I', 'L', 'varpi', 'Omega'];
      out[m[1]] = Object.fromEntries(k.map((key, j) => [key, [v0[j], v1[j]]]));
    }
    if (Object.keys(out).length !== 8) throw new Error('approx_pos: 8 gezegen bekleniyordu');
    return out;
  };
  const extra = {};
  for (const l of pres[2].split('\n')){
    const m = l.trim().match(/^(Jupiter|Saturn|Uranus|Neptune)\s+(.*)$/);
    if (m){ const [b, c, s, f] = m[2].split(/\s+/).map(num); extra[m[1]] = { b, c, s, f }; }
  }
  if (Object.keys(extra).length !== 4) throw new Error('approx_pos: tablo 2b eksik');

  // nominal hata tablosu: gezegen, sonra 1800–2050 için λ φ ρ ve MÖ 3000 – MS 3000 için λ φ ρ
  const acc = {};
  const tbl = html.slice(html.indexOf('Accuracy'), html.indexOf('Formulae for using'));
  for (const row of tbl.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
    const cells = cellsOf(row[1]).map(strip);
    const name = cells[0]?.replace(/\s*\^?†.*$/, '');
    if (!PLANETS.some(p => p.name === name)) continue;
    const v = cells.slice(1).map(num);
    if (v.length !== 6) throw new Error('approx_pos: hata tablosu eksik, ' + name);
    acc[name] = { '1800-2050': { lon_arcsec: v[0], lat_arcsec: v[1], dist_1000km: v[2] },
                  '-2999-3000': { lon_arcsec: v[3], lat_arcsec: v[4], dist_1000km: v[5] } };
  }
  if (Object.keys(acc).length !== 8) throw new Error('approx_pos: hata tablosu 8 gezegen içermiyor');
  return { table1: elemTable(pres[0]), table2a: elemTable(pres[1]), table2b: extra, nominal_errors: acc };
}

// "değer [kaynak] ±sigma" biçimindeki hücreler
function valueCell(txt, where){
  if (!txt) return null;
  const m = txt.match(/^([-+]?\d*\.?\d+)\s*(?:\[\s*([^\]]+?)\s*\])?\s*(?:±\s*([\d.]+))?$/);
  if (!m) throw new Error(`çözülemedi "${txt}" (${where})`);
  return { value: Number(m[1]), sigma: m[3] ? Number(m[3]) : null, ref: m[2] || null };
}

// Sayfanın "refs" bölümündeki kaynak listesi (tablolardaki harf ve rakamların açılımı)
function parseRefs(html){
  const refs = {};
  const block = html.slice(html.indexOf('id="refs"'));
  for (const m of block.matchAll(/<(?:li|tr|p|dt)[^>]*>\s*(?:<[^>]+>)*\s*\[?([A-Z0-9*]{1,3})\]?\s*(?:<[^>]+>)*\s*([\s\S]*?)<\/(?:li|tr|p|dd)>/g)){
    const txt = strip(m[2]); if (txt && !refs[m[1]]) refs[m[1]] = txt;
  }
  return refs;
}

// ---------- 2. Gezegen ve cüce gezegen fiziksel parametreleri ----------
function parsePhysPar(html){
  const tables = [...html.matchAll(/<table class="planet-phys-par[^"]*">([\s\S]*?)<\/table>/g)].map(m => m[1]);
  if (tables.length !== 2) throw new Error('phys_par: 2 tablo bekleniyordu, bulunan ' + tables.length);
  return { tables: tables.map(t => {
    const rows = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
    const heads = cellsOf(rows[0], 'th').map(strip);
    const units = cellsOf(rows[1], 'td').map(strip);
    const columns = heads.slice(1).map((h, i) => ({ name: h, unit: units[i + 1] || null }));
    const bodies = {};
    for (const r of rows.slice(2)){
      const cells = cellsOf(r, 'td');
      if (cells.length !== heads.length) continue;
      const name = strip(cells[0]);
      bodies[name] = Object.fromEntries(cells.slice(1).map((c, i) => [columns[i].name, valueCell(strip(c), `${name}, ${columns[i].name}`)]));
    }
    return { label: heads[0], columns, bodies };
  }), references: parseRefs(html) };
}

// ---------- 3. Uyduların fiziksel parametreleri ----------
// Bu tabloda <td> etiketleri kapatılmıyor; satırlar <td> açılışlarına göre bölünür.
function parseSatPhys(html){
  const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
  const sats = [];
  for (const r of body.split(/<tr[^>]*>/).slice(1)){
    const c = r.split(/<td[^>]*>/).slice(1).map(x => strip(x.replace(/<\/tr>[\s\S]*$/, '')));
    if (c.length < 12) continue;
    const val = s => (s === '' || s === 'n/a') ? null : num(s); // "n/a": kaynakta değer yok
    const trip = i => {
      const lim = c[i].match(/^<\s*(\d*\.?\d+)$/); // "<0.0002": kaynakta yalnızca üst sınır var (Kerberos, Styx)
      if (lim) return { value: null, upper_limit: num(lim[1]), sigma: null, ref: c[i + 2] || null };
      return val(c[i]) === null ? null : { value: val(c[i]), sigma: val(c[i + 1]), ref: c[i + 2] || null };
    };
    sats.push({ planet: c[0], name: c[1], horizons_id: c[2],
      GM_km3_s2: trip(3), mean_radius_km: trip(6), mean_density_g_cm3: trip(9) });
  }
  if (sats.length < 40) throw new Error('sats/phys_par: beklenenden az uydu: ' + sats.length);
  return { columns: { GM_km3_s2: 'km^3/s^2', mean_radius_km: 'km', mean_density_g_cm3: 'g/cm^3' }, satellites: sats, references: parseRefs(html) };
}

// ---------- 4. Uyduların ortalama yörünge elemanları ----------
// JPL uyarısı: bu elemanlar konum hesabı için değildir. Yalnızca yörüngenin şekli ve yönelimi için kullanılır.
function parseSatElem(html){
  const t = html.slice(html.indexOf('<table id="sat_elem"'), html.indexOf('</table>', html.indexOf('<table id="sat_elem"')));
  const rows = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  const heads = cellsOf(rows[0], 'th').map(strip);
  const expect = ['ID', 'Planet', 'Satellite', 'Code', 'Ephemeris', 'Frame', 'Epoch (TDB)', 'a (km)', 'e', 'ω (deg)', 'M (deg)',
    'i (deg)', 'node (deg)', 'P (days)', 'P_apsis (yr)', 'P_node (yr)', 'R.A. (deg)', 'Dec. (deg)', 'Tilt (deg)', 'Ref.'];
  if (heads.join('|') !== expect.join('|')) throw new Error('sats/elem: sütunlar değişmiş: ' + heads.join('|'));
  const keys = ['id', 'planet', 'name', 'horizons_id', 'ephemeris', 'frame', 'epoch_tdb', 'a_km', 'e', 'w_deg', 'M_deg',
    'i_deg', 'node_deg', 'P_days', 'P_apsis_yr', 'P_node_yr', 'laplace_ra_deg', 'laplace_dec_deg', 'laplace_tilt_deg', 'ref'];
  const text = new Set(['planet', 'name', 'horizons_id', 'ephemeris', 'frame', 'epoch_tdb', 'ref']);
  const sats = rows.slice(1).map(r => {
    const c = cellsOf(r, 'td').map(strip);
    if (c.length !== keys.length) throw new Error('sats/elem: eksik satır');
    // boş hücre ve "-": kaynakta değer yok
    return Object.fromEntries(keys.map((k, i) => [k, text.has(k) ? c[i] : (['', '-', 'n/a'].includes(c[i]) ? null : num(c[i]))]));
  });
  if (sats.length < 100) throw new Error('sats/elem: beklenenden az uydu: ' + sats.length);
  return { warning: 'JPL: "These mean orbital parameters are not intended for ephemeris computation. Accurate ephemerides should be obtained from our Horizons system." — Projede yalnızca yörüngenin şeklini ve yönelimini çizmek için kullanılır; konumlar Horizons tablolarından gelir.',
    satellites: sats };
}

// ---------- 5. Güneş bilgi kartı (NSSDCA) ----------
function parseSun(html){
  const out = { tables: {}, text_blocks: {} };
  // tablolar: başlıktan sonra gelen <table>; her satır "etiket | Güneş | Dünya | oran"
  for (const m of html.matchAll(/<h3>([^<]+)<\/h3>\s*<table[^>]*>([\s\S]*?)<\/table>/g)){
    const rows = {};
    for (const r of m[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
      const c = cellsOf(r[1]).map(strip);
      if (!c[0] || !c[1] || c[1] === 'Sun') continue;
      let value = null;
      try { value = numLoose(c[1]); } catch { /* "G2 V" gibi metin değerler */ }
      rows[c[0]] = { sun: c[1], value, earth: c[2] ?? null, ratio_sun_earth: c[3] ?? null };
    }
    out.tables[m[1].trim()] = rows;
  }
  // düz metin blokları (<pre>): satırlar olduğu gibi saklanır, sonra bilinen alanlar sayıya çevrilir
  for (const m of html.matchAll(/<h3>([^<]+)<\/h3>\s*<pre>([\s\S]*?)<\/pre>/g))
    out.text_blocks[m[1].trim()] = decode(m[2].replace(/<[^>]+>/g, '')).split('\n').map(s => s.trim()).filter(Boolean);
  const pole = out.text_blocks['North Pole of Rotation'] || [];
  const pick = (lines, re) => { const l = lines.find(x => re.test(x)); if (!l) throw new Error('sunfact: bulunamadı ' + re); return num(l.split(':')[1].trim().split(/\s+/)[0]); };
  const atm = out.text_blocks['Solar Atmosphere'] || [];
  out.derived = {
    north_pole_ra_deg: pick(pole, /^Right Ascension/), north_pole_dec_deg: pick(pole, /^Declination/),
    effective_temperature_K: pick(atm, /^Effective temperature/),
  };
  if (!out.tables['Bulk parameters']?.['Volumetric mean radius (km)']) throw new Error('sunfact: yarıçap bulunamadı');
  return out;
}

const approx = await get(SRC.approx, 'approx_pos.html');
await saveJSON('planets_kepler_elements.json', {
  _source: { ...approx.meta, title: 'JPL SSD — Approximate Positions of the Planets (E.M. Standish & J.G. Williams)',
    frame: 'J2000 ortalama ekliptiği ve ekinoksu; Güneş merkezli (Uranüs ve Neptün için bkz. tests/accuracy.mjs)',
    time: 'T = (JD_TDB − 2451545.0) / 36525',
    units: { a: 'au, au/yy', e: '—, 1/yy', I: 'derece, derece/yy', L: 'derece, derece/yy', varpi: 'derece, derece/yy', Omega: 'derece, derece/yy' },
    validity: { table1: '1800 – 2050', table2a: 'MÖ 3000 – MS 3000 (M ek terimleri tablo 2b ile)' },
    note: 'Her eleman [değer, yüzyıllık değişim] olarak tutulur.' },
  ...parseApprox(approx.text),
});

const phys = await get(SRC.physPar, 'phys_par.html');
await saveJSON('planets_physical.json', { _source: { ...phys.meta, title: 'JPL SSD — Planetary Physical Parameters' }, ...parsePhysPar(phys.text) });

const satPhys = await get(SRC.satPhys, 'sats_phys_par.html');
await saveJSON('satellites_physical.json', { _source: { ...satPhys.meta, title: 'JPL SSD — Planetary Satellite Physical Parameters' }, ...parseSatPhys(satPhys.text) });

const satElem = await get(SRC.satElem, 'sats_elem.html');
await saveJSON('satellites_mean_elements.json', { _source: { ...satElem.meta, title: 'JPL SSD — Planetary Satellite Mean Elements' }, ...parseSatElem(satElem.text) });

const sun = await get(SRC.sun, 'sunfact.html', 'latin1'); // sayfa Latin-1 kodlu
await saveJSON('sun.json', { _source: { ...sun.meta, title: 'NASA NSSDCA — Sun Fact Sheet (D. R. Williams)' }, ...parseSun(sun.text) });

// Horizons doğruluk referansı: tablo 1 aralığının tamamı (1800–2050), 10 günde bir;
// hem Güneş merkezine hem Güneş Sistemi kütle merkezine göre.
for (const [center, file, title] of [
  ['500@10', 'horizons_truth_1800_2050.json', 'JPL Horizons — Güneş merkezli konumlar (J2000 ekliptiği, au, TDB)'],
  ['500@0', 'horizons_truth_bary_1800_2050.json', 'JPL Horizons — Güneş Sistemi kütle merkezine göre konumlar (J2000 ekliptiği, au, TDB)'],
]){
  const truth = { _source: { title, bodies: {} }, bodies: {} };
  for (const p of PLANETS){
    const h = await horizonsVectors({ command: p.id, center, units: 'AU-D',
      time: { start: '1800-01-01', stop: '2050-12-31', step: '10d' }, rawFile: `horizons_${p.id}_c${center.split('@')[1]}_1800_2050.json` });
    truth._source.bodies[p.name] = { ...h.meta, header: h.header };
    truth.bodies[p.name] = h.rows.map(r => r.slice(0, 4));
    console.log(`  Horizons ${p.name} (${center}): ${h.rows.length} konum`);
  }
  await saveJSON(file, truth);
}
