// Camera stream hook for the AI panorama capture tab.
// Written from scratch using current MediaDevices.getUserMedia API (2025+).
// Intentionally independent of components/panorama-capture/useCamera.

import { useCallback, useEffect, useRef, useState } from 'react';

interface CameraStreamState {
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 960 },
  height: { ideal: 540 },
};

export interface UseCameraStreamV2 {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  captureFrame: () => Promise<Blob | null>;
}

export function useCameraStreamV2(): UseCameraStreamV2 {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<CameraStreamState>({
    isActive: false,
    isStarting: false,
    error: null,
  });

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      // WebKit memory-leak workaround: explicitly detach the srcObject.
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        // ignore
      }
    }

    // Release the offscreen capture canvas so the GC can reclaim its backing store.
    captureCanvasRef.current = null;

    setState({ isActive: false, isStarting: false, error: null });
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ isActive: false, isStarting: false, error: 'Kamera API desteklenmiyor.' });
      return;
    }

    setState({ isActive: false, isStarting: true, error: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        // The consumer unmounted before the promise resolved — release the stream.
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;

      // Wait for the video to have metadata before reporting active. Safari
      // sometimes rejects video.play() while the element is still buffering;
      // the element's autoPlay attribute will kick in once metadata arrives.
      if (video.readyState < 1) {
        await new Promise<void>((resolve) => {
          const onLoaded = () => {
            video.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          };
          video.addEventListener('loadedmetadata', onLoaded, { once: true });
          // Fallback in case loadedmetadata never fires (shouldn't happen, but
          // be defensive on flaky mobile browsers).
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          }, 2000);
        });
      }

      // Best-effort play(). If the browser blocks it (autoplay policy), the
      // <video autoPlay> attribute will retry; we don't fail the whole start.
      try {
        await video.play();
      } catch {
        // Swallow — we'll let the <video> element's autoPlay handle it, and
        // the user can tap the screen to trigger playback on strict browsers.
      }

      setState({ isActive: true, isStarting: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kamera erisilemedi.';
      const friendly =
        message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')
          ? 'Kamera izni reddedildi. Tarayici ayarlarindan izin verin.'
          : message.toLowerCase().includes('notfound')
            ? 'Kamera bulunamadi.'
            : message;
      setState({ isActive: false, isStarting: false, error: friendly });
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    }
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    let canvas = captureCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      captureCanvasRef.current = canvas;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    return new Promise<Blob | null>((resolve) => {
      canvas!.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.85,
      );
    });
  }, []);

  // Ensure the stream is released if the consumer unmounts without calling stop().
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    isActive: state.isActive,
    isStarting: state.isStarting,
    error: state.error,
    start,
    stop,
    captureFrame,
  };
}
