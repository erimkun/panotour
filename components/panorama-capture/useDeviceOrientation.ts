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

// Low-pass filter to dampen jitter. Lower = smoother but more lag.
// 0.15 is aggressive smoothing — needed because phone gyro jitter
// was causing the auto-capture stability check to constantly reset.
const SMOOTHING = 0.15;

function lerpAngle(current: number, target: number, t: number): number {
  // Handle wraparound for alpha (0-360)
  let diff = target - current;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return current + diff * t;
}

export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const [orientation, setOrientation] = useState<OrientationData | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('idle');
  const listenerAttached = useRef(false);
  const smoothed = useRef<OrientationData | null>(null);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    // Determine the most accurate heading (alpha)
    let rawAlpha = event.alpha;
    const evAsAny = event as any;

    if (typeof evAsAny.webkitCompassHeading === 'number') {
      // iOS webkitCompassHeading increases clockwise (0 to 360).
      // Standard W3C alpha increases counter-clockwise.
      // So we negate it to match the math direction.
      rawAlpha = 360 - evAsAny.webkitCompassHeading;
    }

    if (rawAlpha === null) return;

    const raw: OrientationData = {
      alpha: rawAlpha,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
    };

    // Apply low-pass filter to reduce jitter
    if (!smoothed.current) {
      smoothed.current = raw;
    } else {
      smoothed.current = {
        alpha: lerpAngle(smoothed.current.alpha, raw.alpha, SMOOTHING),
        beta: smoothed.current.beta + (raw.beta - smoothed.current.beta) * SMOOTHING,
        gamma: smoothed.current.gamma + (raw.gamma - smoothed.current.gamma) * SMOOTHING,
      };
    }

    setOrientation({ ...smoothed.current });
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
