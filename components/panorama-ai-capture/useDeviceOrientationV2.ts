// Device orientation hook using the current W3C DeviceOrientationEvent API.
// Written from scratch for the AI panorama camera tab.
// iOS 13+ requires DeviceOrientationEvent.requestPermission() to be called
// inside a user gesture — we expose that as an explicit requestPermission().

import { useCallback, useEffect, useRef, useState } from 'react';

export type OrientationPermissionState =
  | 'unknown'    // initial state
  | 'prompt'     // supported but permission not yet requested (iOS 13+)
  | 'granted'    // listener attached, data flowing (or will flow on first event)
  | 'denied'     // user denied on iOS
  | 'unsupported'; // DeviceOrientationEvent not available at all

export interface DeviceOrientation {
  alpha: number | null; // 0..360, compass heading (rotation around Z)
  beta: number | null;  // -180..180, front-back tilt (around X)
  gamma: number | null; // -90..90, left-right tilt (around Y)
  absolute: boolean;    // true if alpha is absolute (magnetometer)
}

export interface UseDeviceOrientationV2 {
  orientationRef: React.MutableRefObject<DeviceOrientation | null>;
  hasOrientation: boolean;
  permissionState: OrientationPermissionState;
  requestPermission: () => Promise<void>;
}

interface IOSDeviceOrientationEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function needsExplicitPermission(): boolean {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false;
  const ctor = DeviceOrientationEvent as unknown as IOSDeviceOrientationEventCtor;
  return typeof ctor.requestPermission === 'function';
}

export function useDeviceOrientationV2(): UseDeviceOrientationV2 {
  // Lazy initial state — computed once on mount, no cascading effect update.
  const [permissionState, setPermissionState] = useState<OrientationPermissionState>(() => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      return 'unsupported';
    }
    return 'prompt';
  });
  const orientationRef = useRef<DeviceOrientation | null>(null);
  const [hasOrientation, setHasOrientation] = useState(false);
  const hasOrientationRef = useRef(false);
  const attachedRef = useRef(false);

  const handleEvent = useCallback((event: DeviceOrientationEvent) => {
    orientationRef.current = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      absolute: event.absolute,
    };

    if (!hasOrientationRef.current) {
      hasOrientationRef.current = true;
      setHasOrientation(true);
    }
  }, []);

  const attachListener = useCallback(() => {
    if (attachedRef.current) return;
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;

    // Prefer the absolute variant when available (magnetometer-backed compass).
    const hasAbsolute = 'ondeviceorientationabsolute' in window;
    const type = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';

    window.addEventListener(type, handleEvent as EventListener, { passive: true });
    attachedRef.current = true;
  }, [handleEvent]);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      setPermissionState('unsupported');
      return;
    }

    if (needsExplicitPermission()) {
      try {
        const ctor = DeviceOrientationEvent as unknown as IOSDeviceOrientationEventCtor;
        const result = await ctor.requestPermission!();
        if (result === 'granted') {
          attachListener();
          setPermissionState('granted');
        } else {
          setPermissionState('denied');
        }
      } catch {
        setPermissionState('denied');
      }
      return;
    }

    // Android / desktop Chrome / Firefox — no explicit permission needed.
    attachListener();
    setPermissionState('granted');
  }, [attachListener]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (!attachedRef.current) return;
      if (typeof window === 'undefined') return;
      const hasAbsolute = 'ondeviceorientationabsolute' in window;
      const type = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
      window.removeEventListener(type, handleEvent as EventListener);
      attachedRef.current = false;
    };
  }, [handleEvent]);

  return { orientationRef, hasOrientation, permissionState, requestPermission };
}

/**
 * Quick synchronous check callers can use before mounting the camera tab,
 * to decide whether to enable the tab at all (e.g. hide on desktop).
 */
export function isDeviceOrientationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  return true;
}
