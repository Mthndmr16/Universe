// Kepler yörüngesinden konum.
//
// 1) Gezegenler: JPL "Approximate Positions of the Planets" (https://ssd.jpl.nasa.gov/planets/approx_pos.html).
//    Her adım o sayfadaki formüllerle birebir aynıdır; elemanlar bu dosyada değil, data/planets_kepler_elements.json içindedir.
// 2) Küçük cisimler: JPL SBDB oskülatör elemanları + NASA'nın verdiği ortalama hareket n (iki cisim yaklaşımı).
//
// Konumlar au cinsinden, J2000 ortalama ekliptiği ve ekinoksunda. Zaman girdisi TDB cinsinden Jülyen Günü (JD).

export const AU_KM = 149597870.7;            // JPL SSD astrodinamik parametreler (IAU 2012 B1)
export const OBLIQUITY_J2000_DEG = 23.43928; // approx_pos sayfasında verilen değer
const D2R = Math.PI / 180;

// Tablo 1: 1800-01-01 .. 2050-12-31; tablo 2a/2b: MÖ 3000 .. MS 3000.
export const JD_1800 = 2378496.5, JD_2051 = 2470172.5;
export const JD_3000BC = 625673.5, JD_3001 = 2817152.5;

export function tableFor(jd){
  if (jd >= JD_1800 && jd < JD_2051) return 'table1';
  if (jd >= JD_3000BC && jd < JD_3001) return 'table2a';
  throw new RangeError(`JD ${jd} JPL yaklaşık elemanlarının geçerlilik aralığı dışında (MÖ 3000 – MS 3000)`);
}

// Kepler denklemi M = E − e* sin E; açılar derece cinsinden, sayfadaki gibi tol = 1e-6° ile yinelenir.
export function solveKepler(Mdeg, e){
  const eStar = e / D2R;
  let E = Mdeg + eStar * Math.sin(Mdeg * D2R);
  for (let n = 0; n < 50; n++){
    const dM = Mdeg - (E - eStar * Math.sin(E * D2R));
    const dE = dM / (1 - e * Math.cos(E * D2R));
    E += dE;
    if (Math.abs(dE) <= 1e-6) return E;
  }
  throw new Error('Kepler denklemi yakınsamadı');
}

// Yörünge düzlemindeki konumu J2000 ekliptiğine döndürür (approx_pos sayfasındaki matris).
function orbitToEcliptic(a, e, Ideg, omegaDeg, OmegaDeg, Edeg){
  const xp = a * (Math.cos(Edeg * D2R) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(Edeg * D2R);
  const co = Math.cos(omegaDeg * D2R), so = Math.sin(omegaDeg * D2R);
  const cO = Math.cos(OmegaDeg * D2R), sO = Math.sin(OmegaDeg * D2R);
  const cI = Math.cos(Ideg * D2R), sI = Math.sin(Ideg * D2R);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    (so * sI) * xp + (co * sI) * yp,
  ];
}

const wrap180 = M => ((M + 180) % 360 + 360) % 360 - 180;

// elements: ayrıştırılmış JSON; name: 'Mercury' … 'Neptune' ya da 'EM Bary'; table: isteğe bağlı zorlama.
export function position(elements, name, jd, table = tableFor(jd)){
  const el = elements[table][name];
  if (!el) throw new Error(`${table} içinde ${name} yok`);
  const T = (jd - 2451545.0) / 36525;
  const v = k => el[k][0] + el[k][1] * T;
  const a = v('a'), e = v('e'), I = v('I'), L = v('L'), varpi = v('varpi'), Omega = v('Omega');

  const omega = varpi - Omega;
  let M = L - varpi;
  const x = table === 'table2a' && elements.table2b[name];
  if (x) M += x.b * T * T + x.c * Math.cos(x.f * T * D2R) + x.s * Math.sin(x.f * T * D2R);
  return orbitToEcliptic(a, e, I, omega, Omega, solveKepler(wrap180(M), e));
}

// SBDB oskülatör elemanlarından konum (iki cisim). el: { epoch, a, e, i, om, w, ma, n } — birimler SBDB'deki gibi
// (au, derece, derece/gün). Ortalama anomali, NASA'nın verdiği n ile ilerletilir; Güneş kütlesi varsayılmaz.
export function positionFromElements(el, jd){
  const M = wrap180(el.ma + el.n * (jd - el.epoch));
  return orbitToEcliptic(el.a, el.e, el.i, el.w, el.om, solveKepler(M, el.e));
}

// Ekliptik → ekvatoral (ICRF/J2000), approx_pos sayfasındaki gibi.
export function eclipticToEquatorial([x, y, z]){
  const c = Math.cos(OBLIQUITY_J2000_DEG * D2R), s = Math.sin(OBLIQUITY_J2000_DEG * D2R);
  return [x, c * y - s * z, s * y + c * z];
}
