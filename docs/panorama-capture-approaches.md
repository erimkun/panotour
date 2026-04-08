# 360 Panorama Capture — Yaklaşım Karşılaştırması

Kamera ile tarayıcı üzerinden 360° panorama oluşturma özelliği için değerlendirilen yaklaşımlar.

## Seçilen: Yaklaşım 2 — Three.js Sphere Patch Meshes + CubeCamera Export

Her kare çekildiğinde kürenin ilgili bölgesine bir "yama mesh" (küre dilimi) eklenir. Mesh'in texture'u çekilen kare, konumu DeviceOrientation'dan alınan yaw/pitch'e göre hesaplanır. Kullanıcı Three.js sahnesinde kürenin gerçek zamanlı dolduğunu görür. Export aşamasında CubeCamera ile cubemap render edilir ve equirectangular JPEG'e dönüştürülür.

**Neden bu seçildi:**
- Projede zaten Three.js v0.182 ve sphere pattern mevcut (VRPreviewPopup)
- Her patch standart bir Three.js Mesh — ekleme, çıkarma, debug kolay
- Gerçek zamanlı güncelleme doğal (mesh ekle → sahne otomatik render)
- CubeCamera → equirectangular dönüşümü Three.js'te standart operasyon
- Custom shader yazmaya gerek yok, MeshBasicMaterial + texture yeterli
- Telefon GPU'larında performanslı çalışır

---

## Alternatif: Yaklaşım 3 — WebGL Custom Shader Pipeline

Her frame için özel bir fragment shader yazılır. Shader, perspektif kamera görüntüsünü doğrudan equirectangular projeksiyon koordinatlarına dönüştürür. Tüm işlem GPU'da çalışır. Offscreen WebGLRenderTarget'a çizilir, sonuç sphere texture olarak gösterilir.

### Nasıl çalışır

```glsl
// Fragment shader: perspektif frame → equirectangular projeksiyon
uniform sampler2D uFrame;        // çekilen kare
uniform mat3 uRotationInv;       // kamera rotasyonunun tersi
uniform float uHFov;             // yatay FOV (radyan)
uniform float uVFov;             // dikey FOV (radyan)

void main() {
    vec2 uv = vUv; // 0..1 equirectangular koordinatları

    // Equirect → spherical
    float lon = uv.x * 2.0 * PI - PI;
    float lat = PI / 2.0 - uv.y * PI;

    // Spherical → 3D direction
    vec3 dir = vec3(
        cos(lat) * sin(lon),
        sin(lat),
        cos(lat) * cos(lon)
    );

    // World → camera frame
    vec3 camDir = uRotationInv * dir;

    // Kameranın arkası → atla
    if (camDir.z <= 0.0) discard;

    // Perspektif projeksiyon
    float fx = 1.0 / tan(uHFov / 2.0);
    float fy = 1.0 / tan(uVFov / 2.0);
    float u = fx * (camDir.x / camDir.z) * 0.5 + 0.5;
    float v = fy * (camDir.y / camDir.z) * 0.5 + 0.5;

    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;

    gl_FragColor = texture2D(uFrame, vec2(u, 1.0 - v));
}
```

### Akış

1. 4096×2048 WebGLRenderTarget oluştur (equirectangular canvas)
2. Her capture'da: frame → texture yükle, orientation → rotation matrix hesapla
3. Fullscreen quad üzerinde shader çalıştır → render target güncelle
4. Render target'ı sphere texture olarak göster
5. Export: render target'tan piksel oku → canvas → JPEG

### Artıları
- En hızlı (tüm projeksiyon GPU'da, piksel döngüsü yok)
- Matematiksel olarak en doğru (her piksel bireysel projekte)
- Seam/kenar geçişleri shader'da alpha blending ile pürüzsüz yapılabilir
- Tek bir render pass'te tüm frame boyandığı için bellek verimli

### Eksileri
- Custom GLSL shader yazımı ve debug'u karmaşık
- Three.js ShaderMaterial + RenderTarget yönetimi ek karmaşıklık
- Shader hataları runtime'da sessiz fail edebilir (siyah ekran)
- Farklı GPU'larda precision farkları sorun çıkarabilir
- Bakım maliyeti yüksek — shader kodu React/TS developer'lar için okunması zor

### Ne zaman tercih edilir
- Çok yüksek çözünürlük gerektiğinde (8K+ equirectangular)
- Çok sayıda frame ile çalışıldığında (100+ kare)
- Gerçek zamanlı video stream'den panorama oluşturulacaksa
- Profesyonel panorama capture ürünü geliştirilecekse

---

## Değerlendirme Özeti

| Kriter | Yaklaşım 2 (Patch Mesh) | Yaklaşım 3 (Shader) |
|--------|------------------------|---------------------|
| Performans | İyi (telefonda yeterli) | En iyi |
| Kod karmaşıklığı | Orta | Yüksek |
| Debug kolaylığı | Kolay (mesh inspectable) | Zor (shader opaque) |
| Bakım maliyeti | Düşük | Yüksek |
| Projeksiyon doğruluğu | İyi (küçük patch'lerde minimal hata) | Mükemmel |
| Mevcut proje uyumu | Yüksek (aynı pattern) | Düşük (yeni paradigma) |

Bu proje için Yaklaşım 2 doğru tercih. Yaklaşım 3, ileride profesyonel bir panorama capture ürünü yapılacaksa upgrade path olarak düşünülebilir.
