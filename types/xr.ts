/**
 * WebXR Type Definitions
 * Single Responsibility: Only XR-related type definitions
 */

import * as THREE from 'three';
import { Hotspot, TourConfig, VRConfig } from './tour';

// XR Session States
export type XRSessionMode = 'immersive-vr' | 'inline' | null;

export interface XRState {
  isSupported: boolean;
  isSessionActive: boolean;
  sessionMode: XRSessionMode;
  error: string | null;
}

// XR Configuration
export interface XRConfig {
  gazeDuration: number;        // Gaze activation time in ms (default: 5000)
  gazePointerSize: number;     // Center pointer size (default: 0.02)
  hotspotScale: number;        // Hotspot size multiplier in VR (default: 1.5)
  transitionDuration: number;  // Scene fade duration in ms (default: 1000)
  showProgressText: boolean;   // Show remaining time text (default: true)
  hapticFeedback: boolean;     // Enable haptic feedback (default: true)
  sphereRadius: number;        // Panorama sphere radius (default: 500)
  sphereSegments: number;      // Sphere geometry segments (default: 60)
}

export const DEFAULT_XR_CONFIG: XRConfig = {
  gazeDuration: 5000,
  gazePointerSize: 0.02,
  hotspotScale: 1.5,
  transitionDuration: 1000,
  showProgressText: true,
  hapticFeedback: true,
  sphereRadius: 500,
  sphereSegments: 60,
};

// XR Panorama Viewer Props
export interface XRPanoramaViewerProps {
  config: TourConfig;
  projectCode: string;
  initialSceneId: string;
  initialPitch?: number;
  initialYaw?: number;
  xrConfig?: Partial<XRConfig>;
  vrConfig?: VRConfig; // VR-specific config for hotspot overrides
  onExit: () => void;
  onSceneChange?: (sceneId: string) => void;
}

// XR Hotspot Props
export interface XRHotspotProps {
  hotspot: Hotspot;
  isGazed: boolean;
  gazeProgress: number; // 0-1
  scale?: number;
}

// XR Loading Ring Props
export interface XRLoadingRingProps {
  progress: number; // 0-1
  color?: string;
  size?: number;
  showText?: boolean;
  remainingTime?: number; // seconds
}

// XR Gaze Pointer Props
export interface XRGazePointerProps {
  size?: number;
  color?: string;
  isActive?: boolean;
}

// Gaze Interaction State
export interface GazeState {
  targetHotspotId: string | null;
  gazeStartTime: number | null;
  progress: number; // 0-1
  isComplete: boolean;
}

// XR Scene Transition
export interface SceneTransition {
  fromSceneId: string;
  toSceneId: string;
  targetPitch?: number;
  targetYaw?: number;
  targetHfov?: number;
}

// XR Button Props
export interface XRButtonProps {
  config: TourConfig;
  projectCode: string;
  currentSceneId: string;
  currentPitch?: number;
  currentYaw?: number;
}

// Texture Cache Entry
export interface TextureCacheEntry {
  url: string;
  texture: THREE.Texture | null;
  loading: boolean;
  error: string | null;
  lastAccessed: number;
}
