// Betiklerin ortak yardımcıları: indirme, kaynak kaydı, HTML ayıklama, Horizons sorgusu.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');
export const RAW = join(DATA, 'raw');
export const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// İndirir; yanıtı (file verilirse) data/raw/ altına olduğu gibi kaydeder ve kaynak bilgisini döndürür.
// SHA-256, sunucudan gelen baytların üzerinden hesaplanır.
export async function get(url, file, encoding = 'utf-8'){
  for (let attempt = 1; ; attempt++){
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const text = new TextDecoder(encoding).decode(bytes);
      const meta = { url, retrieved_utc: new Date().toISOString(), sha256: sha256(bytes) };
      if (file){
        await mkdir(RAW, { recursive: true });
        await writeFile(join(RAW, file), bytes);
        meta.raw_file = 'data/raw/' + file;
      }
      return { text, meta };
    } catch (err){
      if (attempt >= 6) throw err;
      console.log(`  tekrar deneniyor (${attempt}): ${err.message.slice(0, 120)}`);
      await new Promise(r => setTimeout(r, 5000 * 2 ** (attempt - 1))); // 5, 10, 20, 40, 80 sn
    }
  }
}

// compact: büyük tablolar için girintisiz yazar
export async function saveJSON(file, obj, compact = false){
  await mkdir(dirname(join(DATA, file)), { recursive: true });
  await writeFile(join(DATA, file), JSON.stringify(obj, null, compact ? 0 : 2) + '\n');
  console.log('yazıldı: data/' + file);
}

export const decode = s => s.replace(/&plusmn;/g, '±').replace(/&nbsp;/g, ' ').replace(/&times;/g, '×')
  .replace(/&dagger;/g, '†').replace(/&omega;/g, 'ω').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;|&rsquo;/g, "'");
export const strip = s => decode(s.replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<sub>(.*?)<\/sub>/g, '_$1')
  .replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Kesin sayı ayrıştırma: sayı olmayan her şeyde hata verir (sessizce NaN üretmez).
export const num = s => { if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) throw new Error('sayı değil: ' + s); return Number(s); };
// Binlik ayırıcılı ve sonu noktalı NSSDCA sayıları ("1,988,400.") için.
export const numLoose = s => num(s.replace(/,/g, '').replace(/\.$/, ''));

// Horizons oskülatör eleman sorgusu (Güneş merkezli, J2000 ekliptiği, au ve gün).
// Satırlar: [JD, a, e, i, om, w, ma, n] — açılar derece, n derece/gün.
export async function horizonsElements({ command, start, stop, step }){
  const query = new URLSearchParams({ format: 'json', COMMAND: `'${command}'`, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS', CENTER: "'500@10'", REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES', TP_TYPE: 'ABSOLUTE', START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: `'${step}'` });
  const { text, meta } = await get(HORIZONS + '?' + query);
  const body = JSON.parse(text);
  if (body.error) throw new Error('Horizons: ' + body.error);
  const res = body.result;
  const soe = res.indexOf('$$SOE'), eoe = res.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) throw new Error('Horizons: veri bloğu yok\n' + res.slice(0, 3000));
  // sütun başlıkları $$SOE'den önceki satırda; sırası doğrulanır
  const head = res.slice(0, soe).trim().split('\n').reverse().find(l => l.includes('JDTDB')).split(',').map(s => s.trim()).filter(Boolean);
  const col = k => { const i = head.indexOf(k); if (i < 0) throw new Error('Horizons: sütun yok ' + k); return i; };
  const idx = ['JDTDB', 'A', 'EC', 'IN', 'OM', 'W', 'MA', 'N'].map(col);
  const rows = res.slice(soe + 5, eoe).trim().split('\n').map(l => { const c = l.split(',').map(s => s.trim()); return idx.map(i => num(c[i])); });
  // "Target body name: 4 Vesta (A807 FA)     {source: JPL#36}" — uzun adlarda {source'tan önce tek boşluk olabiliyor
  const target = (res.match(/Target body name:\s*(.*?)\s*(\{source|\n)/) || [])[1] ?? null;
  return { meta, rows, target };
}

// Horizons vektör sorgusu. Zaman TDB, düzlem J2000 ekliptiği. Satırlar: [JD, x, y, z, vx, vy, vz].
// time: { start, stop, step } ya da { tlist: [JD, …] }
export async function horizonsVectors({ command, center, units = 'KM-D', time, rawFile }){
  const q = { format: 'json', COMMAND: `'${command}'`, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'VECTORS',
    CENTER: `'${center}'`, REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', VEC_TABLE: '2', OUT_UNITS: units,
    CSV_FORMAT: 'YES', VEC_LABELS: 'NO', VEC_CORR: 'NONE', TIME_TYPE: 'TDB' };
  if (time.tlist){ q.TLIST = time.tlist.map(j => j.toFixed(9)).join(' '); q.TLIST_TYPE = 'JD'; }
  else Object.assign(q, { START_TIME: `'${time.start}'`, STOP_TIME: `'${time.stop}'`, STEP_SIZE: `'${time.step}'` });
  const query = new URLSearchParams(q);
  const { text, meta } = await get(HORIZONS + '?' + query, rawFile);
  const body = JSON.parse(text);
  if (body.error) throw new Error('Horizons: ' + body.error);
  const res = body.result;
  const soe = res.indexOf('$$SOE'), eoe = res.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) throw new Error('Horizons: veri bloğu yok\n' + res.slice(0, 3000));
  const rows = res.slice(soe + 5, eoe).trim().split('\n').map(l => {
    const c = l.split(',').map(s => s.trim());
    return [num(c[0]), num(c[2]), num(c[3]), num(c[4]), num(c[5]), num(c[6]), num(c[7])];
  });
  const header = res.slice(0, soe).split('\n')
    .filter(l => /Target body name|Center body name|Reference frame|Output units|Ephemeris \//.test(l)).map(l => l.trim());
  return { meta: { ...meta, query: Object.fromEntries(query) }, header, rows };
}
