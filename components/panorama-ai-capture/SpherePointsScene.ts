// Three.js scene that draws a wireframe sphere + 16 sprite markers
// for the AI panorama capture tab.
//
// v2: render captured photo textures on their markers instead of just color
// change. Currently only color-change for memory — 16 captured JPEG blobs
// (~150KB each ≈ 2.4MB) stay in RAM as Blobs, NOT as GPU textures. Uploading
// 16 textures at capture resolution can push mobile Safari over the GPU
// budget and cause a silent reload.

import {
  AmbientLight,
  CanvasTexture,
  Color,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  Euler,
} from 'three';
import { GUIDE_POINTS_16, yawPitchToCartesian, type GuidePoint } from './guide-points-16';

export type MarkerState = 'idle' | 'active' | 'captured';

const SPHERE_RADIUS = 5;
const MARKER_WORLD_SIZE = 0.6;
const HORIZONTAL_FOV_DEG = 53; // per spec — NOT the Three.js default 50°
const ACTIVE_THRESHOLD_DEG = 15;

const COLOR_IDLE = new Color(0x6b7280);     // gray-500
const COLOR_ACTIVE = new Color(0xfacc15);   // yellow-400
const COLOR_CAPTURED = new Color(0x22c55e); // green-500

// Standard Three.js device-orientation quaternion composition helpers.
// Matches the pattern used by the official DeviceOrientationControls addon.
const Z_AXIS = new Vector3(0, 0, 1);
const Q_FLIP = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X

interface MarkerEntry {
  point: GuidePoint;
  sprite: Sprite;
  material: SpriteMaterial;
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  state: MarkerState;
}

function buildMarkerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, 64, 64);
  // White filled circle with a soft outer ring — material color tints this.
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.stroke();
  return canvas;
}

export interface SpherePointsSceneOptions {
  container: HTMLElement;
  onContextLost?: () => void;
}

export class SpherePointsScene {
  private readonly container: HTMLElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly wireframe: Mesh;
  private readonly markers = new Map<string, MarkerEntry>();
  private readonly tmpEuler = new Euler();
  private readonly cameraQuat = new Quaternion();
  private readonly resizeObserver?: ResizeObserver;
  private readonly onContextLostHandler: (event: Event) => void;
  private readonly projectionVec = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly toMarker = new Vector3();
  private readonly rendererSize = new Vector2();
  private disposed = false;
  private screenOrientationAngle = 0;

  constructor(options: SpherePointsSceneOptions) {
    this.container = options.container;

    // ── Renderer ──
    this.renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: 'low-power',
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x0b1020, 0);
    this.container.appendChild(this.renderer.domElement);

    // Context loss handling — the consumer may want to inform the user.
    this.onContextLostHandler = (event: Event) => {
      event.preventDefault();
      options.onContextLost?.();
    };
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.onContextLostHandler,
      false,
    );

    // ── Camera (horizontal FOV 53°, derived vertical FOV) ──
    const aspect = width / height;
    this.camera = new PerspectiveCamera(
      horizontalToVerticalFov(HORIZONTAL_FOV_DEG, aspect),
      aspect,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 0);

    // ── Wireframe sphere ──
    const sphereGeometry = new SphereGeometry(SPHERE_RADIUS, 32, 16);
    const sphereMaterial = new MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    this.wireframe = new Mesh(sphereGeometry, sphereMaterial);
    this.scene.add(this.wireframe);

    // Ambient light (sprites don't need lighting, but defensive for v2).
    this.scene.add(new AmbientLight(0xffffff, 1));

    // ── Markers ──
    for (const point of GUIDE_POINTS_16) {
      const canvas = buildMarkerCanvas();
      const texture = new CanvasTexture(canvas);
      const material = new SpriteMaterial({
        map: texture,
        color: COLOR_IDLE.clone(),
        transparent: true,
        depthTest: false,
      });
      const sprite = new Sprite(material);
      const pos = yawPitchToCartesian(point.yaw, point.pitch, SPHERE_RADIUS);
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.scale.set(MARKER_WORLD_SIZE, MARKER_WORLD_SIZE, 1);
      this.scene.add(sprite);
      this.markers.set(point.id, { point, sprite, material, texture, canvas, state: 'idle' });
    }

    // ── Resize handling ──
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }

    this.updateScreenOrientation();
    if (typeof window !== 'undefined') {
      window.addEventListener('orientationchange', this.handleOrientationChange);
    }
  }

  private handleOrientationChange = () => {
    this.updateScreenOrientation();
  };

  private updateScreenOrientation() {
    const screen = typeof window !== 'undefined' ? window.screen : undefined;
    const angleFromScreen =
      (screen && 'orientation' in screen && screen.orientation && typeof screen.orientation.angle === 'number'
        ? screen.orientation.angle
        : null);
    const angleFromWindow =
      typeof window !== 'undefined' && typeof window.orientation === 'number'
        ? (window.orientation as number)
        : null;
    const angle = angleFromScreen ?? angleFromWindow ?? 0;
    this.screenOrientationAngle = MathUtils.degToRad(angle);
  }

  private handleResize() {
    if (this.disposed) return;
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = horizontalToVerticalFov(HORIZONTAL_FOV_DEG, aspect);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Feed raw DeviceOrientationEvent values into the scene camera.
   * Standard Three.js composition: Euler(beta, alpha, -gamma, 'YXZ'),
   * then rotate -PI/2 around X so "phone flat facing floor" maps to
   * "camera looking forward", then undo screen orientation.
   */
  updateCameraFromDevice(alpha: number, beta: number, gamma: number): void {
    const alphaRad = MathUtils.degToRad(alpha);
    const betaRad = MathUtils.degToRad(beta);
    const gammaRad = MathUtils.degToRad(gamma);

    this.tmpEuler.set(betaRad, alphaRad, -gammaRad, 'YXZ');
    this.cameraQuat.setFromEuler(this.tmpEuler);
    this.cameraQuat.multiply(Q_FLIP);
    // Compensate for screen orientation (landscape vs portrait).
    this.cameraQuat.multiply(
      new Quaternion().setFromAxisAngle(Z_AXIS, -this.screenOrientationAngle),
    );
    this.camera.quaternion.copy(this.cameraQuat);
  }

  /**
   * Returns the current camera yaw/pitch in degrees (0 yaw = +Z forward).
   * Used by the consumer to find the nearest guide point.
   */
  getCameraYawPitch(): { yaw: number; pitch: number } {
    // The camera's forward in Three.js is -Z. Project that into world space.
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const yaw = MathUtils.radToDeg(Math.atan2(forward.x, forward.z));
    const pitch = MathUtils.radToDeg(Math.asin(forward.y));
    // Normalize yaw to [0, 360).
    const yawNorm = ((yaw % 360) + 360) % 360;
    return { yaw: yawNorm, pitch };
  }

  /**
   * Finds the nearest guide marker to the screen center using the same camera
   * projection math as rendering. This keeps hit-testing aligned with what
   * the user visually sees.
   */
  findNearestGuideByScreenProjection(): GuidePoint | null {
    this.renderer.getSize(this.rendererSize);
    const width = this.rendererSize.x || this.container.clientWidth || 1;
    const height = this.rendererSize.y || this.container.clientHeight || 1;
    const centerX = width * 0.5;
    const centerY = height * 0.5;

    const pxPerDegHorizontal = width / HORIZONTAL_FOV_DEG;
    const pxPerDegVertical = height / this.camera.fov;
    const thresholdPx = ACTIVE_THRESHOLD_DEG * Math.min(pxPerDegHorizontal, pxPerDegVertical);

    let best: GuidePoint | null = null;
    let bestDist = thresholdPx;

    this.camera.getWorldDirection(this.cameraForward);

    for (const entry of this.markers.values()) {
      this.toMarker.copy(entry.sprite.position).sub(this.camera.position).normalize();
      if (this.cameraForward.dot(this.toMarker) <= 0) continue;

      this.projectionVec.copy(entry.sprite.position).project(this.camera);
      if (this.projectionVec.z < -1 || this.projectionVec.z > 1) continue;

      const screenX = (this.projectionVec.x * 0.5 + 0.5) * width;
      const screenY = (-this.projectionVec.y * 0.5 + 0.5) * height;
      const dist = Math.hypot(screenX - centerX, screenY - centerY);

      if (dist < bestDist) {
        bestDist = dist;
        best = entry.point;
      }
    }

    return best;
  }

  /**
   * Mark a marker as "active" (aimed at). Pass null to clear.
   * Captured markers keep their captured state regardless.
   */
  setActiveMarker(pointId: string | null): void {
    for (const entry of this.markers.values()) {
      if (entry.state === 'captured') continue;
      if (entry.point.id === pointId) {
        entry.state = 'active';
        entry.material.color.copy(COLOR_ACTIVE);
      } else {
        entry.state = 'idle';
        entry.material.color.copy(COLOR_IDLE);
      }
    }
  }

  markCaptured(pointId: string): void {
    const entry = this.markers.get(pointId);
    if (!entry) return;
    entry.state = 'captured';
    entry.material.color.copy(COLOR_CAPTURED);
  }

  resetAll(): void {
    for (const entry of this.markers.values()) {
      entry.state = 'idle';
      entry.material.color.copy(COLOR_IDLE);
    }
  }

  getActiveThresholdDeg(): number {
    return ACTIVE_THRESHOLD_DEG;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (typeof window !== 'undefined') {
      window.removeEventListener('orientationchange', this.handleOrientationChange);
    }
    this.resizeObserver?.disconnect();

    for (const entry of this.markers.values()) {
      entry.sprite.removeFromParent();
      entry.material.dispose();
      entry.texture.dispose();
    }
    this.markers.clear();

    this.wireframe.removeFromParent();
    (this.wireframe.geometry as SphereGeometry).dispose();
    (this.wireframe.material as MeshBasicMaterial).dispose();

    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onContextLostHandler,
      false,
    );
    this.renderer.dispose();
    this.renderer.forceContextLoss();

    const canvas = this.renderer.domElement;
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }
}

function horizontalToVerticalFov(horizontalDeg: number, aspect: number): number {
  const hRad = MathUtils.degToRad(horizontalDeg);
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / aspect);
  return MathUtils.radToDeg(vRad);
}
