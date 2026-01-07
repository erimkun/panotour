/**
 * Gaze Controller
 * Single Responsibility: Handle gaze-based interaction detection
 * Manages raycasting, timing, and progress calculation
 */

import * as THREE from 'three';
import { GazeState } from '@/types/xr';

export interface GazeTarget {
  id: string;
  object: THREE.Object3D;
  onActivate: () => void;
}

export interface GazeControllerConfig {
  gazeDuration: number;      // Time required to activate (ms)
  activationAngle: number;   // Max angle from center to count as gaze (degrees)
}

const DEFAULT_CONFIG: GazeControllerConfig = {
  gazeDuration: 5000,
  activationAngle: 5,
};

export class GazeController {
  private config: GazeControllerConfig;
  private targets: Map<string, GazeTarget> = new Map();
  private raycaster: THREE.Raycaster;
  private currentTarget: GazeTarget | null = null;
  private gazeStartTime: number | null = null;
  private onProgressChange: ((state: GazeState) => void) | null = null;
  private onActivate: ((targetId: string) => void) | null = null;
  private isActive: boolean = true;
  private cooldownUntil: number = 0;
  private cooldownDuration: number = 1000; // 1 second cooldown after activation

  constructor(config: Partial<GazeControllerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.raycaster = new THREE.Raycaster();
    
    // Set raycaster parameters for better precision
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
  }

  /**
   * Register a target for gaze interaction
   */
  addTarget(target: GazeTarget): void {
    this.targets.set(target.id, target);
  }

  /**
   * Remove a target
   */
  removeTarget(id: string): void {
    this.targets.delete(id);
    if (this.currentTarget?.id === id) {
      this.resetGaze();
    }
  }

  /**
   * Clear all targets
   */
  clearTargets(): void {
    this.targets.clear();
    this.resetGaze();
  }

  /**
   * Set progress change callback
   */
  setOnProgressChange(callback: (state: GazeState) => void): void {
    this.onProgressChange = callback;
  }

  /**
   * Set activation callback
   */
  setOnActivate(callback: (targetId: string) => void): void {
    this.onActivate = callback;
  }

  /**
   * Update gaze detection - call this every frame
   * @param camera - The camera to raycast from
   */
  update(camera: THREE.Camera): GazeState {
    const state: GazeState = {
      targetHotspotId: null,
      gazeStartTime: null,
      progress: 0,
      isComplete: false,
    };

    if (!this.isActive) {
      return state;
    }

    // Check cooldown
    if (Date.now() < this.cooldownUntil) {
      this.notifyProgress(state);
      return state;
    }

    // Cast ray from camera center
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Get all target objects
    const targetObjects = Array.from(this.targets.values()).map(t => t.object);
    
    if (targetObjects.length === 0) {
      if (this.currentTarget) {
        this.resetGaze();
      }
      return state;
    }

    // Check for intersections
    const intersects = this.raycaster.intersectObjects(targetObjects, true);

    if (intersects.length > 0) {
      // Find the target that owns this object
      const hitObject = intersects[0].object;
      const target = this.findTargetByObject(hitObject);

      if (target) {
        return this.handleGazeOn(target);
      }
    }

    // No intersection - reset if we had a target
    if (this.currentTarget) {
      this.resetGaze();
    }

    this.notifyProgress(state);
    return state;
  }

  /**
   * Handle gaze on a target
   */
  private handleGazeOn(target: GazeTarget): GazeState {
    const now = Date.now();

    // New target or same target?
    if (this.currentTarget?.id !== target.id) {
      // New target - start fresh
      this.currentTarget = target;
      this.gazeStartTime = now;
    }

    // Calculate progress
    const elapsed = now - (this.gazeStartTime || now);
    const progress = Math.min(elapsed / this.config.gazeDuration, 1);

    const state: GazeState = {
      targetHotspotId: target.id,
      gazeStartTime: this.gazeStartTime,
      progress,
      isComplete: false,
    };

    // Check if activation threshold reached
    if (progress >= 1) {
      state.isComplete = true;
      this.activateTarget(target);
    }

    this.notifyProgress(state);
    return state;
  }

  /**
   * Activate a target after gaze duration complete
   */
  private activateTarget(target: GazeTarget): void {
    // Start cooldown
    this.cooldownUntil = Date.now() + this.cooldownDuration;
    
    // Reset current gaze
    this.currentTarget = null;
    this.gazeStartTime = null;

    // Trigger callbacks
    if (this.onActivate) {
      this.onActivate(target.id);
    }
    target.onActivate();
  }

  /**
   * Reset gaze state
   */
  private resetGaze(): void {
    this.currentTarget = null;
    this.gazeStartTime = null;
  }

  /**
   * Find target by child object (for nested meshes)
   */
  private findTargetByObject(object: THREE.Object3D): GazeTarget | null {
    // Check if this object or any parent is a registered target
    let current: THREE.Object3D | null = object;
    
    while (current) {
      for (const target of this.targets.values()) {
        if (target.object === current || target.object.uuid === current.uuid) {
          return target;
        }
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Notify progress change
   */
  private notifyProgress(state: GazeState): void {
    if (this.onProgressChange) {
      this.onProgressChange(state);
    }
  }

  /**
   * Pause gaze detection
   */
  pause(): void {
    this.isActive = false;
    this.resetGaze();
  }

  /**
   * Resume gaze detection
   */
  resume(): void {
    this.isActive = true;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<GazeControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): GazeControllerConfig {
    return { ...this.config };
  }

  /**
   * Get current gaze state
   */
  getCurrentState(): GazeState {
    if (!this.currentTarget || !this.gazeStartTime) {
      return {
        targetHotspotId: null,
        gazeStartTime: null,
        progress: 0,
        isComplete: false,
      };
    }

    const elapsed = Date.now() - this.gazeStartTime;
    const progress = Math.min(elapsed / this.config.gazeDuration, 1);

    return {
      targetHotspotId: this.currentTarget.id,
      gazeStartTime: this.gazeStartTime,
      progress,
      isComplete: progress >= 1,
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.targets.clear();
    this.currentTarget = null;
    this.gazeStartTime = null;
    this.onProgressChange = null;
    this.onActivate = null;
  }
}

export default GazeController;
