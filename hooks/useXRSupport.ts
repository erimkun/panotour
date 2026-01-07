/**
 * useXRSupport Hook
 * Single Responsibility: Check WebXR support and availability
 */

import { useState, useEffect } from 'react';

export interface XRSupportState {
  isSupported: boolean;
  isChecking: boolean;
  error: string | null;
  supportedModes: {
    immersiveVR: boolean;
    immersiveAR: boolean;
    inline: boolean;
  };
}

const initialState: XRSupportState = {
  isSupported: false,
  isChecking: true,
  error: null,
  supportedModes: {
    immersiveVR: false,
    immersiveAR: false,
    inline: false,
  },
};

/**
 * Hook to check WebXR support
 * @returns XRSupportState with support information
 */
export function useXRSupport(): XRSupportState {
  const [state, setState] = useState<XRSupportState>(initialState);

  useEffect(() => {
    const checkXRSupport = async () => {
      // Check if running in browser
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setState({
          isSupported: false,
          isChecking: false,
          error: 'Not running in browser environment',
          supportedModes: { immersiveVR: false, immersiveAR: false, inline: false },
        });
        return;
      }

      // Check if WebXR is available
      if (!('xr' in navigator)) {
        setState({
          isSupported: false,
          isChecking: false,
          error: 'WebXR not available in this browser',
          supportedModes: { immersiveVR: false, immersiveAR: false, inline: false },
        });
        return;
      }

      try {
        const xr = navigator.xr;
        if (!xr) {
          throw new Error('XR system not available');
        }

        // Check support for different session modes
        const [immersiveVR, immersiveAR, inline] = await Promise.all([
          xr.isSessionSupported('immersive-vr').catch(() => false),
          // immersive-ar may not be in all TypeScript definitions
          xr.isSessionSupported('immersive-ar' as XRSessionMode).catch(() => false),
          xr.isSessionSupported('inline').catch(() => false),
        ]);

        const isSupported = immersiveVR || immersiveAR;

        setState({
          isSupported,
          isChecking: false,
          error: isSupported ? null : 'No immersive XR modes supported',
          supportedModes: { immersiveVR, immersiveAR, inline },
        });
      } catch (error) {
        setState({
          isSupported: false,
          isChecking: false,
          error: error instanceof Error ? error.message : 'Failed to check XR support',
          supportedModes: { immersiveVR: false, immersiveAR: false, inline: false },
        });
      }
    };

    checkXRSupport();
  }, []);

  return state;
}

export default useXRSupport;
