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
  const isEndingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Start XR session
  const startSession = useCallback(async () => {
    if (!renderer || state.isActive || state.isStarting || isEndingRef.current) {
      return;
    }

    // Check if WebGL context is available
    const gl = renderer.getContext();
    if (gl.isContextLost()) {
      const error = new Error('WebGL context lost - cannot start VR session');
      setState(prev => ({ ...prev, error: error.message }));
      onError?.(error);
      return;
    }

    if (!navigator.xr) {
      setState(prev => ({ ...prev, error: 'WebXR not available' }));
      onError?.(new Error('WebXR not available'));
      return;
    }

    // Check if there's already an active session that needs to be ended
    if (sessionRef.current) {
      console.warn('Ending existing session before starting new one');
      try {
        await sessionRef.current.end();
      } catch (e) {
        console.warn('Error ending existing session:', e);
      }
      sessionRef.current = null;
    }

    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      // Check VR support first
      const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!isVRSupported) {
        throw new Error('VR session not supported on this device');
      }

      // Request VR session
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });

      sessionRef.current = session;

      // Configure renderer for XR
      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      // Handle session end
      const handleSessionEnd = () => {
        session.removeEventListener('end', handleSessionEnd);
        sessionRef.current = null;
        isEndingRef.current = false;
        if (isMountedRef.current) {
          setState({ isActive: false, isStarting: false, error: null });
        }
        onSessionEnd?.();
      };

      session.addEventListener('end', handleSessionEnd);

      if (isMountedRef.current) {
        setState({ isActive: true, isStarting: false, error: null });
      }
      onSessionStart?.();
    } catch (error) {
      sessionRef.current = null;
      const errorMessage = error instanceof Error ? error.message : 'Failed to start XR session';
      if (isMountedRef.current) {
        setState({ isActive: false, isStarting: false, error: errorMessage });
      }
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [renderer, state.isActive, state.isStarting, onSessionStart, onSessionEnd, onError]);

  // End XR session
  const endSession = useCallback(async () => {
    if (isEndingRef.current) return;
    
    if (sessionRef.current) {
      isEndingRef.current = true;
      try {
        // Check if session is still valid before ending
        if (sessionRef.current.end) {
          await sessionRef.current.end();
        }
      } catch (error) {
        // Ignore InvalidStateError - session may already be ended
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          console.log('XR session already ended');
        } else {
          console.error('Error ending XR session:', error);
        }
      }
      sessionRef.current = null;
      isEndingRef.current = false;
    }
    if (isMountedRef.current) {
      setState({ isActive: false, isStarting: false, error: null });
    }
  }, []);

  // Get session (for accessing in event handlers)
  const getSession = useCallback(() => {
    return sessionRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (sessionRef.current) {
        try {
          sessionRef.current.end().catch(() => {
            // Ignore errors during cleanup
          });
        } catch {
          // Ignore errors during cleanup
        }
        sessionRef.current = null;
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
