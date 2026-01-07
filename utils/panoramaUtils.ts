/**
 * Panorama Utility Functions
 * Single Responsibility: Shared utilities for panorama handling
 * DRY: Used by both TourViewer and XRPanoramaViewer
 */

import { Scene, Hotspot, TourConfig } from '@/types/tour';

/**
 * Get the full URL for a panorama image
 * @param imagePath - Image filename or full URL
 * @param projectCode - Project code for local images
 * @returns Full image URL
 */
export function getImageUrl(imagePath: string, projectCode: string): string {
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  return `/projects/${projectCode}/images/${encodeURIComponent(imagePath)}`;
}

/**
 * Get the full URL for an audio file
 * @param audioPath - Audio filename or full URL
 * @param projectCode - Project code for local audio
 * @returns Full audio URL
 */
export function getAudioUrl(audioPath: string, projectCode: string): string {
  if (audioPath.startsWith('http')) {
    return audioPath;
  }
  return `/projects/${projectCode}/audio/${encodeURIComponent(audioPath)}`;
}

/**
 * Get scene by ID from config
 * @param config - Tour configuration
 * @param sceneId - Scene ID to find
 * @returns Scene object or undefined
 */
export function getSceneById(config: TourConfig, sceneId: string): Scene | undefined {
  return config.scenes.find(s => s.id === sceneId);
}

/**
 * Get all hotspots for a scene
 * @param scene - Scene object
 * @returns Array of hotspots
 */
export function getSceneHotspots(scene: Scene): Hotspot[] {
  return scene.hotspots || [];
}

/**
 * Get only scene transition hotspots
 * @param scene - Scene object
 * @returns Array of scene-type hotspots
 */
export function getSceneTransitionHotspots(scene: Scene): Hotspot[] {
  return scene.hotspots.filter(h => h.type === 'scene');
}

/**
 * Get only info hotspots
 * @param scene - Scene object
 * @returns Array of info-type hotspots
 */
export function getInfoHotspots(scene: Scene): Hotspot[] {
  return scene.hotspots.filter(h => h.type === 'info');
}

/**
 * Get initial view for a scene
 * @param scene - Scene object
 * @returns Initial view parameters
 */
export function getInitialView(scene: Scene): { pitch: number; yaw: number; hfov: number } {
  return {
    pitch: scene.initialView?.pitch || 0,
    yaw: scene.initialView?.yaw || 0,
    hfov: scene.initialView?.hfov || 110,
  };
}

/**
 * Convert degrees to radians
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Convert spherical coordinates (pitch, yaw) to 3D cartesian coordinates
 * Used for positioning hotspots on the panorama sphere
 * @param pitch - Pitch angle in degrees
 * @param yaw - Yaw angle in degrees
 * @param radius - Sphere radius
 * @returns {x, y, z} coordinates
 */
export function sphericalToCartesian(
  pitch: number,
  yaw: number,
  radius: number
): { x: number; y: number; z: number } {
  const pitchRad = degreesToRadians(pitch);
  const yawRad = degreesToRadians(yaw);

  // Convert Pannellum coordinates to Three.js coordinates
  // Pannellum: pitch = up/down (0 = horizon), yaw = left/right (0 = front)
  // Three.js: y = up, z = forward, x = right
  const x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
  const y = radius * Math.sin(pitchRad);
  const z = -radius * Math.cos(pitchRad) * Math.cos(yawRad);

  return { x, y, z };
}

/**
 * Convert cartesian coordinates to spherical (pitch, yaw)
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns {pitch, yaw} in degrees
 */
export function cartesianToSpherical(
  x: number,
  y: number,
  z: number
): { pitch: number; yaw: number } {
  const radius = Math.sqrt(x * x + y * y + z * z);
  const pitch = radiansToDegrees(Math.asin(y / radius));
  const yaw = radiansToDegrees(Math.atan2(x, -z));

  return { pitch, yaw };
}

/**
 * Normalize yaw angle to -180 to 180 range
 * @param yaw - Yaw angle in degrees
 * @returns Normalized yaw
 */
export function normalizeYaw(yaw: number): number {
  while (yaw > 180) yaw -= 360;
  while (yaw < -180) yaw += 360;
  return yaw;
}

/**
 * Clamp pitch angle to valid range
 * @param pitch - Pitch angle in degrees
 * @param min - Minimum pitch (default: -85)
 * @param max - Maximum pitch (default: 85)
 * @returns Clamped pitch
 */
export function clampPitch(pitch: number, min: number = -85, max: number = 85): number {
  return Math.max(min, Math.min(max, pitch));
}

/**
 * Calculate distance between two spherical points
 * @param pitch1 - First point pitch
 * @param yaw1 - First point yaw
 * @param pitch2 - Second point pitch
 * @param yaw2 - Second point yaw
 * @returns Angular distance in degrees
 */
export function sphericalDistance(
  pitch1: number,
  yaw1: number,
  pitch2: number,
  yaw2: number
): number {
  const p1 = degreesToRadians(pitch1);
  const y1 = degreesToRadians(yaw1);
  const p2 = degreesToRadians(pitch2);
  const y2 = degreesToRadians(yaw2);

  // Haversine formula for spherical distance
  const dLat = p2 - p1;
  const dLon = y2 - y1;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiansToDegrees(c);
}

/**
 * Format time remaining as string
 * @param milliseconds - Time in milliseconds
 * @returns Formatted string (e.g., "3.2s")
 */
export function formatTimeRemaining(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${seconds}s`;
}

/**
 * Lerp (linear interpolation) between two values
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Ease-out cubic function for smooth animations
 * @param t - Input (0-1)
 * @returns Eased output (0-1)
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease-in-out cubic function for smooth transitions
 * @param t - Input (0-1)
 * @returns Eased output (0-1)
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
