# EVREN — proje notları

Kullanıcıyla her zaman **Türkçe** konuş. Kullanıcıya görünen hiçbir şey İngilizce olmaz: mesajlar, özetler, sorular, düğmeler, komut açıklamaları, görev listesi, kod açıklamaları ve test çıktıları Türkçe yazılır.

## Ne bu
GitHub: https://github.com/Mthndmr16/Universe (herkese açık, `main` dalı). Gönderim için GitHub CLI kurulu: `C:\Program Files\GitHub CLI\gh.exe`, hesap Mthndmr16.
Gerçek ölçülere dayalı bir evren modeli. Sırası: Güneş Sistemi → yıldız sistemleri → Samanyolu → evren. Kardeş proje: `Desktop\Gargantua-main` (kara delik raytracer'ı); Samanyolu aşamasında buraya bağlanacak. Güncel durum ve yol haritası `PLAN.md` dosyasında.

## Değişmez kural: tek kaynak NASA
- Her sayı, yörünge ve doku NASA'nın açık kaynaklarından gelir. Kaynakça `PLAN.md` dosyasında.
- NASA sunucusunda yayınlanan başka ajans verisi (ör. IRSA'daki Gaia) kabul edilir, ama asıl kaynağı da yazılır.
- **Uydurma yok.** Kaynakta olmayan değer kodda da olmaz (`null` ya da `upper_limit` olarak saklanır). Sabitleri koda gömme: `data/*.json` dosyalarından oku. Gömülmesi gereken bir sabit varsa yorumunda NASA kaynağını belirt (ör. `AU_KM`).
- NASA'nın kendi uyarılarına uyulur. Ör. JPL, uydu ortalama elemanlarının konum hesabı için kullanılmamasını söylüyor; bu yüzden uydu konumları Horizons tablolarından geliyor.
- Ölçek büyütme, renk eşleme gibi görselleştirme tercihleri "temsilî" diye etiketlenir.
- NASA logosu kullanılmaz; NASA'nın onayladığı izlenimi verilmez.

## Yapı
- `tools/lib.mjs`: ortak yardımcılar (indirme, SHA-256, HTML ayıklama, Horizons vektör sorgusu).
- `tools/fetch_sources.mjs`: tablo kaynakları. Bunlar gezegen yaklaşık elemanları, gezegen ve cüce gezegen fiziksel değerleri, uydu fiziksel değerleri, uydu ortalama elemanları (yalnızca yörünge şekli için), Güneş bilgi kartı ve gezegen testinin Horizons referansı. Ham yanıt `data/raw/` klasörüne, ayrıştırılmış veri `data/*.json` dosyalarına yazılır; `_source` alanında URL, zaman ve SHA-256 bulunur. Ayrıştırıcılar beklenmeyen biçimde hata verir.
- `tools/build_ephemeris.mjs`: Horizons konum tablolarını üretir → `data/ephem/*.bin` + `index.json`. Uydular gezegene göre, gezegenler kendi sistem kütle merkezine göre (2025–2035); cüce gezegenler Güneş'e göre (1800–2050). Adım NASA verisinden türetilir (hedef 0,2 km). Küçük cisimler 10 yıllık parçalarla indirilir (bkz. `PLAN.md` 3. bölüm).
- `tools/fetch_asteroids.mjs`: SBDB'den çapı ölçülmüş ana kuşak asteroitleri (`full-prec=true` şart).
- `tools/fetch_asteroid_elements.mjs`: en büyük 1997 asteroit (H < 12) için Horizons'tan 2025–2035 yıllık elemanlar. Sorgular tek tek gider (Horizons paralel sorguya 503 veriyor); kaldığı yerden devam eder.
- `src/asteroids.js`: büyükler için en yakın yıllık eleman, diğerleri için yalnızca epoch ± 1 yıl. Pencere dışında `null` döner.
- `src/kepler.js`: JPL yaklaşık gezegen formülleri + SBDB elemanlarından iki cisim konumu.
- `src/ephemeris.js`: konum tablolarından kübik Hermite ara değeri. Tablo aralığının dışında hata verir.
- Testler (kriter sonuçlardan önce belirlenir; değişirse başlıkta açıkça yazılır):
  - `tests/accuracy.mjs`: gezegenler ve JPL nominal hata sınırları
  - `tests/ephemeris.mjs`: her tabloda 200 rastgele anda ≤ 1 km
  - `tests/asteroids.mjs`: ≤ 0,01 au. Büyükler 2025–2035 boyunca, diğerleri epoch ± 1 yıl içinde. GEÇİYOR.
- Komutlar: `npm run fetch`, `npm run fetch:asteroids`, `npm run fetch:asteroid-elements`, `npm run build:ephem`, `npm test`, `npm run test:asteroids`. Bağımlılık yok (Node 24).

## Görsel (tarayıcı)
- Çalıştırma: `npx http-server -p 8766 -c-1` → http://127.0.0.1:8766/ (Gargantua klasöründeki `.claude/launch.json` içinde `evren` olarak da tanımlı).
- `index.html` → `src/app.js` (sahne, kamera, arayüz) + `src/world.js` (katalog ve anlık durum) + `src/view/shaders.js` (GLSL).
- Three.js 0.187.0 `vendor/three` içinde (import map). Build adımı yok.
- Konumlar float64 hesaplanır, her karede kameraya göre float32'ye iner; kamera hep orijinde. Uzunluk birimi km.
- Görsel tercihler (veri olmayanlar) `VIS` nesnesinde toplanır ve arayüzde "temsilî" diye etiketlenir.
- Test ve hata ayıklama için tarayıcı konsolunda `window.EVREN` var (ör. `EVREN.focusOn('saturn')`, `EVREN.jd`).
- Dokular: `python tools/build_textures.py` (Pillow, tifffile, imagecodecs gerekir; Windows'ta `PYTHONIOENCODING=utf-8`). Renk ve içerik değiştirilmez.
- Yönelim: `node tools/fetch_orientation.mjs` (NAIF pck00011), `node tests/orientation.mjs`.
- Diğer veri araçları: `tools/build_ring_profile.py` (Cassini halka profili), `tools/build_clouds.py [tarih]` (türetilmiş bulut katmanı), `tools/build_normals.py` (Ay ve Mars kabartması), `tools/fetch_moon_albedo.mjs`, `tools/fetch_rings.mjs`, `tools/sample_colors.py`.
- NASA GIBS (gibs.earthdata.nasa.gov) WMTS: EPSG:4326, 512 piksellik döşemeler; 250m kümesinde düzey 4 = 20×10 döşeme = 10240×5120. Paletli PNG'ler renk anahtarıyla (colormaps/v1.3) veriye çevrilir.

## Tuzaklar
- Horizons ve SBDB tarayıcıdan çağrılamaz (CORS yok); her şey önceden indirilir.
- Horizons TLIST yanıtları sıralı döner; satırları istek sırasıyla eşleştirme.
- Exoplanet Archive TAP sorgularında `top N` ile `order by` birlikte kullanılmaz; sonuç yanlış geliyor.
