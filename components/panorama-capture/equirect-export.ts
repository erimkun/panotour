import * as THREE from 'three';
import type { SphereCaptureScene } from './SphereCaptureScene';

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
    float lon = vUv.x * 2.0 * PI;
    float lat = vUv.y * PI - PI * 0.5;

    // Center of image (u=0.5) is Front (-Z, lon=PI)
    // Right of image (u=0.75) is Right (+X, lon=1.5PI)
    vec3 dir = vec3(
      -cos(lat) * sin(lon),
      sin(lat),
      cos(lat) * cos(lon)
    );

    gl_FragColor = textureCube(tCube, dir);
  }
`;

interface ExportPreset {
  width: number;
  height: number;
  cubeSize: number;
  jpegQuality: number;
  chunkRows: number;
}

async function renderEquirectWithPreset(
  captureScene: SphereCaptureScene,
  preset: ExportPreset,
): Promise<Blob> {
  const { renderer, scene } = captureScene;

  // Save current renderer state
  const prevRenderTarget = renderer.getRenderTarget();
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);

  const cubeRT = new THREE.WebGLCubeRenderTarget(preset.cubeSize);
  const equirectRT = new THREE.WebGLRenderTarget(preset.width, preset.height);
  let material: THREE.ShaderMaterial | null = null;
  let quadGeo: THREE.PlaneGeometry | null = null;

  try {
    // 1. Render scene into cubemap
    const cubeCamera = new THREE.CubeCamera(0.1, 1100, cubeRT);
    cubeCamera.position.set(0, 0, 0);
    cubeCamera.update(renderer, scene);

    // 2. Cubemap → equirectangular via shader
    material = new THREE.ShaderMaterial({
      uniforms: { tCube: { value: cubeRT.texture } },
      vertexShader: EQUIRECT_VERTEX,
      fragmentShader: EQUIRECT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    quadGeo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeo, material);
    const orthoScene = new THREE.Scene();
    orthoScene.add(quad);
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    renderer.setRenderTarget(equirectRT);
    renderer.render(orthoScene, orthoCamera);

    // 3. Read pixels — process in row-chunks to reduce peak memory
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context olusturulamadi');

    for (let startY = 0; startY < preset.height; startY += preset.chunkRows) {
      const rowCount = Math.min(preset.chunkRows, preset.height - startY);
      const buf = new Uint8Array(preset.width * rowCount * 4);
      renderer.readRenderTargetPixels(equirectRT, 0, startY, preset.width, rowCount, buf);

      // WebGL is bottom-up, canvas is top-down
      const imageData = ctx.createImageData(preset.width, rowCount);
      for (let localY = 0; localY < rowCount; localY++) {
        const srcRow = (rowCount - 1 - localY) * preset.width * 4;
        const dstRow = localY * preset.width * 4;
        imageData.data.set(buf.subarray(srcRow, srcRow + preset.width * 4), dstRow);
      }

      const canvasY = preset.height - startY - rowCount;
      ctx.putImageData(imageData, 0, canvasY);

      // Yield control to main thread to prevent watchdog kill
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('JPEG blob olusturulamadi'))),
        'image/jpeg',
        preset.jpegQuality,
      );
    });
  } finally {
    // Restore renderer state
    renderer.setRenderTarget(prevRenderTarget);
    renderer.setSize(prevSize.x, prevSize.y);

    // Dispose temporary GPU resources
    cubeRT.dispose();
    equirectRT.dispose();
    material?.dispose();
    quadGeo?.dispose();
  }
}

/**
 * Export the sphere scene as an equirectangular JPEG.
 *
 * Key safeguards:
 * - Guide markers are hidden before render and restored after
 * - Uses 1024 cubemap faces (not 2048) to reduce GPU memory pressure
 * - Processes pixels in row chunks to avoid huge single allocation
 * - All temporary GPU resources are disposed in a finally block
 */
export async function exportEquirectangular(
  captureScene: SphereCaptureScene,
  width = 2048,
  height = 1024,
): Promise<Blob> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // iOS Safari is the primary platform that reloads the page under GPU memory pressure.
  // Also treat any device reporting ≤4 GB as low-memory.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const lowMemoryDevice =
    isIOS || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4);

  const presets: ExportPreset[] = lowMemoryDevice
    ? [
        { width: 512, height: 256, cubeSize: 128, jpegQuality: 0.75, chunkRows: 32 },
        { width: 256, height: 128, cubeSize: 64, jpegQuality: 0.65, chunkRows: 16 },
      ]
    : [
        { width: 1024, height: 512, cubeSize: 256, jpegQuality: 0.8, chunkRows: 64 },
        { width: 512, height: 256, cubeSize: 128, jpegQuality: 0.7, chunkRows: 32 },
        { width: 256, height: 128, cubeSize: 64, jpegQuality: 0.65, chunkRows: 16 },
      ];

  let lastError: unknown = null;

  try {
    captureScene.setGuidesVisible(false);

    for (const preset of presets) {
      try {
        return await renderEquirectWithPreset(captureScene, preset);
      } catch (err) {
        lastError = err;
      }

      // Give the browser a chance to run GC before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Export basarisiz. Cihaz belleği yetersiz olabilir.');
  } finally {
    // Restore guide markers
    captureScene.setGuidesVisible(true);
  }
}
