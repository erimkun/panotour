/**
 * useGazeInteraction Hook
 * Single Responsibility: React state management for gaze interactions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GazeState } from '@/types/xr';
import { GazeController } from '@/utils/xr/GazeController';

export interface UseGazeInteractionOptions {
  gazeController: GazeController | null;
  onActivate?: (hotspotId: string) => void;
  enabled?: boolean;
}

export interface UseGazeInteractionReturn {
  gazeState: GazeState;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  remainingTime: number; // in milliseconds
}

const initialGazeState: GazeState = {
  targetHotspotId: null,
  gazeStartTime: null,
  progress: 0,
  isComplete: false,
};

/**
 * Hook to manage gaze interaction state
 */
export function useGazeInteraction(
  options: UseGazeInteractionOptions
): UseGazeInteractionReturn {
  const { gazeController, onActivate, enabled = true } = options;
  
  const [gazeState, setGazeState] = useState<GazeState>(initialGazeState);
  const [isPaused, setIsPaused] = useState(false);
  const onActivateRef = useRef(onActivate);

  // Keep callback ref updated
  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  // Set up gaze controller callbacks
  useEffect(() => {
    if (!gazeController) return;

    // Set progress callback
    gazeController.setOnProgressChange((state) => {
      setGazeState(state);
    });

    // Set activation callback
    gazeController.setOnActivate((hotspotId) => {
      if (onActivateRef.current) {
        onActivateRef.current(hotspotId);
      }
    });

    return () => {
      gazeController.setOnProgressChange(() => {});
      gazeController.setOnActivate(() => {});
    };
  }, [gazeController]);

  // Handle enabled state
  useEffect(() => {
    if (!gazeController) return;

    if (enabled && !isPaused) {
      gazeController.resume();
    } else {
      gazeController.pause();
    }
  }, [gazeController, enabled, isPaused]);

  // Pause gaze detection
  const pause = useCallback(() => {
    setIsPaused(true);
    gazeController?.pause();
  }, [gazeController]);

  // Resume gaze detection
  const resume = useCallback(() => {
    setIsPaused(false);
    gazeController?.resume();
  }, [gazeController]);

  // Calculate remaining time
  const remainingTime = gazeController
    ? gazeController.getConfig().gazeDuration * (1 - gazeState.progress)
    : 0;

  return {
    gazeState,
    isPaused,
    pause,
    resume,
    remainingTime,
  };
}

export default useGazeInteraction;
