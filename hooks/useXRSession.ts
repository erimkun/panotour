/**
 * useXRSession Hook
 * Single Responsibility: Manage WebXR session lifecycle
 * 
 * CRITICAL: The Three.js animation loop (setAnimationLoop) must NEVER be stopped
 * before calling renderer.xr.setSession(). If setAnimationLoop(null) is called,
 * Three.js clears its internal animationLoop reference, causing animation.start()
 * inside setSession() to be a no-op. When the session later ends, animation.stop()
 * tries context.cancelAnimationFrame() on a null context → crash.
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
  startSession: (rendererOverride?: THREE.WebGLRenderer) => Promise<void>;
  endSession: () => Promise<void>;
  getSession: () => XRSession | null;
}

/**
 * Wait for WebGL context to be restored on a renderer's canvas.
 * Returns a promise that resolves when context is restored, or rejects on timeout.
 */
function waitForContextRestore(
  canvas: HTMLCanvasElement,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const onRestored = () => {
      clearTimeout(timeoutId);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      // Small delay after restore to let GPU stabilize
      setTimeout(resolve, 150);
    };
    canvas.addEventListener('webglcontextrestored', onRestored, { once: true });
    timeoutId = setTimeout(() => {
      canvas.removeEventListener('webglcontextrestored', onRestored);
      reject(new Error('WebGL context restore timed out'));
    }, timeoutMs);
  });
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

    // Check if WebGL context is available
    const gl = activeRenderer.getContext();
    if (gl.isContextLost()) {
      console.log('WebGL context lost, waiting for restore...');
      try {
        await waitForContextRestore(activeRenderer.domElement, 3000);
      } catch {
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

      // Step 1: Make the GL context XR-compatible BEFORE requesting a session.
      // This may cause a context loss/restore cycle, but it happens before
      // Three.js sets up any XR session state, so it's safe.
      // After this, renderer.xr.setSession() will skip its internal
      // makeXRCompatible() call since the context is already compatible.
      console.log('Making WebGL context XR compatible...');
      try {
        await (gl as WebGL2RenderingContext).makeXRCompatible();
      } catch (e) {
        console.warn('makeXRCompatible warning:', e);
      }

      // Wait for context restore if makeXRCompatible caused context loss
      if (gl.isContextLost()) {
        console.log('Context lost after makeXRCompatible, waiting for restore...');
        await waitForContextRestore(activeRenderer.domElement, 5000);
      }

      // Small delay to ensure GPU is fully ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 2: Request VR session — context should already be XR-compatible
      // so this should NOT cause another context loss
      console.log('Requesting XR session...');
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      sessionRef.current = session;

      // Step 3: If context was lost during requestSession, wait for restore
      if (gl.isContextLost()) {
        console.log('Context lost after requestSession, waiting for restore...');
        await waitForContextRestore(activeRenderer.domElement, 5000);
      }

      // Step 4: Configure renderer for XR
      // IMPORTANT: The animation loop (setAnimationLoop) must still be running
      // at this point. Three.js's setSession() internally calls animation.start()
      // which requires animationLoop to be non-null. If it's null, start() is
      // a no-op, and the subsequent session end will crash in animation.stop().
      console.log('Setting XR session on renderer...');
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
      console.log('XR session started successfully');
    } catch (error) {
      console.error('XR session setup failed:', error);
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
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [renderer, state.isActive, state.isStarting, onSessionStart, onSessionEnd, onError]);

  // End XR session
  const endSession = useCallback(async () => {
    if (isEndingRef.current) return;
    
    if (sessionRef.current) {
      isEndingRef.current = true;
      try {
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
