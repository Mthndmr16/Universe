// Dünya modeli: her cismin verilen andaki konumu (km, Güneş merkezli, J2000 ekliptiği), boyutu ve yönelimi.
// Bütün sayılar data/ altındaki NASA kaynaklı dosyalardan gelir; burada yalnızca hangi cismin hangi veriyi
// kullandığı tanımlanır. Tarayıcıda çalışır.
import { position as keplerPosition, AU_KM } from './kepler.js';
import { EphemerisTable } from './ephemeris.js';
import { bodyAxes } from './orientation.js';
import { makeAsteroidModel } from './asteroids.js';

// Katalog: kimlik, Türkçe ad, veri bağlantıları.
//   kepler: JPL yaklaşık elemanlarındaki ad · offset: gezegenin kendi kütle merkezine göre tablo
//   helio: Güneş merkezli tablo · parent + eph: gezegene göre uydu tablosu · asteroid: SBDB spkid
//   pck: NAIF kimliği (yönelim ve yarıçap) · bary: sistem kütle merkezi kimliği (uydu düzeltme terimleri)
//   tex: doku kimliği · color: data/body_colors.json · regolith: havasız kayalık yüzey (Lommel–Seeliger yansıması)
export const CATALOG = [
  { id: 'sun', name: 'Güneş', kind: 'star', pck: '10' },
  { id: 'mercury', name: 'Merkür', kind: 'planet', kepler: 'Mercury', pck: '199', bary: '1', tex: 'mercury', regolith: true, phys: 'Mercury' },
  { id: 'venus', name: 'Venüs', kind: 'planet', kepler: 'Venus', pck: '299', bary: '2', color: 'Venus', radarTex: 'venus', phys: 'Venus' },
  { id: 'earth', name: 'Dünya', kind: 'planet', kepler: 'EM Bary', offset: 'Earth', pck: '399', bary: '3', tex: 'earth_day', night: 'earth_night', water: 'earth_water', clouds: 'earth_clouds', atmosphere: true, phys: 'Earth' },
  { id: 'moon', name: 'Ay', kind: 'moon', parent: 'earth', eph: 'Moon', pck: '301', bary: '3', tex: 'moon', normal: 'moon_normal', regolith: true },
  { id: 'mars', name: 'Mars', kind: 'planet', kepler: 'Mars', pck: '499', bary: '4', tex: 'mars', normal: 'mars_normal', phys: 'Mars' },
  { id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars', eph: 'Phobos', pck: '401', bary: '4', regolith: true },
  { id: 'deimos', name: 'Deimos', kind: 'moon', parent: 'mars', eph: 'Deimos', pck: '402', bary: '4', regolith: true },
  { id: 'jupiter', name: 'Jüpiter', kind: 'planet', kepler: 'Jupiter', offset: 'Jupiter', pck: '599', bary: '5', tex: 'jupiter', phys: 'Jupiter' },
  { id: 'io', name: 'Io', kind: 'moon', parent: 'jupiter', eph: 'Io', pck: '501', bary: '5', tex: 'io', regolith: true },
  { id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', eph: 'Europa', pck: '502', bary: '5', tex: 'europa', regolith: true },
  { id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter', eph: 'Ganymede', pck: '503', bary: '5', tex: 'ganymede', regolith: true },
  { id: 'callisto', name: 'Kallisto', kind: 'moon', parent: 'jupiter', eph: 'Callisto', pck: '504', bary: '5', regolith: true },
  { id: 'saturn', name: 'Satürn', kind: 'planet', kepler: 'Saturn', offset: 'Saturn', pck: '699', bary: '6', tex: 'saturn', rings: true, phys: 'Saturn' },
  { id: 'mimas', name: 'Mimas', kind: 'moon', parent: 'saturn', eph: 'Mimas', pck: '601', bary: '6', regolith: true },
  { id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn', eph: 'Enceladus', pck: '602', bary: '6', tex: 'enceladus', regolith: true },
  { id: 'tethys', name: 'Tethys', kind: 'moon', parent: 'saturn', eph: 'Tethys', pck: '603', bary: '6', regolith: true },
  { id: 'dione', name: 'Dione', kind: 'moon', parent: 'saturn', eph: 'Dione', pck: '604', bary: '6', regolith: true },
  { id: 'rhea', name: 'Rhea', kind: 'moon', parent: 'saturn', eph: 'Rhea', pck: '605', bary: '6', regolith: true },
  { id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', eph: 'Titan', pck: '606', bary: '6' },
  { id: 'hyperion', name: 'Hyperion', kind: 'moon', parent: 'saturn', eph: 'Hyperion', pck: '607', bary: '6', regolith: true },
  { id: 'iapetus', name: 'Iapetus', kind: 'moon', parent: 'saturn', eph: 'Iapetus', pck: '608', bary: '6', regolith: true },
  { id: 'uranus', name: 'Uranüs', kind: 'planet', kepler: 'Uranus', offset: 'Uranus', pck: '799', bary: '7', color: 'Uranus', phys: 'Uranus' },
  { id: 'miranda', name: 'Miranda', kind: 'moon', parent: 'uranus', eph: 'Miranda', pck: '705', bary: '7', regolith: true },
  { id: 'ariel', name: 'Ariel', kind: 'moon', parent: 'uranus', eph: 'Ariel', pck: '701', bary: '7', regolith: true },
  { id: 'umbriel', name: 'Umbriel', kind: 'moon', parent: 'uranus', eph: 'Umbriel', pck: '702', bary: '7', regolith: true },
  { id: 'titania', name: 'Titania', kind: 'moon', parent: 'uranus', eph: 'Titania', pck: '703', bary: '7', regolith: true },
  { id: 'oberon', name: 'Oberon', kind: 'moon', parent: 'uranus', eph: 'Oberon', pck: '704', bary: '7', regolith: true },
  { id: 'neptune', name: 'Neptün', kind: 'planet', kepler: 'Neptune', offset: 'Neptune', pck: '899', bary: '8', tex: 'neptune', phys: 'Neptune' },
  { id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', eph: 'Triton', pck: '801', bary: '8', regolith: true },
  { id: 'pluto', name: 'Plüton', kind: 'dwarf', helio: 'Pluto', offset: 'Pluto', pck: '999', bary: '9', tex: 'pluto', regolith: true, phys: 'Pluto' },
  { id: 'charon', name: 'Charon', kind: 'moon', parent: 'pluto', eph: 'Charon', pck: '901', bary: '9', regolith: true },
  { id: 'ceres', name: 'Ceres', kind: 'dwarf', helio: 'Ceres', pck: '2000001', regolith: true, phys: 'Ceres' },
  { id: 'vesta', name: 'Vesta', kind: 'asteroid', asteroid: 20000004, pck: '2000004', tex: 'vesta', regolith: true },
  { id: 'eris', name: 'Eris', kind: 'dwarf', helio: 'Eris', regolith: true, phys: 'Eris' },
  { id: 'makemake', name: 'Makemake', kind: 'dwarf', helio: 'Makemake', regolith: true, phys: 'Makemake' },
  { id: 'haumea', name: 'Haumea', kind: 'dwarf', helio: 'Haumea', regolith: true, phys: 'Haumea' },
];

const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const bin = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); };

export async function loadWorld(onProgress = () => {}){
  const files = ['planets_kepler_elements', 'planets_physical', 'orientation', 'textures', 'body_colors', 'saturn_rings', 'saturn_ring_profile', 'sun', 'satellites_mean_elements', 'moon_albedo'];
  const D = {};
  await Promise.all(files.map(async f => { D[f] = await json(`data/${f}.json`); onProgress(f); }));
  const ephIndex = (await json('data/ephem/index.json')).tables;

  const planetPhys = D.planets_physical.tables.find(t => t.label === 'Planet').bodies;
  const dwarfPhys = D.planets_physical.tables.find(t => t.label === 'Dwarf Planet').bodies;
  const O = D.orientation.bodies;
  const satElem = Object.fromEntries(D.satellites_mean_elements.satellites.map(s => [s.name, s]));

  // Konum tabloları: gezegen kaymaları ve cüce gezegenler hemen, uydu tabloları gerektiğinde yüklenir.
  const tables = {};
  const loadTable = async key => {
    if (tables[key] !== undefined) return tables[key];
    const e = ephIndex[key];
    if (!e || e.omitted){ tables[key] = null; return null; }
    tables[key] = 'yükleniyor';
    tables[key] = new EphemerisTable(e, await bin(e.file));
    return tables[key];
  };
  const offsetKey = name => `${name} (kütle merkezine göre)`;
  await Promise.all(CATALOG.flatMap(b => [b.offset && loadTable(offsetKey(b.offset)), b.helio && loadTable(b.helio)]).filter(Boolean));

  // Asteroitler (Vesta konumu ve kuşak için)
  const [mba, large] = await Promise.all([json('data/asteroids_mba.json'), json('data/asteroids_large_yearly.json')]);
  onProgress('asteroitler');
  const asteroids = makeAsteroidModel(mba, large);
  const spkCol = mba.fields.indexOf('spkid');
  const asteroidIndex = new Map(mba.rows.map((r, i) => [r[spkCol], i]));

  const bodies = CATALOG.map(c => {
    const b = { ...c, notes: [] };
    // yarıçaplar: NAIF (a, b, c) → JPL fiziksel tablo → NSSDCA (Güneş)
    if (c.pck && O[c.pck]?.RADII) b.radii = O[c.pck].RADII.slice(0, 3);
    else if (c.phys && (planetPhys[c.phys] || dwarfPhys[c.phys])){
      const p = planetPhys[c.phys] || dwarfPhys[c.phys];
      const r = (p['Mean Radius'] || p['Equatorial Radius']).value; b.radii = [r, r, r];
    }
    if (c.id === 'sun'){ const r = D.sun.tables['Bulk parameters']['Volumetric mean radius (km)'].value; b.radii = [r, r, r]; }
    if (!b.radii) throw new Error(`${c.id}: yarıçap verisi yok`);
    b.radius = Math.cbrt(b.radii[0] * b.radii[1] * b.radii[2]);
    b.orient = c.pck && O[c.pck]?.PM ? O[c.pck] : null;
    if (!b.orient && c.id !== 'sun') b.notes.push('Yönelim verisi yok (NAIF pck00011); cisim dönmeden çizilir.');
    b.texture = c.tex ? D.textures.textures[c.tex] : null;
    if (b.texture?.lon_left_edge_deg == null && b.texture) b.notes.push('Doku kaynağında boylam düzeni belirtilmemiş; boylam hizası temsilî.');
    const physRow = planetPhys[c.phys] || dwarfPhys[c.phys];
    b.albedo = physRow?.['Geometric Albedo']?.value ?? null;
    const ma = c.eph && D.moon_albedo.albedo[c.eph];
    if (b.albedo == null && ma){
      b.albedo = (ma.min + ma.max) / 2;
      b.albedoSource = 'NASA NSSDCA uydu bilgi kartı';
      if (ma.min !== ma.max) b.notes.push(`Albedo kaynakta iki değer olarak veriliyor (${ma.text}); hangi yarımkürenin hangisi olduğu belirtilmediği için ortalaması kullanıldı.`);
    }
    if (c.color) b.colorRatio = D.body_colors.colors[c.color].linear_rgb_ratio;
    if (!b.texture && !b.colorRatio && c.kind !== 'star') b.notes.push(b.albedo != null
      ? `Yüzey haritası ve renk verisi yok; ${b.albedoSource ?? 'JPL'} geometrik albedosu parlaklığında nötr gri.` : 'Renk ve albedo verisi yok; temsilî nötr gri.');
    if (c.parent) b.period = satElem[c.eph]?.P_days ?? null;
    b.physRow = physRow ?? null;
    return b;
  });
  const byId = Object.fromEntries(bodies.map(b => [b.id, b]));

  // Verilen andaki durum. Sonuç: id → { pos:[x,y,z] km | null, axes | null, why }
  function state(jd){
    const S = {};
    const put = (id, pos, why) => { S[id] = { pos, why, axes: null }; };
    for (const b of bodies){
      if (b.id === 'sun'){ put('sun', [0, 0, 0]); continue; }
      if (b.kepler){
        const p = keplerPosition(D.planets_kepler_elements, b.kepler, jd).map(v => v * AU_KM);
        const t = b.offset && tables[offsetKey(b.offset)];
        if (t instanceof EphemerisTable && t.covers(jd)){ const o = t.position(jd); p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; }
        put(b.id, p);
      } else if (b.helio){
        const t = tables[b.helio];
        if (!(t instanceof EphemerisTable) || !t.covers(jd)){ put(b.id, null, 'Konum tablosu bu tarihi kapsamıyor (1800–2050).'); continue; }
        const p = t.position(jd);
        const o = b.offset && tables[offsetKey(b.offset)];
        if (o instanceof EphemerisTable && o.covers(jd)){ const q = o.position(jd); p[0] += q[0]; p[1] += q[1]; p[2] += q[2]; }
        put(b.id, p);
      } else if (b.asteroid){
        const p = asteroids.position(asteroidIndex.get(b.asteroid), jd);
        put(b.id, p ? p.map(v => v * AU_KM) : null, p ? undefined : 'Asteroit konumu bu tarih için doğrulanmış aralığın dışında.');
      }
    }
    for (const b of bodies){
      if (!b.parent) continue;
      const parent = S[b.parent]?.pos;
      const t = tables[b.eph];
      if (!parent){ put(b.id, null, 'Ana gezegenin konumu yok.'); continue; }
      if (t === undefined || t === 'yükleniyor'){ put(b.id, null, 'Konum tablosu yükleniyor.'); continue; }
      if (!t || !t.covers(jd)){ put(b.id, null, 'Uydu konum tablosu bu tarihi kapsamıyor (2025–2035).'); continue; }
      const o = t.position(jd);
      put(b.id, [parent[0] + o[0], parent[1] + o[1], parent[2] + o[2]]);
    }
    for (const b of bodies){
      if (b.orient && S[b.id]) S[b.id].axes = bodyAxes(b.orient, b.bary ? O[b.bary] : null, jd);
    }
    return S;
  }

  return {
    bodies, byId, state, D, asteroids, mba, large,
    loadMoonsOf: async planetId => Promise.all(bodies.filter(b => b.parent === planetId).map(b => loadTable(b.eph))),
    tableReady: key => tables[key] instanceof EphemerisTable,
    AU_KM,
  };
}
