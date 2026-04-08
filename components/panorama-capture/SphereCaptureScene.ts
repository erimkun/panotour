import * as THREE from 'three';
import {
  type GuidePoint,
  generateGuidePoints,
  getActiveLevel,
  findAlignedGuide,
  findNearestGuide,
  wouldOverlap,
} from './guide-points';

const DEG2RAD = Math.PI / 180;
const SPHERE_RADIUS = 500;
const GUIDE_MARKER_RADIUS = 6;
const GUIDE_DISTANCE = 100;
const MAX_PATCHES = 80;
const OVERLAY_RENDER_ORDER = 10000;
// Require meaningful movement before accepting another patch.
// With 30° guide spacing this still allows adjacent guide captures,
// while blocking accidental re-captures of nearly the same direction.
const MIN_PATCH_SEPARATION = 24;

// Edge-fade shader: fades the outer 3% of each patch edge to transparent so
// adjacent patches blend without hard seam lines or spotlight vignetting.
const PATCH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATCH_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float fadeEdge;
  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(map, vUv);
    float dx = min(vUv.x, 1.0 - vUv.x);
    float dy = min(vUv.y, 1.0 - vUv.y);
    float alpha = smoothstep(0.0, fadeEdge, min(dx, dy));
    gl_FragColor = vec4(texColor.rgb, alpha);
  }
`;

interface PatchInfo {
  mesh: THREE.Mesh;
  yawDeg: number;
  pitchDeg: number;
  quaternion: THREE.Quaternion;
}

export class SphereCaptureScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  private container: HTMLElement;
  private backgroundSphere!: THREE.Mesh;
  private patches: Map<string, PatchInfo> = new Map();
  private guideMarkerGroup: THREE.Group;
  private guideMarkers: Map<string, THREE.Mesh> = new Map();
  private guidePoints: GuidePoint[];
  private animationId = 0;
  private disposed = false;

  // Viewfinder + direction arrow (overlays that follow the camera)
  private viewfinderGroup!: THREE.Group;
  private directionArrow!: THREE.Mesh;

  // Camera control state (mouse/touch fallback for desktop)
  private useDeviceOrientation = false;
  private dragYaw = 0;
  private dragPitch = 0;
  private isDragging = false;
  private prevPointer = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.guidePoints = generateGuidePoints();
    this.guideMarkerGroup = new THREE.Group();

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(90, width / height, 0.1, 1100);
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default', // avoid high-performance to reduce context loss risk
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.createBackgroundSphere();
    this.createGuideMarkers();
    this.createViewfinder();
    this.createDirectionArrow();
    this.setupDragControls();

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.animate();
  }

  // ── Background Sphere ──

  private createBackgroundSphere(): void {
    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.BackSide });
    this.backgroundSphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.backgroundSphere);
  }

  // ── Viewfinder (capture area frame visible in the sphere) ──

  private createViewfinder(): void {
    this.viewfinderGroup = new THREE.Group();

    // A wireframe rectangle at GUIDE_DISTANCE, showing the capture FOV area
    const halfH = 30; // approximate half-width at guide distance
    const halfV = 22;
    const d = GUIDE_DISTANCE - 5; // slightly in front of guides

    const points = [
      new THREE.Vector3(-halfH, halfV, -d),
      new THREE.Vector3(halfH, halfV, -d),
      new THREE.Vector3(halfH, -halfV, -d),
      new THREE.Vector3(-halfH, -halfV, -d),
      new THREE.Vector3(-halfH, halfV, -d), // close the loop
    ];
    const frameGeo = new THREE.BufferGeometry().setFromPoints(points);
    const frameMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    });
    const frame = new THREE.Line(frameGeo, frameMat);
    this.viewfinderGroup.add(frame);

    // Corner accent lines (thicker appearance via additional geometry)
    const cornerLen = 8;
    const corners = [
      // top-left
      [new THREE.Vector3(-halfH, halfV, -d), new THREE.Vector3(-halfH + cornerLen, halfV, -d)],
      [new THREE.Vector3(-halfH, halfV, -d), new THREE.Vector3(-halfH, halfV - cornerLen, -d)],
      // top-right
      [new THREE.Vector3(halfH, halfV, -d), new THREE.Vector3(halfH - cornerLen, halfV, -d)],
      [new THREE.Vector3(halfH, halfV, -d), new THREE.Vector3(halfH, halfV - cornerLen, -d)],
      // bottom-left
      [new THREE.Vector3(-halfH, -halfV, -d), new THREE.Vector3(-halfH + cornerLen, -halfV, -d)],
      [new THREE.Vector3(-halfH, -halfV, -d), new THREE.Vector3(-halfH, -halfV + cornerLen, -d)],
      // bottom-right
      [new THREE.Vector3(halfH, -halfV, -d), new THREE.Vector3(halfH - cornerLen, -halfV, -d)],
      [new THREE.Vector3(halfH, -halfV, -d), new THREE.Vector3(halfH, -halfV + cornerLen, -d)],
    ];
    const cornerMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    for (const [a, b] of corners) {
      const cGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
      this.viewfinderGroup.add(new THREE.Line(cGeo, cornerMat));
    }

    // Center crosshair
    const ch = 3;
    const crossPoints = [
      [new THREE.Vector3(-ch, 0, -d), new THREE.Vector3(ch, 0, -d)],
      [new THREE.Vector3(0, -ch, -d), new THREE.Vector3(0, ch, -d)],
    ];
    const crossMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    for (const [a, b] of crossPoints) {
      const cGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
      this.viewfinderGroup.add(new THREE.Line(cGeo, crossMat));
    }

    this.viewfinderGroup.traverse((child) => {
      child.renderOrder = OVERLAY_RENDER_ORDER;
      if (child instanceof THREE.Line && child.material instanceof THREE.Material) {
        child.material.depthTest = false;
        child.material.depthWrite = false;
      }
    });

    // Viewfinder is a child of the camera so it follows where the camera looks
    this.camera.add(this.viewfinderGroup);
    this.scene.add(this.camera); // camera must be in scene to render children
  }

  // ── Direction Arrow (points toward next uncaptured guide) ──

  private createDirectionArrow(): void {
    // Triangle arrow mesh
    const shape = new THREE.Shape();
    shape.moveTo(0, 4);
    shape.lineTo(-2.5, -2);
    shape.lineTo(0, 0);
    shape.lineTo(2.5, -2);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.directionArrow = new THREE.Mesh(geo, mat);
    this.directionArrow.visible = false;
    this.directionArrow.renderOrder = OVERLAY_RENDER_ORDER + 1;

    // Place on edge of viewfinder area, attached to camera
    this.camera.add(this.directionArrow);
  }

  private updateDirectionArrow(): void {
    const nearest = this.findNearest();
    if (!nearest) {
      this.directionArrow.visible = false;
      return;
    }

    const { yaw: camYaw, pitch: camPitch } = this.getCameraDirection();

    // Calculate angle from camera to nearest guide in screen space
    let dYaw = nearest.yaw - camYaw;
    if (dYaw > 180) dYaw -= 360;
    if (dYaw < -180) dYaw += 360;
    const dPitch = nearest.pitch - camPitch;

    // If guide is roughly centered (within viewfinder), hide arrow
    if (Math.abs(dYaw) < 25 && Math.abs(dPitch) < 25) {
      this.directionArrow.visible = false;
      return;
    }

    this.directionArrow.visible = true;

    // Position arrow at edge of viewfinder pointing toward guide
    const angle = Math.atan2(dPitch, dYaw);
    const edgeDist = 35; // distance from center
    const d = GUIDE_DISTANCE - 5;
    this.directionArrow.position.set(
      Math.cos(angle) * edgeDist,
      Math.sin(angle) * edgeDist,
      -d,
    );
    this.directionArrow.rotation.z = angle - Math.PI / 2;
  }

  // ── Guide Markers ──

  private createGuideMarkers(): void {
    const activeLevel = getActiveLevel(this.guidePoints);

    for (const point of this.guidePoints) {
      const color = point.captured ? 0x22c55e : 0xf59e0b;
      const geo = new THREE.SphereGeometry(GUIDE_MARKER_RADIUS, 12, 8);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: point.captured ? 0.3 : 0.7,
        depthTest: false,
      });
      const marker = new THREE.Mesh(geo, mat);
      marker.renderOrder = OVERLAY_RENDER_ORDER;

      const yawRad = point.yaw * DEG2RAD;
      const pitchRad = point.pitch * DEG2RAD;
      marker.position.set(
        GUIDE_DISTANCE * Math.cos(pitchRad) * Math.sin(yawRad),
        GUIDE_DISTANCE * Math.sin(pitchRad),
        -GUIDE_DISTANCE * Math.cos(pitchRad) * Math.cos(yawRad),
      );

      marker.visible = point.level <= activeLevel && !point.captured;
      this.guideMarkerGroup.add(marker);
      this.guideMarkers.set(point.id, marker);
    }

    this.scene.add(this.guideMarkerGroup);
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

  /** Hide all overlays: guide markers, viewfinder, arrow (call before export) */
  setGuidesVisible(visible: boolean): void {
    this.guideMarkerGroup.visible = visible;
    this.viewfinderGroup.visible = visible;
    this.directionArrow.visible = visible;
  }

  // ── Patch Meshes ──

  /** Returns patch id on success, or null if the capture was rejected (overlap / limit). */
  addPatch(
    texture: THREE.Texture,
    yawDeg: number,
    pitchDeg: number,
    hfovDeg: number,
    vfovDeg: number,
  ): string | null {
    if (this.patches.size >= MAX_PATCHES) {
      return null;
    }

    // Reject if this direction overlaps an existing patch
    const existingDirs = Array.from(this.patches.values()).map((p) => ({
      yaw: p.yawDeg,
      pitch: p.pitchDeg,
    }));
    if (wouldOverlap(existingDirs, yawDeg, pitchDeg, MIN_PATCH_SEPARATION)) {
      return null;
    }

    const hfov = hfovDeg * DEG2RAD;
    const vfov = vfovDeg * DEG2RAD;

    // The camera looks at -Z (which is pitch=0, yaw=0).
    // We want the center of the patch to be at -Z before any mesh rotation.
    // Three.js SphereGeometry: x = -r*cos(phi)*sin(theta), z = r*sin(phi)*sin(theta)
    // After geo.scale(-1,1,1), x = r*cos(phi)*sin(theta), z = r*sin(phi)*sin(theta)
    // To center at z = -r, x = 0, we need phi = -Math.PI / 2.
    const phiStart = -Math.PI / 2 - hfov / 2;
    const phiLength = hfov;
    const thetaStart = Math.PI / 2 - vfov / 2;
    const thetaLength = vfov;

    // Each successive patch gets a slightly smaller radius so it renders
    // in front of earlier patches (newer = closer = on top).
    const radius = SPHERE_RADIUS - 1 - this.patches.size * 0.3;

    const geo = new THREE.SphereGeometry(radius, 24, 12, phiStart, phiLength, thetaStart, thetaLength);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fadeEdge: { value: 0.03 },
      },
      vertexShader: PATCH_VERTEX,
      fragmentShader: PATCH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = -yawDeg * DEG2RAD;
    mesh.rotation.x = pitchDeg * DEG2RAD;
    // Transparent patches share the same center point, so rely on explicit
    // render order to keep layering stable (newer patches draw on top).
    mesh.renderOrder = this.patches.size + 1;

    const id = `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.patches.set(id, { mesh, yawDeg, pitchDeg, quaternion: this.camera.quaternion.clone() });
    this.scene.add(mesh);

    return id;
  }

  /** Remove the most recently added patch (undo). Returns true if a patch was removed. */
  undoLastPatch(): boolean {
    if (this.patches.size === 0) return false;

    // Map preserves insertion order — get last entry
    const entries = Array.from(this.patches.entries());
    const [lastId, lastPatch] = entries[entries.length - 1];

    this.scene.remove(lastPatch.mesh);
    lastPatch.mesh.geometry.dispose();
    const mat = lastPatch.mesh.material as THREE.ShaderMaterial;
    (mat.uniforms['map']?.value as THREE.CanvasTexture | undefined)?.dispose();
    mat.dispose();
    this.patches.delete(lastId);

    // Check if we need to un-capture a guide point
    for (const point of this.guidePoints) {
      if (!point.captured) continue;
      // If no remaining patch is near this guide, mark it uncaptured
      const remaining = Array.from(this.patches.values());
      const stillCovered = remaining.some((p) => {
        let dYaw = Math.abs(p.yawDeg - point.yaw);
        if (dYaw > 180) dYaw = 360 - dYaw;
        return dYaw < 30 && Math.abs(p.pitchDeg - point.pitch) < 30;
      });
      if (!stillCovered) {
        point.captured = false;
      }
    }
    this.refreshGuideMarkers();

    return true;
  }

  getPatchCount(): number {
    return this.patches.size;
  }

  setCameraFov(vfovDeg: number): void {
    if (this.camera.fov !== vfovDeg) {
      this.camera.fov = vfovDeg;
      this.camera.updateProjectionMatrix();
    }
  }

  // ── Camera Orientation ──

  updateCameraFromDevice(alpha: number, beta: number, gamma: number): void {
    this.useDeviceOrientation = true;

    const alphaRad = alpha * DEG2RAD;
    const betaRad = beta * DEG2RAD;
    const gammaRad = gamma * DEG2RAD;

    const screenAngleDeg =
      (window.screen.orientation && typeof window.screen.orientation.angle === 'number'
        ? window.screen.orientation.angle
        : (window as Window & { orientation?: number }).orientation) ?? 0;
    const screenOrientRad = screenAngleDeg * DEG2RAD;

    const euler = new THREE.Euler(
      betaRad,
      alphaRad,
      -gammaRad,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(euler);

    // Match Three.js DeviceOrientationControls conversion to avoid yaw drift.
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenOrientRad);
    this.camera.quaternion.multiply(q1);
    this.camera.quaternion.multiply(q0);
  }

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

  // ── Context Loss Handling ──

  onContextLost?: () => void; // called by modal so it can show an error

  private handleContextLost = (e: Event): void => {
    e.preventDefault(); // required to allow restoration attempt
    cancelAnimationFrame(this.animationId);
    this.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    if (!this.disposed) this.animate();
  };

  // ── Render Loop ──

  private animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.updateDirectionArrow();
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
    for (const { mesh } of this.patches.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.ShaderMaterial;
      (mat.uniforms['map']?.value as THREE.Texture | undefined)?.dispose();
      mat.dispose();
    }
    this.patches.clear();

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
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

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

    // Dispose viewfinder geometries
    this.viewfinderGroup.traverse((child) => {
      if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
    this.directionArrow.geometry.dispose();
    (this.directionArrow.material as THREE.MeshBasicMaterial).dispose();

    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
