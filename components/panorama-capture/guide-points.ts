export interface GuidePoint {
  id: string;
  yaw: number;   // degrees, 0-360
  pitch: number;  // degrees, -90 to 90
  level: 1 | 2 | 3;
  captured: boolean;
}

// Level 1: equatorial ring, 30° spacing (12 shots).
// Level 2: upper ring at pitch +65° — high enough to clear portrait-mode Level 1 patches
//          which cover up to ~±43° vertically at 55° hFOV / 9:16 aspect.
// Level 3: lower ring at pitch -65° (symmetric).
// Same yaws across levels means no cross-level overlap confusion.
const LEVEL_1_YAWS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const LEVEL_2_YAWS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const LEVEL_3_YAWS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export const LEVEL_2_PITCH = 65;
export const LEVEL_3_PITCH = -65;

export function generateGuidePoints(): GuidePoint[] {
  const points: GuidePoint[] = [];

  LEVEL_1_YAWS.forEach((yaw, i) => {
    points.push({ id: `L1-${i}`, yaw, pitch: 0, level: 1, captured: false });
  });
  LEVEL_2_YAWS.forEach((yaw, i) => {
    points.push({ id: `L2-${i}`, yaw, pitch: LEVEL_2_PITCH, level: 2, captured: false });
  });
  LEVEL_3_YAWS.forEach((yaw, i) => {
    points.push({ id: `L3-${i}`, yaw, pitch: LEVEL_3_PITCH, level: 3, captured: false });
  });

  return points;
}

export function getActiveLevel(points: GuidePoint[]): 1 | 2 | 3 {
  const level1 = points.filter((p) => p.level === 1);
  const level1Done = level1.filter((p) => p.captured).length;
  if (level1Done < level1.length) return 1;

  const level2 = points.filter((p) => p.level === 2);
  const level2Done = level2.filter((p) => p.captured).length;
  if (level2Done < level2.length) return 2;

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

/**
 * Check whether a new capture at (yaw, pitch) would overlap too much
 * with an existing set of captured directions.
 * Returns true if the new direction is too close to an existing one.
 */
export function wouldOverlap(
  existingDirections: Array<{ yaw: number; pitch: number }>,
  yaw: number,
  pitch: number,
  minSeparationDeg = 40,
): boolean {
  for (const dir of existingDirections) {
    if (angularDistance(dir.yaw, dir.pitch, yaw, pitch) < minSeparationDeg) {
      return true;
    }
  }
  return false;
}
