'use client';

/**
 * XRButton Component
 * Single Responsibility: VR mode entry button
 * Displays VR button only when WebXR is supported
 */

import { useState } from 'react';
import { Glasses } from 'lucide-react';
import { useXRSupport } from '@/hooks/useXRSupport';
import { TourConfig, DEFAULT_VR_CONFIG } from '@/types/tour';
import dynamic from 'next/dynamic';

// Dynamically import XRPanoramaViewer to avoid SSR issues with Three.js
const XRPanoramaViewer = dynamic(() => import('./xr/XRPanoramaViewer'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-9999 bg-black flex items-center justify-center">
      <div className="text-white text-xl">VR Yükleniyor...</div>
    </div>
  ),
});

export interface XRButtonProps {
  config: TourConfig;
  projectCode: string;
  currentSceneId: string;
  currentPitch?: number;
  currentYaw?: number;
  className?: string;
}

export default function XRButton({
  config,
  projectCode,
  currentSceneId,
  currentPitch = 0,
  currentYaw = 0,
  className = '',
}: XRButtonProps) {
  const { isSupported, isChecking } = useXRSupport();
  const [showXRViewer, setShowXRViewer] = useState(false);
  const [currentScene, setCurrentScene] = useState(currentSceneId);

  // Get VR config from main config (embedded)
  const vrConfig = config.vrConfig || DEFAULT_VR_CONFIG;

  // Don't render while checking or if not supported
  if (isChecking) {
    return null;
  }

  // Show disabled button if not supported (for user awareness)
  if (!isSupported) {
    return (
      <button
        disabled
        className={`
          flex items-center justify-center p-3
          bg-gray-700/30 text-gray-500 
          rounded-lg cursor-not-allowed
          backdrop-blur-md border border-white/5
          ${className}
        `}
        title="VR desteği bu tarayıcıda mevcut değil"
      >
        <Glasses size={20} />
      </button>
    );
  }

  const handleEnterVR = () => {
    setCurrentScene(currentSceneId);
    setShowXRViewer(true);
  };

  const handleExitVR = () => {
    setShowXRViewer(false);
  };

  const handleSceneChange = (sceneId: string) => {
    setCurrentScene(sceneId);
  };

  return (
    <>
      <button
        onClick={handleEnterVR}
        className={`
          flex items-center gap-2 px-4 py-2 
          bg-blue-600/80 hover:bg-blue-500/80 
          text-white font-medium
          rounded-lg transition-all duration-200
          backdrop-blur-md border border-white/20
          shadow-lg hover:shadow-xl hover:scale-105
          ${className}
        `}
        title="VR Modunda Görüntüle"
      >
        <Glasses size={20} />
        <span className="hidden md:inline">VR Modu</span>
      </button>

      {showXRViewer && (
        <XRPanoramaViewer
          config={config}
          projectCode={projectCode}
          initialSceneId={currentScene}
          initialPitch={currentPitch}
          initialYaw={currentYaw}
          vrConfig={vrConfig}
          onExit={handleExitVR}
          onSceneChange={handleSceneChange}
        />
      )}
    </>
  );
}
