'use client';

import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TourConfig, Hotspot } from '@/types/tour';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import clsx from 'clsx';

// We'll load pannellum via a script tag or dynamic import to avoid SSR issues
// But for now, let's assume we can import it. If not, we'll fix it.
// Actually, Pannellum is best loaded via script in Next.js to avoid window is not defined
declare global {
  interface Window {
    pannellum: any;
  }
}

interface TourViewerProps {
  config: TourConfig;
  projectCode: string;
}

export default function TourViewer({ config, projectCode }: TourViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerInstanceRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activePopup, setActivePopup] = useState<Hotspot | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState(config.initialSceneId);
  const [yaw, setYaw] = useState(0);

  const currentScene = config.scenes.find(s => s.id === currentSceneId);

  useEffect(() => {
    // Track yaw for minimap radar
    const interval = setInterval(() => {
      if (viewerInstanceRef.current) {
        setYaw(viewerInstanceRef.current.getYaw());
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Audio Management
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
      }

      const scene = config.scenes.find(s => s.id === currentSceneId);
      if (scene?.audio) {
          const audioUrl = scene.audio.startsWith('http') 
              ? scene.audio 
              : `/projects/${projectCode}/audio/${encodeURIComponent(scene.audio)}`;
          
          const newAudio = new Audio(audioUrl);
          newAudio.loop = true;
          newAudio.volume = 0.5;
          
          const playPromise = newAudio.play();
          if (playPromise !== undefined) {
              playPromise.catch(e => {
                  console.log("Autoplay prevented", e);
                  // We could show a UI button to enable audio here
              });
          }
          
          audioRef.current = newAudio;
      }
      
      return () => {
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
          }
      };
  }, [currentSceneId, config, projectCode]);

  useEffect(() => {
    // Dynamic import to ensure window exists
    const initPannellum = async () => {
      if (typeof window === 'undefined') return;
      
      const isMobile = window.innerWidth < 768;
      const defaultHfov = isMobile ? 90 : 115; // Reduced FOV for mobile

      // We need to ensure pannellum css is loaded
      // import('pannellum/src/css/pannellum.css'); 
      // The above import might fail if node_modules structure is weird. 
      // Let's assume we add the CSS in globals or layout.

      if (!window.pannellum) {
        // Fallback if not loaded globally
        await import('pannellum');
      }

      if (viewerInstanceRef.current) {
        viewerInstanceRef.current.destroy();
      }

      const scenes: any = {};
      config.scenes.forEach((scene) => {
        scenes[scene.id] = {
          title: scene.title,
          type: 'equirectangular',
          panorama: scene.image.startsWith('http') ? scene.image : `/projects/${projectCode}/images/${encodeURIComponent(scene.image)}`,
          pitch: scene.initialView?.pitch || 0,
          yaw: scene.initialView?.yaw || 0,
          hfov: isMobile ? 90 : (scene.initialView?.hfov || 115),
          hotSpots: scene.hotspots.map((hs) => ({
            pitch: hs.pitch,
            yaw: hs.yaw,
            type: hs.type === 'scene' ? 'scene' : 'info',
            text: hs.text,
            sceneId: hs.targetSceneId,
            targetPitch: hs.targetPitch,
            targetYaw: hs.targetYaw,
            targetHfov: hs.targetHfov,
            cssClass: 'custom-hotspot',
            // Custom data to pass to handler
            createTooltipFunc: hotspotTooltip,
            createTooltipArgs: hs
          })),
        };
      });

      viewerInstanceRef.current = window.pannellum.viewer(viewerContainerRef.current, {
        default: {
          firstScene: config.initialSceneId,
          sceneFadeDuration: 1000,
          autoLoad: true,
          showControls: true,
          showTitle: false,
          minHfov: isMobile ? 60 : 50, // En yakın zoom (dar açı)
          maxHfov: isMobile ? 100 : 130, // En uzak zoom (geniş açı)
        },
        scenes: scenes,
      });

      viewerInstanceRef.current.on('scenechange', (id: string) => {
          setCurrentSceneId(id);
          setActivePopup(null);
      });
    };

    initPannellum();

    return () => {
      if (viewerInstanceRef.current) {
        viewerInstanceRef.current.destroy();
      }
    };
  }, [config, projectCode]);

  // Custom tooltip function to bind React state
  const hotspotTooltip = (hotSpotDiv: HTMLElement, args: Hotspot) => {
    hotSpotDiv.classList.add('custom-tooltip');
    
    // Create wrapper for border animation
    const wrapper = document.createElement('div');
    wrapper.className = 'relative hotspot-wrapper';
    wrapper.style.display = 'inline-block';
    
    // Animated border for info hotspots
    if (args.type === 'info') {
      const borderGradient = document.createElement('div');
      const size = args.size || 1;
      const baseSize = 40 * size;
      borderGradient.style.position = 'absolute';
      borderGradient.style.width = `${baseSize + 8}px`;
      borderGradient.style.height = `${baseSize + 8}px`;
      borderGradient.style.left = '-4px';
      borderGradient.style.top = '-4px';
      borderGradient.style.borderRadius = '50%';
      borderGradient.style.animation = 'spinBorder 3s linear infinite';
      
      const color = args.color || '#3b82f6';
      borderGradient.style.background = `conic-gradient(from 0deg, ${color}, ${color}00, ${color})`;
      borderGradient.style.opacity = '0.8';
      wrapper.appendChild(borderGradient);
    }
    
    // Create a simple icon or dot
    const icon = document.createElement('div');
    const size = args.size || 1;
    const baseSize = 40 * size; // 40px base size
    
    icon.style.width = `${baseSize}px`;
    icon.style.height = `${baseSize}px`;
    const opacityHex = Math.round((args.opacity ?? 0.8) * 255).toString(16).padStart(2, '0');
    icon.style.backgroundColor = args.color ? `${args.color}${opacityHex}` : (args.type === 'scene' ? 'rgba(255,255,255,0.2)' : 'rgba(59, 130, 246, 0.8)');
    icon.style.position = 'relative';
    icon.style.zIndex = '10';
    
    icon.className = `rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)] backdrop-blur-md border-2 ${
      args.type === 'scene' ? '[transform:rotateX(60deg)] border-white/60' : 'border-white/40'
    }`;
    
    // We can't render React components directly into this DOM node easily without portals
    // So we use standard DOM events to trigger React state
    icon.onclick = () => {
      if (args.type === 'info') {
        setActivePopup(args);
      }
      // Scene transitions are handled automatically by Pannellum if type is 'scene'
    };

    // Icon content
    let iconHtml = '';
    if (args.icon && (LucideIcons as any)[args.icon]) {
        const IconComponent = (LucideIcons as any)[args.icon];
        iconHtml = renderToStaticMarkup(<IconComponent size={20 * size} color="white" />);
    } else {
        // Default icons
        if (args.type === 'scene') {
            iconHtml = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'; // Simple arrow
        } else {
            iconHtml = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'; // Info
        }
    }
    icon.innerHTML = iconHtml;

    wrapper.appendChild(icon);
    hotSpotDiv.appendChild(wrapper);
    
    // Add label on hover
    const label = document.createElement('span');
    label.className = 'absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap pointer-events-none';
    label.innerText = args.text;
    hotSpotDiv.appendChild(label);
    hotSpotDiv.classList.add('group'); // For hover effect
  };

  return (
    <div className="relative w-full h-full bg-black">
      <div ref={viewerContainerRef} className="w-full h-full" />

      {/* Scene Info Overlay - Top Left */}
      {currentScene?.metadata && currentScene.metadata.length > 0 && (
        <div 
            className="absolute top-4 left-4 md:ml-8 z-40 max-w-[200px] md:max-w-sm animate-in slide-in-from-left-4 duration-500"
            style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
        >
           <div className="bg-black/40 backdrop-blur-md border border-white/10 p-4 md:p-6 rounded-xl shadow-lg text-white">
              <h2 className="text-base md:text-xl font-bold mb-2 md:mb-4 border-b border-white/10 pb-2 md:pb-3">{currentScene.title}</h2>
              <div className="space-y-2 md:space-y-3">
                  {currentScene.metadata.map((item, idx) => {
                      // @ts-ignore - Dynamic access to Lucide icons
                      const IconComp = item.icon ? LucideIcons[item.icon] : null;
                      return (
                        <div key={idx} className="flex justify-between items-center text-xs md:text-base">
                            <div className="flex items-center gap-2 md:gap-3 mr-2 md:mr-6">
                                {IconComp && <IconComp size={16} className="w-4 h-4 md:w-[18px] md:h-[18px]" style={{ color: item.color || '#e2e8f0' }} />}
                                <span className="font-bold" style={{ color: item.color || '#e2e8f0' }}>{item.label}</span>
                            </div>
                            <span className="font-light text-white/90">{item.value}</span>
                        </div>
                      );
                  })}
              </div>
           </div>
        </div>
      )}

      {/* Glassmorphic Popup - Bottom Right Style */}
      {activePopup && (
        <div className="absolute bottom-4 right-4 z-50 w-80 md:w-96 animate-slide-in-right">
          <div className="bg-black/60 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-2xl text-white relative overflow-hidden">
            <button 
              onClick={() => setActivePopup(null)}
              className="absolute top-3 right-3 p-1.5 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors z-20 backdrop-blur-md border border-white/10"
            >
              <X size={18} />
            </button>
            {activePopup.image && (
                <div className="mb-4 rounded-lg overflow-hidden border border-white/10">
                    <img 
                        src={activePopup.image.startsWith('http') ? activePopup.image : `/projects/${projectCode}/images/${encodeURIComponent(activePopup.image)}`} 
                        alt={activePopup.text}
                        className="w-full h-48 object-cover"
                    />
                </div>
            )}
            <h3 className="text-xl font-bold mb-2 pr-8">{activePopup.text}</h3>
            <p className="text-gray-200 leading-relaxed text-sm max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {activePopup.description || "No description available."}
            </p>
          </div>
        </div>
      )}

      {/* Minimap Overlay */}
      {config.floorplanImage && (
          <div 
            className="absolute top-4 right-4 w-32 md:w-64"
            style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
          >
              <div className="bg-black/40 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden shadow-2xl transition-opacity hover:opacity-100 opacity-80 aspect-square">
                  <div className="relative w-full h-full p-0.5">
                      <img 
                          src={config.floorplanImage.startsWith('http') ? config.floorplanImage : `/projects/${projectCode}/images/${encodeURIComponent(config.floorplanImage)}`} 
                          alt="Floorplan" 
                          className="w-full h-full object-contain p-0.5"
                  />
                  {config.scenes.map(s => s.floorplanPosition && (
                      <div 
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            viewerInstanceRef.current?.loadScene(s.id);
                          }}
                          className={`absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border border-white shadow-sm transition-all duration-500 cursor-pointer hover:scale-125 ${
                              s.id === currentSceneId ? 'bg-blue-500 z-10 ring-4 ring-blue-500/30' : 'bg-red-400 hover:bg-red-300'
                          }`}
                          style={{ 
                              left: `${s.floorplanPosition.x}%`, 
                              top: `${s.floorplanPosition.y}%`,
                              transform: `translate(-50%, -50%) rotate(${s.floorplanPosition.rotation || 0}deg)`
                          }}
                      >
                        {s.id === currentSceneId && (
                            <div 
                                className="absolute top-1/2 left-1/2 w-[60px] h-[60px] pointer-events-none"
                                style={{ 
                                    transform: `translate(-50%, -50%) rotate(${yaw}deg)`,
                                    transformOrigin: 'center' 
                                }}
                            >
                                <svg viewBox="0 0 100 100" className="w-full h-full">
                                    <path 
                                        d="M50 50 L15 0 A50 50 0 0 1 85 0 Z" 
                                        fill={config.minimapSettings?.coneColor || "url(#radar-gradient)"} 
                                        fillOpacity={config.minimapSettings?.coneOpacity || 0.5}
                                        stroke={config.minimapSettings?.coneBorder ? (config.minimapSettings?.coneBorderColor || "white") : "none"}
                                        strokeWidth={config.minimapSettings?.coneBorder ? 2 : 0}
                                    />
                                    {!config.minimapSettings?.coneColor && (
                                        <defs>
                                            <radialGradient id="radar-gradient" cx="0.5" cy="0.5" r="0.5">
                                                <stop offset="0%" stopColor="rgba(59, 130, 246, 0.8)" />
                                                <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                                            </radialGradient>
                                        </defs>
                                    )}
                                </svg>
                            </div>
                        )}
                      </div>
                  ))}
              </div>
          </div>
          <div className="mt-2 bg-black/60 backdrop-blur-md border border-white/20 rounded-lg px-3 py-2 text-center">
              <p className="text-white text-sm font-semibold">{currentScene?.title || 'Unknown Scene'}</p>
          </div>
      </div>
      )}
    </div>
  );
}
