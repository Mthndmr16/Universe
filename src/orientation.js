// Gök cisimlerinin yönelimi (NAIF pck00011 / IAU modeli; veri: data/orientation.json).
// Çıktı: cisme bağlı eksenlerin (x: ana meridyen, z: kuzey kutbu) J2000 ekliptiği çerçevesindeki yönleri.
import { OBLIQUITY_J2000_DEG } from './kepler.js';

const D2R = Math.PI / 180;

// Kutup yönü (α, δ) ve ana meridyen açısı W, derece. body: orientation.json'daki kayıt; bary: sistem kütle merkezi kaydı.
export function poleAndMeridian(body, bary, jd){
  const d = jd - 2451545.0, T = d / 36525;
  const poly = (c, x) => (c?.[0] ?? 0) + (c?.[1] ?? 0) * x + (c?.[2] ?? 0) * x * x;
  let ra = poly(body.POLE_RA, T), dec = poly(body.POLE_DEC, T), W = poly(body.PM, d);
  const ang = bary?.NUT_PREC_ANGLES;
  if (ang){
    for (let i = 0; 2 * i + 1 < ang.length; i++){
      const th = (ang[2 * i] + ang[2 * i + 1] * T) * D2R;
      ra += (body.NUT_PREC_RA?.[i] ?? 0) * Math.sin(th);
      dec += (body.NUT_PREC_DEC?.[i] ?? 0) * Math.cos(th);
      W += (body.NUT_PREC_PM?.[i] ?? 0) * Math.sin(th);
    }
  }
  return { ra, dec, W: ((W % 360) + 360) % 360 };
}

const eqToEcl = ([x, y, z]) => {
  const c = Math.cos(OBLIQUITY_J2000_DEG * D2R), s = Math.sin(OBLIQUITY_J2000_DEG * D2R);
  return [x, c * y + s * z, -s * y + c * z];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Cisme bağlı eksenler, J2000 ekliptiğinde: { x, y, z } birim vektörleri.
export function bodyAxes(body, bary, jd){
  const { ra, dec, W } = poleAndMeridian(body, bary, jd);
  const a = ra * D2R, dl = dec * D2R, w = W * D2R;
  const p = [Math.cos(dl) * Math.cos(a), Math.cos(dl) * Math.sin(a), Math.sin(dl)];    // kuzey kutbu
  const n = [-Math.sin(a), Math.cos(a), 0];                                              // ekvatorun ICRF ekvatorundaki çıkış düğümü
  const pn = cross(p, n);
  const x = n.map((v, i) => v * Math.cos(w) + pn[i] * Math.sin(w));                     // ana meridyen
  const y = cross(p, x);
  return { x: eqToEcl(x), y: eqToEcl(y), z: eqToEcl(p) };
}

// Cisim merkezinden bakılan bir yönün (J2000 ekliptiği) cisim üzerindeki boylam/enlemi (gezegen merkezli, doğu pozitif).
export function directionToLonLat(axes, v){
  const r = Math.hypot(...v);
  const dot = a => (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) / r;
  return { lon: Math.atan2(dot(axes.y), dot(axes.x)) / D2R, lat: Math.asin(dot(axes.z)) / D2R };
}
