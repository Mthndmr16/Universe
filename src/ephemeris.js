// Horizons konum tablolarından herhangi bir anın konumunu bulur (kübik Hermite ara değeri).
// Tablolar data/ephem/ altında: eşit aralıklı satırlar [x, y, z, vx, vy, vz] (km, km/gün), J2000 ekliptiği, TDB.
// Tarayıcıda ve Node'da aynı şekilde çalışır.

export class EphemerisTable {
  // entry: data/ephem/index.json içindeki kayıt; buffer: o kaydın .bin dosyası
  constructor(entry, buffer){
    this.entry = entry;
    this.data = entry.dtype === 'float32' ? new Float32Array(buffer) : new Float64Array(buffer);
    if (this.data.length !== entry.n * 6) throw new Error(`${entry.name}: dosya boyutu kayıtla uyuşmuyor`);
    this.jd0 = entry.jd0;
    this.step = entry.step_days;
    this.jd1 = entry.jd0 + (entry.n - 1) * entry.step_days;
  }

  covers(jd){ return jd >= this.jd0 && jd <= this.jd1; }

  // Konum (km). Tablo aralığının dışında hata verir; tahmin yürütmez.
  position(jd){
    if (!this.covers(jd)) throw new RangeError(`${this.entry.name}: JD ${jd} tablo aralığının dışında (${this.jd0} – ${this.jd1})`);
    const f = (jd - this.jd0) / this.step;
    const i = Math.min(Math.floor(f), this.entry.n - 2);
    const s = f - i, h = this.step, d = this.data, a = i * 6, b = a + 6;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return [0, 1, 2].map(k => h00 * d[a + k] + h10 * h * d[a + 3 + k] + h01 * d[b + k] + h11 * h * d[b + 3 + k]);
  }
}
