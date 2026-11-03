# EVREN — Kaynakça ve Yol Haritası

*3 Kasım 2026 · Aşağıdaki tüm adresler bu tarihte canlı olarak test edildi (HTTP 200, örnek sorgular çalıştı).*

---

## 0. Temel kural

**Tek gerçek kaynak NASA'dır.** Ekrana çıkan her sayı, her yörünge, her renk ve her doku aşağıdaki listeden gelir.

1. **NASA'da yayınlanan veri kabul edilir.** NASA sunucusunda yayınlanan başka ajans verisi de buna dahil (ör. IRSA'daki ESA Gaia kataloğu). Böyle bir veride asıl kaynak da kaynakçaya yazılır: *"Gaia DR3 — ESA, NASA/IPAC IRSA üzerinden"*.
2. **Uydurma yok.** Bir değer NASA kaynağında yoksa projede de olmaz. Boş kalır ya da "veri yok" diye gösterilir.
3. **Görselleştirme seçimleri ayrı işaretlenir.** Bazı şeyler ölçüm değil, bizim tercihimizdir: ölçek büyütme, kamera, renk eşleme, bir gezegenin bilinmeyen yüzeyi gibi. Bunlar ekranda ve kodda "temsilî" olarak etiketlenir.
4. **Her veri dosyası kaynağını taşır.** Projedeki her veri dosyasının yanında hangi adresten, hangi sorguyla, hangi tarihte indirildiği yazılı olur. Böylece her sayı geriye doğru izlenebilir.
5. **Lisans:** NASA içeriği ABD'de telif kapsamında değildir, kaynak olarak NASA belirtilir. **NASA logosu kullanılmaz.** NASA'nın projeyi onayladığı izlenimi verilmez. Üçüncü taraf telifli görseller (© işaretli olanlar) kullanılmaz.
   Kaynak: https://www.nasa.gov/nasa-brand-center/images-and-media/

---

## 1. Kaynakça

### Güneş Sistemi
| Kaynak | Ne verir | Adres |
|---|---|---|
| **JPL Horizons API** | Gezegen, uydu, asteroit ve kuyruklu yıldızların herhangi bir tarihteki konum ve hızı (DE440/441 efemeris) | https://ssd.jpl.nasa.gov/api/horizons.api |
| **JPL SSD: gezegen fiziksel parametreleri** | Kütle, yarıçap, yoğunluk, dönme süresi | https://ssd.jpl.nasa.gov/planets/phys_par.html |
| **JPL SSD: uydu fiziksel parametreleri** | Uyduların kütle, yarıçap ve albedo değerleri | https://ssd.jpl.nasa.gov/sats/phys_par/ |
| **JPL Small-Body Database API** | Asteroit ve kuyruklu yıldız yörüngeleri ve fiziksel verileri | https://ssd-api.jpl.nasa.gov/sbdb.api |
| **NASA NSSDCA Planetary Fact Sheets** | Gezegen bilgi kartları (eksen eğikliği, atmosfer, sıcaklık…) | https://nssdc.gsfc.nasa.gov/planetary/factsheet/ |
| **NAIF SPICE çekirdekleri** | Yüksek hassasiyetli efemeris dosyaları (de440.bsp) ve dönme modelleri | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ |
| **NASA SVS: CGI Moon Kit** | LRO ölçümlerinden Ay renk ve yükseklik haritaları | https://svs.gsfc.nasa.gov/4720 |
| **NASA Visible Earth: Blue Marble** | Dünya dokuları | https://visibleearth.nasa.gov/collection/1484/blue-marble |
| **NASA 3D Resources** | Gezegen dokuları, uzay aracı modelleri | https://science.nasa.gov/3d-resources/ |
| **JPL Photojournal** | Görev görüntüleri | https://photojournal.jpl.nasa.gov/ |
| **NASA Planetary Data System (PDS)** | Görevlerin ham ve işlenmiş verisi | https://pds.nasa.gov/ |

### Yıldızlar ve diğer yıldız sistemleri
| Kaynak | Ne verir | Adres |
|---|---|---|
| **NASA Exoplanet Archive (TAP)** | Bilinen tüm ötegezegenler (şu an 6451) ve barındırdıkları yıldızlar: uzaklık, sıcaklık, yarıçap, yörünge | https://exoplanetarchive.ipac.caltech.edu/TAP/sync |
| Sütun açıklamaları | | https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html |
| **NASA SVS: Deep Star Maps 2020** | Gökyüzü arka planı: 1,7 milyar yıldızlık HDR harita (Hipparcos-2, Tycho-2, Gaia DR2 kaynaklı). Asıl kaynaklar da kaynakçaya yazılır: *NASA/GSFC SVS; Gaia team/ESA*. | https://svs.gsfc.nasa.gov/4851 |
| **HEASARC** | Hipparcos ve diğer yıldız katalogları | https://heasarc.gsfc.nasa.gov/W3Browse/ |

### Samanyolu
| Kaynak | Ne verir | Adres |
|---|---|---|
| **NASA/IPAC IRSA: Gaia** | Gaia DR3 yıldız konumları, uzaklıkları ve hareketleri (kaynak: ESA) | https://irsa.ipac.caltech.edu/Missions/gaia.html |
| **NASA/IPAC IRSA (genel)** | Spitzer, WISE ve 2MASS kızılötesi gökyüzü taramaları | https://irsa.ipac.caltech.edu/ |

### Evren
| Kaynak | Ne verir | Adres |
|---|---|---|
| **NASA/IPAC Extragalactic Database (NED)** | Galaksilerin konumu, kırmızıya kayması ve uzaklığı (TAP sorgusu destekli) | https://ned.ipac.caltech.edu/ |
| **NASA LAMBDA** | Kozmik mikrodalga arka plan verisi (WMAP; Planck kopyaları) ve kozmolojik parametreler | https://lambda.gsfc.nasa.gov/ |

### Genel
| Kaynak | Adres |
|---|---|
| NASA Image and Video Library API | https://images-api.nasa.gov/ |
| NASA Open APIs | https://api.nasa.gov/ |

---

## 2. Yol haritası

Her aşama tamamlanıp tarayıcıda doğrulanmadan bir sonrakine geçilmez.

### Aşama 1: Güneş Sistemi
> **Durum (3 Kasım 2026):** 1. ve 2. adımlar tamam. Görselin (3. adım) ilk sürümü çalışıyor: `index.html`, `npx http-server -p 8766 -c-1`. Ayrıntılar ve açık işler aşağıda, "Görsel motor" başlığı altında.
> - **Gezegenler:** JPL yaklaşık elemanları, MÖ 3000 – MS 3000. JPL'nin hata sınırları içinde (`tests/accuracy.mjs`).
> - **22 büyük uydu ve gezegenlerin kendi kütle merkezlerine göre kaymaları:** Horizons tabloları, 2025–2035. Ara değer hatası ≤ 1 km; ölçülen en büyük 0,29 km (`tests/ephemeris.mjs`).
> - **Cüce gezegenler** (Ceres, Plüton sistemi, Eris, Makemake, Haumea): Horizons tabloları, 1800–2050. Hata ≤ 1 km; en büyük 0,61 km.
> - **Fiziksel veriler:** Güneş (NSSDCA), gezegenler ve cüce gezegenler (JPL), 46 uydu (JPL). Ayrıca 461 uydunun yörünge şekli (JPL ortalama elemanlar).
> - **Asteroit kuşağı:** çapı ölçülmüş 127 488 ana kuşak asteroidi (SBDB). Tek epoch'lu iki cisim modeli 2025–2035 boyunca 0,01 au kriterini sağlamadı. Kullanıcının kararı: en büyük 1997 asteroit (H < 12) için Horizons'tan yıllık elemanlar; geri kalanlar yalnızca epoch ± 1 yıl içinde gösterilir (`src/asteroids.js`). Test GEÇTİ (`tests/asteroids.mjs`): büyüklerde en büyük hata 0,00086 au (129 000 km), diğerlerinde 0,0031 au. Not: 365 asteroidin SBDB epoch'u 2010 civarı (yörüngesi güncellenmemiş). Bu kural gereği bunlar 2025–2035'te gösterilmez.

1. **Veri hattı.** Horizons'tan gezegen ve büyük uyduların konum ve hızları, JPL SSD ile NSSDCA'dan fiziksel değerler çekilir. Her veri dosyası JSON olarak, kaynak bilgisiyle kaydedilir.
2. **Doğruluk testi.** Yörüngeyi bizim kodumuzla hesaplarız ve Horizons'un aynı tarih için verdiği konumla karşılaştırırız. Fark belirlenen eşiğin altında kalmalı.
3. **Görsel.** Güneş, 8 gezegen, büyük uydular, cüce gezegenler ve asteroit kuşağı (SBDB). Gerçek ölçek ile okunabilir ölçek arasında geçiş yapılabilir; okunabilir ölçek "temsilî" diye etiketlenir.
4. **Zaman kontrolü:** tarih seçme, hızlandırma, geri sarma.

#### Görsel motor: yeni nesil, sinematik (kullanıcının isteği)
Hedef "gözalıcı" bir görüntü. Görüntüdeki her **veri** NASA'dan gelir (konum, boyut, eğiklik, doku, renk). **Kamera ve ışık işleme** (pozlama, parlama, ton eşleme) ise görselleştirme tercihidir ve böyle belgelenir.

**İlk sürümde olanlar (3 Kasım 2026):**
- Three.js 0.187.0, WebGL2 (`vendor/three`). Planlanan WebGPU yerine WebGL2 seçildi: özel gölgelendiriciler GLSL ile daha güvenilir yazılıyor. WebGPU'ya geçiş açık iş olarak duruyor.
- Kamera merkezli çizim, logaritmik derinlik, HDR (yarım kayan nokta), AgX ton eşleme, parlama, otomatik pozlama.
- Yönelim: NAIF pck00011 (`src/orientation.js`, `tests/orientation.mjs`). Dünya'da ekinoks anında Güneş enlemi 0,002°; öğle boylamı 1,95° (zaman denklemi ≈ 1,9°).
- 15 NASA dokusu (`tools/build_textures.py`, `data/textures.json`): Trek mozaikleri (Merkür, Mars, Io, Europa, Ganymede, Enceladus, Vesta), Blue Marble ve Black Marble, CGI Moon Kit, Cassini Jüpiter haritası, NASA 3D Resources (Satürn, Neptün, Plüton). Gökyüzü: SVS Deep Star Maps 2020. Haritanın yönü veriden doğrulandı: en parlak bölge Samanyolu merkezi.
- Haritası olmayan cisimler: Uranüs ve Venüs için NASA renkli fotoğraflarından ortalama renk (`tools/sample_colors.py`). Diğerleri, varsa JPL albedosu parlaklığında, nötr gri.
- Işık: Güneş yüzey parlaklığı (au/R☉)², havasız cisimlerde Lommel–Seeliger, uydu gölgeleri ve tutulmalar (uzatılmış Güneş diski), Satürn halka gölgeleri ve gezegenin halkalara düşen gölgesi.
- Dünya atmosferi: Rayleigh + Mie ışın yürütme; gece ışıkları.
- Asteroit kuşağı GPU'da (127 488 nokta, Kepler çözümü gölgelendiricide).
- Arayüz: cisim listesi, bilgi paneli (kaynak ve uyarılarla), zaman çubuğu, katman anahtarları, "Kaynaklar" penceresi.

**Güzelleştirme turu (3 Kasım 2026):**
- **Satürn halkaları:** optik derinlik NASA PDS Rings'teki Cassini RSS Rev007 X bandı profilinden geliyor (`tools/build_ring_profile.py`, 288 954 ölçüm → 8192 adım; geçirgenlik ortalaması). Renk Cassini doğal renk görüntüsü PIA06485'ten. Karıncalanmaya karşı, geçirgenlik ortalamasıyla elle üretilen mipmap'ler var.
- **Dünya:** okyanus maskesi NASA GIBS MODIS Water Mask'tan; Güneş yansıması GGX ile, F0 = 0,02. Bulut katmanı türetilmiş (`tools/build_clouds.py`): üç VIIRS uydusunun 30 Ekim 2026 görüntüsünün ortancası ile Blue Marble yüzeyi arasındaki parlaklık farkından. Kar ve buz üzerinde örtü "bilinmiyor = 0".
  - İlk deneme olan MODIS "bulut oranı" ürünü elendi: ekvatorda uydu şeridi boşlukları vardı ve değerler çok yerde %100'e doyuyordu.
  - NASA'nın Blue Marble bulut haritası, eski Earth Observatory sunucusu yanıt vermediği için alınamadı.
- **Kabartma** (`tools/build_normals.py`, gerçek ölçek): Ay için CGI Moon Kit LOLA yüksekliği (−9,0 … +10,7 km), Mars için PDS MOLA MEGDR (−8,2 … +21,2 km). Mars'ın hizası Olympus Mons ile doğrulandı. Normal haritası öz-gölgelemeyi bilmediği için kabartma geometrik terminatörün birkaç derece ötesinde kesiliyor.
- **Uydu albedoları:** NSSDCA bilgi kartlarından (`tools/fetch_moon_albedo.mjs`, `data/moon_albedo.json`). Iapetus iki tonlu (0,05 / 0,5); ortalaması kullanılıyor.

**Bilinen sorunlar ve açık işler:**
- **Venüs:** NASA 3D dokusu Magellan radar haritası (görünür değil); şu an bulut rengiyle düz çiziliyor. Radar yüzeyi isteğe bağlı katman olabilir.
- **Satürn dokusu** (NASA 3D Resources) çok doygun renkli; Cassini kaynaklı bir harita aranmalı. **Neptün dokusu** sanatsal yorum olabilir; doğrulanmalı.
- Halka albedosu hâlâ NSSDCA bölge aralıklarının orta değeri. Halka profili radyo dalga boyunda; görünür ışıkta C ve F halkaları farklı görünebilir.
- Dünya bulutları tek bir güne ait; tarih değişince değişmiyor. GIBS'ten tarihe göre bulut yüklemek mümkün.
- Ay'ın gece tarafında "Dünya ışığı" (earthshine) yok. Mars, Titan ve Venüs atmosferleri yok.
- Gerçek ölçek / okunabilir ölçek anahtarı henüz yok (şu an hep gerçek ölçek; küçük cisimler etiketle gösteriliyor).
- Performans ölçümü (60 fps hedefi) ve mobil denemesi yapılmadı.
- Görsel tercihlerin değerleri `src/app.js` içindeki `VIS` nesnesinde: pozlama, gece ışıkları, yıldız ve kuşak görünürlüğü, Güneş diskinin ekran parlaklığı sınırı.

- **Motor:** Three.js, WebGPU oluşturucusuyla (desteklemeyen tarayıcıda otomatik WebGL2). Build adımı yok; kütüphane sürümü sabitlenmiş olarak projeye konur.
- **Ölçek sorunu:** Güneş Sistemi metre ile milyar kilometre arasında. Kamera merkezli çizim (kayan merkez noktası) ve logaritmik derinlik tamponu kullanılır; konumlar float64 ile hesaplanıp kameraya göre float32'ye indirilir.
- **Işık:** tek ışık kaynağı Güneş. Parlaklık uzaklığın karesiyle azalır; HDR görüntü, otomatik pozlama, AgX ton eşleme ve parlama (bloom) ile ekrana getirilir.
- **Atmosfer:** fiziksel tabanlı saçılma (Rayleigh + Mie). Ölçek yüksekliği gibi atmosfer değerleri NASA bilgi kartlarından alınır (ör. Dünya 8,5 km).
- **Dünya:** Blue Marble gündüz yüzeyi, gece ışıkları (Black Marble), bulut katmanı, okyanus yansıması, alacakaranlık çizgisi.
- **Halkalar:** Satürn halkalarının parlaklığı ve geçirgenliği Cassini ölçümlerinden (PDS). Halkaların gezegene, gezegenin halkalara düşen gölgesi çizilir.
- **Gölgeler:** uyduların gezegene düşen gölgeleri ve tutulmalar gerçek konumlardan hesaplanır.
- **Gökyüzü:** SVS Deep Star Maps 2020 HDR yıldız haritası (Hipparcos-2, Tycho-2, Gaia DR2; ESA kaynakları belirtilir).
- **Dokular:** her cisim için NASA kaynağı, çözünürlüğü ve atfı `data/textures.json` içinde kayıtlı olur. Bulunan adaylar: Jüpiter, Cassini PIA07782; Satürn, Cassini mozaikleri ve NASA 3B modeli; Mars, Viking (NASA sitesinde, USGS işlemesi); Ay, LRO CGI Moon Kit; Dünya, Blue Marble. Dosyalar tek tek açılıp doğrulanacak.
- **Kalite ölçütü:** her gezegene yakından bakıldığında NASA görüntüleriyle yan yana karşılaştırılır; 60 fps hedefi orta sınıf bir ekran kartında ölçülür.

### Aşama 2: Komşu yıldızlar ve yıldız sistemleri
- Exoplanet Archive'dan yakın sistemler: Proxima Cen ve Barnard yıldızından başlanır.
- Yıldızın rengi ve boyutu katalogdaki sıcaklık ve yarıçaptan hesaplanır.
- Gezegenin yörüngesi katalogdaki yarı büyük eksen, dış merkezlik ve periyottan çizilir.
- Katalogda olmayan değerler gösterilmez.

### Aşama 3: Samanyolu
- Gaia DR3 (IRSA) yıldızlarıyla Güneş'in çevresi kurulur.
- Galaksinin genel yapısı NASA kaynaklı görsel ve verilerle "temsilî" olarak işaretlenerek gösterilir.
- Gargantua, buradaki kara delik sahnesi olarak bağlanır.

### Aşama 4: Evren
- NED'den galaksi konumları ve kırmızıya kaymaları alınır.
- LAMBDA'dan kozmik arka plan ışıması ve kozmolojik parametreler alınır.

---

## 3. Veri sorgularken öğrenilenler
- **Exoplanet Archive TAP:** `top N` ile `order by` birlikte kullanılırsa sıralama sonuçlar kesildikten *sonra* yapılıyor. "En yakın 3 sistem" sorgusu yanlış sonuç döndü (55 Cnc, 12,6 pc). Sorgu `where sy_dist<3 order by sy_dist` olarak yazılınca doğru sonuç geldi: Proxima Cen (1,30 pc) ve Barnard yıldızı (1,83 pc).
- **JPL yaklaşık gezegen elemanlarının referans noktası gezegene göre değişiyor.** Sayfada hepsi "Güneş merkezli" yazıyor. Uranüs ve Neptün bu ölçütte JPL'nin kendi hata sınırını aştı (Neptün: λ 28,7″, sınır 10″). Hata ortalaması sıfır olan ±60″'lik bir salınımdı; sebebi Güneş'in kütle merkezi etrafındaki ~700 000 km'lik salınımı. Güneş Sistemi'nin kütle merkezine göre karşılaştırınca ikisi de sınır içinde kaldı (Neptün 6,4″). İç gezegenler ise yalnızca Güneş merkezli ölçütte sınır içinde. Test iki referansı da raporluyor.
- **Horizons** varsayılan olarak km ve km/s verir. Merkez `500@10` (Güneş merkezi), referans düzlemi ekliptik ve J2000'dir.
- **Horizons TLIST** ile istenen anlar sıralanmış olarak geri dönüyor. Satırları istek sırasıyla eşleştirmeyin; her satırın kendi JD değerini kullanın.
- **Horizons tarayıcıdan çağrılamıyor** (CORS başlığı yok; SBDB API de aynı). Bütün veri önceden indirilir.
- **JPL uydu ortalama elemanları konum hesabı için değil.** JPL sayfası açıkça uyarıyor. Bu elemanlar yalnızca yörüngenin şeklini çizmek için kullanılıyor; uydu konumları Horizons tablolarından geliyor.
- **İç içe sistemler ayrı izlenmeli.** Plüton'un Güneş'e göre konumunda 30 günlük adımla 13 000 km ara değer hatası çıktı: Charon, Plüton'u 6,4 günde bir ~2100 km sallıyor. Doğrusu: sistemin kütle merkezi Güneş etrafında, gezegen ve uyduları da o merkeze göre ayrı ayrı izlenir.
- **Horizons küçük cisimleri sorgu anında integrasyonla hesaplıyor; uzun sorgularda hata birikiyor.** Haumea'nın tek parça 1800–2050 sorgusu, aynı anlar için kısa sorgulara göre 1827'de 0,07 km, 1964'te 6 km, 2046'da 13 km farklı çıktı. 10 yıllık parçalarla indirilince fark 0,6 km'nin altına indi. Gezegenler, uydular ve Plüton sistem kütle merkezi sabit NASA dosyalarından (DE441, uydu SPK'ları) geldiği için bu sorun onlarda yok.
- **Horizons eşzamanlı sorgulara 503 ("meşgul") yanıtı veriyor.** 4 paralel sorgu sürekli reddedildi. Sorgular tek tek gönderilmeli.
- **Horizons'ta uzun cisim adlarında** "Target body name" satırında addan sonra tek boşluk geliyor (ör. "5687 Yamamotoshinobu (1991 AB1) {source…").
- **SBDB Query API elemanları varsayılan olarak yuvarlıyor** (a = 2.766 gibi). `full-prec=true` şart.
- **Asteroitlerde iki cisim yaklaşımı yalnızca epoch'a yakın zamanlarda yeterli.** SBDB elemanlarının epoch'u 2026-05 (JD 2461200,5). 60 asteroitlik ölçümde en büyük hata: ±1 yılda 0,0034 au, ±2 yılda 0,018 au, ±3 yılda 0,05 au (Jüpiter'in çekimi). 2025–2035 için konulan 0,01 au kriteri tutmadı (`tests/asteroids.mjs` KALDI).
- **SBDB tablolarında sayı olmayan hücreler var:** "n/a", "-", boş hücre ve "<0.0002" gibi üst sınırlar. Bunlar `null` ya da `upper_limit` olarak saklanıyor, hiçbiri uydurulmuyor.
