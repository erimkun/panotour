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
  onBeforeSessionStart?: () => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onSessionFailed?: () => void;
  onError?: (error: Error) => void;
}

export interface UseXRSessionReturn {
  state: XRSessionState;
  startSession: (rendererOverride?: THREE.WebGLRenderer) => Promise<void>;
  endSession: () => Promise<void>;
  getSession: () => XRSession | null;
}

/**
 * Hook to manage WebXR session
 */
export function useXRSession(options: UseXRSessionOptions): UseXRSessionReturn {
  const { renderer, onBeforeSessionStart, onSessionStart, onSessionEnd, onSessionFailed, onError } = options;
  
  const [state, setState] = useState<XRSessionState>({
    isActive: false,
    isStarting: false,
    error: null,
  });
  
  const sessionRef = useRef<XRSession | null>(null);
  const isEndingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(renderer);

  // Keep renderer ref updated
  useEffect(() => {
    rendererRef.current = renderer;
  }, [renderer]);

  // Start XR session - can accept renderer override for cases where ref isn't updated yet
  const startSession = useCallback(async (rendererOverride?: THREE.WebGLRenderer) => {
    const activeRenderer = rendererOverride || rendererRef.current || renderer;
    
    if (!activeRenderer) {
      const error = new Error('Renderer not available');
      setState(prev => ({ ...prev, error: error.message }));
      onError?.(error);
      return;
    }
    
    if (state.isActive || state.isStarting || isEndingRef.current) {
      return;
    }

    // Check if WebGL context is available - wait for context to be restored if needed
    const gl = activeRenderer.getContext();
    if (gl.isContextLost()) {
      // Wait a bit for context to be restored
      console.log('WebGL context lost, waiting for restore...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again
      if (gl.isContextLost()) {
        const error = new Error('WebGL context lost - cannot start VR session');
        setState(prev => ({ ...prev, error: error.message }));
        onError?.(error);
        return;
      }
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
      // Wait for session to fully end
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Also check if renderer already has an active XR session
    if (activeRenderer.xr.isPresenting) {
      console.warn('Renderer already presenting, ending existing session');
      try {
        const existingSession = activeRenderer.xr.getSession();
        if (existingSession) {
          await existingSession.end();
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (e) {
        console.warn('Error ending existing renderer session:', e);
      }
    }

    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      // Check VR support first
      const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!isVRSupported) {
        throw new Error('VR session not supported on this device');
      }

      // Small delay to ensure everything is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop normal animation loop and signal XR entry before requesting session
      onBeforeSessionStart?.();

      // Request VR session
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });

      sessionRef.current = session;

      // Wait for WebGL context to be ready (XR session request may cause context loss/restore)
      const gl = activeRenderer.getContext();
      if (gl.isContextLost()) {
        console.log('WebGL context lost after requestSession, waiting for restore...');
        await new Promise<void>((resolve, reject) => {
          let timeoutId: ReturnType<typeof setTimeout>;
          const onRestored = () => {
            clearTimeout(timeoutId);
            activeRenderer.domElement.removeEventListener('webglcontextrestored', onRestored);
            // Give a small delay after restore
            setTimeout(resolve, 100);
          };
          activeRenderer.domElement.addEventListener('webglcontextrestored', onRestored, { once: true });
          timeoutId = setTimeout(() => {
            activeRenderer.domElement.removeEventListener('webglcontextrestored', onRestored);
            reject(new Error('WebGL context restore timed out'));
          }, 3000);
        });
      }

      // Configure renderer for XR
      activeRenderer.xr.setReferenceSpaceType('local');
      await activeRenderer.xr.setSession(session);

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
      // End the session if it was obtained but setup failed
      if (sessionRef.current) {
        try {
          await sessionRef.current.end();
        } catch (e) {
          console.warn('Error ending failed XR session:', e);
        }
      }
      sessionRef.current = null;
      const errorMessage = error instanceof Error ? error.message : 'Failed to start XR session';
      if (isMountedRef.current) {
        setState({ isActive: false, isStarting: false, error: errorMessage });
      }
      onSessionFailed?.();
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [renderer, state.isActive, state.isStarting, onBeforeSessionStart, onSessionStart, onSessionEnd, onSessionFailed, onError]);

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
