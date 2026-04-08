# Sphere Panorama Capture — Design Spec

**Tarih:** 2026-04-07  
**Durum:** Onay bekliyor  
**Dosya:** `components/PanoramaCaptureModal.tsx` (tamamen yeniden yazılacak)

## Ozet

Mevcut OpenCV-based frame stitching mekanizmasini kaldirip yerine Three.js tabanli kure ici panorama capture araci yaziyoruz. Kullanici telefonunu cevirirken DeviceOrientation ile yon takibi yapilir, kare cektikce kurenin ilgili bolgesi gercek zamanli doldurulur, sonucta equirectangular JPEG export edilir.

## Kararlar

| Karar | Secim |
|-------|-------|
| Kapsama hedefi | Tam 360 derece, ama zorunlu degil — eksik yerler koyu gri ile doldurulur |
| Capture modu | Hibrit — guide noktalarina hizalaninca otomatik cekim + manuel buton yedek |
| Guide dagitimi | Adaptif — yatay orta serit (8 nokta) ile baslar, tamamlandikca ust/alt acilir |
| Gercek zamanli guncelleme | Evet — her kare aninda kureye boyanir, kullanici gorur |
| Yaklasim | Three.js Sphere Patch Meshes + CubeCamera Export (Yaklasim 2) |

## Mimari

### Dosya Yapisi

```
components/
  PanoramaCaptureModal.tsx          <- ana bileşen (yeniden yazılacak)
  panorama-capture/
    useDeviceOrientation.ts         <- DeviceOrientation hook
    useCamera.ts                    <- getUserMedia hook
    SphereCaptureScene.ts           <- Three.js sahne yönetimi (class)
    guide-points.ts                 <- adaptif guide noktaları hesaplama
    equirect-export.ts              <- CubeCamera → equirectangular export
```

### SphereCaptureScene (Three.js sahne sinifi)

Class-based yaklasim, React state ile karistirmamak icin. Ref uzerinden yonetilir.

```
class SphereCaptureScene {
  // Three.js core
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  
  // Kure
  backgroundSphere: Mesh          // inside-out, koyu gri base texture
  patchMeshes: Map<string, Mesh>  // her capture icin bir patch mesh
  
  // Guide markers
  guideMarkers: Map<string, Mesh> // kucuk kure/ring, turuncu=bekliyor, yesil=cekildi
  activeLevel: 1 | 2 | 3         // adaptif seviye
  
  // Methods
  constructor(container: HTMLElement)
  updateCameraOrientation(alpha: number, beta: number, gamma: number): void
  addPatch(frameTexture: CanvasTexture, yaw: number, pitch: number, hfov: number, vfov: number): void
  getGuidePoints(): GuidePoint[]
  getNearestGuide(yaw: number, pitch: number): GuidePoint | null
  isAlignedToGuide(yaw: number, pitch: number, threshold: number): GuidePoint | null
  markGuideComplete(id: string): void
  advanceLevel(): boolean              // ust/alt seviye ac, true=acildi
  exportEquirectangular(width: number, height: number): Promise<Blob>
  getCoveragePercent(): number
  dispose(): void
}
```

### Patch Mesh Geometrisi

Her capture bir kure dilimi (spherical rectangle) mesh olusturur:

```
Girdi: yaw, pitch, hfov (~65 derece), vfov (~50 derece)
Cikti: SphereGeometry parcasi (phiStart, phiLength, thetaStart, thetaLength)

- phiStart   = yaw - hfov/2 (yatay baslangic)
- phiLength  = hfov (yatay aciklik)
- thetaStart = PI/2 - pitch - vfov/2 (dikey baslangic)
- thetaLength = vfov (dikey aciklik)
- radius = buyuk (ornegin 500), kamera merkezde
- material.side = BackSide (icten gorunsun)
- material.map = captured frame texture
```

UV mapping otomatik olarak SphereGeometry tarafindan yapilir — frame texture dogru yere oturur.

### Guide Noktalari (Adaptif)

```
Seviye 1 (baslangic):
  Yatay orta serit, pitch=0, 8 nokta (0, 45, 90, 135, 180, 225, 270, 315 derece yaw)
  
Seviye 2 (Seviye 1 %75+ tamamlaninca acilir):
  Ust serit, pitch=+45, 6 nokta (0, 60, 120, 180, 240, 300 derece yaw)
  
Seviye 3 (Seviye 2 %75+ tamamlaninca acilir):
  Alt serit, pitch=-45, 6 nokta (0, 60, 120, 180, 240, 300 derece yaw)
```

Toplam: 20 guide noktasi maximum

### Otomatik Cekim Mantigi

```
Her animation frame'de:
1. Mevcut (yaw, pitch) al
2. En yakin guide noktasini bul
3. Mesafe < threshold (15 derece) ise:
   a. UI'da "hizalandi" gostergesi goster
   b. 0.5 sn stabil kaldiysa (hareket < 3 derece):
      - Otomatik cek
      - Titresim (navigator.vibrate) + ses efekti
      - Guide'i yesile cevir
4. Manuel buton her zaman aktif (guide disinda da cekim yapilabilir)
```

### Equirectangular Export

```
1. CubeCamera olustur (position: 0,0,0 — kurenin merkezi)
   - cubeRenderTarget: WebGLCubeRenderTarget(2048)
   
2. CubeCamera.update(renderer, scene) → 6 yuzlu cubemap

3. Cubemap → equirectangular donusum:
   - Fullscreen quad + equirectangular shader
   - Shader: cubemap texture sample ederek equirect koordinatlarina yazar
   - Sonuc: WebGLRenderTarget(4096, 2048)
   
4. renderer.readRenderTargetPixels() → ImageData → canvas → toBlob('image/jpeg')

5. Bos alanlar: backgroundSphere koyu gri oldugu icin otomatik doldurulmus olur
```

### useDeviceOrientation Hook

```typescript
interface OrientationData {
  alpha: number;    // 0-360, compass heading (yaw)
  beta: number;     // -180..180, on-arka egilme (pitch)  
  gamma: number;    // -90..90, sag-sol egilme (roll)
  absolute: boolean;
}

interface UseDeviceOrientationReturn {
  orientation: OrientationData | null;
  permissionState: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';
  requestPermission: () => Promise<boolean>;
}
```

iOS 13+ icin `DeviceOrientationEvent.requestPermission()` handle eder.

### useCamera Hook

```typescript
interface UseCameraReturn {
  videoRef: RefObject<HTMLVideoElement>;
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  captureFrame: () => HTMLCanvasElement | null;  // video'dan canvas'a cek
}
```

facingMode: environment, 1920x1080 ideal, HTTPS kontrolu.

## UI Tasarimi

### Layout (mobil-first, tam ekran)

```
+------------------------------------------+
| [X] 360 Panorama Capture    %45 kapsama  |  <- header, kapsama yuzdesi
+------------------------------------------+
|                                          |
|    Three.js Kure Sahnesi                 |  <- kullanici kurenin icini gorur
|    (guide noktalar + patch'ler)          |     telefonu cevirdikce sahne doner
|                                          |
|    +------------------+                  |
|    | Kamera Overlay   |                  |  <- yari saydam kamera feed
|    | (center aligned) |                  |     kurenin ortasinda gosterilir
|    +------------------+                  |
|                                          |
|    [Hizalandi! Sabit tutun...]           |  <- guide hizalama bildirimi
|                                          |
+------------------------------------------+
| Seviye 1: [*][*][*][ ][ ][ ][ ][ ] 3/8  |  <- adaptif guide ilerlemesi
| Seviye 2: kilitli                        |
+------------------------------------------+
| [Kare Cek]              [Tamamla]        |  <- kontrol butonlari
| [Sifirla]                                |
+------------------------------------------+
```

### Kamera Overlay

- Kamera feed'i Three.js sahnesinin ortasina yari saydam (%60 opacity) overlay olarak konur
- Kullanici hem kurede nereye baktigini hem kameranin ne gordugunu ayni anda gorur
- Overlay boyutu: kamera FOV ile kuredeki gorunum acisi eslestirilir
- Kenarlarda hafif gradient fade (net sinir yerine yumusak gecis)

### Guide Hizalama Bildirimi

- Guide noktasina yaklasinca: "Noktaya yaklasiyorsunuz..." (sari)
- Hizalaninca: "Sabit tutun..." (yesil, countdown)
- Cekim yapilinca: "Cekildi!" (yesil flash) + titresim

### Tamamla Butonu

- Her zaman aktif (0 kare ile bile — bos panorama)
- Tiklayinca: "Eksik bolgeler koyu gri ile doldurulacak. Devam?" onay
- Onaylaninca: export pipeline calisir → onPanoramaReady() cagirilir
- 0 kare ile tamamlarsa uyari: "Hic kare cekilmedi, en az bir kare cekin"

### Desktop Layout

- Ayni layout ama Three.js sahnesi daha buyuk
- DeviceOrientation olmadigi icin mouse drag ile kureyi cevir
- Manuel capture butonu daha one cikar
- Desktop'ta gyroscope olmayacagi icin otomatik cekim calisMAZ, sadece manuel

## Veri Akisi

```
DeviceOrientation event
  → useDeviceOrientation hook
  → SphereCaptureScene.updateCameraOrientation()
  → Three.js kamera rotasyonu guncellenir
  → Nearest guide check
  → Aligned + stable → auto-capture trigger

Capture trigger (auto veya manuel):
  → useCamera.captureFrame() → HTMLCanvasElement
  → new CanvasTexture(canvas)
  → SphereCaptureScene.addPatch(texture, yaw, pitch, hfov, vfov)
  → Guide marker yesile donusur
  → Coverage % guncellenir
  → Adaptif seviye kontrolu

Tamamla:
  → SphereCaptureScene.exportEquirectangular(4096, 2048)
  → Blob → File
  → onPanoramaReady(file, sceneTitle)
  → Modal kapanir, TourEditor yeni sahneyi ekler
```

## Hata Durumlari

| Durum | Davranis |
|-------|----------|
| DeviceOrientation desteklenmiyor | Uyari goster, mouse drag mode'a gec (desktop) |
| iOS izin reddedildi | "Ayarlardan yeniden izin verin" mesaji |
| Kamera acilamiyor | Mevcut hata mesajlari korunur |
| WebGL desteklenmiyor | "Bu tarayici WebGL desteklemiyor" hata mesaji goster |
| Dusuk bellek (cok fazla patch) | 30+ patch'te uyari, her patch ~2-4MB GPU bellek |
| Export basarisiz | Try/catch, hata mesaji goster, tekrar dene butonu |

## Performans Hedefleri

- Patch ekleme: < 50ms (texture upload + mesh creation)
- Sahne render: 60fps (basit MeshBasicMaterial, no lighting)
- Export (4096x2048): < 3 saniye (CubeCamera render + readPixels)
- Toplam GPU bellek: < 200MB (20 patch x ~4MB + base textures)

## Kapsam DISI

- Video stream'den otomatik panorama (sadece tek kare capture)
- HDR / exposure blending
- Otomatik renk duzeltme (komsu patch'ler arasi)
- Stitching / feature matching (geometrik yerlestirme yeterli)
- Zenith/nadir (tam ust/tam alt) capture guide'i — sadece 3 yatay serit
