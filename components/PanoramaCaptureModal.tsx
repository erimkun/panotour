'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw, Undo2, X } from 'lucide-react';
import * as THREE from 'three';
import { SphereCaptureScene } from './panorama-capture/SphereCaptureScene';
import { useDeviceOrientation } from './panorama-capture/useDeviceOrientation';
import { useCamera } from './panorama-capture/useCamera';
import { exportEquirectangular } from './panorama-capture/equirect-export';
import {
  type GuidePoint,
  angularDistance,
  getActiveLevel,
  getLevelCompletionPercent,
  getTotalCoverage,
} from './panorama-capture/guide-points';

interface PanoramaCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onPanoramaReady: (file: File, sceneTitle: string) => void;
}

interface StableTimer {
  guideId: string;
  startTime: number;
  startYaw: number;   // camera yaw when timer began — used to detect motion
  startPitch: number;
}

const ALIGN_THRESHOLD = 10;     // degrees — tight threshold: must be close to center of guide
const STABLE_DURATION = 800;    // ms — stay still this long before auto-capture
const MOTION_THRESHOLD = 6;     // degrees — reset timer if camera moves more than this while waiting

export default function PanoramaCaptureModal({
  open,
  onClose,
  onPanoramaReady,
}: PanoramaCaptureModalProps) {
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SphereCaptureScene | null>(null);
  const stableTimerRef = useRef<StableTimer | null>(null);
  const autoCapturedRef = useRef<Set<string>>(new Set());

  const orientation = useDeviceOrientation();
  const camera = useCamera();

  const [sceneTitle, setSceneTitle] = useState('Kamera Panoramasi');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [patchCount, setPatchCount] = useState(0);
  const [coverage, setCoverage] = useState(0);
  const [activeLevel, setActiveLevel] = useState(1);
  const [levelPercents, setLevelPercents] = useState([0, 0, 0]);
  const [alignState, setAlignState] = useState<'none' | 'approaching' | 'stable' | 'captured' | 'rejected'>('none');
  const [showConfirm, setShowConfirm] = useState(false);
  const [cameraDir, setCameraDir] = useState<{ yaw: number; pitch: number } | null>(null);
  const [nearestDist, setNearestDist] = useState<number | null>(null);

  // ── Initialize Three.js scene ──
  useEffect(() => {
    if (!open || !sceneContainerRef.current) return;

    const scene = new SphereCaptureScene(sceneContainerRef.current);
    scene.onContextLost = () => {
      setError('GPU bağlantısı kesildi. Sayfayı yenileyin.');
    };
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [open]);

  // ── Start camera + orientation when modal opens ──
  useEffect(() => {
    if (!open) return;

    camera.start();
    orientation.requestPermission();

    return () => {
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Feed device orientation into Three.js camera ──
  useEffect(() => {
    if (!sceneRef.current || !orientation.orientation) return;
    const { alpha, beta, gamma } = orientation.orientation;
    sceneRef.current.updateCameraFromDevice(alpha, beta, gamma);
  }, [orientation.orientation]);

  // ── Sync camera FOV if it updates ──
  useEffect(() => {
    if (sceneRef.current && camera.fov) {
      sceneRef.current.setCameraFov(camera.fov.vertical);
    }
  }, [camera.fov]);

  // ── Update UI state from scene ──
  const syncUIFromScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const points = scene.getGuidePoints();
    setPatchCount(scene.getPatchCount());
    setCoverage(getTotalCoverage(points));
    setActiveLevel(getActiveLevel(points));
    setLevelPercents([
      getLevelCompletionPercent(points, 1),
      getLevelCompletionPercent(points, 2),
      getLevelCompletionPercent(points, 3),
    ]);
  }, []);

  // ── Capture logic (ref-based to avoid re-render → effect restart cycle) ──
  const doCaptureRef = useRef<(alignedGuide?: GuidePoint | null) => void>(() => {});
  doCaptureRef.current = (alignedGuide?: GuidePoint | null) => {
    const scene = sceneRef.current;
    if (!scene || !camera.isActive) return;

    const frameImage = camera.captureFrame();
    if (!frameImage) return;

    const texture = new THREE.DataTexture(
      frameImage.data,
      frameImage.width,
      frameImage.height,
      THREE.RGBAFormat,
    );
    texture.flipY = true; // match CanvasTexture default behavior
    texture.needsUpdate = true;
    const { yaw, pitch } = scene.getCameraDirection();

    const patchId = scene.addPatch(texture, yaw, pitch, camera.fov.horizontal, camera.fov.vertical);

    if (patchId === null) {
      texture.dispose();
      // Area already covered — mark the guide as auto-captured so the loop doesn't retry it
      if (alignedGuide) {
        autoCapturedRef.current.add(alignedGuide.id);
      }
      setAlignState('rejected');
      setStatusMessage('Bu alan zaten cekildi veya limit doldu.');
      setTimeout(() => {
        setAlignState('none');
        setStatusMessage('');
      }, 1200);
      return;
    }

    if (alignedGuide) {
      scene.markGuideCaptured(alignedGuide.id);
      autoCapturedRef.current.add(alignedGuide.id);
    }

    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(100);
    }

    syncUIFromScene();
    setAlignState('captured');
    setStatusMessage('');
    setTimeout(() => setAlignState('none'), 600);
  };

  // ── Auto-capture loop ──
  // IMPORTANT: This effect must NOT depend on doCapture or any frequently
  // changing state. It uses refs for everything to avoid the re-render →
  // effect restart → timer reset cycle that was preventing auto-capture.
  useEffect(() => {
    if (!open) return;

    let rafId = 0;
    let lastHudUpdate = 0;
    let lastAlignState = 'none';

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const scene = sceneRef.current;
      if (!scene) return;

      const now = Date.now();

      // Update HUD (throttled to ~200ms to reduce re-renders)
      if (now - lastHudUpdate > 200) {
        lastHudUpdate = now;
        const dir = scene.getCameraDirection();
        setCameraDir(dir);
        const nearest = scene.findNearest();
        if (nearest) {
          setNearestDist(Math.round(angularDistance(dir.yaw, dir.pitch, nearest.yaw, nearest.pitch)));
        } else {
          setNearestDist(null);
        }
      }

      const aligned = scene.findAligned(ALIGN_THRESHOLD);

      if (aligned && !autoCapturedRef.current.has(aligned.id)) {
        const timer = stableTimerRef.current;
        const dir = scene.getCameraDirection();

        // --- Step 1: update or start timer ---
        if (!timer || timer.guideId !== aligned.id) {
          // New guide aligned — start timer
          stableTimerRef.current = { guideId: aligned.id, startTime: now, startYaw: dir.yaw, startPitch: dir.pitch };
          if (lastAlignState !== 'approaching') { lastAlignState = 'approaching'; setAlignState('approaching'); }
        } else {
          const moved = angularDistance(timer.startYaw, timer.startPitch, dir.yaw, dir.pitch);
          if (moved > MOTION_THRESHOLD) {
            // Still aligned but moved — restart timer, back to approaching
            stableTimerRef.current = { guideId: aligned.id, startTime: now, startYaw: dir.yaw, startPitch: dir.pitch };
            if (lastAlignState !== 'approaching') { lastAlignState = 'approaching'; setAlignState('approaching'); }
          } else if (now - timer.startTime >= STABLE_DURATION) {
            // --- Step 2: held still long enough — capture ---
            try { doCaptureRef.current(aligned); } catch (e) { console.error('Auto-capture error:', e); }
            stableTimerRef.current = null;
            lastAlignState = 'captured';
          } else {
            // --- Step 3: counting down — show stable ---
            if (lastAlignState !== 'stable') { lastAlignState = 'stable'; setAlignState('stable'); }
          }
        }
      } else {
        if (stableTimerRef.current) {
          stableTimerRef.current = null;
        }
        if (lastAlignState !== 'none') {
          lastAlignState = 'none';
          setAlignState('none');
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // Only depend on `open` — everything else is accessed via refs
  }, [open]);

  const handleManualCapture = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const aligned = scene.findAligned(ALIGN_THRESHOLD);
    doCaptureRef.current(aligned);
  };

  // ── Export ──
  const handleComplete = async () => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (patchCount === 0) {
      setError('Hic kare cekilmedi. En az bir kare cekin.');
      return;
    }

    setShowConfirm(false);
    setIsExporting(true);
    setError('');
    setStatusMessage('Panorama olusturuluyor...');

    // Stop the camera stream before the GPU-intensive export.
    // On mobile Safari, keeping the camera active during export pushes GPU/RAM
    // over the OS limit and causes the browser to silently reload the page.
    camera.stop();
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const blob = await exportEquirectangular(scene);
      const fileName = `panorama-${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      onPanoramaReady(file, sceneTitle.trim() || 'Kamera Panoramasi');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export basarisiz');
    } finally {
      setIsExporting(false);
      setStatusMessage('');
    }
  };

  // ── Reset ──
  const handleReset = () => {
    sceneRef.current?.reset();
    autoCapturedRef.current.clear();
    stableTimerRef.current = null;
    syncUIFromScene();
    setAlignState('none');
    setError('');
    setStatusMessage('');
  };

  // ── Undo last capture ──
  const handleUndo = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const removed = scene.undoLastPatch();
    if (removed) {
      // Also remove from auto-captured set (find which guide was uncaptured)
      const points = scene.getGuidePoints();
      const uncaptured = points.filter((p) => !p.captured).map((p) => p.id);
      for (const id of uncaptured) {
        autoCapturedRef.current.delete(id);
      }
      syncUIFromScene();
      setStatusMessage('Son kare geri alindi.');
      setTimeout(() => setStatusMessage(''), 1000);
    }
  };

  // ── Cleanup on close ──
  useEffect(() => {
    if (!open) {
      autoCapturedRef.current.clear();
      stableTimerRef.current = null;
      setPatchCount(0);
      setCoverage(0);
      setActiveLevel(1);
      setLevelPercents([0, 0, 0]);
      setAlignState('none');
      setError('');
      setStatusMessage('');
      setShowConfirm(false);
      setSceneTitle('Kamera Panoramasi');
      setCameraDir(null);
      setNearestDist(null);
    }
  }, [open]);

  if (!open) return null;

  const alignLabel =
    alignState === 'approaching'
      ? 'Noktaya yaklasiyorsunuz...'
      : alignState === 'stable'
        ? 'Sabit tutun...'
        : alignState === 'captured'
          ? 'Cekildi!'
          : alignState === 'rejected'
            ? 'Bu alan zaten cekildi'
            : null;

  const alignColor =
    alignState === 'approaching'
      ? 'text-yellow-400 border-yellow-500/50 bg-yellow-900/30'
      : alignState === 'stable'
        ? 'text-emerald-400 border-emerald-500/50 bg-emerald-900/30'
        : alignState === 'captured'
          ? 'text-emerald-300 border-emerald-400/50 bg-emerald-800/40'
          : alignState === 'rejected'
            ? 'text-red-400 border-red-500/50 bg-red-900/30'
            : '';

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">360° Panorama Capture</h2>
          <p className="text-[11px] text-gray-400">
            {coverage}% kapsama · {patchCount} kare
            {cameraDir && (
              <span className="ml-2 text-gray-500">
                {Math.round(cameraDir.yaw)}° yaw · {Math.round(cameraDir.pitch)}° pitch
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Three.js Scene + Camera Overlay */}
      <div className="relative min-h-0 flex-1">
        <div ref={sceneContainerRef} className="h-full w-full" />

        {/* Camera feed overlay — always in DOM so videoRef is set before start() attaches the stream */}
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
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            borderRadius: '12px',
          }}
        />

        {/* Alignment indicator */}
        {alignLabel && (
          <div
            className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-semibold ${alignColor}`}
          >
            {alignState === 'captured' && <Check size={12} className="mr-1 inline" />}
            {alignLabel}
          </div>
        )}

        {/* Next guide distance (when not aligned) */}
        {!alignLabel && nearestDist !== null && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-gray-600/50 bg-gray-900/60 px-3 py-1 text-[11px] text-gray-400">
            Sonraki nokta: {nearestDist}° uzakta
          </div>
        )}

        {/* Flash on capture */}
        {alignState === 'captured' && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/15" />
        )}

        {/* Camera starting overlay */}
        {camera.isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 size={28} className="animate-spin text-blue-400" />
          </div>
        )}
      </div>

      {/* Level progress */}
      <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2">
        {[1, 2, 3].map((level) => {
          const locked = level > activeLevel;
          const pct = levelPercents[level - 1];
          const label =
            level === 1 ? 'Yatay orta' : level === 2 ? 'Yukari bak (65°)' : 'Asagi bak (65°)';
          return (
            <div key={level} className="mb-1 flex items-center gap-2 text-[10px]">
              <span className={`w-16 ${locked ? 'text-gray-600' : 'text-gray-300'}`}>
                {label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all ${locked ? 'bg-gray-700' : 'bg-emerald-500'}`}
                  style={{ width: `${locked ? 0 : pct}%` }}
                />
              </div>
              <span className={locked ? 'text-gray-600' : 'text-gray-400'}>
                {locked ? 'Kilitli' : `${pct}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status / Error */}
      {(error || camera.error || statusMessage) && (
        <div
          className={`shrink-0 border-t px-4 py-2 text-xs ${
            error || camera.error
              ? 'border-red-500/30 bg-red-900/20 text-red-300'
              : 'border-blue-500/30 bg-blue-900/20 text-blue-300'
          }`}
        >
          {error || camera.error || statusMessage}
        </div>
      )}

      {/* Controls */}
      <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-3">
        <input
          type="text"
          value={sceneTitle}
          onChange={(e) => setSceneTitle(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Sahne basligi"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleManualCapture}
            disabled={!camera.isActive}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white active:scale-95 disabled:bg-gray-700 disabled:opacity-50"
          >
            <Camera size={16} /> Kare Cek
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={patchCount === 0}
            className="rounded-lg bg-yellow-600/80 px-3 py-2.5 text-white hover:bg-yellow-500 disabled:opacity-40"
            title="Son kareyi geri al"
          >
            <Undo2 size={16} />
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={patchCount === 0}
            className="rounded-lg bg-gray-700 px-3 py-2.5 text-gray-300 hover:bg-gray-600 disabled:opacity-40"
            title="Tumu sifirla"
          >
            <RotateCcw size={16} />
          </button>

          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-gray-700"
          >
            {isExporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Tamamla
          </button>
        </div>

        {/* Orientation status */}
        {orientation.permissionState === 'unsupported' && (
          <p className="mt-2 text-center text-[10px] text-gray-500">
            Jiroskop bulunamadi — mouse/touch ile kurede donebilirsiniz
          </p>
        )}
        {orientation.permissionState === 'denied' && (
          <p className="mt-2 text-center text-[10px] text-yellow-500">
            Jiroskop izni reddedildi — ayarlardan izin verin veya mouse kullanin
          </p>
        )}
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-5">
            <p className="mb-1 text-sm font-semibold text-white">Panoramayi tamamla?</p>
            <p className="mb-4 text-xs text-gray-400">
              Kapsama: {coverage}%. Eksik bolgeler koyu gri ile doldurulacak.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg bg-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-600"
              >
                Iptal
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
