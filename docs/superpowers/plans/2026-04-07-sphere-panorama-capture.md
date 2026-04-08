# Sphere Panorama Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenCV-based panorama stitching with a Three.js sphere capture tool that paints camera frames onto a sphere in real-time, guided by device orientation.

**Architecture:** Class-based Three.js scene (`SphereCaptureScene`) manages the sphere, patches, and guide markers. React hooks (`useDeviceOrientation`, `useCamera`) handle device APIs. The modal component wires everything together with auto-capture logic and equirectangular export.

**Tech Stack:** Three.js v0.182, React 19, DeviceOrientation API, getUserMedia API, WebGL shaders (cubemap→equirect export)

**Note:** No git commits during development — user will commit when ready. No test framework in project — manual testing checklist provided.

---

## File Structure

```
components/
  panorama-capture/
    guide-points.ts            <- CREATE: guide point definitions + logic
    useDeviceOrientation.ts    <- CREATE: device orientation hook
    useCamera.ts               <- CREATE: camera stream hook
    SphereCaptureScene.ts      <- CREATE: Three.js scene class (core)
    equirect-export.ts         <- CREATE: CubeCamera → equirectangular export
  PanoramaCaptureModal.tsx     <- REWRITE: main component
```

---

### Task 1: Guide Points Module

**Files:**
- Create: `components/panorama-capture/guide-points.ts`

- [ ] **Step 1: Create guide-points.ts**

```typescript
// components/panorama-capture/guide-points.ts

export interface GuidePoint {
  id: string;
  yaw: number;   // degrees, 0-360
  pitch: number;  // degrees, -90 to 90
  level: 1 | 2 | 3;
  captured: boolean;
}

const LEVEL_1_YAWS = [0, 45, 90, 135, 180, 225, 270, 315];
const LEVEL_2_YAWS = [0, 60, 120, 180, 240, 300];
const LEVEL_3_YAWS = [0, 60, 120, 180, 240, 300];

export function generateGuidePoints(): GuidePoint[] {
  const points: GuidePoint[] = [];

  LEVEL_1_YAWS.forEach((yaw, i) => {
    points.push({ id: `L1-${i}`, yaw, pitch: 0, level: 1, captured: false });
  });
  LEVEL_2_YAWS.forEach((yaw, i) => {
    points.push({ id: `L2-${i}`, yaw, pitch: 45, level: 2, captured: false });
  });
  LEVEL_3_YAWS.forEach((yaw, i) => {
    points.push({ id: `L3-${i}`, yaw, pitch: -45, level: 3, captured: false });
  });

  return points;
}

export function getActiveLevel(points: GuidePoint[]): 1 | 2 | 3 {
  const level1 = points.filter((p) => p.level === 1);
  const level1Done = level1.filter((p) => p.captured).length;
  if (level1Done < Math.ceil(level1.length * 0.75)) return 1;

  const level2 = points.filter((p) => p.level === 2);
  const level2Done = level2.filter((p) => p.captured).length;
  if (level2Done < Math.ceil(level2.length * 0.75)) return 2;

  return 3;
}

export function getLevelCompletionPercent(points: GuidePoint[], level: number): number {
  const levelPoints = points.filter((p) => p.level === level);
  if (levelPoints.length === 0) return 0;
  return Math.round((levelPoints.filter((p) => p.captured).length / levelPoints.length) * 100);
}

export function getTotalCoverage(points: GuidePoint[]): number {
  const total = points.length;
  if (total === 0) return 0;
  return Math.round((points.filter((p) => p.captured).length / total) * 100);
}

/** Angular distance in degrees between two spherical points */
export function angularDistance(yaw1: number, pitch1: number, yaw2: number, pitch2: number): number {
  const DEG2RAD = Math.PI / 180;
  const lat1 = pitch1 * DEG2RAD;
  const lat2 = pitch2 * DEG2RAD;
  const dLon = (yaw2 - yaw1) * DEG2RAD;

  const cosD =
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return Math.acos(Math.min(1, Math.max(-1, cosD))) / DEG2RAD;
}

export function findNearestGuide(
  points: GuidePoint[],
  yaw: number,
  pitch: number,
  activeLevel: number,
): GuidePoint | null {
  let nearest: GuidePoint | null = null;
  let minDist = Infinity;

  for (const p of points) {
    if (p.captured || p.level > activeLevel) continue;
    const dist = angularDistance(yaw, pitch, p.yaw, p.pitch);
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }

  return nearest;
}

export function findAlignedGuide(
  points: GuidePoint[],
  yaw: number,
  pitch: number,
  activeLevel: number,
  thresholdDeg = 15,
): GuidePoint | null {
  const nearest = findNearestGuide(points, yaw, pitch, activeLevel);
  if (!nearest) return null;
  const dist = angularDistance(yaw, pitch, nearest.yaw, nearest.pitch);
  return dist <= thresholdDeg ? nearest : null;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 2: Device Orientation Hook

**Files:**
- Create: `components/panorama-capture/useDeviceOrientation.ts`

- [ ] **Step 1: Create useDeviceOrientation.ts**

```typescript
// components/panorama-capture/useDeviceOrientation.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OrientationData {
  alpha: number;  // 0-360, compass heading
  beta: number;   // -180..180, tilt front/back
  gamma: number;  // -90..90, tilt left/right
}

export type PermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

export interface UseDeviceOrientationReturn {
  orientation: OrientationData | null;
  permissionState: PermissionState;
  requestPermission: () => Promise<boolean>;
}

export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const [orientation, setOrientation] = useState<OrientationData | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('idle');
  const listenerAttached = useRef(false);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (event.alpha === null) return;
    setOrientation({
      alpha: event.alpha,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
    });
  }, []);

  const attachListener = useCallback(() => {
    if (listenerAttached.current) return;
    window.addEventListener('deviceorientation', handleOrientation, true);
    listenerAttached.current = true;
  }, [handleOrientation]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      setPermissionState('unsupported');
      return false;
    }

    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DOE.requestPermission === 'function') {
      setPermissionState('requesting');
      try {
        const result = await DOE.requestPermission();
        if (result === 'granted') {
          setPermissionState('granted');
          attachListener();
          return true;
        }
        setPermissionState('denied');
        return false;
      } catch {
        setPermissionState('denied');
        return false;
      }
    }

    // Non-iOS: no permission needed
    setPermissionState('granted');
    attachListener();
    return true;
  }, [attachListener]);

  useEffect(() => {
    return () => {
      if (listenerAttached.current) {
        window.removeEventListener('deviceorientation', handleOrientation, true);
        listenerAttached.current = false;
      }
    };
  }, [handleOrientation]);

  return { orientation, permissionState, requestPermission };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 3: Camera Hook

**Files:**
- Create: `components/panorama-capture/useCamera.ts`

- [ ] **Step 1: Create useCamera.ts**

```typescript
// components/panorama-capture/useCamera.ts
'use client';

import { useCallback, useRef, useState } from 'react';

export interface CameraFov {
  horizontal: number; // degrees
  vertical: number;   // degrees
}

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  fov: CameraFov;
  start: () => Promise<void>;
  stop: () => void;
  captureFrame: () => HTMLCanvasElement | null;
}

const DEFAULT_HFOV = 65;

function estimateVFov(hfov: number, videoWidth: number, videoHeight: number): number {
  const aspect = videoHeight / videoWidth;
  const hfovRad = (hfov * Math.PI) / 180;
  const vfovRad = 2 * Math.atan(Math.tan(hfovRad / 2) * aspect);
  return (vfovRad * 180) / Math.PI;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fov, setFov] = useState<CameraFov>({ horizontal: DEFAULT_HFOV, vertical: 50 });

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setIsStarting(true);

    try {
      if (!window.isSecureContext) {
        throw new Error('Kamera icin HTTPS gerekli.');
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Bu tarayicide kamera desteklenmiyor.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        if (vw && vh) {
          setFov({
            horizontal: DEFAULT_HFOV,
            vertical: estimateVFov(DEFAULT_HFOV, vw, vh),
          });
        }
      }

      setIsActive(true);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') setError('Kamera izni reddedildi.');
        else if (err.name === 'NotFoundError') setError('Kamera bulunamadi.');
        else if (err.name === 'NotReadableError') setError('Kamera baska uygulama kullaniyor.');
        else setError(`Kamera acilamadi: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Kamera acilamadi');
      }
    } finally {
      setIsStarting(false);
    }
  }, []);

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas;
  }, []);

  return { videoRef, isActive, isStarting, error, fov, start, stop, captureFrame };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 4: SphereCaptureScene (Core Three.js)

**Files:**
- Create: `components/panorama-capture/SphereCaptureScene.ts`

This is the largest file. It manages the Three.js scene, background sphere, patch meshes, guide markers, camera orientation, and mouse/touch fallback.

- [ ] **Step 1: Create SphereCaptureScene.ts**

```typescript
// components/panorama-capture/SphereCaptureScene.ts

import * as THREE from 'three';
import {
  GuidePoint,
  generateGuidePoints,
  getActiveLevel,
  findAlignedGuide,
  findNearestGuide,
} from './guide-points';

const DEG2RAD = Math.PI / 180;
const SPHERE_RADIUS = 500;
const GUIDE_RADIUS = 8;
const GUIDE_DISTANCE = 100; // distance from center for guide markers

interface PatchInfo {
  mesh: THREE.Mesh;
  yawDeg: number;
  pitchDeg: number;
}

export class SphereCaptureScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  private container: HTMLElement;
  private backgroundSphere!: THREE.Mesh;
  private patches: Map<string, PatchInfo> = new Map();
  private guideMarkers: Map<string, THREE.Mesh> = new Map();
  private guidePoints: GuidePoint[];
  private animationId = 0;
  private disposed = false;

  // Camera control state (mouse/touch fallback)
  private useDeviceOrientation = false;
  private dragYaw = 0;
  private dragPitch = 0;
  private isDragging = false;
  private prevPointer = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.guidePoints = generateGuidePoints();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();

    // Camera — wider FOV to show context around the capture area
    this.camera = new THREE.PerspectiveCamera(90, width / height, 0.1, 1100);
    this.camera.position.set(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.createBackgroundSphere();
    this.createGuideMarkers();
    this.setupDragControls();

    window.addEventListener('resize', this.handleResize);
    this.animate();
  }

  // ── Background Sphere ──

  private createBackgroundSphere(): void {
    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);
    geo.scale(-1, 1, 1);

    // Dark gray base — uncaptured areas
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e });
    this.backgroundSphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.backgroundSphere);
  }

  // ── Guide Markers ──

  private createGuideMarkers(): void {
    const activeLevel = getActiveLevel(this.guidePoints);

    for (const point of this.guidePoints) {
      const visible = point.level <= activeLevel;
      const color = point.captured ? 0x22c55e : 0xf59e0b; // green or amber

      const geo = new THREE.SphereGeometry(GUIDE_RADIUS, 12, 8);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: point.captured ? 0.3 : 0.7,
        depthTest: false,
      });
      const marker = new THREE.Mesh(geo, mat);

      // Position on the sphere surface (at smaller radius so visible in front of patches)
      const yawRad = point.yaw * DEG2RAD;
      const pitchRad = point.pitch * DEG2RAD;
      marker.position.set(
        GUIDE_DISTANCE * Math.cos(pitchRad) * Math.sin(yawRad),
        GUIDE_DISTANCE * Math.sin(pitchRad),
        -GUIDE_DISTANCE * Math.cos(pitchRad) * Math.cos(yawRad),
      );

      marker.visible = visible;
      this.scene.add(marker);
      this.guideMarkers.set(point.id, marker);
    }
  }

  refreshGuideMarkers(): void {
    const activeLevel = getActiveLevel(this.guidePoints);

    for (const point of this.guidePoints) {
      const marker = this.guideMarkers.get(point.id);
      if (!marker) continue;

      marker.visible = point.level <= activeLevel && !point.captured;

      const mat = marker.material as THREE.MeshBasicMaterial;
      mat.color.setHex(point.captured ? 0x22c55e : 0xf59e0b);
      mat.opacity = point.captured ? 0.3 : 0.7;
    }
  }

  // ── Patch Meshes ──

  addPatch(
    texture: THREE.CanvasTexture,
    yawDeg: number,
    pitchDeg: number,
    hfovDeg: number,
    vfovDeg: number,
  ): string {
    const hfov = hfovDeg * DEG2RAD;
    const vfov = vfovDeg * DEG2RAD;

    // Sphere section centered at forward direction (-Z)
    const phiStart = Math.PI - hfov / 2;
    const phiLength = hfov;
    const thetaStart = Math.PI / 2 - vfov / 2;
    const thetaLength = vfov;

    const geo = new THREE.SphereGeometry(
      SPHERE_RADIUS - 1, // slightly smaller than background to avoid z-fighting
      32,
      16,
      phiStart,
      phiLength,
      thetaStart,
      thetaLength,
    );
    geo.scale(-1, 1, 1);

    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Rotate to actual orientation
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = -yawDeg * DEG2RAD;
    mesh.rotation.x = pitchDeg * DEG2RAD;

    const id = `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.patches.set(id, { mesh, yawDeg, pitchDeg });
    this.scene.add(mesh);

    return id;
  }

  // ── Camera Orientation ──

  updateCameraFromDevice(alpha: number, beta: number, gamma: number): void {
    this.useDeviceOrientation = true;

    const euler = new THREE.Euler(
      beta * DEG2RAD,
      alpha * DEG2RAD,
      -gamma * DEG2RAD,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(euler);

    // Compensate for phone held vertically (portrait mode)
    // Rotate -90° around X so that "forward" is through the back of the phone
    const q1 = new THREE.Quaternion();
    q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.camera.quaternion.multiply(q1);
  }

  /** Get where the camera is currently looking, in degrees */
  getCameraDirection(): { yaw: number; pitch: number } {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);

    const yaw = Math.atan2(forward.x, -forward.z) / DEG2RAD;
    const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y))) / DEG2RAD;

    return {
      yaw: ((yaw % 360) + 360) % 360,
      pitch,
    };
  }

  // ── Guide Queries ──

  getGuidePoints(): GuidePoint[] {
    return this.guidePoints;
  }

  findAligned(thresholdDeg = 15): GuidePoint | null {
    const { yaw, pitch } = this.getCameraDirection();
    const activeLevel = getActiveLevel(this.guidePoints);
    return findAlignedGuide(this.guidePoints, yaw, pitch, activeLevel, thresholdDeg);
  }

  findNearest(): GuidePoint | null {
    const { yaw, pitch } = this.getCameraDirection();
    const activeLevel = getActiveLevel(this.guidePoints);
    return findNearestGuide(this.guidePoints, yaw, pitch, activeLevel);
  }

  markGuideCaptured(id: string): void {
    const point = this.guidePoints.find((p) => p.id === id);
    if (point) {
      point.captured = true;
      this.refreshGuideMarkers();
    }
  }

  // ── Mouse/Touch Drag Fallback ──

  private setupDragControls(): void {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', this.onPointerDown);
    el.addEventListener('mousemove', this.onPointerMove);
    el.addEventListener('mouseup', this.onPointerUp);
    el.addEventListener('mouseleave', this.onPointerUp);

    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onPointerUp);
  }

  private onPointerDown = (e: MouseEvent): void => {
    if (this.useDeviceOrientation) return;
    this.isDragging = true;
    this.prevPointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: MouseEvent): void => {
    if (!this.isDragging || this.useDeviceOrientation) return;
    const dx = e.clientX - this.prevPointer.x;
    const dy = e.clientY - this.prevPointer.y;
    this.dragYaw += dx * 0.3;
    this.dragPitch = Math.max(-85, Math.min(85, this.dragPitch - dy * 0.3));
    this.prevPointer = { x: e.clientX, y: e.clientY };
    this.applyCameraDrag();
  };

  private onPointerUp = (): void => {
    this.isDragging = false;
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (this.useDeviceOrientation) return;
    e.preventDefault();
    this.isDragging = true;
    this.prevPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.isDragging || this.useDeviceOrientation) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - this.prevPointer.x;
    const dy = touch.clientY - this.prevPointer.y;
    this.dragYaw += dx * 0.3;
    this.dragPitch = Math.max(-85, Math.min(85, this.dragPitch - dy * 0.3));
    this.prevPointer = { x: touch.clientX, y: touch.clientY };
    this.applyCameraDrag();
  };

  private applyCameraDrag(): void {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = -this.dragYaw * DEG2RAD;
    this.camera.rotation.x = this.dragPitch * DEG2RAD;
    this.camera.rotation.z = 0;
  }

  // ── Render Loop ──

  private animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);

    // Make guide markers face camera (billboard)
    for (const marker of this.guideMarkers.values()) {
      if (marker.visible) {
        marker.lookAt(this.camera.position);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  // ── Resize ──

  private handleResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ── Reset ──

  reset(): void {
    // Remove all patch meshes
    for (const { mesh } of this.patches.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.patches.clear();

    // Reset guide points
    for (const point of this.guidePoints) {
      point.captured = false;
    }
    this.refreshGuideMarkers();
  }

  // ── Dispose ──

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);

    const el = this.renderer.domElement;
    el.removeEventListener('mousedown', this.onPointerDown);
    el.removeEventListener('mousemove', this.onPointerMove);
    el.removeEventListener('mouseup', this.onPointerUp);
    el.removeEventListener('mouseleave', this.onPointerUp);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onPointerUp);

    this.reset();
    this.backgroundSphere.geometry.dispose();
    (this.backgroundSphere.material as THREE.MeshBasicMaterial).dispose();

    for (const marker of this.guideMarkers.values()) {
      marker.geometry.dispose();
      (marker.material as THREE.MeshBasicMaterial).dispose();
    }
    this.guideMarkers.clear();

    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 5: Equirectangular Export

**Files:**
- Create: `components/panorama-capture/equirect-export.ts`

- [ ] **Step 1: Create equirect-export.ts**

```typescript
// components/panorama-capture/equirect-export.ts

import * as THREE from 'three';

const EQUIRECT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EQUIRECT_FRAGMENT = /* glsl */ `
  uniform samplerCube tCube;
  varying vec2 vUv;

  #define PI 3.14159265359

  void main() {
    float lon = vUv.x * 2.0 * PI - PI;
    float lat = vUv.y * PI - PI * 0.5;

    vec3 dir = vec3(
      cos(lat) * sin(lon),
      sin(lat),
      cos(lat) * cos(lon)
    );

    gl_FragColor = textureCube(tCube, dir);
  }
`;

export async function exportEquirectangular(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  width = 4096,
  height = 2048,
): Promise<Blob> {
  // Save current state
  const prevRenderTarget = renderer.getRenderTarget();
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);

  // 1. Render scene into a cubemap
  const cubeRT = new THREE.WebGLCubeRenderTarget(2048);
  const cubeCamera = new THREE.CubeCamera(0.1, 1100, cubeRT);
  cubeCamera.position.set(0, 0, 0);
  cubeCamera.update(renderer, scene);

  // 2. Convert cubemap → equirectangular via shader
  const equirectRT = new THREE.WebGLRenderTarget(width, height);

  const material = new THREE.ShaderMaterial({
    uniforms: { tCube: { value: cubeRT.texture } },
    vertexShader: EQUIRECT_VERTEX,
    fragmentShader: EQUIRECT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeo, material);
  const orthoScene = new THREE.Scene();
  orthoScene.add(quad);
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  renderer.setRenderTarget(equirectRT);
  renderer.render(orthoScene, orthoCamera);

  // 3. Read pixels
  const buffer = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(equirectRT, 0, 0, width, height, buffer);

  // 4. Restore renderer state
  renderer.setRenderTarget(prevRenderTarget);
  renderer.setSize(prevSize.x, prevSize.y);

  // 5. Cleanup GPU resources
  cubeRT.dispose();
  equirectRT.dispose();
  material.dispose();
  quadGeo.dispose();

  // 6. Buffer → Canvas (flip Y, WebGL is bottom-up)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context olusturulamadi');

  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    imageData.data.set(buffer.subarray(srcRow, srcRow + width * 4), dstRow);
  }
  ctx.putImageData(imageData, 0, 0);

  // 7. Canvas → JPEG Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG blob olusturulamadi'))),
      'image/jpeg',
      0.92,
    );
  });
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 6: PanoramaCaptureModal (Main Component Rewrite)

**Files:**
- Rewrite: `components/PanoramaCaptureModal.tsx`

- [ ] **Step 1: Rewrite PanoramaCaptureModal.tsx**

```tsx
// components/PanoramaCaptureModal.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw, X } from 'lucide-react';
import * as THREE from 'three';
import { SphereCaptureScene } from './panorama-capture/SphereCaptureScene';
import { useDeviceOrientation } from './panorama-capture/useDeviceOrientation';
import { useCamera } from './panorama-capture/useCamera';
import { exportEquirectangular } from './panorama-capture/equirect-export';
import {
  type GuidePoint,
  getActiveLevel,
  getLevelCompletionPercent,
  getTotalCoverage,
} from './panorama-capture/guide-points';

interface PanoramaCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onPanoramaReady: (file: File, sceneTitle: string) => void;
}

interface StableTimer {
  guideId: string;
  startTime: number;
  lastYaw: number;
  lastPitch: number;
}

const ALIGN_THRESHOLD = 15; // degrees
const STABLE_DURATION = 500; // ms
const STABLE_DRIFT_MAX = 3; // degrees

export default function PanoramaCaptureModal({
  open,
  onClose,
  onPanoramaReady,
}: PanoramaCaptureModalProps) {
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SphereCaptureScene | null>(null);
  const stableTimerRef = useRef<StableTimer | null>(null);
  const autoCapturedRef = useRef<Set<string>>(new Set());

  const orientation = useDeviceOrientation();
  const camera = useCamera();

  const [sceneTitle, setSceneTitle] = useState('Kamera Panoramasi');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [patchCount, setPatchCount] = useState(0);
  const [coverage, setCoverage] = useState(0);
  const [activeLevel, setActiveLevel] = useState(1);
  const [levelPercents, setLevelPercents] = useState([0, 0, 0]);
  const [alignState, setAlignState] = useState<'none' | 'approaching' | 'stable' | 'captured'>('none');
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Initialize Three.js scene ──
  useEffect(() => {
    if (!open || !sceneContainerRef.current) return;

    const scene = new SphereCaptureScene(sceneContainerRef.current);
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [open]);

  // ── Start camera + orientation when modal opens ──
  useEffect(() => {
    if (!open) return;

    camera.start();
    orientation.requestPermission();

    return () => {
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Feed device orientation into Three.js camera ──
  useEffect(() => {
    if (!sceneRef.current || !orientation.orientation) return;
    const { alpha, beta, gamma } = orientation.orientation;
    sceneRef.current.updateCameraFromDevice(alpha, beta, gamma);
  }, [orientation.orientation]);

  // ── Auto-capture loop ──
  useEffect(() => {
    if (!open || !sceneRef.current) return;
    if (orientation.permissionState !== 'granted') return;

    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const scene = sceneRef.current;
      if (!scene) return;

      const aligned = scene.findAligned(ALIGN_THRESHOLD);

      if (aligned && !autoCapturedRef.current.has(aligned.id)) {
        const { yaw, pitch } = scene.getCameraDirection();
        const timer = stableTimerRef.current;

        if (!timer || timer.guideId !== aligned.id) {
          // New alignment — start timer
          stableTimerRef.current = {
            guideId: aligned.id,
            startTime: Date.now(),
            lastYaw: yaw,
            lastPitch: pitch,
          };
          setAlignState('approaching');
        } else {
          // Check stability
          const drift =
            Math.abs(yaw - timer.lastYaw) + Math.abs(pitch - timer.lastPitch);

          if (drift > STABLE_DRIFT_MAX) {
            // Too much movement — reset timer
            timer.startTime = Date.now();
            timer.lastYaw = yaw;
            timer.lastPitch = pitch;
            setAlignState('approaching');
          } else if (Date.now() - timer.startTime >= STABLE_DURATION) {
            // Stable enough — auto capture!
            doCapture(aligned);
            stableTimerRef.current = null;
          } else {
            setAlignState('stable');
          }
        }
      } else {
        if (stableTimerRef.current) {
          stableTimerRef.current = null;
          setAlignState('none');
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orientation.permissionState]);

  // ── Capture logic ──
  const doCapture = useCallback(
    (alignedGuide?: GuidePoint | null) => {
      const scene = sceneRef.current;
      if (!scene || !camera.isActive) return;

      const frameCanvas = camera.captureFrame();
      if (!frameCanvas) return;

      const texture = new THREE.CanvasTexture(frameCanvas);
      const { yaw, pitch } = scene.getCameraDirection();

      scene.addPatch(texture, yaw, pitch, camera.fov.horizontal, camera.fov.vertical);

      if (alignedGuide) {
        scene.markGuideCaptured(alignedGuide.id);
        autoCapturedRef.current.add(alignedGuide.id);
      }

      // Vibrate feedback
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(100);
      }

      // Update UI state
      const points = scene.getGuidePoints();
      setPatchCount((prev) => prev + 1);
      setCoverage(getTotalCoverage(points));
      setActiveLevel(getActiveLevel(points));
      setLevelPercents([
        getLevelCompletionPercent(points, 1),
        getLevelCompletionPercent(points, 2),
        getLevelCompletionPercent(points, 3),
      ]);
      setAlignState('captured');
      setTimeout(() => setAlignState('none'), 600);
    },
    [camera],
  );

  const handleManualCapture = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const aligned = scene.findAligned(ALIGN_THRESHOLD);
    doCapture(aligned);
  };

  // ── Export ──
  const handleComplete = async () => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (patchCount === 0) {
      setError('Hic kare cekilmedi. En az bir kare cekin.');
      return;
    }

    setShowConfirm(false);
    setIsExporting(true);
    setError('');

    try {
      const blob = await exportEquirectangular(scene.renderer, scene.scene);
      const fileName = `panorama-${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      onPanoramaReady(file, sceneTitle.trim() || 'Kamera Panoramasi');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export basarisiz');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    sceneRef.current?.reset();
    autoCapturedRef.current.clear();
    stableTimerRef.current = null;
    setPatchCount(0);
    setCoverage(0);
    setActiveLevel(1);
    setLevelPercents([0, 0, 0]);
    setAlignState('none');
    setError('');
  };

  // ── Cleanup on close ──
  useEffect(() => {
    if (!open) {
      autoCapturedRef.current.clear();
      stableTimerRef.current = null;
      setPatchCount(0);
      setCoverage(0);
      setActiveLevel(1);
      setLevelPercents([0, 0, 0]);
      setAlignState('none');
      setError('');
      setShowConfirm(false);
      setSceneTitle('Kamera Panoramasi');
    }
  }, [open]);

  if (!open) return null;

  // ── Align state label ──
  const alignLabel =
    alignState === 'approaching'
      ? 'Noktaya yaklasiyorsunuz...'
      : alignState === 'stable'
        ? 'Sabit tutun...'
        : alignState === 'captured'
          ? 'Cekildi!'
          : null;

  const alignColor =
    alignState === 'approaching'
      ? 'text-yellow-400 border-yellow-500/50 bg-yellow-900/30'
      : alignState === 'stable'
        ? 'text-emerald-400 border-emerald-500/50 bg-emerald-900/30'
        : alignState === 'captured'
          ? 'text-emerald-300 border-emerald-400/50 bg-emerald-800/40'
          : '';

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">360° Panorama Capture</h2>
          <p className="text-[11px] text-gray-400">
            {coverage}% kapsama · {patchCount} kare
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Three.js Scene + Camera Overlay */}
      <div className="relative min-h-0 flex-1">
        {/* Three.js container */}
        <div ref={sceneContainerRef} className="h-full w-full" />

        {/* Camera feed overlay */}
        {camera.isActive && (
          <video
            ref={camera.videoRef}
            playsInline
            muted
            autoPlay
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '65%',
              height: '65%',
              objectFit: 'cover',
              opacity: 0.55,
              maskImage:
                'radial-gradient(ellipse at center, black 40%, transparent 80%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at center, black 40%, transparent 80%)',
            }}
          />
        )}

        {/* Alignment indicator */}
        {alignLabel && (
          <div
            className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-semibold ${alignColor}`}
          >
            {alignState === 'captured' && <Check size={12} className="mr-1 inline" />}
            {alignLabel}
          </div>
        )}

        {/* Flash on capture */}
        {alignState === 'captured' && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/20" />
        )}
      </div>

      {/* Level progress */}
      <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2">
        {[1, 2, 3].map((level) => {
          const locked = level > activeLevel;
          const pct = levelPercents[level - 1];
          const label =
            level === 1
              ? 'Yatay orta'
              : level === 2
                ? 'Ust serit'
                : 'Alt serit';
          return (
            <div key={level} className="mb-1 flex items-center gap-2 text-[10px]">
              <span
                className={`w-16 ${locked ? 'text-gray-600' : 'text-gray-300'}`}
              >
                {label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    locked ? 'bg-gray-700' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${locked ? 0 : pct}%` }}
                />
              </div>
              <span className={locked ? 'text-gray-600' : 'text-gray-400'}>
                {locked ? 'Kilitli' : `${pct}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {(error || camera.error) && (
        <div className="shrink-0 border-t border-red-500/30 bg-red-900/20 px-4 py-2 text-xs text-red-300">
          {error || camera.error}
        </div>
      )}

      {/* Controls */}
      <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-3">
        {/* Scene title */}
        <input
          type="text"
          value={sceneTitle}
          onChange={(e) => setSceneTitle(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Sahne basligi"
        />

        <div className="flex gap-2">
          {/* Manual capture */}
          <button
            onClick={handleManualCapture}
            disabled={!camera.isActive}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white active:scale-95 disabled:bg-gray-700 disabled:opacity-50"
          >
            <Camera size={16} /> Kare Cek
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={patchCount === 0}
            className="rounded-lg bg-gray-700 px-3 py-2.5 text-gray-300 hover:bg-gray-600 disabled:opacity-40"
          >
            <RotateCcw size={16} />
          </button>

          {/* Complete */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-gray-700"
          >
            {isExporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Tamamla
          </button>
        </div>

        {/* Orientation status */}
        {orientation.permissionState === 'unsupported' && (
          <p className="mt-2 text-center text-[10px] text-gray-500">
            Jiroskop bulunamadi — mouse/touch ile kurede donebilirsiniz
          </p>
        )}
        {orientation.permissionState === 'denied' && (
          <p className="mt-2 text-center text-[10px] text-yellow-500">
            Jiroskop izni reddedildi — ayarlardan izin verin veya mouse kullanin
          </p>
        )}
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-5">
            <p className="mb-1 text-sm font-semibold text-white">
              Panoramayi tamamla?
            </p>
            <p className="mb-4 text-xs text-gray-400">
              Kapsama: {coverage}%. Eksik bolgeler koyu gri ile doldurulacak.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg bg-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-600"
              >
                Iptal
              </button>
              <button
                onClick={handleComplete}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

---

### Task 7: Integration Verification

**Files:**
- Verify: `components/TourEditor.tsx` (should need no changes — interface is identical)

- [ ] **Step 1: Verify PanoramaCaptureModal interface matches TourEditor expectations**

TourEditor imports:
```typescript
import PanoramaCaptureModal from './PanoramaCaptureModal';
```

And uses:
```tsx
<PanoramaCaptureModal
    open={showPanoramaCaptureModal}
    onClose={() => setShowPanoramaCaptureModal(false)}
    onPanoramaReady={handlePanoramaReadyFromCamera}
/>
```

Where `handlePanoramaReadyFromCamera` has signature:
```typescript
(file: File, sceneTitle: string) => void
```

Our new component exports the same interface:
```typescript
interface PanoramaCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onPanoramaReady: (file: File, sceneTitle: string) => void;
}
```

No changes needed to TourEditor.

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -20`

If build errors appear, fix them before proceeding.

---

### Task 8: Manual Testing Checklist

- [ ] **Desktop (Chrome):**
  - Open modal — Three.js sphere visible with amber guide markers
  - Mouse drag rotates camera inside sphere
  - Click "Kare Cek" — patch appears on sphere at camera direction
  - Guide markers turn green when captured nearby
  - Level progress bar updates
  - "Tamamla" → confirm dialog → exports JPEG
  - Exported panorama loads correctly in Pannellum viewer

- [ ] **Mobile (Safari iOS / Chrome Android):**
  - Device orientation permission requested on open
  - Rotating phone rotates view inside sphere
  - Camera feed visible as semi-transparent overlay in center
  - Auto-capture fires when aligned with guide + held steady 0.5s
  - Vibration feedback on capture
  - Guide markers disappear after capture
  - Level 2 unlocks after Level 1 is 75%+ done
  - "Tamamla" exports and adds scene to tour
  - Camera and orientation cleaned up on modal close

- [ ] **Edge cases:**
  - Orientation denied → mouse/touch fallback works
  - Camera denied → error message shown
  - 0 captures + Tamamla → "En az bir kare cekin" error
  - Reset button clears all patches and guide states
  - Close and reopen modal → clean state
