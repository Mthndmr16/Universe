// Asteroit kuşağı: JPL Small-Body Database'den, çapı ölçülmüş tüm ana kuşak asteroitleri (sınıf MBA).
// full-prec=true şart: varsayılan yanıtta elemanlar 3–4 haneye yuvarlanıyor (ör. a = 2.766), bu da konumu bozar.
//
//   node tools/fetch_asteroids.mjs
import { get, saveJSON, num } from './lib.mjs';

const FIELDS = ['spkid', 'full_name', 'epoch', 'a', 'e', 'i', 'om', 'w', 'ma', 'n', 'H', 'diameter', 'albedo'];
const q = new URLSearchParams({ fields: FIELDS.join(','), 'sb-class': 'MBA', 'sb-cdata': JSON.stringify({ AND: ['diameter|DF'] }), 'full-prec': 'true' });
const url = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api?' + q;

const { text, meta } = await get(url, 'sbdb_mba_diameter.json');
const body = JSON.parse(text);
if (body.fields.join(',') !== FIELDS.join(',')) throw new Error('SBDB: alanlar değişmiş: ' + body.fields);
if (body.data.length !== body.count) throw new Error(`SBDB: ${body.count} kayıt bildirildi, ${body.data.length} geldi`);

const opt = s => s === null || s === '' ? null : num(s);
const rows = body.data.map(r => {
  const [spkid, name, ...rest] = r;
  const [epoch, a, e, i, om, w, ma, n, H, diameter, albedo] = rest.map(opt);
  if ([epoch, a, e, i, om, w, ma, n, diameter].some(v => v === null)) throw new Error('SBDB: eksik eleman: ' + name);
  if (e >= 1) throw new Error('SBDB: kapalı olmayan yörünge: ' + name);
  return [spkid, name.trim(), epoch, a, e, i, om, w, ma, n, H, diameter, albedo];
});

await saveJSON('asteroids_mba.json', {
  _source: { ...meta, title: 'JPL SBDB Query API — çapı ölçülmüş ana kuşak asteroitleri (sb-class=MBA, diameter tanımlı)',
    frame: 'Güneş merkezli oskülatör elemanlar, J2000 ekliptiği', count: rows.length,
    units: { epoch: 'JD (TDB)', a: 'au', e: '—', i: 'derece', om: 'derece (çıkış düğümü boylamı)', w: 'derece (enberi argümanı)',
             ma: 'derece (ortalama anomali, epoch anında)', n: 'derece/gün (ortalama hareket)', H: 'mutlak parlaklık (kadir)', diameter: 'km', albedo: '—' } },
  fields: ['spkid', 'name', 'epoch', 'a', 'e', 'i', 'om', 'w', 'ma', 'n', 'H', 'diameter', 'albedo'],
  rows,
}, true);
console.log(`${rows.length} asteroit`);
