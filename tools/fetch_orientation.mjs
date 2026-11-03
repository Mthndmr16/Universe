// Gök cisimlerinin yönelimi: NASA NAIF genel çekirdeği pck00011.tpc (IAU WGCCRE modelleri, NAIF biçiminde).
// Kutup yönü (sağ açıklık, dik açıklık), ana meridyen açısı W ve uydular için periyodik düzeltme terimleri.
// Yalnızca \begindata blokları okunur; \begintext bloklarındaki açıklama satırları atlanır.
//
//   node tools/fetch_orientation.mjs
import { get, saveJSON } from './lib.mjs';

const URL = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc';
const { text, meta } = await get(URL, 'pck00011.tpc');

// NAIF metin çekirdeği: "AD = ( değerler )" ya da "AD += ( … )"; değerler birden çok satıra yayılabilir; üs "D" ile yazılabilir.
const vars = {};
let inData = false, buf = '';
for (const line of text.split(/\r?\n/)){
  const t = line.trim();
  if (t === '\\begindata'){ inData = true; continue; }
  if (t === '\\begintext'){ inData = false; continue; }
  if (inData) buf += line + '\n';
}
for (const m of buf.matchAll(/([A-Z0-9_]+)\s*(\+?=)\s*(\([^)]*\)|'[^']*'|[^\s(]+)/g)){
  const [, name, op, raw] = m;
  const vals = raw.replace(/[()]/g, ' ').trim().split(/[\s,]+/).filter(Boolean).map(s => {
    const v = Number(s.replace(/[dD]/, 'e'));
    if (!Number.isFinite(v)) throw new Error(`pck: sayı değil ${name}: ${s}`);
    return v;
  });
  vars[name] = op === '+=' ? [...(vars[name] ?? []), ...vals] : vals;
}

// Cisim başına topla
const bodies = {};
for (const [k, v] of Object.entries(vars)){
  const m = k.match(/^BODY(\d+)_(.+)$/);
  if (!m) continue;
  (bodies[m[1]] ??= {})[m[2]] = v;
}
for (const id of ['10', '199', '299', '399', '301', '499', '599', '501', '699', '606', '799', '899', '801', '999', '901']){
  if (!bodies[id]?.POLE_RA || !bodies[id]?.PM) throw new Error(`pck: ${id} için yönelim eksik`);
}
// Örnek kontrol: Dünya ana meridyeni (pck00011'de 190.147, 360.9856235)
if (bodies['399'].PM[0] !== 190.147 || bodies['399'].PM[1] !== 360.9856235) throw new Error('pck: Dünya PM beklenen değer değil');

await saveJSON('orientation.json', {
  _source: { ...meta, title: 'NASA NAIF — pck00011.tpc (gezegen sabitleri çekirdeği)',
    model: 'RA = RA0 + RA1·T + RA2·T² + Σ RAi·sin(θi); DEC = DEC0 + DEC1·T + DEC2·T² + Σ DECi·cos(θi); W = W0 + W1·d + W2·d² + Σ Wi·sin(θi). ' +
           'T: J2000\'den itibaren Jülyen yüzyılı (TDB), d: gün. θi: sistem kütle merkezinin NUT_PREC_ANGLES değerleri (derece, derece/yüzyıl). ' +
           'Açılar ICRF/J2000 ekvatoral çerçevesinde, derece.' },
  bodies,
});
console.log(`${Object.keys(bodies).length} cisim`);
