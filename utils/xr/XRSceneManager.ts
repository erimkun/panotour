/**
 * XR Scene Manager
 * Single Responsibility: Manage Three.js scene, camera, and renderer for XR
 * Handles panorama sphere, hotspots, and WebXR session
 */

import * as THREE from 'three';
import { Hotspot } from '@/types/tour';
import { XRConfig, DEFAULT_XR_CONFIG } from '@/types/xr';
import { getTextureCache } from './textureCache';
import { sphericalToCartesian } from '@/utils/panoramaUtils';
import { GazeController } from './GazeController';

export interface HotspotMesh {
  id: string;
  hotspot: Hotspot;
  group: THREE.Group;
  sprite: THREE.Sprite;
  ring: THREE.Mesh;
  label: THREE.Sprite;
}

export class XRSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private sphere: THREE.Mesh;
  private hotspotMeshes: Map<string, HotspotMesh> = new Map();
  private gazeController: GazeController;
  private gazePointer: THREE.Sprite | null = null;
  private config: XRConfig;
  private container: HTMLElement;
  private animationFrameId: number | null = null;
  private onSceneChange: ((sceneId: string) => void) | null = null;
  private isTransitioning: boolean = false;
  private isDisposed: boolean = false;
  private contextLostHandler: ((event: Event) => void) | null = null;
  private contextRestoredHandler: ((event: Event) => void) | null = null;

  constructor(container: HTMLElement, config: Partial<XRConfig> = {}) {
    this.config = { ...DEFAULT_XR_CONFIG, ...config };
    this.container = container;

    // Initialize Three.js components
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.sphere = this.createPanoramaSphere();
    this.gazeController = new GazeController({
      gazeDuration: this.config.gazeDuration,
    });

    // Add sphere to scene
    this.scene.add(this.sphere);

    // Create gaze pointer
    this.createGazePointer();

    // Handle resize
    window.addEventListener('resize', this.handleResize);

    // Handle WebGL context lost/restored
    this.contextLostHandler = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost - stopping animation');
      this.stopAnimation();
    };

    this.contextRestoredHandler = () => {
      console.log('WebGL context restored - restarting animation');
      if (!this.isDisposed) {
        this.startAnimation();
      }
    };

    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);
  }

  private createCamera(): THREE.PerspectiveCamera {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(0, 0, 0);
    return camera;
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.xr.enabled = true;
    this.container.appendChild(renderer.domElement);
    return renderer;
  }

  private createPanoramaSphere(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(
      this.config.sphereRadius,
      this.config.sphereSegments,
      this.config.sphereSegments / 2
    );
    // Flip the geometry inside out for viewing from inside
    geometry.scale(-1, 1, 1);

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createGazePointer(): void {
    // Create a small dot at the center of view
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Outer ring
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(32, 32, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.gazePointer = new THREE.Sprite(material);
    this.gazePointer.scale.set(this.config.gazePointerSize, this.config.gazePointerSize, 1);
    this.gazePointer.position.set(0, 0, -0.5);
    this.gazePointer.renderOrder = 999;

    this.camera.add(this.gazePointer);
    this.scene.add(this.camera);
  }

  /**
   * Load a panorama texture and display it
   */
  async loadPanorama(imageUrl: string, onProgress?: (progress: number) => void): Promise<void> {
    const cache = getTextureCache();
    
    try {
      const texture = await cache.load(imageUrl, onProgress);
      const material = this.sphere.material as THREE.MeshBasicMaterial;
      
      // Dispose old texture if exists
      if (material.map) {
        // Don't dispose - it's in cache
      }
      
      material.map = texture;
      material.needsUpdate = true;
    } catch (error) {
      console.error('Failed to load panorama:', error);
      throw error;
    }
  }

  /**
   * Transition to a new panorama with fade effect
   */
  async transitionToPanorama(
    imageUrl: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const duration = this.config.transitionDuration;
    const material = this.sphere.material as THREE.MeshBasicMaterial;

    // Fade out
    await this.animateOpacity(material, 1, 0, duration / 2);

    // Load new texture
    await this.loadPanorama(imageUrl, onProgress);

    // Fade in
    await this.animateOpacity(material, 0, 1, duration / 2);

    this.isTransitioning = false;
  }

  private animateOpacity(
    material: THREE.MeshBasicMaterial,
    from: number,
    to: number,
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        material.opacity = from + (to - from) * progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Create hotspot meshes for a scene
   */
  createHotspots(hotspots: Hotspot[]): void {
    // Clear existing hotspots
    this.clearHotspots();

    hotspots.forEach(hotspot => {
      if (hotspot.type !== 'scene') return; // Only scene hotspots for VR

      const mesh = this.createHotspotMesh(hotspot);
      this.hotspotMeshes.set(hotspot.id, mesh);
      this.scene.add(mesh.group);

      // Register with gaze controller
      this.gazeController.addTarget({
        id: hotspot.id,
        object: mesh.group,
        onActivate: () => {
          if (this.onSceneChange && hotspot.targetSceneId) {
            this.onSceneChange(hotspot.targetSceneId);
          }
        },
      });
    });
  }

  private createHotspotMesh(hotspot: Hotspot): HotspotMesh {
    const group = new THREE.Group();
    const position = sphericalToCartesian(
      hotspot.pitch,
      hotspot.yaw,
      this.config.sphereRadius * 0.9
    );
    // Mirror X position to match the mirrored sphere geometry (scale -1, 1, 1)
    group.position.set(-position.x, position.y, position.z);
    group.lookAt(0, 0, 0);

    // Main hotspot sprite
    const spriteCanvas = this.createHotspotCanvas(hotspot);
    const spriteTexture = new THREE.CanvasTexture(spriteCanvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: spriteTexture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    const size = (hotspot.size || 1) * this.config.hotspotScale * 20;
    sprite.scale.set(size, size, 1);
    sprite.renderOrder = 1; // Ensure drawn after sphere
    group.add(sprite);

    // Loading ring (initially invisible)
    const ring = this.createLoadingRing(hotspot);
    ring.visible = false;
    ring.renderOrder = 1; // Ensure drawn after sphere
    group.add(ring);

    // Label sprite
    const labelCanvas = this.createLabelCanvas(hotspot.text);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.scale.set(40, 10, 1);
    label.position.set(0, -size / 2 - 8, 0);
    label.visible = false;
    label.renderOrder = 1; // Ensure drawn after sphere
    group.add(label);

    return { id: hotspot.id, hotspot, group, sprite, ring, label };
  }

  private createHotspotCanvas(hotspot: Hotspot): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const centerX = 64;
    const centerY = 64;
    const radius = 50;

    // Background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = hotspot.color || 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Arrow icon for scene transitions
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY);
    ctx.lineTo(centerX + 15, centerY);
    ctx.lineTo(centerX + 5, centerY - 12);
    ctx.moveTo(centerX + 15, centerY);
    ctx.lineTo(centerX + 5, centerY + 12);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    return canvas;
  }

  private createLoadingRing(hotspot: Hotspot): THREE.Mesh {
    const geometry = new THREE.RingGeometry(28, 35, 64);
    
    // Custom shader material for animated progress
    const material = new THREE.ShaderMaterial({
      uniforms: {
        progress: { value: 0.0 },
        color: { value: new THREE.Color(hotspot.color || '#3b82f6') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float progress;
        uniform vec3 color;
        varying vec2 vUv;
        
        void main() {
          float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
          float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);
          
          if (normalizedAngle <= progress) {
            gl_FragColor = vec4(color, 1.0);
          } else {
            gl_FragColor = vec4(color, 0.2);
          }
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.z = Math.PI / 2; // Start from top
    return ring;
  }

  private createLabelCanvas(text: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(0, 0, canvas.width, canvas.height, 16);
    ctx.fill();

    // Text
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas;
  }

  /**
   * Update hotspot visuals based on gaze state
   */
  updateHotspotGaze(hotspotId: string | null, progress: number): void {
    this.hotspotMeshes.forEach((mesh, id) => {
      const isGazed = id === hotspotId;
      
      // Show/hide loading ring
      mesh.ring.visible = isGazed && progress > 0;
      
      // Update ring progress
      if (isGazed && mesh.ring.material instanceof THREE.ShaderMaterial) {
        mesh.ring.material.uniforms.progress.value = progress;
      }
      
      // Show label on gaze
      mesh.label.visible = isGazed;
      
      // Scale effect
      const targetScale = isGazed ? 1.2 : 1.0;
      mesh.sprite.scale.lerp(
        new THREE.Vector3(
          targetScale * (mesh.hotspot.size || 1) * this.config.hotspotScale * 20,
          targetScale * (mesh.hotspot.size || 1) * this.config.hotspotScale * 20,
          1
        ),
        0.1
      );
    });
  }

  /**
   * Clear all hotspots from the scene
   */
  clearHotspots(): void {
    this.hotspotMeshes.forEach(mesh => {
      this.scene.remove(mesh.group);
      mesh.sprite.material.dispose();
      mesh.ring.geometry.dispose();
      (mesh.ring.material as THREE.Material).dispose();
      mesh.label.material.dispose();
    });
    this.hotspotMeshes.clear();
    this.gazeController.clearTargets();
  }

  /**
   * Set camera rotation from pitch/yaw
   */
  setCameraRotation(pitch: number, yaw: number): void {
    // Convert degrees to radians
    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const yawRad = THREE.MathUtils.degToRad(yaw);

    // Create rotation
    this.camera.rotation.set(pitchRad, yawRad, 0, 'YXZ');
  }

  /**
   * Set scene change callback
   */
  setOnSceneChange(callback: (sceneId: string) => void): void {
    this.onSceneChange = callback;
  }

  /**
   * Get the renderer for XR session
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Get the camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get gaze controller
   */
  getGazeController(): GazeController {
    return this.gazeController;
  }

  /**
   * Render the scene
   */
  render(): void {
    // Don't render if disposed or context lost
    if (this.isDisposed) return;
    
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) return;

    // Update gaze controller
    const gazeState = this.gazeController.update(this.camera);
    this.updateHotspotGaze(gazeState.targetHotspotId, gazeState.progress);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Start animation loop
   */
  startAnimation(): void {
    if (this.isDisposed) return;
    
    this.renderer.setAnimationLoop(() => {
      if (!this.isDisposed) {
        this.render();
      }
    });
  }

  /**
   * Stop animation loop
   */
  stopAnimation(): void {
    try {
      if (this.renderer && !this.isDisposed) {
        this.renderer.setAnimationLoop(null);
      }
    } catch (error) {
      console.warn('Error stopping animation loop:', error);
    }
  }

  private handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    window.removeEventListener('resize', this.handleResize);

    // Remove context lost/restored handlers
    if (this.contextLostHandler) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler);
    }
    if (this.contextRestoredHandler) {
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
    }

    // End XR session if active
    if (this.renderer.xr.isPresenting) {
      try {
        const session = this.renderer.xr.getSession();
        if (session) {
          session.end().catch(console.warn);
        }
      } catch (error) {
        console.warn('Error ending XR session during dispose:', error);
      }
    }

    this.stopAnimation();
    this.clearHotspots();

    // Dispose Three.js resources
    try {
      this.sphere.geometry.dispose();
      (this.sphere.material as THREE.Material).dispose();
      
      if (this.gazePointer) {
        this.gazePointer.material.dispose();
      }

      this.renderer.dispose();
      this.gazeController.dispose();

      // Remove canvas from DOM
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    } catch (error) {
      console.warn('Error disposing Three.js resources:', error);
    }
  }
}

export default XRSceneManager;
