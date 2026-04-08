'use client';

// Camera capture tab for AIPanoramaModal.
// Mounts a Three.js sphere with 16 guide markers and a device camera overlay.
// The user aims at each point and taps [Çek]; after all 16 captures the tab
// hands a File[] back to the parent via onFilesReady.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react';
import { SpherePointsScene } from './SpherePointsScene';
import {
  GUIDE_POINTS_16,
  TOTAL_POINTS,
} from './guide-points-16';
import { useCameraStreamV2 } from './useCameraStreamV2';
import { useDeviceOrientationV2 } from './useDeviceOrientationV2';

export interface CameraCaptureTabProps {
  active: boolean;
  onFilesReady: (files: File[]) => void;
  onError?: (message: string) => void;
}

// Shared ref store for blobs — kept outside component state because Blob
// objects are large enough that we want fine-grained control over when React
// re-renders. We still mirror counts into state for the HUD.
interface CapturedEntry {
  blob: Blob;
  capturedAt: number;
}

export default function CameraCaptureTab({
  active,
  onFilesReady,
  onError,
}: CameraCaptureTabProps) {
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SpherePointsScene | null>(null);
  const capturedRef = useRef<Map<string, CapturedEntry>>(new Map());
  const activePointIdRef = useRef<string | null>(null);

  const camera = useCameraStreamV2();
  const orientation = useDeviceOrientationV2();

  const [capturedCount, setCapturedCount] = useState(0);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // ── Mount Three.js scene when the tab becomes active ──
  useEffect(() => {
    if (!active) return;
    const container = sceneContainerRef.current;
    if (!container) return;

    const scene = new SpherePointsScene({
      container,
      onContextLost: () => {
        setLocalError('GPU baglantisi kesildi. Tabi yenileyin.');
      },
    });
    sceneRef.current = scene;

    // Replay any existing captures into the scene (tab was re-entered).
    for (const pointId of capturedRef.current.keys()) {
      scene.markCaptured(pointId);
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [active]);

  // ── Start camera + gyro when the tab is active ──
  useEffect(() => {
    if (!active) return;

    void camera.start();
    void orientation.requestPermission();

    return () => {
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── Single RAF loop ──
  // One loop handles orientation sampling, scene render and active-point
  // detection. This avoids extra RAFs and keeps computation in one place.
  useEffect(() => {
    if (!active) return;
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const scene = sceneRef.current;
      if (!scene) return;

      const device = orientation.orientationRef.current;
      if (device && device.alpha != null && device.beta != null && device.gamma != null) {
        scene.updateCameraFromDevice(device.alpha, device.beta, device.gamma);
      }

      scene.render();

      const nearest = scene.findNearestGuideByScreenProjection();
      const nextId = nearest ? nearest.id : null;
      if (nextId !== activePointIdRef.current) {
        activePointIdRef.current = nextId;
        scene.setActiveMarker(nextId);
        setActivePointId(nextId);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, orientation.orientationRef]);

  // ── Cleanup captured blobs when the tab is fully unmounted from parent ──
  // NOTE: we intentionally KEEP blobs when toggling `active` off so the user
  // can switch tabs without losing work. The parent decides when to clear
  // (e.g. after submit or modal close).
  useEffect(() => {
    const capturedMap = capturedRef.current;
    return () => {
      capturedMap.clear();
    };
  }, []);

  // ── Propagate camera / orientation errors ──
  useEffect(() => {
    const msg = camera.error || localError;
    if (msg && onError) onError(msg);
  }, [camera.error, localError, onError]);

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    const scene = sceneRef.current;
    const pointId = activePointIdRef.current;
    if (!scene || !pointId) return;
    setIsCapturing(true);
    try {
      const blob = await camera.captureFrame();
      if (!blob) {
        setLocalError('Kare yakalanamadi, tekrar deneyin.');
        return;
      }
      capturedRef.current.set(pointId, { blob, capturedAt: Date.now() });
      scene.markCaptured(pointId);
      setCapturedCount(capturedRef.current.size);
      setLocalError(null);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(60);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Yakalama hatasi');
    } finally {
      setIsCapturing(false);
    }
  }, [camera, isCapturing]);

  const handleReset = useCallback(() => {
    capturedRef.current.clear();
    sceneRef.current?.resetAll();
    setCapturedCount(0);
    setActivePointId(null);
    activePointIdRef.current = null;
    setLocalError(null);
  }, []);

  const handleFinish = useCallback(() => {
    if (capturedRef.current.size !== TOTAL_POINTS) return;
    const files: File[] = [];
    // Emit in the canonical guide-point order so the AI receives a consistent layout.
    for (const point of GUIDE_POINTS_16) {
      const entry = capturedRef.current.get(point.id);
      if (!entry) return; // should not happen — size check above
      const file = new File([entry.blob], `ai-capture-${point.id}.jpg`, {
        type: 'image/jpeg',
        lastModified: entry.capturedAt,
      });
      files.push(file);
    }
    onFilesReady(files);
  }, [onFilesReady]);

  const permissionPrompt = orientation.permissionState === 'prompt' && !orientation.hasOrientation;
  const permissionDenied = orientation.permissionState === 'denied';
  const orientationUnsupported = orientation.permissionState === 'unsupported';

  const canCapture =
    camera.isActive && !!activePointId && !isCapturing && !permissionDenied && !orientationUnsupported;
  const canFinish = capturedCount === TOTAL_POINTS;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Scene area — grows to fill available vertical space */}
      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
        <div ref={sceneContainerRef} className="absolute inset-0" />

        {/* Camera preview overlay — soft masked to avoid occluding the sphere */}
        <video
          ref={camera.videoRef}
          playsInline
          muted
          autoPlay
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: camera.isActive ? 0.35 : 0,
            maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 75%)',
          }}
        />

        {/* Center crosshair */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`h-10 w-10 rounded-full border-2 ${
              activePointId ? 'border-yellow-400' : 'border-white/40'
            }`}
          />
        </div>

        {/* Status badge */}
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-gray-700/60 bg-gray-900/80 px-3 py-1 text-[11px] text-gray-200">
          {capturedCount}/{TOTAL_POINTS} cekildi
          {activePointId && <span className="ml-2 text-yellow-300">· hedef: {activePointId}</span>}
        </div>

        {camera.isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 size={28} className="animate-spin text-blue-400" />
          </div>
        )}

        {permissionPrompt && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-blue-500/40 bg-blue-900/40 px-3 py-2 text-center text-xs text-blue-100">
            Cihaz yonelim izni gerekli. Ekrana dokunarak izin verin.
            <button
              type="button"
              onClick={() => orientation.requestPermission()}
              className="ml-2 rounded bg-blue-500 px-2 py-0.5 text-white hover:bg-blue-400"
            >
              Izin ver
            </button>
          </div>
        )}

        {permissionDenied && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-red-500/40 bg-red-900/40 px-3 py-2 text-center text-xs text-red-100">
            Yonelim izni reddedildi.
            <button
              type="button"
              onClick={() => orientation.requestPermission()}
              className="ml-2 rounded bg-red-500 px-2 py-0.5 text-white hover:bg-red-400"
            >
              Tekrar dene
            </button>
          </div>
        )}

        {orientationUnsupported && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-yellow-500/40 bg-yellow-900/30 px-3 py-2 text-center text-xs text-yellow-100">
            Bu cihazda jiroskop yok. Mobil bir cihaz kullanin veya &ldquo;Dosya Yukle&rdquo; sekmesine gecin.
          </div>
        )}
      </div>

      {/* Controls — large tap targets for mobile use */}
      <div className="mt-3 flex shrink-0 items-stretch gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={capturedCount === 0}
          className="flex items-center justify-center rounded-lg bg-gray-700 px-4 text-gray-200 hover:bg-gray-600 disabled:opacity-40"
          title="Tum cekimleri sifirla"
        >
          <RotateCcw size={20} />
        </button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!canCapture}
          className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-base font-bold text-white shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          {isCapturing ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
          {activePointId ? 'Cek' : 'Bir noktaya yonelin'}
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={!canFinish}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          <Check size={20} />
          <span className="hidden sm:inline">{canFinish ? 'Tamamla' : `${TOTAL_POINTS - capturedCount}`}</span>
        </button>
      </div>

      {(camera.error || localError) && (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          {camera.error || localError}
        </div>
      )}
    </div>
  );
}
