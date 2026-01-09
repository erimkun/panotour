'use client';

import { useState, useEffect } from 'react';
import { Glasses, ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw, X, Minimize2, Maximize2, Move } from 'lucide-react';
import { TourConfig, Scene, Hotspot, VRConfig, DEFAULT_VR_CONFIG } from '@/types/tour';
import {
  isSceneVisibleInVR,
  toggleSceneVisibility,
  updateHotspotOverride,
  resetHotspotOverride,
  getHotspotValue,
} from '@/utils/vrConfigUtils';
import VRPreviewPopup from './VRPreviewPopup';

interface VRSettingsPanelProps {
  config: TourConfig;
  vrConfig: VRConfig;
  activeSceneId: string;
  selectedHotspotId: string | null;
  projectCode: string;
  onVRConfigChange: (vrConfig: VRConfig) => void;
}

export default function VRSettingsPanel({
  config,
  vrConfig,
  activeSceneId,
  selectedHotspotId,
  projectCode,
  onVRConfigChange,
}: VRSettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [scenesExpanded, setScenesExpanded] = useState(true);
  const [hotspotExpanded, setHotspotExpanded] = useState(true);
  const [previewHotspot, setPreviewHotspot] = useState<Hotspot | null>(null);

  const activeScene = config.scenes.find(s => s.id === activeSceneId);
  const selectedHotspot = activeScene?.hotspots.find(h => h.id === selectedHotspotId);
  
  // Only show link (scene) hotspots for VR settings
  const linkHotspots = activeScene?.hotspots.filter(h => h.type === 'scene') || [];

  // Handle scene visibility toggle
  const handleSceneToggle = (sceneId: string, visible: boolean) => {
    const allSceneIds = config.scenes.map(s => s.id);
    const newVRConfig = toggleSceneVisibility(vrConfig, sceneId, visible, allSceneIds);
    onVRConfigChange(newVRConfig);
  };

  // Handle hotspot visibility toggle
  const handleHotspotVisibilityToggle = (hotspotId: string, visible: boolean) => {
    const newVRConfig = updateHotspotOverride(vrConfig, activeSceneId, hotspotId, { visible });
    onVRConfigChange(newVRConfig);
  };

  // Handle hotspot position change
  const handleHotspotPositionChange = (
    hotspotId: string,
    field: 'pitch' | 'yaw',
    value: number | undefined
  ) => {
    const newVRConfig = updateHotspotOverride(vrConfig, activeSceneId, hotspotId, { [field]: value });
    onVRConfigChange(newVRConfig);
  };

  // Reset hotspot to Pannellum defaults
  const handleResetHotspot = (hotspotId: string) => {
    const newVRConfig = resetHotspotOverride(vrConfig, activeSceneId, hotspotId);
    onVRConfigChange(newVRConfig);
  };

  // Get override info for a hotspot
  const getOverrideInfo = (hotspot: Hotspot) => {
    const override = vrConfig.hotspotOverrides[activeSceneId]?.[hotspot.id];
    return {
      hasOverride: !!override,
      pitchOverride: override?.pitch,
      yawOverride: override?.yaw,
      visibleOverride: override?.visible,
    };
  };

  // Minimized state - just show icon
  if (isMinimized) {
    return (
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-lg shadow-lg transition-all flex items-center gap-2"
          title="VR Ayarları"
        >
          <Glasses size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-50 w-80 bg-gray-800 rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-purple-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Glasses size={20} />
          <span className="font-semibold">VR Ayarları</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-white/80 hover:text-white p-1 rounded"
            title="Küçült"
          >
            <Minimize2 size={16} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white/80 hover:text-white p-1 rounded"
            title={isExpanded ? 'Daralt' : 'Genişlet'}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {!isExpanded ? null : (
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Scene Visibility Section */}
          <div className="border-b border-gray-700">
            <button
              onClick={() => setScenesExpanded(!scenesExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-white hover:bg-gray-700/50"
            >
              <span className="font-medium flex items-center gap-2">
                <Eye size={16} />
                Sahne Görünürlüğü
              </span>
              {scenesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {scenesExpanded && (
              <div className="px-4 pb-3 space-y-2">
                <p className="text-xs text-gray-400 mb-2">
                  VR modunda hangi sahneler görünsün?
                </p>
                {config.scenes.map(scene => {
                  const isVisible = isSceneVisibleInVR(scene.id, vrConfig);
                  return (
                    <label
                      key={scene.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                        isVisible ? 'bg-green-900/30 hover:bg-green-900/50' : 'bg-red-900/30 hover:bg-red-900/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={(e) => handleSceneToggle(scene.id, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                      />
                      <span className={`text-sm ${isVisible ? 'text-white' : 'text-gray-400'}`}>
                        {scene.title}
                      </span>
                      {scene.id === activeSceneId && (
                        <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded">
                          Aktif
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hotspot Settings Section */}
          <div>
            <button
              onClick={() => setHotspotExpanded(!hotspotExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-white hover:bg-gray-700/50"
            >
              <span className="font-medium flex items-center gap-2">
                <Glasses size={16} />
                Hotspot Ayarları
              </span>
              {hotspotExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {hotspotExpanded && (
              <div className="px-4 pb-3 space-y-3">
                <p className="text-xs text-gray-400">
                  Bu sahnedeki link hotspotlarının VR'daki görünümü
                </p>
                
                {linkHotspots.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    Bu sahnede link hotspot yok
                  </p>
                ) : (
                  linkHotspots.map(hotspot => {
                    const overrideInfo = getOverrideInfo(hotspot);
                    const isVisible = overrideInfo.visibleOverride ?? true;
                    const isSelected = selectedHotspotId === hotspot.id;
                    
                    return (
                      <div
                        key={hotspot.id}
                        className={`bg-gray-900 rounded-lg p-3 border ${
                          isSelected ? 'border-purple-500' : 'border-gray-700'
                        }`}
                      >
                        {/* Hotspot Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white font-medium truncate flex-1">
                            {hotspot.text}
                          </span>
                          {overrideInfo.hasOverride && (
                            <button
                              onClick={() => handleResetHotspot(hotspot.id)}
                              className="text-yellow-500 hover:text-yellow-400 p-1"
                              title="VR ayarlarını sıfırla (PC değerlerine dön)"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>

                        {/* Visibility Toggle */}
                        <label className="flex items-center gap-2 mb-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={(e) => handleHotspotVisibilityToggle(hotspot.id, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                          />
                          <span className="text-xs text-gray-300">
                            {isVisible ? 'VR\'da görünür' : 'VR\'da gizli'}
                          </span>
                          {isVisible ? (
                            <Eye size={14} className="text-green-400" />
                          ) : (
                            <EyeOff size={14} className="text-red-400" />
                          )}
                        </label>

                        {/* Preview Button */}
                        {isVisible && (
                          <button
                            onClick={() => setPreviewHotspot(hotspot)}
                            className="w-full mb-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs rounded flex items-center justify-center gap-2 transition-colors border border-purple-500/30"
                          >
                            <Move size={14} />
                            VR Önizleme ile Ayarla
                          </button>
                        )}

                        {/* Position Override (only if visible) */}
                        {isVisible && (
                          <div className="grid grid-cols-2 gap-2">
                            {/* Pitch */}
                            <div>
                              <label className="text-xs text-gray-400 flex items-center gap-1">
                                Pitch
                                {overrideInfo.pitchOverride !== undefined && (
                                  <span className="text-yellow-500">*</span>
                                )}
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={overrideInfo.pitchOverride ?? ''}
                                  placeholder={String(hotspot.pitch.toFixed(1))}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleHotspotPositionChange(
                                      hotspot.id,
                                      'pitch',
                                      val === '' ? undefined : parseFloat(val)
                                    );
                                  }}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                                />
                              </div>
                              <span className="text-[10px] text-gray-500">
                                PC: {hotspot.pitch.toFixed(1)}
                              </span>
                            </div>

                            {/* Yaw */}
                            <div>
                              <label className="text-xs text-gray-400 flex items-center gap-1">
                                Yaw
                                {overrideInfo.yawOverride !== undefined && (
                                  <span className="text-yellow-500">*</span>
                                )}
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={overrideInfo.yawOverride ?? ''}
                                  placeholder={String(hotspot.yaw.toFixed(1))}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleHotspotPositionChange(
                                      hotspot.id,
                                      'yaw',
                                      val === '' ? undefined : parseFloat(val)
                                    );
                                  }}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                                />
                              </div>
                              <span className="text-[10px] text-gray-500">
                                PC: {hotspot.yaw.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                
                {/* Info text */}
                <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-900/50 rounded">
                  <p className="flex items-center gap-1">
                    <span className="text-yellow-500">*</span>
                    VR için özelleştirilmiş değer
                  </p>
                  <p className="mt-1">
                    Boş bırakılan alanlar PC (Pannellum) değerlerini kullanır.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VR Preview Popup */}
      {previewHotspot && activeScene && (
        <VRPreviewPopup
          hotspot={previewHotspot}
          vrPitch={vrConfig.hotspotOverrides[activeSceneId]?.[previewHotspot.id]?.pitch}
          vrYaw={vrConfig.hotspotOverrides[activeSceneId]?.[previewHotspot.id]?.yaw}
          originalPitch={previewHotspot.pitch}
          originalYaw={previewHotspot.yaw}
          panoramaUrl={
            activeScene.image.startsWith('http')
              ? activeScene.image
              : `/projects/${projectCode}/images/${encodeURIComponent(activeScene.image)}`
          }
          onClose={() => setPreviewHotspot(null)}
          onPitchChange={(pitch) => {
            // If pitch equals original, remove override
            if (pitch === previewHotspot.pitch) {
              const newVRConfig = updateHotspotOverride(vrConfig, activeSceneId, previewHotspot.id, { pitch: undefined });
              onVRConfigChange(newVRConfig);
            } else {
              handleHotspotPositionChange(previewHotspot.id, 'pitch', pitch);
            }
          }}
          onYawChange={(yaw) => {
            // If yaw equals original, remove override
            if (yaw === previewHotspot.yaw) {
              const newVRConfig = updateHotspotOverride(vrConfig, activeSceneId, previewHotspot.id, { yaw: undefined });
              onVRConfigChange(newVRConfig);
            } else {
              handleHotspotPositionChange(previewHotspot.id, 'yaw', yaw);
            }
          }}
        />
      )}
    </div>
  );
}
