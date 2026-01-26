export type HotspotType = 'scene' | 'info';

export interface Hotspot {
  id: string;
  type: HotspotType;
  text: string;
  pitch: number;
  yaw: number;
  targetSceneId?: string; // For 'scene' type
  targetPitch?: number; // Optional target pitch for scene transition
  targetYaw?: number; // Optional target yaw for scene transition
  targetHfov?: number; // Optional target hfov for scene transition
  description?: string; // For 'info' type
  image?: string; // Optional image for info popup
  icon?: string; // Lucide icon name
  color?: string; // Hex color
  opacity?: number; // Opacity 0-1
  size?: number; // Scale factor (default 1)
  rotation?: number; // Rotation in degrees (0-360)
}

export interface Scene {
  id: string;
  title: string;
  image: string; // Filename relative to project images folder
  audio?: string; // Filename relative to project audio folder (optional background audio)
  hotspots: Hotspot[];
  initialView?: {
    pitch: number;
    yaw: number;
    hfov: number;
  };
  floorplanPosition?: {
    x: number; // Percentage 0-100
    y: number; // Percentage 0-100
    rotation?: number; // Rotation in degrees (0-360) for minimap indicator
  };
  metadata?: { 
    label: string; 
    value: string;
    icon?: string;
    color?: string;
  }[];
}

export interface TourConfig {
  id: string;
  name: string;
  scenes: Scene[];
  initialSceneId: string;
  floorplanImage?: string; // Filename of the floorplan image
  minimapSettings?: {
    coneColor?: string;
    coneOpacity?: number;
    coneBorder?: boolean;
    coneBorderColor?: string;
    coneSize?: number;
  };
  // VR config embedded in main config (exported with ZIP)
  vrConfig?: VRConfig;
}

// VR-specific hotspot override (only changed values)
export interface VRHotspotOverride {
  pitch?: number;    // VR-specific pitch (fallback to Pannellum value)
  yaw?: number;      // VR-specific yaw (fallback to Pannellum value)
  visible?: boolean; // Whether visible in VR (default: true for scene hotspots)
}

// VR Configuration - separate from Pannellum config
export interface VRConfig {
  // Which scenes are visible in VR mode
  visibleScenes: string[];  // scene IDs - empty means all visible
  
  // Hotspot overrides per scene (only store changed values)
  hotspotOverrides: {
    [sceneId: string]: {
      [hotspotId: string]: VRHotspotOverride;
    };
  };
}

// Default VR config
export const DEFAULT_VR_CONFIG: VRConfig = {
  visibleScenes: [],
  hotspotOverrides: {},
};
