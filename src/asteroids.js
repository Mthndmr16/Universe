// Asteroit konumları. İki kaynak, iki kural:
//   • Büyükler (H < 12, ~2000 asteroit): Horizons'un 2025–2035 yıllık elemanlarından en yakın epoch'unki kullanılır.
//   • Diğerleri: SBDB'nin tek epoch'taki elemanları; yalnızca epoch ± 1 yıl içinde gösterilir. Bu sınır
//     tests/asteroids.mjs ölçümüne dayanır; dışında konum bilinmiyor sayılır ve null döner.
import { positionFromElements } from './kepler.js';

export const SMALL_WINDOW_DAYS = 365.25;
const KEYS = ['epoch', 'a', 'e', 'i', 'om', 'w', 'ma', 'n'];

// mba: data/asteroids_mba.json, large: data/asteroids_large_yearly.json
export function makeAsteroidModel(mba, large){
  const c = Object.fromEntries(mba.fields.map((f, i) => [f, i]));
  const yearly = large.bodies;
  return {
    count: mba.rows.length,
    // i: mba.rows içindeki sıra. Konum au cinsinden (Güneş merkezli, J2000 ekliptiği) ya da null.
    position(i, jd){
      const r = mba.rows[i];
      const y = yearly[r[c.spkid]];
      if (y){
        const first = y.rows[0][0], last = y.rows[y.rows.length - 1][0];
        if (jd < first || jd > last) return null;
        const row = y.rows.reduce((best, x) => Math.abs(x[0] - jd) < Math.abs(best[0] - jd) ? x : best);
        return positionFromElements(Object.fromEntries(KEYS.map((k, j) => [k, row[j]])), jd);
      }
      const el = Object.fromEntries(KEYS.map(k => [k, r[c[k]]]));
      if (Math.abs(jd - el.epoch) > SMALL_WINDOW_DAYS) return null;
      return positionFromElements(el, jd);
    },
    isLarge: i => !!yearly[mba.rows[i][c.spkid]],
  };
}
