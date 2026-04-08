// 16 fixed sphere points arranged as 4-8-4 rings.
// Written from scratch for the AI Panorama camera tab — intentionally NOT
// importing anything from components/panorama-capture/.
//
// Layout rationale (horizontal FOV = 53°):
//   - Middle ring: 8 photos at pitch 0° with 45° yaw spacing
//       → 8×45° = 360° coverage, ~8° overlap (minimal)
//   - Top ring:    4 photos at pitch +60° with 90° yaw spacing (dome)
//   - Bottom ring: 4 photos at pitch -60° with 90° yaw spacing (dome)
//
// 16 total, no zenith/nadir cap shot — the AI fills poles from surrounding frames.

export interface GuidePoint {
  id: string;       // stable id, e.g. 'mid-0', 'top-1', 'bot-2'
  yaw: number;      // degrees, 0 = +Z forward, increases toward +X (right)
  pitch: number;    // degrees, 0 = horizon, +up
  ring: 'middle' | 'top' | 'bottom';
  index: number;    // position within its ring (0-based)
}

const MIDDLE_YAWS = [0, 45, 90, 135, 180, 225, 270, 315];
const TOP_BOTTOM_YAWS = [0, 90, 180, 270];
const TOP_PITCH = 60;
const BOTTOM_PITCH = -60;

export const GUIDE_POINTS_16: readonly GuidePoint[] = [
  ...MIDDLE_YAWS.map((yaw, i): GuidePoint => ({
    id: `mid-${i}`,
    yaw,
    pitch: 0,
    ring: 'middle',
    index: i,
  })),
  ...TOP_BOTTOM_YAWS.map((yaw, i): GuidePoint => ({
    id: `top-${i}`,
    yaw,
    pitch: TOP_PITCH,
    ring: 'top',
    index: i,
  })),
  ...TOP_BOTTOM_YAWS.map((yaw, i): GuidePoint => ({
    id: `bot-${i}`,
    yaw,
    pitch: BOTTOM_PITCH,
    ring: 'bottom',
    index: i,
  })),
] as const;

export const TOTAL_POINTS = GUIDE_POINTS_16.length;

/**
 * Convert yaw/pitch (degrees) to a Cartesian position on a sphere of `radius`.
 * Yaw is measured around +Y axis, pitch is tilt from horizon (+up).
 * Matches Three.js right-handed coordinate system.
 */
export function yawPitchToCartesian(
  yaw: number,
  pitch: number,
  radius: number,
): { x: number; y: number; z: number } {
  const yawRad = (yaw * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;
  const cosPitch = Math.cos(pitchRad);
  return {
    x: radius * cosPitch * Math.sin(yawRad),
    y: radius * Math.sin(pitchRad),
    z: radius * cosPitch * Math.cos(yawRad),
  };
}

/**
 * Spherical great-circle distance between two yaw/pitch points, in degrees.
 * Uses the haversine-style formula adapted for yaw/pitch.
 */
export function angularDistance(
  yaw1: number,
  pitch1: number,
  yaw2: number,
  pitch2: number,
): number {
  const p1 = (pitch1 * Math.PI) / 180;
  const p2 = (pitch2 * Math.PI) / 180;
  const dy = ((yaw2 - yaw1) * Math.PI) / 180;

  const cosD = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dy);
  // Clamp to avoid NaN from floating-point drift.
  const clamped = Math.max(-1, Math.min(1, cosD));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Find the guide point closest to the given yaw/pitch, within a threshold.
 * Returns null if no point is within the threshold.
 */
export function findNearestGuide(
  yaw: number,
  pitch: number,
  thresholdDeg: number,
): GuidePoint | null {
  let best: GuidePoint | null = null;
  let bestDist = thresholdDeg;
  for (const point of GUIDE_POINTS_16) {
    const d = angularDistance(yaw, pitch, point.yaw, point.pitch);
    if (d < bestDist) {
      bestDist = d;
      best = point;
    }
  }
  return best;
}
