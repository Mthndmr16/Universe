# Universe

Tarayıcıda çalışan, gerçek ölçülere dayalı bir evren modeli. İlk aşama Güneş Sistemi; sırada yakın yıldız sistemleri, Samanyolu ve evrenin geri kalanı var.

**Tek kaynak NASA'nın açık verisi.** Ekrandaki her konum, boyut, yönelim, doku ve renk bir NASA kaynağından gelir ve kaynağına kadar izlenebilir: her veri dosyası indirildiği adresi, zamanı ve ham yanıtın SHA-256 özetini taşır. Veri olmayan yerde değer uydurulmaz. Görselleştirme tercihleri (pozlama, parlama, ölçek gibi) arayüzde "temsilî" diye etiketlenir.

## Neler var

- **Konumlar**
  - Gezegenler: JPL yaklaşık elemanları. Horizons (DE441) ile karşılaştırıldı ve JPL'nin kendi hata sınırları içinde.
  - Büyük uydular, gezegenlerin kütle merkezi kaymaları ve cüce gezegenler: Horizons tabloları. Ara değer hatası en fazla 1 km.
  - 127 488 ana kuşak asteroidi: JPL SBDB.
- **Yönelim:** NAIF pck00011 (kutup yönü, dönme, uydu düzeltme terimleri).
- **Görseller**
  - Yüzeyler: NASA Trek mozaikleri (MESSENGER, Viking, Galileo, Cassini, Dawn), Blue Marble ve Black Marble, LRO CGI Moon Kit, Cassini Jüpiter haritası.
  - Gökyüzü: NASA SVS Deep Star Maps.
- **Satürn halkaları:** Cassini radyo örtülme profili (NASA PDS Rings).
- **Kabartma:** Ay için LOLA, Mars için MOLA yükseklik modelleri. Gerçek ölçek, abartma yok.
- **Görüntü:** HDR, otomatik pozlama, gölgeler ve tutulmalar, Dünya atmosferi, okyanus yansıması.

## Çalıştırma

```bash
npx http-server -p 8766 -c-1
```

Sonra http://127.0.0.1:8766/ adresini aç. Build adımı yok; Three.js `vendor/` içinde.

## Testler

```bash
npm test                    # gezegenler ve konum tabloları
npm run test:asteroids      # asteroit kuşağı
npm run test:orientation    # kutup ve dönme
```

Her testin kriteri sonuçlar görülmeden önce belirlenir ve test dosyasının başında yazılıdır.

## Veriyi yeniden üretme

`tools/` altındaki betikler bütün veriyi NASA kaynaklarından yeniden indirir. Kaynakça, yöntemler ve bulunan tuzaklar `PLAN.md` dosyasında.

## Not

Bu proje NASA'nın açık verilerini kullanır; NASA tarafından onaylanmış ya da desteklenmiş değildir. NASA görsellerinde atıf kuralları için: https://www.nasa.gov/nasa-brand-center/images-and-media/ — Gaia, Hipparcos ve Tycho yıldız katalogları ESA kaynaklıdır (NASA SVS yıldız haritası üzerinden).

Three.js MIT lisanslıdır (`vendor/three/LICENSE`).
