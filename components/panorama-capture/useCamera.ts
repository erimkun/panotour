'use client';

import { useCallback, useRef, useState } from 'react';

export interface CameraFov {
  horizontal: number; // degrees
  vertical: number;   // degrees
  detected: boolean;  // true if read from hardware, false if fallback estimate
}

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  fov: CameraFov;
  start: () => Promise<void>;
  stop: () => void;
  captureFrame: () => ImageData | null;
}

// Portrait-held phone: the sensor short-edge is horizontal → narrower FOV.
// iPhone 16e (26mm equiv) portrait ≈ 55°. Most Androids in portrait ≈ 55-60°.
const FALLBACK_HFOV = 55;
const MAX_TEXTURE_WIDTH = 256;

function estimateVFov(hfov: number, videoWidth: number, videoHeight: number): number {
  const aspect = videoHeight / videoWidth;
  const hfovRad = (hfov * Math.PI) / 180;
  const vfovRad = 2 * Math.atan(Math.tan(hfovRad / 2) * aspect);
  return (vfovRad * 180) / Math.PI;
}

/**
 * Try to read the real horizontal FOV from the camera hardware via
 * MediaStreamTrack.getCapabilities() or getSettings().
 * Falls back to FALLBACK_HFOV if not available.
 */
function detectFov(track: MediaStreamTrack, videoWidth: number, videoHeight: number): CameraFov {
  const isPortrait = videoHeight > videoWidth;
  // Sensible default FOVs based on typical 26mm smartphone lenses.
  // Portrait 9:16 crop yields ~55° horizontal. Landscape 16:9 yields ~75°.
  let hfov = isPortrait ? 55 : 75;
  let detected = false;

  try {
    const settings = track.getSettings() as Record<string, unknown>;

    // Many mobile browsers report uncropped sensor FOV in capabilities, which ruins
    // rendering if the video is actually a 16:9 cropped stream. We only trust current
    // settings.fieldOfView if it's within a very "sane" range for the aspect ratio.
    if (typeof settings.fieldOfView === 'number') {
       const fov = settings.fieldOfView;
       if (isPortrait && fov > 40 && fov < 70) {
         hfov = fov;
         detected = true;
       } else if (!isPortrait && fov > 60 && fov < 100) {
         hfov = fov;
         detected = true;
       }
    }

    if (!detected && typeof settings.zoom === 'number' && settings.zoom > 0) {
      hfov = hfov / settings.zoom;
      if (settings.zoom !== 1) detected = true;
    }
  } catch {
    // getSettings() not available
  }

  return {
    horizontal: hfov,
    vertical: estimateVFov(hfov, videoWidth, videoHeight),
    detected,
  };
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fov, setFov] = useState<CameraFov>({ horizontal: FALLBACK_HFOV, vertical: 50, detected: false });

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setIsStarting(true);

    try {
      if (!window.isSecureContext) {
        throw new Error('Kamera icin HTTPS gerekli.');
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Bu tarayicide kamera desteklenmiyor.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        if (vw && vh) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            setFov(detectFov(videoTrack, vw, vh));
          } else {
            setFov({
              horizontal: FALLBACK_HFOV,
              vertical: estimateVFov(FALLBACK_HFOV, vw, vh),
              detected: false,
            });
          }
        }
      }

      setIsActive(true);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') setError('Kamera izni reddedildi.');
        else if (err.name === 'NotFoundError') setError('Kamera bulunamadi.');
        else if (err.name === 'NotReadableError') setError('Kamera baska uygulama kullaniyor.');
        else setError(`Kamera acilamadi: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Kamera acilamadi');
      }
    } finally {
      setIsStarting(false);
    }
  }, []);

  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const scale = Math.min(1, MAX_TEXTURE_WIDTH / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    canvas.width = 0;
    canvas.height = 0; // free backing store immediately
    return imgData;
  }, []);

  return { videoRef, isActive, isStarting, error, fov, start, stop, captureFrame };
}
