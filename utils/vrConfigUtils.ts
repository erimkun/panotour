/**
 * VR Configuration Utilities
 * Handles merging VR config with Pannellum config (fallback system)
 */

import { Hotspot, Scene, TourConfig, VRConfig, VRHotspotOverride, DEFAULT_VR_CONFIG } from '@/types/tour';

/**
 * Get VR-specific hotspot with fallback to Pannellum values
 * @param hotspot - Original Pannellum hotspot
 * @param override - VR override (if any)
 * @returns Hotspot with VR values applied
 */
export function getVRHotspot(hotspot: Hotspot, override?: VRHotspotOverride): Hotspot & { vrVisible: boolean } {
  return {
    ...hotspot,
    // Apply VR overrides if present, otherwise use original values
    pitch: override?.pitch ?? hotspot.pitch,
    yaw: override?.yaw ?? hotspot.yaw,
    vrVisible: override?.visible ?? true, // Default: visible in VR
  };
}

/**
 * Get all VR hotspots for a scene with overrides applied
 * Only returns scene-type hotspots (info hotspots not shown in VR)
 * @param scene - Original scene from Pannellum config
 * @param vrConfig - VR configuration
 * @returns Array of hotspots with VR settings applied
 */
export function getVRHotspotsForScene(
  scene: Scene,
  vrConfig: VRConfig
): (Hotspot & { vrVisible: boolean })[] {
  const sceneOverrides = vrConfig.hotspotOverrides[scene.id] || {};
  
  return scene.hotspots
    // Only scene (link) hotspots are shown in VR
    .filter(h => h.type === 'scene')
    .map(hotspot => {
      const override = sceneOverrides[hotspot.id];
      return getVRHotspot(hotspot, override);
    })
    // Filter out hotspots marked as hidden in VR
    .filter(h => h.vrVisible);
}

/**
 * Get VR-visible scenes
 * @param config - Tour config
 * @param vrConfig - VR configuration
 * @returns Array of scenes visible in VR mode
 */
export function getVRVisibleScenes(config: TourConfig, vrConfig: VRConfig): Scene[] {
  // If visibleScenes is empty, all scenes are visible
  if (vrConfig.visibleScenes.length === 0) {
    return config.scenes;
  }
  
  return config.scenes.filter(scene => 
    vrConfig.visibleScenes.includes(scene.id)
  );
}

/**
 * Check if a scene is visible in VR
 * @param sceneId - Scene ID to check
 * @param vrConfig - VR configuration
 * @returns boolean
 */
export function isSceneVisibleInVR(sceneId: string, vrConfig: VRConfig): boolean {
  // Empty array means all scenes visible
  if (vrConfig.visibleScenes.length === 0) {
    return true;
  }
  return vrConfig.visibleScenes.includes(sceneId);
}

/**
 * Update hotspot override in VR config
 * @param vrConfig - Current VR config
 * @param sceneId - Scene ID
 * @param hotspotId - Hotspot ID
 * @param override - New override values
 * @returns Updated VR config
 */
export function updateHotspotOverride(
  vrConfig: VRConfig,
  sceneId: string,
  hotspotId: string,
  override: Partial<VRHotspotOverride>
): VRConfig {
  const currentSceneOverrides = vrConfig.hotspotOverrides[sceneId] || {};
  const currentHotspotOverride = currentSceneOverrides[hotspotId] || {};
  
  const newOverride = { ...currentHotspotOverride, ...override };
  
  // Clean up: remove override if all values are undefined/default
  const hasValues = Object.values(newOverride).some(v => v !== undefined);
  
  if (!hasValues) {
    // Remove the hotspot override
    const { [hotspotId]: _, ...remainingHotspots } = currentSceneOverrides;
    
    // If no more hotspots, remove the scene entry
    if (Object.keys(remainingHotspots).length === 0) {
      const { [sceneId]: __, ...remainingScenes } = vrConfig.hotspotOverrides;
      return {
        ...vrConfig,
        hotspotOverrides: remainingScenes,
      };
    }
    
    return {
      ...vrConfig,
      hotspotOverrides: {
        ...vrConfig.hotspotOverrides,
        [sceneId]: remainingHotspots,
      },
    };
  }
  
  return {
    ...vrConfig,
    hotspotOverrides: {
      ...vrConfig.hotspotOverrides,
      [sceneId]: {
        ...currentSceneOverrides,
        [hotspotId]: newOverride,
      },
    },
  };
}

/**
 * Reset hotspot to Pannellum defaults (remove VR override)
 * @param vrConfig - Current VR config
 * @param sceneId - Scene ID
 * @param hotspotId - Hotspot ID
 * @returns Updated VR config
 */
export function resetHotspotOverride(
  vrConfig: VRConfig,
  sceneId: string,
  hotspotId: string
): VRConfig {
  const currentSceneOverrides = vrConfig.hotspotOverrides[sceneId] || {};
  const { [hotspotId]: _, ...remainingHotspots } = currentSceneOverrides;
  
  // If no more hotspots, remove the scene entry
  if (Object.keys(remainingHotspots).length === 0) {
    const { [sceneId]: __, ...remainingScenes } = vrConfig.hotspotOverrides;
    return {
      ...vrConfig,
      hotspotOverrides: remainingScenes,
    };
  }
  
  return {
    ...vrConfig,
    hotspotOverrides: {
      ...vrConfig.hotspotOverrides,
      [sceneId]: remainingHotspots,
    },
  };
}

/**
 * Toggle scene visibility in VR
 * @param vrConfig - Current VR config
 * @param sceneId - Scene ID to toggle
 * @param visible - New visibility state
 * @param allSceneIds - All scene IDs in the tour (needed for first toggle)
 * @returns Updated VR config
 */
export function toggleSceneVisibility(
  vrConfig: VRConfig,
  sceneId: string,
  visible: boolean,
  allSceneIds: string[]
): VRConfig {
  let visibleScenes = [...vrConfig.visibleScenes];
  
  // If visibleScenes is empty (all visible), initialize with all scenes
  if (visibleScenes.length === 0 && !visible) {
    visibleScenes = allSceneIds.filter(id => id !== sceneId);
  } else if (visible) {
    // Add scene if not present
    if (!visibleScenes.includes(sceneId)) {
      visibleScenes.push(sceneId);
    }
    // If all scenes are now visible, clear the array (means all visible)
    if (visibleScenes.length === allSceneIds.length) {
      visibleScenes = [];
    }
  } else {
    // Remove scene
    visibleScenes = visibleScenes.filter(id => id !== sceneId);
  }
  
  return {
    ...vrConfig,
    visibleScenes,
  };
}

/**
 * Get hotspot override value or original value
 * Used for displaying in UI
 */
export function getHotspotValue<K extends keyof Hotspot>(
  hotspot: Hotspot,
  vrConfig: VRConfig,
  sceneId: string,
  key: K
): { value: Hotspot[K]; isOverridden: boolean } {
  const override = vrConfig.hotspotOverrides[sceneId]?.[hotspot.id];
  
  if (override && key in override && (override as any)[key] !== undefined) {
    return {
      value: (override as any)[key],
      isOverridden: true,
    };
  }
  
  return {
    value: hotspot[key],
    isOverridden: false,
  };
}

/**
 * Initialize VR config from existing tour config
 * Called when VR config doesn't exist yet
 */
export function initializeVRConfig(): VRConfig {
  return { ...DEFAULT_VR_CONFIG };
}
