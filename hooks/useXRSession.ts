/**
 * useXRSession Hook
 * Single Responsibility: Manage WebXR session lifecycle
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';

export interface XRSessionState {
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
}

export interface UseXRSessionOptions {
  renderer: THREE.WebGLRenderer | null;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface UseXRSessionReturn {
  state: XRSessionState;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  getSession: () => XRSession | null;
}

/**
 * Hook to manage WebXR session
 */
export function useXRSession(options: UseXRSessionOptions): UseXRSessionReturn {
  const { renderer, onSessionStart, onSessionEnd, onError } = options;
  
  const [state, setState] = useState<XRSessionState>({
    isActive: false,
    isStarting: false,
    error: null,
  });
  
  const sessionRef = useRef<XRSession | null>(null);

  // Start XR session
  const startSession = useCallback(async () => {
    if (!renderer || state.isActive || state.isStarting) {
      return;
    }

    if (!navigator.xr) {
      setState(prev => ({ ...prev, error: 'WebXR not available' }));
      onError?.(new Error('WebXR not available'));
      return;
    }

    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      // Request VR session
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });

      sessionRef.current = session;

      // Configure renderer for XR
      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      // Handle session end
      session.addEventListener('end', () => {
        sessionRef.current = null;
        setState({ isActive: false, isStarting: false, error: null });
        onSessionEnd?.();
      });

      setState({ isActive: true, isStarting: false, error: null });
      onSessionStart?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start XR session';
      setState({ isActive: false, isStarting: false, error: errorMessage });
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [renderer, state.isActive, state.isStarting, onSessionStart, onSessionEnd, onError]);

  // End XR session
  const endSession = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.end();
      } catch (error) {
        console.error('Error ending XR session:', error);
      }
      sessionRef.current = null;
    }
    setState({ isActive: false, isStarting: false, error: null });
  }, []);

  // Get session (for accessing in event handlers)
  const getSession = useCallback(() => {
    return sessionRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.end().catch(console.error);
      }
    };
  }, []);

  return {
    state,
    startSession,
    endSession,
    getSession,
  };
}

export default useXRSession;
