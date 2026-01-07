'use client';

/**
 * XRPanoramaViewer Component
 * Single Responsibility: Full VR panorama viewing experience
 * Manages Three.js scene, WebXR session, and gaze interactions
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Volume2, VolumeX, Glasses } from 'lucide-react';
import { Scene } from '@/types/tour';
import { XRPanoramaViewerProps, DEFAULT_XR_CONFIG, XRConfig, GazeState } from '@/types/xr';
import { XRSceneManager } from '@/utils/xr/XRSceneManager';
import { getImageUrl, getSceneTransitionHotspots, getSceneById } from '@/utils/panoramaUtils';
import { useXRSession } from '@/hooks/useXRSession';

export default function XRPanoramaViewer({
  config,
  projectCode,
  initialSceneId,
  initialPitch = 0,
  initialYaw = 0,
  xrConfig,
  onExit,
  onSceneChange,
}: XRPanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<XRSceneManager | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedRef = useRef(false);
  
  const [currentSceneId, setCurrentSceneId] = useState(initialSceneId);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gazeState, setGazeState] = useState<GazeState>({
    targetHotspotId: null,
    gazeStartTime: null,
    progress: 0,
    isComplete: false,
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isVRActive, setIsVRActive] = useState(false);

  const mergedConfig: XRConfig = { ...DEFAULT_XR_CONFIG, ...xrConfig };
  const currentScene = getSceneById(config, currentSceneId);

  // XR Session management
  const { state: xrSessionState, startSession, endSession } = useXRSession({
    renderer: sceneManagerRef.current?.getRenderer() || null,
    onSessionStart: () => {
      setIsVRActive(true);
    },
    onSessionEnd: () => {
      setIsVRActive(false);
    },
    onError: (err) => {
      console.error('XR Session error:', err);
      setError('VR oturumu başlatılamadı');
    },
  });

  // Stop audio helper (defined before useEffect that uses it)
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  // Handle audio helper
  const playSceneAudio = useCallback((scene: Scene, muted: boolean) => {
    // Stop existing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (scene.audio) {
      const audioUrl = scene.audio.startsWith('http')
        ? scene.audio
        : `/projects/${projectCode}/audio/${encodeURIComponent(scene.audio)}`;
      
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audio.volume = 0.5;
      audio.muted = muted;
      audio.play().catch(console.log);
      audioRef.current = audio;
    }
  }, [projectCode]);

  // Initialize scene manager
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const manager = new XRSceneManager(containerRef.current, mergedConfig);
    sceneManagerRef.current = manager;

    // Set initial camera rotation
    manager.setCameraRotation(initialPitch, initialYaw);

    // Start animation loop
    manager.startAnimation();

    // Set up gaze progress callback
    manager.getGazeController().setOnProgressChange((state) => {
      setGazeState(state);
    });

    // Set up scene change callback
    manager.setOnSceneChange((sceneId) => {
      setCurrentSceneId(sceneId);
      onSceneChange?.(sceneId);
      // Load the new scene
      const scene = getSceneById(config, sceneId);
      if (scene && sceneManagerRef.current) {
        setIsLoading(true);
        const imageUrl = getImageUrl(scene.image, projectCode);
        sceneManagerRef.current.transitionToPanorama(imageUrl, setLoadingProgress)
          .then(() => {
            const hotspots = getSceneTransitionHotspots(scene);
            sceneManagerRef.current?.createHotspots(hotspots);
            setIsLoading(false);
          })
          .catch((err) => {
            console.error('Failed to load scene:', err);
            setError('Sahne yüklenemedi');
            setIsLoading(false);
          });
      }
    });

    // Load initial scene
    const scene = getSceneById(config, initialSceneId);
    if (scene) {
      const imageUrl = getImageUrl(scene.image, projectCode);
      manager.loadPanorama(imageUrl, setLoadingProgress)
        .then(() => {
          const hotspots = getSceneTransitionHotspots(scene);
          manager.createHotspots(hotspots);
          playSceneAudio(scene, false);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load initial scene:', err);
          setError('Sahne yüklenemedi');
          setIsLoading(false);
        });
    }

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (audioRef.current) {
        audioRef.current.muted = newMuted;
      }
      return newMuted;
    });
  }, []);

  // Handle VR button click
  const handleVRClick = useCallback(async () => {
    if (isVRActive) {
      await endSession();
    } else {
      await startSession();
    }
  }, [isVRActive, startSession, endSession]);

  // Handle exit
  const handleExit = useCallback(() => {
    endSession();
    stopAudio();
    onExit();
  }, [endSession, stopAudio, onExit]);

  // Manual scene change (from thumbnail clicks)
  const handleManualSceneChange = useCallback((sceneId: string) => {
    if (sceneId === currentSceneId) return;
    
    setCurrentSceneId(sceneId);
    onSceneChange?.(sceneId);
    
    const scene = getSceneById(config, sceneId);
    if (scene && sceneManagerRef.current) {
      setIsLoading(true);
      const imageUrl = getImageUrl(scene.image, projectCode);
      sceneManagerRef.current.transitionToPanorama(imageUrl, setLoadingProgress)
        .then(() => {
          const hotspots = getSceneTransitionHotspots(scene);
          sceneManagerRef.current?.createHotspots(hotspots);
          playSceneAudio(scene, isMuted);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load scene:', err);
          setError('Sahne yüklenemedi');
          setIsLoading(false);
        });
    }
  }, [config, projectCode, currentSceneId, onSceneChange, playSceneAudio, isMuted]);

  // Get remaining time for gaze
  const remainingTime = Math.ceil(
    (mergedConfig.gazeDuration * (1 - gazeState.progress)) / 1000
  );

  // Get target scene name for display
  const targetSceneName = gazeState.targetHotspotId
    ? config.scenes.find(s => 
        currentScene?.hotspots.find(h => 
          h.id === gazeState.targetHotspotId && h.targetSceneId === s.id
        )
      )?.title || 'Diğer Oda'
    : null;

  return (
    <div className="fixed inset-0 z-9999 bg-black">
      {/* Three.js Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-white text-lg">Yükleniyor... {Math.round(loadingProgress)}%</p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-6 text-center">
            <p className="text-red-400 text-lg mb-4">{error}</p>
            <button
              onClick={handleExit}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
            >
              Çıkış
            </button>
          </div>
        </div>
      )}

      {/* Gaze Progress Indicator (Center) */}
      {gazeState.targetHotspotId && gazeState.progress > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <div className="relative w-32 h-32">
            {/* Progress Ring */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${gazeState.progress * 283} 283`}
                className="transition-all duration-100"
              />
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-2xl font-bold">{remainingTime}s</span>
              <span className="text-xs mt-1 max-w-20 text-center truncate">
                {targetSceneName}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Gaze Pointer (Center dot when not loading) */}
      {!gazeState.targetHotspotId && !isLoading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <div className="w-4 h-4 rounded-full border-2 border-white/80 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        </div>
      )}

      {/* Scene Title */}
      {currentScene && !isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
            <h2 className="text-white text-lg font-medium">{currentScene.title}</h2>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
        {/* Mute Button */}
        <button
          onClick={toggleMute}
          className="p-3 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/20 transition-all"
          title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>

        {/* VR Toggle Button */}
        <button
          onClick={handleVRClick}
          disabled={xrSessionState.isStarting}
          className={`
            p-4 rounded-full backdrop-blur-md border transition-all
            ${isVRActive 
              ? 'bg-blue-500 hover:bg-blue-600 border-blue-400' 
              : 'bg-black/60 hover:bg-black/80 border-white/20'
            }
            ${xrSessionState.isStarting ? 'opacity-50 cursor-wait' : ''}
          `}
          title={isVRActive ? 'VR\'dan Çık' : 'VR\'a Gir'}
        >
          <Glasses size={28} className="text-white" />
        </button>

        {/* Exit Button */}
        <button
          onClick={handleExit}
          className="p-3 bg-red-500/60 hover:bg-red-500/80 text-white rounded-full backdrop-blur-md border border-red-400/50 transition-all"
          title="Çıkış"
        >
          <X size={24} />
        </button>
      </div>

      {/* Instructions */}
      {!isLoading && !isVRActive && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
          <p className="text-white/60 text-sm text-center max-w-xs">
            {gazeState.targetHotspotId
              ? 'Geçiş için bakmaya devam edin...'
              : 'Sahne değiştirmek için mavi noktalara bakın'}
          </p>
        </div>
      )}

      {/* Scene Navigation (Mini thumbnails) */}
      {!isLoading && config.scenes.length > 1 && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
          <div className="flex flex-col gap-2 bg-black/40 backdrop-blur-md rounded-lg p-2 border border-white/10">
            {config.scenes.map(scene => (
              <button
                key={scene.id}
                onClick={() => handleManualSceneChange(scene.id)}
                className={`
                  w-16 h-12 rounded overflow-hidden border-2 transition-all
                  ${scene.id === currentSceneId 
                    ? 'border-blue-500 scale-110' 
                    : 'border-transparent hover:border-white/50'
                  }
                `}
                title={scene.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageUrl(scene.image, projectCode)}
                  alt={scene.title}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
