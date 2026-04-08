# AI Panorama Modal — Camera Capture Tab

**Date:** 2026-04-08
**Target file:** [components/AIPanoramaModal.tsx](../../../components/AIPanoramaModal.tsx)
**Status:** Approved, implementation pending

## Problem

`AIPanoramaModal` currently only accepts photos via file picker (4–16 images from disk). Mobile users have no way to capture photos directly with their device and feed them into the AI panorama flow. The existing `PanoramaCaptureModal` is a separate feature (guided Three.js sphere capture with client-side equirectangular export) and must **not** be modified.

## Goal

Add a **Camera** tab inside `AIPanoramaModal` that lets mobile users capture exactly **16 photos** at fixed sphere points using device orientation, then hand them to the existing AI panorama endpoint for stitching.

## Non-goals

- Do **not** touch `components/panorama-capture/` or `PanoramaCaptureModal.tsx`.
- No client-side stitching (no OpenCV.js, no manual feature matching). AI does the stitching.
- No desktop capture flow (gyro-only). Desktop users continue using the file picker tab.
- No preview of captured photos on the sphere (v2).
- No EXIF / orientation metadata writing.

## Constraints

- **FOV:** 53° horizontal (derived vertical FOV from camera aspect).
- **Point count:** Exactly 16, no overlap-heavy layouts.
- **Layout:** 4-8-4 (top ring / middle ring / bottom ring).
- **Capture mode:** Tap-to-capture only (no auto-capture).
- **Memory:** Blobs only in RAM (Map<pointId, Blob>), no Three.js texture patches on the sphere.
- **Research freshly:** Do not copy logic from `components/panorama-capture/`. Research current (2026) Three.js, `DeviceOrientationEvent`, and `getUserMedia` APIs from scratch.

## File Structure

```
components/
  AIPanoramaModal.tsx                  ← EDIT: minimal tab switcher + state
  panorama-ai-capture/                  ← NEW folder (isolated from existing panorama-capture/)
    CameraCaptureTab.tsx                ← Main camera UI component
    SpherePointsScene.ts                ← Three.js scene: sphere + 16 point markers
    useDeviceOrientationV2.ts           ← DeviceOrientationEvent + iOS 13+ permission
    useCameraStreamV2.ts                ← getUserMedia + captureFrame → Blob
    guide-points-16.ts                  ← 16-point layout math (4-8-4)
```

Nothing under `components/panorama-capture/` is read, imported, or modified.

## Component Architecture

### `AIPanoramaModal.tsx` (minimal edit)

New state:
```ts
const [activeTab, setActiveTab] = useState<'file' | 'camera'>('file');
const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
```

New tab switcher header with two buttons: `[Dosya Yükle]` `[Kamera]`. The camera tab is disabled (with tooltip "Sadece mobil cihazlarda") when gyro is unavailable.

`handleGenerate` uses `activeTab === 'camera' ? capturedFiles : files` as its file source. All other AI generation logic is untouched.

Camera tab body:
```tsx
{activeTab === 'camera' && (
  <CameraCaptureTab onFilesReady={setCapturedFiles} onError={setError} />
)}
```

### `CameraCaptureTab.tsx` (new, ~300 lines)

Responsibilities:
- Mount Three.js canvas + camera `<video>` overlay.
- Request gyro permission on first user interaction (iOS 13+ requires interaction-triggered).
- Start `getUserMedia` stream, bind to `videoRef`.
- RAF loop: feed device orientation → scene camera → compute active point.
- Render HUD: counter (`N/16`), progress bar, large `[Çek]` button, `[Tamamla]` button (disabled until 16/16), `[Sıfırla]`.
- On `[Çek]`: if active point exists and not yet captured → `captureFrame()` → Blob → update `capturedBlobs` map → mark point green in scene.
- On `[Tamamla]`: convert all blobs to `File[]` in point order → `onFilesReady(files)`.
- On unmount or tab leave: dispose everything (scene, stream, blobs, listeners).

Props:
```ts
interface CameraCaptureTabProps {
  onFilesReady: (files: File[]) => void;
  onError: (message: string) => void;
}
```

### `SpherePointsScene.ts` (new Three.js class)

Responsibilities:
- Create `WebGLRenderer` with `antialias: false`, `powerPreference: 'low-power'`, `pixelRatio` capped at 2.
- Wireframe `SphereGeometry` (radius 5, 32×16 segments), semi-transparent material.
- 16 `Sprite` markers at the fixed point positions (converted from yaw/pitch to XYZ via `sphericalToCartesian`).
- Sprite colors: gray (not captured), yellow (active/aimed), green (captured).
- `PerspectiveCamera` with **horizontal FOV 53°** (`fov_v = 2 * atan(tan(deg2rad(53/2)) / aspect)`).
- Methods:
  - `updateCameraFromDevice(alpha, beta, gamma)` — quaternion composition from Euler device angles.
  - `getActivePointId(threshold = 15)` — returns nearest point within angular threshold, or `null`.
  - `markCaptured(pointId)` — sprite color → green.
  - `resetCaptured()` — all sprites back to gray.
  - `dispose()` — geometries, materials, textures, renderer, canvas DOM removal.
- WebGL context loss handler: stops RAF, fires `onContextLost` callback.

Code comment at the top:
```ts
// v2: render captured photo textures on their markers instead of just color change.
// Currently only color-change for memory (~150KB × 16 ≈ 2.4MB as Blobs in RAM,
// vs. adding texture uploads which can push mobile Safari over GPU limits).
```

### `useDeviceOrientationV2.ts`

Fresh implementation from current MDN / W3C DeviceOrientationEvent spec:
- `window.addEventListener('deviceorientation', handler)`.
- On iOS 13+: check `typeof DeviceOrientationEvent.requestPermission === 'function'`, call inside user gesture.
- Expose: `{ orientation: { alpha, beta, gamma } | null, permissionState: 'unknown' | 'granted' | 'denied' | 'unsupported', requestPermission: () => Promise<void> }`.
- Use `absolute` event variant if available (magnetometer).
- Cleanup on unmount.

### `useCameraStreamV2.ts`

Fresh implementation:
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })`.
- Expose: `{ videoRef, isActive, isStarting, error, start(), stop(), captureFrame(): Promise<Blob | null> }`.
- `captureFrame()`: draw current video frame to an offscreen canvas → `canvas.toBlob('image/jpeg', 0.85)`.
- `stop()`: stop all tracks, set `video.srcObject = null` (WebKit memory leak fix), dispose offscreen canvas.

### `guide-points-16.ts`

```ts
export interface GuidePoint {
  id: string;       // e.g. 'mid-0', 'top-2'
  yaw: number;      // degrees, 0 = +Z forward
  pitch: number;    // degrees, 0 = horizon, +up
}

export const GUIDE_POINTS_16: GuidePoint[] = [
  // Middle ring (pitch 0°), 8 points, 45° apart
  { id: 'mid-0', yaw: 0,   pitch: 0 },
  { id: 'mid-1', yaw: 45,  pitch: 0 },
  { id: 'mid-2', yaw: 90,  pitch: 0 },
  { id: 'mid-3', yaw: 135, pitch: 0 },
  { id: 'mid-4', yaw: 180, pitch: 0 },
  { id: 'mid-5', yaw: 225, pitch: 0 },
  { id: 'mid-6', yaw: 270, pitch: 0 },
  { id: 'mid-7', yaw: 315, pitch: 0 },
  // Top ring (pitch +60°), 4 points, 90° apart
  { id: 'top-0', yaw: 0,   pitch: 60 },
  { id: 'top-1', yaw: 90,  pitch: 60 },
  { id: 'top-2', yaw: 180, pitch: 60 },
  { id: 'top-3', yaw: 270, pitch: 60 },
  // Bottom ring (pitch -60°), 4 points, 90° apart
  { id: 'bot-0', yaw: 0,   pitch: -60 },
  { id: 'bot-1', yaw: 90,  pitch: -60 },
  { id: 'bot-2', yaw: 180, pitch: -60 },
  { id: 'bot-3', yaw: 270, pitch: -60 },
];

export function angularDistance(
  yaw1: number, pitch1: number,
  yaw2: number, pitch2: number
): number { /* spherical distance in degrees */ }

export function yawPitchToCartesian(
  yaw: number, pitch: number, radius: number
): { x: number; y: number; z: number } { /* ... */ }
```

## Data Flow

```
[1] User opens AIPanoramaModal
[2] User clicks "Kamera" tab
[3] CameraCaptureTab mounts
    - Requests gyro permission (iOS interaction gesture)
    - Starts getUserMedia stream
    - Creates SpherePointsScene, mounts canvas
    - Starts RAF loop
[4] User rotates device
    - deviceorientation → scene.updateCameraFromDevice
    - scene.getActivePointId → HUD shows "aktif nokta" marker in yellow
[5] User taps [Çek]
    - useCameraStreamV2.captureFrame() → Blob
    - capturedBlobs.set(activePointId, blob)
    - scene.markCaptured(activePointId)
    - counter: N/16
[6] Repeat until 16/16
[7] User taps [Tamamla]
    - Convert Map<pointId, Blob> → File[] (ordered by GUIDE_POINTS_16 sequence)
    - onFilesReady(files)
[8] AIPanoramaModal.handleGenerate() runs (UNCHANGED)
    - POST /api/panorama/generate with 16 files (UNCHANGED ENDPOINT)
    - AI returns stitched panorama
    - onPanoramaReady → TourEditor adds scene
```

The existing `/api/panorama/generate` endpoint requires 4–16 images — 16 fits. No server-side changes.

## Memory & Lifecycle

- **Blobs:** Stored in `Map<string, Blob>` keyed by `pointId`. Estimated size: 16 × ~150 KB @ JPEG quality 0.85 ≈ **2.4 MB** total.
- **Three.js disposal:** On unmount, `scene.dispose()` walks the scene graph and calls `.dispose()` on every `Geometry`, `Material`, `Texture`, then disposes the renderer and removes the canvas from the DOM.
- **Camera stream disposal:** Stop all tracks, then `video.srcObject = null` (Safari leak fix).
- **Event listener cleanup:** `deviceorientation` listener removed in `useEffect` cleanup.
- **Tab switching:** When the user switches from Camera → File tab, the camera stream is stopped and scene is disposed. Captured blobs are preserved in a ref until the modal closes (so accidentally switching tabs doesn't lose work). Warning dialog if user tries to close modal with uncommitted captures.
- **Recapture:** Tapping an already-captured point replaces its blob (old one is GC'd when the Map reference is dropped).

## Error Handling & Fallback

| Scenario | Behavior |
|---|---|
| No gyro (desktop) | Camera tab button shows "Sadece mobil" label, tab disabled, file tab remains active. |
| Gyro permission denied | Inline error card with "Tekrar Dene" button that re-calls `requestPermission()`. |
| Camera permission denied | Inline error card: "Kamera izni gerekli. Tarayıcı ayarlarından verin." |
| getUserMedia fails (no device) | Inline error: "Kamera bulunamadı." |
| WebGL context lost | Scene disposed, message "GPU bağlantısı kesildi, tabı yenileyin." Captured blobs preserved. |
| User taps [Çek] with no active point | Button disabled; HUD shows "Bir noktayı hedefleyin". |
| User taps [Tamamla] before 16/16 | Button disabled; counter shown as "12/16 kaldı". |
| Tab switch with uncommitted captures | Captures kept in ref; re-entering Camera tab restores them. |
| Modal close with uncommitted captures | Confirmation dialog: "N çekim kaybolacak, devam?" |

## Manual Testing Checklist

Automated tests are **not** written for this feature (user request). The user will perform manual testing on a mobile device and report back. Use this checklist during testing:

### Permissions & Startup
1. **iOS 13+ gyro prompt:** Open the Camera tab — does iOS show the motion permission prompt on first tap?
2. **Android gyro:** Does the sphere respond to device rotation without a prompt?
3. **Camera permission prompt:** Does the browser show the camera prompt on Camera tab open?
4. **Permission denied recovery:** Deny camera, then re-grant from browser settings — does the tab recover without a page reload?
5. **No gyro device (desktop):** On desktop Chrome, is the Camera tab visibly disabled with the correct tooltip?

### Sphere & Markers
6. **16 markers visible:** Are all 16 sphere points rendered and visible when rotating 360°?
7. **Layout verification:** Are middle-ring markers evenly spaced every 45°? Are top/bottom at ±60° pitch?
8. **Active marker highlight:** When you aim at a marker (within 15°), does it turn yellow?
9. **Captured marker highlight:** After capturing, does the marker turn green and stay green as you move away?
10. **No double-activation:** If two markers are close, does only the closest one become active?

### Capture
11. **[Çek] disabled without active point:** With no marker in range, is the capture button disabled?
12. **Successful capture:** Does tapping [Çek] on an active point increment counter (e.g. "1/16") and turn marker green?
13. **Recapture:** Tapping [Çek] again on an already-green marker — does it replace the blob (no duplicate)? Counter stays at current value?
14. **All 16 captures:** Can you complete all 16 captures without errors?
15. **[Tamamla] enables at 16/16:** Is the complete button disabled until exactly 16 captures?

### Memory & Performance
16. **Mobile Safari stability:** Capture all 16, then close the modal — does the page stay responsive (no white screen or reload)?
17. **Repeat cycle:** Can you open/close the Camera tab 5 times in a row without slowdown?
18. **Camera stream stops on close:** After closing the modal, does the device camera indicator turn off?
19. **Video frame memory:** After capturing 16 photos, is memory usage reasonable (< 30 MB extra vs. before)?
20. **Tab switching:** Switch to File tab and back — are previously-captured blobs still present?

### Integration with AI Flow
21. **Generate succeeds:** After [Tamamla], does the existing AI generation start?
22. **Correct file count:** Does the `/api/panorama/generate` request payload contain exactly 16 files?
23. **File ordering:** Is the order consistent (middle ring first, then top, then bottom)?
24. **Final panorama:** Does the AI return a usable panorama and does it load into `TourEditor`?

### Edge Cases
25. **Portrait / landscape rotation:** Does the preview scale correctly if the device is rotated mid-capture?
26. **Background / foreground:** Put the browser in background, return — does the stream resume or error gracefully?
27. **Low battery / thermal throttling:** Any visible FPS drop that makes capture unusable?
28. **Close modal mid-capture:** Does the "N çekim kaybolacak" warning appear?

Report results as: `#N: PASS / FAIL — note`. Failed items become follow-up fixes.

## Open Questions

- None at design time. Any unknowns will surface during implementation research (Three.js current API, iOS 13+ DeviceOrientationEvent edge cases) and be resolved inline.

## Out of Scope (Future v2)

- Rendering captured photo thumbnails on sphere markers (memory cost: extra ~32 MB of GPU textures).
- Auto-capture when user dwells on a point (mirrors existing `PanoramaCaptureModal` logic).
- Undo / single-point retake UI separate from re-tapping a green marker.
- Fibonacci 32-point layout for higher-fidelity panoramas.
- Client-side preview of AI output before committing to scene.
