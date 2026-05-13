'use client';

import { useState, useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TourConfig, Scene, Hotspot, VRConfig, DEFAULT_VR_CONFIG } from '@/types/tour';
import { Plus, Trash, Map as MapIcon, Info, Download, Eye, Crosshair, Settings, ChevronDown, ChevronUp, Upload, Music, ArrowLeft, Save, X, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import VRSettingsPanel from './VRSettingsPanel';
import * as LucideIcons from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Common icons for selection
const COMMON_ICONS = [
  'Info', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'MapPin', 'Home', 'Image', 'Video', 'Music',
  'Maximize', 'Minimize', 'Search', 'Menu', 'X', 'Check', 'AlertCircle', 'HelpCircle', 'Settings',
  'Camera', 'Mic', 'Speaker', 'Wifi', 'Battery', 'Bluetooth', 'Sun', 'Moon', 'Cloud', 'Wind', 'Droplets',
  'Thermometer', 'Compass', 'Map', 'Navigation', 'Flag', 'Target', 'Anchor', 'Coffee', 'Utensils', 'Bed',
  'Bath', 'Car', 'Bus', 'Train', 'Plane', 'Bike', 'ShoppingBag', 'ShoppingCart', 'CreditCard', 'DollarSign'
];

// Icons specifically for Scene Info Box metadata
const METADATA_ICONS = [
  'Maximize', 'Compass', 'Wind', 'Sun', 'Home', 'Map', 'Ruler', 'Box', 'Layers', 'Thermometer', 'Droplets',
  'Square', 'LayoutGrid', 'Building', 'Building2', 'DoorOpen', 'DoorClosed', 'Sofa', 'Lamp', 'LampDesk',
  'Tv', 'Monitor', 'Refrigerator', 'WashingMachine', 'AirVent', 'Heater', 'Fan', 'Lightbulb',
  'Bath', 'ShowerHead', 'Bed', 'BedDouble', 'BedSingle', 'Armchair', 'Table', 'Table2',
  'ParkingSquare', 'Car', 'Warehouse', 'Trees', 'TreePine', 'Flower2', 'Mountain', 'Waves',
  'Eye', 'MapPin', 'Navigation', 'MoveHorizontal', 'MoveVertical', 'ArrowUpDown', 'ArrowLeftRight',
  'Clock', 'Calendar', 'Star', 'Heart', 'Award', 'Crown', 'Gem', 'Sparkles', 'Zap', 'Flame',
  'Gauge', 'Percent', 'Hash', 'AtSign', 'Euro', 'DollarSign', 'PoundSterling', 'CircleDot'
];

const GLASS_PRESETS = [
  { name: 'White', color: '#ffffff', opacity: 0.2 },
  { name: 'Blue', color: '#3b82f6', opacity: 0.8 },
  { name: 'Dark', color: '#000000', opacity: 0.5 },
  { name: 'Purple', color: '#8b5cf6', opacity: 0.8 },
  { name: 'Emerald', color: '#10b981', opacity: 0.8 },
  { name: 'Amber', color: '#f59e0b', opacity: 0.8 },
  { name: 'Rose', color: '#f43f5e', opacity: 0.8 },
  { name: 'Cyan', color: '#06b6d4', opacity: 0.8 },
  { name: 'Indigo', color: '#6366f1', opacity: 0.8 },
  { name: 'Teal', color: '#14b8a6', opacity: 0.8 },
];

declare global {
  interface Window {
    pannellum: any;
  }
}

interface TourEditorProps {
  initialConfig: TourConfig;
  projectCode: string;
}

export default function TourEditor({ initialConfig, projectCode }: TourEditorProps) {
  const [serverBlobMap] = useState<Map<string, string>>(() => new Map());
  const [config, setConfig] = useState<TourConfig>(() => {
      const clean = JSON.parse(JSON.stringify(initialConfig));
      const extract = (val: string) => {
          if (val && typeof val === 'string' && val.startsWith('http')) {
              try {
                  const url = new URL(val);
                  const filename = decodeURIComponent(url.pathname.split('/').pop() || val);
                  serverBlobMap.set(filename, val);
                  return filename;
              } catch {
                  return val;
              }
          }
          return val;
      };
      if (clean.scenes) {
          clean.scenes.forEach((s: any) => {
              if (s.image) s.image = extract(s.image);
              if (s.audio) s.audio = extract(s.audio);
              if (s.hotspots) {
                  s.hotspots.forEach((h: any) => {
                      if (h.image) h.image = extract(h.image);
                  });
              }
          });
      }
      if (clean.floorplanImage) clean.floorplanImage = extract(clean.floorplanImage);
      return clean;
  });
  const [activeSceneId, setActiveSceneId] = useState<string>(config.initialSceneId || (config.scenes[0]?.id) || '');
  const [activeIconPicker, setActiveIconPicker] = useState<string | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerInstanceRef = useRef<any>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [tempHotspot, setTempHotspot] = useState<{pitch: number, yaw: number} | null>(null);
  const [yaw, setYaw] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (viewerInstanceRef.current) {
        setYaw(viewerInstanceRef.current.getYaw());
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);
  const [isAddingScene, setIsAddingScene] = useState(false);
  const [newSceneData, setNewSceneData] = useState({ id: '', title: '', image: '' });
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [showWizard, setShowWizard] = useState(initialConfig.scenes.length === 0);
  const [wizardData, setWizardData] = useState({ name: '', selectedFiles: [] as File[] });
    const [wizardStatus, setWizardStatus] = useState<'idle' | 'saving' | 'exporting' | 'error'>('idle');
    const [wizardMessage, setWizardMessage] = useState('');
  
  // Local mode: Store File objects and their preview URLs
  const [localFiles, setLocalFiles] = useState<Map<string, File>>(new Map());
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const isLocalMode = localFiles.size > 0; // Has local files = local mode
  const [viewSavedMessage, setViewSavedMessage] = useState(false);
  
  // Combine server images with local files for dropdowns
  const allAvailableImages = [
    ...availableImages,
    ...Array.from(localFiles.keys()).filter(name => 
      /\.(jpg|jpeg|png|webp)$/i.test(name) && !availableImages.includes(name)
    )
  ];
  
  // Server save state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editSecret, setEditSecret] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Hotspot target view state
  const [isSettingTargetView, setIsSettingTargetView] = useState(false);
  const [targetViewHotspotId, setTargetViewHotspotId] = useState<string | null>(null);
  const [returnSceneId, setReturnSceneId] = useState<string | null>(null);
  
  // Selected hotspot for VR panel
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  
  const isPickingRef = useRef(false);
  const lastSceneIdRef = useRef<string>('');

  // Get VR config from main config (or default)
  const vrConfig = config.vrConfig || DEFAULT_VR_CONFIG;

  // Sync ref
  useEffect(() => { isPickingRef.current = isPicking; }, [isPicking]);

  // Fetch available images
  const fetchAvailableImages = async () => {
      try {
          const res = await fetch(`/api/projects/${projectCode}/images`);
          const data = await res.json();
          if (Array.isArray(data)) setAvailableImages(data);
      } catch (err) {
          console.error("Failed to load images", err);
      }
  };

  useEffect(() => {
      void fetchAvailableImages();
  }, [projectCode]);

  // Update VR config within main config (no separate API call - saved with export)
  const handleVRConfigChange = (newVRConfig: VRConfig) => {
      setConfig(prev => ({
          ...prev,
          vrConfig: newVRConfig,
      }));
  };

  const resolveEditorImageUrl = (imagePath: string) => {
      if (isLocalMode && previewUrls.has(imagePath)) {
          return previewUrls.get(imagePath)!;
      }

      if (serverBlobMap.has(imagePath)) {
          return serverBlobMap.get(imagePath)!;
      }

      if (imagePath.startsWith('http')) {
          return imagePath;
      }

      return `/projects/${projectCode}/images/${encodeURIComponent(imagePath)}`;
  };

  const registerLocalFiles = (files: File[]) => {
      if (files.length === 0) return;

      const nextLocalFiles = new Map(localFiles);
      const nextPreviewUrls = new Map(previewUrls);

      files.forEach((file) => {
          const previousUrl = nextPreviewUrls.get(file.name);
          if (previousUrl) {
              URL.revokeObjectURL(previousUrl);
          }

          nextLocalFiles.set(file.name, file);
          nextPreviewUrls.set(file.name, URL.createObjectURL(file));
      });

      setLocalFiles(nextLocalFiles);
      setPreviewUrls(nextPreviewUrls);
  };

  const handleEditorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(file => file.type.startsWith('image/'));
      registerLocalFiles(files);
      e.target.value = '';
  };

  // Save config to server with password (and optionally upload files in local mode)
  const handleSaveToServer = async () => {
      if (!editSecret.trim()) {
          setSaveMessage('Şifre gerekli');
          setSaveStatus('error');
          return;
      }

      setSaveStatus('saving');
      setSaveMessage('');

      try {
          // If local mode, first upload all files
          if (isLocalMode && localFiles.size > 0) {
              setSaveMessage('Dosyalar yükleniyor...');
              
              // Separate files into images and audio
              const imageFiles: File[] = [];
              const audioFiles: File[] = [];
              
              for (const [filename, file] of localFiles.entries()) {
                  if (file.type.startsWith('audio/') || filename.match(/\.(mp3|wav|ogg)$/i)) {
                      audioFiles.push(file);
                  } else {
                      imageFiles.push(file);
                  }
              }

              // Upload images one by one to avoid 413 error
              if (imageFiles.length > 0) {
                  for (let i = 0; i < imageFiles.length; i++) {
                      const file = imageFiles[i];
                      setSaveMessage(`Resim yükleniyor: ${i + 1}/${imageFiles.length} - ${file.name}`);
                      
                      const imageFormData = new FormData();
                      imageFormData.append('folder', 'images');
                      imageFormData.append('files', file);

                      const imageResponse = await fetch(`/api/projects/${projectCode}/upload-files`, {
                          method: 'POST',
                          headers: { 'x-edit-secret': editSecret },
                          body: imageFormData,
                      });

                      if (!imageResponse.ok) {
                          // Handle non-JSON responses (like 413 errors)
                          const contentType = imageResponse.headers.get('content-type');
                          if (contentType && contentType.includes('application/json')) {
                              const err = await imageResponse.json();
                              throw new Error(err.error || `Resim yükleme hatası: ${file.name}`);
                          } else {
                              const text = await imageResponse.text();
                              throw new Error(`Resim çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB): ${file.name}. Max 4.5MB`);
                          }
                      }
                      
                      const imageResult = await imageResponse.json();
                      console.log('[SAVE] Image uploaded:', file.name, imageResult);
                  }
              }

              // Upload audio one by one
              if (audioFiles.length > 0) {
                  for (let i = 0; i < audioFiles.length; i++) {
                      const file = audioFiles[i];
                      setSaveMessage(`Ses yükleniyor: ${i + 1}/${audioFiles.length} - ${file.name}`);
                      
                      const audioFormData = new FormData();
                      audioFormData.append('folder', 'audio');
                      audioFormData.append('files', file);

                      const audioResponse = await fetch(`/api/projects/${projectCode}/upload-files`, {
                          method: 'POST',
                          headers: { 'x-edit-secret': editSecret },
                          body: audioFormData,
                      });

                      if (!audioResponse.ok) {
                          const contentType = audioResponse.headers.get('content-type');
                          if (contentType && contentType.includes('application/json')) {
                              const err = await audioResponse.json();
                              throw new Error(err.error || `Ses yükleme hatası: ${file.name}`);
                          } else {
                              throw new Error(`Ses dosyası çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB): ${file.name}. Max 4.5MB`);
                          }
                      }
                      
                      const audioResult = await audioResponse.json();
                      console.log('[SAVE] Audio uploaded:', file.name, audioResult);
                  }
              }

              setSaveMessage('Config kaydediliyor...');
          }

          // Now save the config
          const response = await fetch(`/api/projects/${projectCode}/config`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-edit-secret': editSecret,
              },
              body: JSON.stringify(config),
          });

          // Safely parse response
          let data;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
              data = await response.json();
          } else {
              const text = await response.text();
              data = { error: text || `HTTP ${response.status}` };
          }

          if (response.ok) {
              setSaveStatus('success');
              if (isLocalMode) {
                  const uploadedImageNames = Array.from(localFiles.keys()).filter(name => /\.(jpg|jpeg|png|webp)$/i.test(name));
                  setSaveMessage(`✓ ${localFiles.size} dosya + config başarıyla kaydedildi!`);
                  // Clear local files after successful upload
                  setLocalFiles(new Map());
                  // Clean up preview URLs
                  previewUrls.forEach(url => URL.revokeObjectURL(url));
                  setPreviewUrls(new Map());
                  setAvailableImages(prev => Array.from(new Set([...prev, ...uploadedImageNames])));
                  void fetchAvailableImages();
              } else {
                  setSaveMessage('Config başarıyla kaydedildi!');
              }
              setTimeout(() => {
                  setShowSaveModal(false);
                  setSaveStatus('idle');
                  setSaveMessage('');
              }, 2500);
          } else {
              setSaveStatus('error');
              // Show detailed error with remaining attempts or ban info
              let errorMsg = data.error || 'Kaydetme başarısız';
              if (data.remainingAttempts !== undefined && data.remainingAttempts > 0) {
                  errorMsg += ` (Kalan hak: ${data.remainingAttempts})`;
              }
              if (data.bannedUntil) {
                  const banDate = new Date(data.bannedUntil);
                  errorMsg = `⛔ IP adresiniz engellenmiş. Kaldırılma: ${banDate.toLocaleString('tr-TR')}`;
              }
              setSaveMessage(errorMsg);
          }
      } catch (err) {
          setSaveStatus('error');
          setSaveMessage(err instanceof Error ? err.message : 'Bağlantı hatası');
      }
  };

  // Load Pannellum
  useEffect(() => {
    const initPannellum = async () => {
      if (typeof window === 'undefined') return;
      if (!window.pannellum) await import('pannellum');

      if (!activeSceneId) return;

      const scene = config.scenes.find(s => s.id === activeSceneId);
      if (!scene) return;

      // Handle Audio
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
          setIsPlayingAudio(false);
      }

      if (scene.audio) {
          const audioUrl = isLocalMode && previewUrls.has(scene.audio)
              ? previewUrls.get(scene.audio)!
              : scene.audio.startsWith('http')
                  ? scene.audio
                  : `/projects/${projectCode}/audio/${encodeURIComponent(scene.audio)}`;
          
          const audio = new Audio(audioUrl);
          audio.loop = true;
          audio.volume = 0.5;
          audio.play().catch(e => console.log("Autoplay blocked", e));
          audioRef.current = audio;
          setIsPlayingAudio(true);
      }

      let startPitch = scene.initialView?.pitch || 0;
      let startYaw = scene.initialView?.yaw || 0;
      let startHfov = scene.initialView?.hfov || 110;

      // Preserve view if reloading same scene (e.g. adding hotspot)
      if (viewerInstanceRef.current && lastSceneIdRef.current === activeSceneId) {
          try {
            startPitch = viewerInstanceRef.current.getPitch();
            startYaw = viewerInstanceRef.current.getYaw();
            startHfov = viewerInstanceRef.current.getHfov();
          } catch (e) {
              console.log("Could not get current view", e);
          }
      }

      if (viewerInstanceRef.current) {
        viewerInstanceRef.current.destroy();
      }

      lastSceneIdRef.current = activeSceneId;

      // Get panorama URL: use preview URL if in local mode, otherwise server path
            const panoramaUrl = resolveEditorImageUrl(scene.image);

      viewerInstanceRef.current = window.pannellum.viewer(viewerContainerRef.current, {
        type: 'equirectangular',
        panorama: panoramaUrl,
        autoLoad: true,
        pitch: startPitch,
        yaw: startYaw,
        hfov: startHfov,
        hotSpots: scene.hotspots.map(hs => ({
            pitch: hs.pitch,
            yaw: hs.yaw,
            type: 'info', // Always use info for editor to see them easily
            text: hs.text,
            cssClass: 'custom-hotspot',
            createTooltipFunc: (el: HTMLElement, args: any) => {
                el.classList.add('custom-tooltip');
                
                // Container for icon and label
                const container = document.createElement('div');
                container.className = 'flex flex-col items-center gap-1';
                
                // Wrapper for border animation
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';
                wrapper.style.display = 'inline-block';
                
                // Animated border for info hotspots
                if (hs.type === 'info') {
                    const borderGradient = document.createElement('div');
                    const size = hs.size || 1;
                    const baseSize = 32 * size;
                    borderGradient.style.position = 'absolute';
                    borderGradient.style.width = `${baseSize + 6}px`;
                    borderGradient.style.height = `${baseSize + 6}px`;
                    borderGradient.style.left = '-3px';
                    borderGradient.style.top = '-3px';
                    borderGradient.style.borderRadius = '50%';
                    borderGradient.style.animation = 'spinBorder 3s linear infinite';
                    
                    const color = hs.color || '#3b82f6';
                    borderGradient.style.background = `conic-gradient(from 0deg, ${color}, ${color}00, ${color})`;
                    borderGradient.style.opacity = '0.7';
                    wrapper.appendChild(borderGradient);
                }
                
                // Icon
                const icon = document.createElement('div');
                const size = hs.size || 1;
                const baseSize = 32 * size; // 32px base size for editor (slightly smaller than viewer)
                
                icon.style.width = `${baseSize}px`;
                icon.style.height = `${baseSize}px`;
                const opacityHex = Math.round((hs.opacity ?? 0.8) * 255).toString(16).padStart(2, '0');
                icon.style.backgroundColor = hs.color ? `${hs.color}${opacityHex}` : (hs.type === 'scene' ? 'rgba(255,255,255,0.2)' : 'rgba(59, 130, 246, 0.8)');
                icon.style.position = 'relative';
                icon.style.zIndex = '10';
                
                // Apply rotation if set
                const rotation = hs.rotation ?? 0;
                const baseTransform = hs.type === 'scene' ? 'rotateX(60deg)' : '';
                icon.style.transform = rotation ? `${baseTransform} rotate(${rotation}deg)` : baseTransform;

                icon.className = `rounded-full flex items-center justify-center border-2 shadow-lg backdrop-blur-md ${
                    hs.type === 'scene' ? 'border-white/60' : 'border-white/40'
                }`;
                
                // Icon content
                let iconHtml = '';
                if (hs.icon && (LucideIcons as any)[hs.icon]) {
                    const IconComponent = (LucideIcons as any)[hs.icon];
                    iconHtml = renderToStaticMarkup(<IconComponent size={16 * size} color="white" />);
                } else {
                    if (hs.type === 'scene') {
                        iconHtml = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
                    } else {
                        iconHtml = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
                    }
                }
                icon.innerHTML = iconHtml;
                
                wrapper.appendChild(icon);
                container.appendChild(wrapper);

                // Label
                const span = document.createElement('span');
                span.innerText = hs.text;
                span.className = 'bg-black/70 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap backdrop-blur-sm';
                
                container.appendChild(span);
                el.appendChild(container);
            }
        }))
      });
      
      // Drag detection variables
      let startX = 0;
      let startY = 0;

      viewerInstanceRef.current.on('mousedown', (event: MouseEvent) => {
          startX = event.clientX;
          startY = event.clientY;
      });

      // Use mouseup for picking to allow dragging
      viewerInstanceRef.current.on('mouseup', (event: MouseEvent) => {
          if (isPickingRef.current) {
              const diffX = Math.abs(event.clientX - startX);
              const diffY = Math.abs(event.clientY - startY);
              
              // Only pick if mouse hasn't moved much (not a drag)
              if (diffX < 5 && diffY < 5) {
                  const [pitch, yaw] = viewerInstanceRef.current.mouseEventToCoords(event);
                  console.log('Picked:', pitch, yaw);
                  setTempHotspot({ pitch, yaw });
                  setIsPicking(false);
              }
          }
      });
    };

    initPannellum();

    return () => {
      // Don't destroy on unmount of effect if we want to preserve view? 
      // No, we must destroy to prevent memory leaks and double viewers.
      // We handle preservation via logic above.
      if (viewerInstanceRef.current) viewerInstanceRef.current.destroy();
    };
  }, [activeSceneId, config.scenes, projectCode]); // Removed isPicking from deps

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleLocalFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setWizardData({ ...wizardData, selectedFiles: files });
  };

    const buildWizardProject = () => {
    if (!wizardData.name.trim()) {
      alert('Lütfen proje adı girin!');
            return null;
    }
    
    // Create scenes from selected files (if any)
    const scenes: Scene[] = wizardData.selectedFiles.map((file, index) => ({
      id: `scene-${index + 1}`,
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      image: file.name,
      hotspots: [],
      initialView: {
        pitch: 0,
        yaw: 0,
        hfov: 110
      }
    }));

    const newConfig: TourConfig = {
      id: projectCode,
      name: wizardData.name,
            status: 'draft',
      initialSceneId: scenes.length > 0 ? scenes[0].id : '',
      scenes: scenes
    };

    // Store file objects and preview URLs for local mode
    const newLocalFiles = new Map<string, File>();
    const newPreviewUrls = new Map<string, string>();
    
    wizardData.selectedFiles.forEach(file => {
      newLocalFiles.set(file.name, file);
      newPreviewUrls.set(file.name, URL.createObjectURL(file));
    });

        return {
            newConfig,
            newLocalFiles,
            newPreviewUrls,
        };
    };

    const applyWizardProject = (project: {
        newConfig: TourConfig;
        newLocalFiles: Map<string, File>;
        newPreviewUrls: Map<string, string>;
    }) => {
        previewUrls.forEach(url => URL.revokeObjectURL(url));

        setLocalFiles(project.newLocalFiles);
        setPreviewUrls(project.newPreviewUrls);
        setConfig(project.newConfig);
        setActiveSceneId(project.newConfig.scenes[0]?.id || '');
        setShowWizard(false);
        setWizardStatus('idle');
        setWizardMessage('');
    };

    const handleCreateProject = async (mode: 'edit' | 'export' | 'server') => {
        const project = buildWizardProject();
        if (!project) {
            return;
        }
    
        applyWizardProject(project);

        if (mode === 'edit') {
      return;
    }

        if (mode === 'export') {
            try {
                setWizardStatus('exporting');
                setWizardMessage('ZIP hazırlanıyor...');
                await handleExportZIP(project.newConfig, wizardData.selectedFiles);
            } finally {
                setWizardStatus('idle');
                setWizardMessage('');
            }
            return;
        }

        setShowSaveModal(true);
  };

  const handleExportZIP = async (exportConfig: TourConfig, files: File[]) => {
    const zip = new JSZip();
    
    // Create project folder
    const projectFolder = zip.folder(projectCode);
    if (!projectFolder) {
      alert('ZIP oluşturma hatası!');
      return;
    }
    
    // Add config.json
    projectFolder.file('config.json', JSON.stringify(exportConfig, null, 2));
    
    // Add folders
    const imagesFolder = projectFolder.folder('images');
    const audioFolder = projectFolder.folder('audio');

    if (imagesFolder && audioFolder) {
      for (const file of files) {
        // Check mime type or extension
        if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg)$/i)) {
             audioFolder.file(file.name, file);
        } else {
             imagesFolder.file(file.name, file);
        }
      }
    }
    
    // Generate and download ZIP
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${projectCode}.zip`);
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Store file for export
    const newLocalFiles = new Map(localFiles);
    newLocalFiles.set(file.name, file);
    setLocalFiles(newLocalFiles);

    // Store preview URL
    const newPreviewUrls = new Map(previewUrls);
    newPreviewUrls.set(file.name, URL.createObjectURL(file));
    setPreviewUrls(newPreviewUrls);

    // Update scene config
    handleUpdateScene(sceneId, { audio: file.name });
  };

  const startSettingTargetView = (hotspotId: string, targetSceneId: string) => {
    setTargetViewHotspotId(hotspotId);
    setReturnSceneId(activeSceneId);
    setActiveSceneId(targetSceneId);
    setIsSettingTargetView(true);
  };

  const confirmTargetView = () => {
    if (!viewerInstanceRef.current || !targetViewHotspotId || !returnSceneId) return;

    const pitch = viewerInstanceRef.current.getPitch();
    const yaw = viewerInstanceRef.current.getYaw();
    const hfov = viewerInstanceRef.current.getHfov();

    // Update hotspot in original scene
    const updatedScenes = config.scenes.map(s => {
        if (s.id === returnSceneId) {
            return {
                ...s,
                hotspots: s.hotspots.map(h => h.id === targetViewHotspotId ? {
                    ...h,
                    targetPitch: pitch,
                    targetYaw: yaw,
                    targetHfov: hfov
                } : h)
            };
        }
        return s;
    });

    setConfig({ ...config, scenes: updatedScenes });
    
    // Return to original scene
    setActiveSceneId(returnSceneId);
    setIsSettingTargetView(false);
    setTargetViewHotspotId(null);
    setReturnSceneId(null);
  };
  
  const cancelTargetView = () => {
      if (returnSceneId) setActiveSceneId(returnSceneId);
      setIsSettingTargetView(false);
      setTargetViewHotspotId(null);
      setReturnSceneId(null);
  };

  const addHotspot = (type: 'scene' | 'info') => {
      if (!tempHotspot || !activeSceneId) return;
      
      const newHotspot: Hotspot = {
          id: `hs-${Date.now()}`,
          type,
          text: "New Hotspot",
          pitch: tempHotspot.pitch,
          yaw: tempHotspot.yaw,
          description: type === 'info' ? "Description here" : undefined,
          targetSceneId: type === 'scene' ? "" : undefined
      };

      const updatedScenes = config.scenes.map(s => {
          if (s.id === activeSceneId) {
              return { ...s, hotspots: [...s.hotspots, newHotspot] };
          }
          return s;
      });

      setConfig({ ...config, scenes: updatedScenes });
      setTempHotspot(null);
  };

  const deleteHotspot = (hotspotId: string) => {
      const updatedScenes = config.scenes.map(s => {
          if (s.id === activeSceneId) {
              return { ...s, hotspots: s.hotspots.filter(h => h.id !== hotspotId) };
          }
          return s;
      });
      setConfig({ ...config, scenes: updatedScenes });
  };

  const activeScene = config.scenes.find(s => s.id === activeSceneId);

  const handleDeleteScene = (sceneId: string) => {
      if (!confirm("Are you sure you want to delete this scene?")) return;
      
      const updatedScenes = config.scenes.filter(s => s.id !== sceneId);
      setConfig({ 
          ...config, 
          scenes: updatedScenes,
          initialSceneId: config.initialSceneId === sceneId ? (updatedScenes[0]?.id || '') : config.initialSceneId
      });
      
      if (activeSceneId === sceneId) {
          setActiveSceneId(updatedScenes[0]?.id || '');
      }
  };

  const handleUpdateScene = (sceneId: string, updates: Partial<Scene>) => {
      const updatedScenes = config.scenes.map(s => {
          if (s.id === sceneId) {
              return { ...s, ...updates };
          }
          return s;
      });
      setConfig({ ...config, scenes: updatedScenes });
  };

  const handleSetInitialView = () => {
      if (!viewerInstanceRef.current || !activeSceneId) return;
      
      const pitch = viewerInstanceRef.current.getPitch();
      const yaw = viewerInstanceRef.current.getYaw();
      const hfov = viewerInstanceRef.current.getHfov();

      handleUpdateScene(activeSceneId, {
          initialView: { pitch, yaw, hfov }
      });
      
      setViewSavedMessage(true);
      setTimeout(() => setViewSavedMessage(false), 3000);
  };

  const handleSetStartScene = () => {
      if (!activeSceneId) return;
      setConfig(prev => ({
          ...prev,
          initialSceneId: activeSceneId
      }));
  };

  const handleAddScene = () => {
    if (!newSceneData.id || !newSceneData.title || !newSceneData.image) return;
    
    const newScene: Scene = {
        id: newSceneData.id,
        title: newSceneData.title,
        image: newSceneData.image,
        hotspots: []
    };

    setConfig(prev => ({
        ...prev,
        scenes: [...prev.scenes, newScene],
        initialSceneId: prev.initialSceneId || newScene.id
    }));
    
    setActiveSceneId(newScene.id);
    setIsAddingScene(false);
    setNewSceneData({ id: '', title: '', image: '' });
  };

  const handleFloorplanClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeScene) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const updatedScenes = config.scenes.map(s => {
          if (s.id === activeSceneId) {
              return { ...s, floorplanPosition: { x, y } };
          }
          return s;
      });
      setConfig({ ...config, scenes: updatedScenes });
  };

  // Project Setup Wizard
  if (showWizard) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900 p-8">
        <div className="w-full max-w-2xl bg-gray-800 rounded-2xl border border-gray-700 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">🎉 Yeni Proje Oluştur</h1>
            <p className="text-gray-400">
              Proje: <span className="text-blue-400 font-mono">{projectCode}</span>
            </p>
          </div>

          <div className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Proje Adı *
              </label>
              <input
                type="text"
                value={wizardData.name}
                onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                placeholder="Örn: Daire 1 - Örnek Proje"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Image Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Panorama Resimleri Seç (Opsiyonel)
              </label>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleLocalFilesSelect}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="flex flex-col items-center gap-3 cursor-pointer"
                >
                  <Upload size={48} className="text-gray-500" />
                  <div className="text-center">
                    <p className="text-white font-medium">
                      Bilgisayarından Resim Seç
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      veya sürükle-bırak (JPG, PNG, WEBP)
                    </p>
                  </div>
                </label>
              </div>
              {wizardData.selectedFiles.length > 0 && (
                <div className="mt-3 bg-gray-900 border border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs text-gray-400 mb-2">Seçilen Dosyalar:</p>
                  {wizardData.selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-300 py-1">
                      <span className="text-green-400">✓</span>
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}
                            <p className="text-xs text-gray-500 mt-2">
                {wizardData.selectedFiles.length === 0 ? (
                                    <>💡 Resim seçmezsen boş proje oluşturulur. Sonra editörde "Add Scene" ile ekleyebilirsin.</>
                ) : (
                                    <>✅ {wizardData.selectedFiles.length} resim seçildi. İstersen editörde devam et, istersen ZIP indir, istersen direkt sunucuya yaz.</>
                )}
              </p>
            </div>

            {/* Actions */}
                        <div className="grid gap-3 pt-4 md:grid-cols-3">
              <button
                                onClick={() => handleCreateProject('edit')}
                                className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Eye size={20} />
                                Editorde Ac
                            </button>
                            <button
                                onClick={() => handleCreateProject('export')}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download size={20} />
                                ZIP Indir
                            </button>
                            <button
                                onClick={() => handleCreateProject('server')}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Upload size={20} />
                                Sunucuya Yaz
              </button>
            </div>

                        {wizardMessage && (
                            <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                                wizardStatus === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-blue-900/30 text-blue-300'
                            }`}>
                                {(wizardStatus === 'saving' || wizardStatus === 'exporting') && <Loader2 size={16} className="animate-spin" />}
                                <span>{wizardMessage}</span>
                            </div>
                        )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700 text-xs text-gray-500 space-y-2">
            <p>💡 <strong>İpucu:</strong> Resim seçmesen de proje oluşturabilirsin! Editör açıldıktan sonra "Add Scene" butonu ile sahne ekleyebilirsin.</p>
                        <p>📥 <strong>Not:</strong> Sunucuya Yaz seçeneği aktif storage'a yazar. Storage ayarına göre bu local path veya Blob olabilir.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar */}
      {isSettingTargetView ? (
        <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 p-6 flex flex-col gap-6 animate-in slide-in-from-left">
           <div className="p-6 bg-blue-900/20 border border-blue-500/30 rounded-xl text-center">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/50">
                    <Eye size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Bakış Açısını Ayarla</h3>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                    Sahneyi sürükleyerek başlangıç açısını belirleyin ve kaydedin.
                </p>
                
                <div className="space-y-3">
                    <button 
                        onClick={confirmTargetView}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 transition-all hover:scale-105"
                    >
                        <LucideIcons.Check size={20} /> Kaydet ve Dön
                    </button>
                    <button 
                        onClick={cancelTargetView}
                        className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium border border-gray-700 transition-colors"
                    >
                        İptal
                    </button>
                </div>
            </div>
        </div>
      ) : (
      <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto flex flex-col gap-6">
        
        {/* Project Settings */}
        <div className="border-b border-gray-800 pb-4">
            <h2 className="text-xl font-bold mb-2">Project Settings</h2>
            
            <label className="block text-xs text-gray-400 mb-1">Project Name</label>
            <input 
                type="text"
                value={config.name}
                onChange={(e) => setConfig({...config, name: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm mb-3"
                placeholder="Enter project name..."
            />

            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
                value={config.status || 'published'}
                onChange={(e) => setConfig({ ...config, status: e.target.value as 'draft' | 'published' })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm mb-3"
            >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
            </select>
            
            <label className="block text-xs text-gray-400 mb-1">Floorplan Image</label>
            <select 
                value={config.floorplanImage || ''}
                onChange={(e) => setConfig({...config, floorplanImage: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            >
                <option value="">Select Image...</option>
                {allAvailableImages.map(img => (
                    <option key={img} value={img}>{img}</option>
                ))}
            </select>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-gray-600 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-blue-500 hover:text-white">
                <Upload size={14} /> Floorplan PNG/JPG/WEBP Yukle
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    multiple
                    onChange={handleEditorImageUpload}
                    className="hidden"
                />
            </label>
        </div>

        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <MapIcon size={20} /> Scenes
                </h2>
                <button 
                    onClick={() => setIsAddingScene(!isAddingScene)}
                    className="p-1 bg-blue-600 rounded hover:bg-blue-500"
                >
                    <Plus size={16} />
                </button>
            </div>

            {isAddingScene && (
                <div className="bg-gray-800 p-3 rounded mb-4 border border-gray-700 animate-in slide-in-from-top-2">
                    <input 
                        placeholder="ID (e.g. living-room)" 
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2"
                        value={newSceneData.id}
                        onChange={e => setNewSceneData({...newSceneData, id: e.target.value})}
                    />
                    <input 
                        placeholder="Title (e.g. Living Room)" 
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2"
                        value={newSceneData.title}
                        onChange={e => setNewSceneData({...newSceneData, title: e.target.value})}
                    />
                    <select 
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2"
                        value={newSceneData.image}
                        onChange={e => setNewSceneData({...newSceneData, image: e.target.value})}
                    >
                        <option value="">Select Panorama Image...</option>
                        {allAvailableImages.map(img => (
                            <option key={img} value={img}>{img}</option>
                        ))}
                    </select>
                    <label className="mb-2 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-gray-600 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-blue-500 hover:text-white">
                        <Upload size={14} /> Yeni PNG/JPG Yukle
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleEditorImageUpload}
                            className="hidden"
                        />
                    </label>
                    <button onClick={handleAddScene} className="w-full bg-green-600 hover:bg-green-500 py-1 rounded text-sm">
                        Add Scene
                    </button>
                </div>
            )}

            <div className="space-y-2">
                {config.scenes.map(scene => (
                    <button
                        key={scene.id}
                        onClick={() => setActiveSceneId(scene.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex justify-between items-center ${
                            activeSceneId === scene.id ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
                        }`}
                    >
                        <span>{scene.title}</span>
                        {config.initialSceneId === scene.id && <span title="Starting Scene">🏠</span>}
                    </button>
                ))}
            </div>
        </div>

        {activeScene && (
            <div>
                <div className="mb-6 border-b border-gray-800 pb-6">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Settings size={18} /> Scene Settings
                        </h3>
                        <button 
                            onClick={() => handleDeleteScene(activeScene.id)}
                            className="text-red-400 hover:text-red-300 p-1 hover:bg-red-900/30 rounded"
                            title="Delete Scene"
                        >
                            <Trash size={16} />
                        </button>
                    </div>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Title</label>
                            <input 
                                type="text" 
                                value={activeScene.title}
                                onChange={(e) => handleUpdateScene(activeScene.id, { title: e.target.value })}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Panorama Image</label>
                            <select 
                                value={activeScene.image}
                                onChange={(e) => handleUpdateScene(activeScene.id, { image: e.target.value })}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                            >
                                {allAvailableImages.map(img => (
                                    <option key={img} value={img}>{img}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Initial View</label>
                            <button 
                                onClick={handleSetInitialView}
                                className="w-full bg-gray-700 hover:bg-gray-600 text-xs py-2 rounded flex items-center justify-center gap-2 transition-colors"
                            >
                                <Eye size={14} /> Set Current View as Start
                            </button>
                            {viewSavedMessage && (
                                <div className="mt-1 text-xs text-green-400 flex items-center justify-center gap-1 animate-in fade-in zoom-in duration-300">
                                    <span>✅</span> Görünüm Ayarlandı
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Start Scene</label>
                            <button 
                                onClick={handleSetStartScene}
                                disabled={config.initialSceneId === activeSceneId}
                                className={`w-full text-xs py-2 rounded flex items-center justify-center gap-2 transition-colors ${
                                    config.initialSceneId === activeSceneId 
                                    ? 'bg-green-600/50 text-white cursor-default' 
                                    : 'bg-gray-700 hover:bg-gray-600'
                                }`}
                            >
                                {config.initialSceneId === activeSceneId ? (
                                    <><span>🏠</span> Starting Scene</>
                                ) : (
                                    <><span>🏠</span> Set as Starting Scene</>
                                )}
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Background Audio (MP3)</label>
                             <div className="flex items-center gap-2">
                                <label className="flex-1 flex items-center gap-2 cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-1 text-sm transition-colors">
                                    <Music size={14} className="text-gray-400" />
                                    <span className="truncate text-gray-300">
                                        {activeScene.audio || "Select Audio..."}
                                    </span>
                                    <input 
                                        type="file" 
                                        accept="audio/*" 
                                        onChange={(e) => handleAudioSelect(e, activeScene.id)} 
                                        className="hidden"
                                    />
                                </label>
                                {activeScene.audio && (
                                    <button 
                                        onClick={() => handleUpdateScene(activeScene.id, { audio: undefined })}
                                        className="p-1.5 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded"
                                        title="Remove Audio"
                                    >
                                        <Trash size={14} />
                                    </button>
                                )}
                             </div>
                        </div>

                        {/* Scene Metadata Editor */}
                        <div className="mt-4 pt-4 border-t border-gray-800">
                            <label className="block text-xs text-gray-400 mb-2">Scene Info Box (Top Left)</label>
                            <div className="space-y-2 mb-2">
                                {activeScene.metadata?.map((meta, idx) => {
                                    const MetaIcon = meta.icon ? (LucideIcons as any)[meta.icon] : null;
                                    return (
                                        <div key={idx} className="flex items-center gap-2 bg-gray-900 p-1.5 rounded border border-gray-700">
                                            {MetaIcon && <MetaIcon size={14} className="text-gray-400 flex-shrink-0" />}
                                            <span className="text-xs font-bold" style={{ color: meta.color || '#e2e8f0' }}>{meta.label}:</span>
                                            <span className="text-xs text-gray-400 truncate flex-1">{meta.value}</span>
                                            <button 
                                                onClick={() => {
                                                    const newMeta = [...(activeScene.metadata || [])];
                                                    newMeta.splice(idx, 1);
                                                    handleUpdateScene(activeScene.id, { metadata: newMeta });
                                                }}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                <Trash size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-1">
                                    <input 
                                        id="new-meta-label"
                                        placeholder="Label" 
                                        className="w-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                                    />
                                    <input 
                                        id="new-meta-value"
                                        placeholder="Value" 
                                        className="w-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                                    />
                                </div>
                                <div className="flex gap-1 items-center">
                                    <div className="relative flex-1">
                                        <button
                                            type="button"
                                            id="meta-icon-picker-btn"
                                            onClick={() => {
                                                const picker = document.getElementById('meta-icon-picker');
                                                if (picker) picker.classList.toggle('hidden');
                                            }}
                                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex items-center justify-between gap-2 hover:bg-gray-700"
                                        >
                                            <span className="flex items-center gap-2" id="meta-icon-selected-display">
                                                <X size={14} className="text-gray-500" />
                                                <span className="text-gray-400">No Icon</span>
                                            </span>
                                            <ChevronDown size={12} className="text-gray-500" />
                                        </button>
                                        <input type="hidden" id="new-meta-icon" value="" />
                                        <div 
                                            id="meta-icon-picker" 
                                            className="hidden absolute z-50 bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2"
                                        >
                                            <div 
                                                className="flex items-center gap-2 p-1.5 hover:bg-gray-700 rounded cursor-pointer mb-1 border-b border-gray-700 pb-2"
                                                onClick={() => {
                                                    (document.getElementById('new-meta-icon') as HTMLInputElement).value = '';
                                                    const display = document.getElementById('meta-icon-selected-display');
                                                    if (display) display.innerHTML = '<span class="text-gray-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span><span class="text-gray-400">No Icon</span>';
                                                    document.getElementById('meta-icon-picker')?.classList.add('hidden');
                                                }}
                                            >
                                                <X size={16} className="text-gray-500" />
                                                <span className="text-xs text-gray-400">No Icon</span>
                                            </div>
                                            <div className="grid grid-cols-6 gap-1">
                                                {METADATA_ICONS.map(iconName => {
                                                    const IconComp = (LucideIcons as any)[iconName];
                                                    return IconComp ? (
                                                        <button
                                                            key={iconName}
                                                            type="button"
                                                            onClick={() => {
                                                                (document.getElementById('new-meta-icon') as HTMLInputElement).value = iconName;
                                                                const display = document.getElementById('meta-icon-selected-display');
                                                                if (display) {
                                                                    display.innerHTML = `<span class="text-blue-400" id="meta-icon-preview"></span><span class="text-gray-300">${iconName}</span>`;
                                                                    const preview = document.getElementById('meta-icon-preview');
                                                                    if (preview && IconComp) {
                                                                        preview.innerHTML = renderToStaticMarkup(<IconComp size={14} />);
                                                                    }
                                                                }
                                                                document.getElementById('meta-icon-picker')?.classList.add('hidden');
                                                            }}
                                                            className="p-1.5 hover:bg-gray-700 rounded flex items-center justify-center text-gray-400 hover:text-blue-400 transition-colors"
                                                            title={iconName}
                                                        >
                                                            <IconComp size={16} />
                                                        </button>
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <input 
                                        type="color"
                                        id="new-meta-color"
                                        defaultValue="#e2e8f0"
                                        className="w-8 h-8 bg-transparent border border-gray-700 rounded p-0 cursor-pointer"
                                        title="Select Color"
                                    />
                                    <button 
                                        onClick={() => {
                                            const l = (document.getElementById('new-meta-label') as HTMLInputElement);
                                            const v = (document.getElementById('new-meta-value') as HTMLInputElement);
                                            const i = (document.getElementById('new-meta-icon') as HTMLInputElement);
                                            const c = (document.getElementById('new-meta-color') as HTMLInputElement);
                                            
                                            if (l.value && v.value) {
                                                const newMeta = [...(activeScene.metadata || []), { 
                                                    label: l.value, 
                                                    value: v.value,
                                                    icon: i.value || undefined,
                                                    color: c.value
                                                }];
                                                handleUpdateScene(activeScene.id, { metadata: newMeta });
                                                l.value = '';
                                                v.value = '';
                                                i.value = '';
                                                c.value = '#e2e8f0';
                                                // Reset icon picker display
                                                const display = document.getElementById('meta-icon-selected-display');
                                                if (display) display.innerHTML = '<span class="text-gray-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span><span class="text-gray-400">No Icon</span>';
                                            }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-white flex items-center justify-center"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Info size={18} /> Hotspots
                </h3>
                
                <div className="mb-4">
                    {!isPicking && !tempHotspot && (
                        <button 
                            onClick={() => setIsPicking(true)}
                            className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center gap-2 border border-dashed border-gray-500"
                        >
                            <Crosshair size={16} /> Pick Location
                        </button>
                    )}
                    {isPicking && (
                        <div className="w-full py-2 bg-yellow-600/20 text-yellow-400 text-center rounded border border-yellow-600 animate-pulse">
                            Click on the viewer...
                        </div>
                    )}
                    {tempHotspot && (
                        <div className="flex gap-2">
                            <button onClick={() => addHotspot('info')} className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded text-sm">Add Info</button>
                            <button onClick={() => addHotspot('scene')} className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded text-sm">Add Link</button>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {activeScene.hotspots.map(hs => (
                        <div key={hs.id} className="bg-gray-800 p-3 rounded border border-gray-700">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${hs.type === 'scene' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                                    {hs.type}
                                </span>
                                <button onClick={() => deleteHotspot(hs.id)} className="text-red-400 hover:text-red-300">
                                    <Trash size={14} />
                                </button>
                            </div>
                            <input 
                                type="text" 
                                value={hs.text}
                                onChange={(e) => {
                                    const updatedScenes = config.scenes.map(s => {
                                        if (s.id === activeSceneId) {
                                            return { 
                                                ...s, 
                                                hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, text: e.target.value } : h) 
                                            };
                                        }
                                        return s;
                                    });
                                    setConfig({ ...config, scenes: updatedScenes });
                                }}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2"
                                placeholder="Label"
                            />
                            {hs.type === 'info' && (
                                <>
                                    <textarea
                                        value={hs.description || ''}
                                        onChange={(e) => {
                                            const updatedScenes = config.scenes.map(s => {
                                                if (s.id === activeSceneId) {
                                                    return { 
                                                        ...s, 
                                                        hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, description: e.target.value } : h) 
                                                    };
                                                }
                                                return s;
                                            });
                                            setConfig({ ...config, scenes: updatedScenes });
                                        }}
                                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2 min-h-[60px]"
                                        placeholder="Description..."
                                    />
                                    <select 
                                        value={hs.image || ''}
                                        onChange={(e) => {
                                            const updatedScenes = config.scenes.map(s => {
                                                if (s.id === activeSceneId) {
                                                    return { 
                                                        ...s, 
                                                        hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, image: e.target.value } : h) 
                                                    };
                                                }
                                                return s;
                                            });
                                            setConfig({ ...config, scenes: updatedScenes });
                                        }}
                                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2"
                                    >
                                        <option value="">Select Popup Image (Optional)...</option>
                                        {allAvailableImages.map(img => (
                                            <option key={img} value={img}>{img}</option>
                                        ))}
                                    </select>
                                </>
                            )}
                            {hs.type === 'scene' && (
                                <div className="space-y-2">
                                <select
                                    value={hs.targetSceneId || ''}
                                    onChange={(e) => {
                                        const updatedScenes = config.scenes.map(s => {
                                            if (s.id === activeSceneId) {
                                                return { 
                                                    ...s, 
                                                    hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, targetSceneId: e.target.value } : h) 
                                                };
                                            }
                                            return s;
                                        });
                                        setConfig({ ...config, scenes: updatedScenes });
                                    }}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
                                >
                                    <option value="">Select Target Scene</option>
                                    {config.scenes.map(s => (
                                        <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                </select>
                                
                                {hs.targetSceneId && (
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => startSettingTargetView(hs.id, hs.targetSceneId!)}
                                            className="flex-1 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-xs flex items-center justify-center gap-2 transition-colors"
                                            title="Go to target scene and set initial view"
                                        >
                                            <Eye size={12} /> Set Target View
                                        </button>
                                        {(hs.targetPitch !== undefined || hs.targetYaw !== undefined) && (
                                            <button 
                                                onClick={() => {
                                                     const updatedScenes = config.scenes.map(s => {
                                                        if (s.id === activeSceneId) {
                                                            return { 
                                                                ...s, 
                                                                hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, targetPitch: undefined, targetYaw: undefined, targetHfov: undefined } : h) 
                                                            };
                                                        }
                                                        return s;
                                                    });
                                                    setConfig({ ...config, scenes: updatedScenes });
                                                }}
                                                className="px-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded"
                                                title="Clear Target View"
                                            >
                                                <Trash size={12} />
                                            </button>
                                        )}
                                    </div>
                                )}
                                </div>
                            )}

                            {/* Hotspot Style Settings */}
                            <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">Icon</label>
                                    <div className="relative">
                                        <button
                                            onClick={() => setActiveIconPicker(activeIconPicker === hs.id ? null : hs.id)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs flex items-center justify-between hover:bg-gray-800 transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                {hs.icon && (LucideIcons as any)[hs.icon] ? (
                                                    (() => {
                                                        const Icon = (LucideIcons as any)[hs.icon];
                                                        return <><Icon size={14} className="text-blue-400" /> <span className="truncate max-w-[80px]">{hs.icon}</span></>;
                                                    })()
                                                ) : <span className="text-gray-500">Default</span>}
                                            </span>
                                            <ChevronDown size={12} className="text-gray-500" />
                                        </button>
                                        
                                        {activeIconPicker === hs.id && (
                                            <div className="absolute top-full left-0 z-50 w-64 max-h-64 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-2 grid grid-cols-6 gap-1 mt-1 custom-scrollbar">
                                                <button
                                                    onClick={() => {
                                                        const updatedScenes = config.scenes.map(s => {
                                                            if (s.id === activeSceneId) {
                                                                return { 
                                                                    ...s, 
                                                                    hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, icon: undefined } : h) 
                                                                };
                                                            }
                                                            return s;
                                                        });
                                                        setConfig({ ...config, scenes: updatedScenes });
                                                        setActiveIconPicker(null);
                                                    }}
                                                    className="col-span-6 text-xs text-center py-1.5 hover:bg-gray-700 rounded mb-1 text-gray-400 border border-dashed border-gray-600"
                                                >
                                                    Default Icon
                                                </button>
                                                {COMMON_ICONS.map(iconName => {
                                                    const Icon = (LucideIcons as any)[iconName];
                                                    if (!Icon) return null;
                                                    return (
                                                        <button
                                                            key={iconName}
                                                            onClick={() => {
                                                                const updatedScenes = config.scenes.map(s => {
                                                                    if (s.id === activeSceneId) {
                                                                        return { 
                                                                            ...s, 
                                                                            hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, icon: iconName } : h) 
                                                                        };
                                                                    }
                                                                    return s;
                                                                });
                                                                setConfig({ ...config, scenes: updatedScenes });
                                                                setActiveIconPicker(null);
                                                            }}
                                                            className={`p-2 rounded hover:bg-blue-600 flex justify-center items-center transition-colors ${hs.icon === iconName ? 'bg-blue-600 ring-1 ring-white' : 'bg-gray-700'}`}
                                                            title={iconName}
                                                        >
                                                            <Icon size={16} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 mb-1">Color</label>
                                    <label className="flex gap-1 h-[26px] cursor-pointer group">
                                        <div className="relative w-8 h-full rounded overflow-hidden border border-gray-700">
                                            <input 
                                                type="color" 
                                                value={hs.color || (hs.type === 'scene' ? '#ffffff' : '#3b82f6')}
                                                onChange={(e) => {
                                                    const updatedScenes = config.scenes.map(s => {
                                                        if (s.id === activeSceneId) {
                                                            return { 
                                                                ...s, 
                                                                hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, color: e.target.value } : h) 
                                                            };
                                                        }
                                                        return s;
                                                    });
                                                    setConfig({ ...config, scenes: updatedScenes });
                                                }}
                                                className="absolute -top-2 -left-2 w-16 h-16 p-0 border-none cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs flex items-center min-w-0 group-hover:border-gray-500 transition-colors">
                                            <span className="truncate text-gray-300">
                                                {hs.color || (hs.type === 'scene' ? '#ffffff' : '#3b82f6')}
                                            </span>
                                        </div>
                                    </label>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] text-gray-400 mb-1">Size: {hs.size || 1}x</label>
                                    <input 
                                        type="range" 
                                        min="0.5" 
                                        max="3" 
                                        step="0.1"
                                        value={hs.size || 1}
                                        onChange={(e) => {
                                            const updatedScenes = config.scenes.map(s => {
                                                if (s.id === activeSceneId) {
                                                    return { 
                                                        ...s, 
                                                        hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, size: parseFloat(e.target.value) } : h) 
                                                    };
                                                }
                                                return s;
                                            });
                                            setConfig({ ...config, scenes: updatedScenes });
                                        }}
                                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] text-gray-400 mb-1">Opacity: {Math.round((hs.opacity ?? 0.8) * 100)}%</label>
                                    <input 
                                        type="range" 
                                        min="0.1" 
                                        max="1" 
                                        step="0.05"
                                        value={hs.opacity ?? 0.8}
                                        onChange={(e) => {
                                            const updatedScenes = config.scenes.map(s => {
                                                if (s.id === activeSceneId) {
                                                    return { 
                                                        ...s, 
                                                        hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, opacity: parseFloat(e.target.value) } : h) 
                                                    };
                                                }
                                                return s;
                                            });
                                            setConfig({ ...config, scenes: updatedScenes });
                                        }}
                                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] text-gray-400 mb-1">Rotation: {hs.rotation ?? 0}°</label>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="360" 
                                        step="5"
                                        value={hs.rotation ?? 0}
                                        onChange={(e) => {
                                            const updatedScenes = config.scenes.map(s => {
                                                if (s.id === activeSceneId) {
                                                    return { 
                                                        ...s, 
                                                        hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, rotation: parseInt(e.target.value) } : h) 
                                                    };
                                                }
                                                return s;
                                            });
                                            setConfig({ ...config, scenes: updatedScenes });
                                        }}
                                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="col-span-2 pt-2 border-t border-gray-700">
                                    <label className="block text-[10px] text-gray-400 mb-2">Glassmorphic Presets</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {GLASS_PRESETS.map((preset) => (
                                            <button
                                                key={preset.name}
                                                onClick={() => {
                                                    const updatedScenes = config.scenes.map(s => {
                                                        if (s.id === activeSceneId) {
                                                            return { 
                                                                ...s, 
                                                                hotspots: s.hotspots.map(h => h.id === hs.id ? { ...h, color: preset.color, opacity: preset.opacity } : h) 
                                                            };
                                                        }
                                                        return s;
                                                    });
                                                    setConfig({ ...config, scenes: updatedScenes });
                                                }}
                                                className="w-full aspect-square rounded-full border border-white/20 shadow-sm hover:scale-110 transition-transform"
                                                style={{ backgroundColor: `${preset.color}${Math.round(preset.opacity * 255).toString(16).padStart(2, '0')}` }}
                                                title={`${preset.name} (${Math.round(preset.opacity * 100)}%)`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Minimap Editor */}
        {config.floorplanImage && activeScene && (
            <div className="border-t border-gray-800 pt-4">
                <h3 className="text-lg font-semibold mb-2">Minimap Position</h3>
                <p className="text-xs text-gray-400 mb-2">Click on the map to set current scene position.</p>
                <div className="relative w-full aspect-square bg-gray-800 rounded overflow-hidden border border-gray-700">
                    <img 
                        src={resolveEditorImageUrl(config.floorplanImage)} 
                        alt="Floorplan" 
                        className="w-full h-full object-contain"
                        onClick={handleFloorplanClick}
                    />
                    {/* All Scenes Dots */}
                    {config.scenes.map(s => s.floorplanPosition && (
                        <div 
                            key={s.id}
                            className={`absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border border-white shadow-sm transition-transform ${s.id === activeSceneId ? 'bg-blue-500 scale-125 z-10' : 'bg-red-400'}`}
                            style={{ 
                                left: `${s.floorplanPosition.x}%`, 
                                top: `${s.floorplanPosition.y}%`,
                                transform: `translate(-50%, -50%) rotate(${s.floorplanPosition.rotation || 0}deg)`
                            }}
                        >
                            {/* Direction indicator for active scene */}
                            {s.id === activeSceneId && (
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
                                            fill={config.minimapSettings?.coneColor || "rgba(59, 130, 246, 0.8)"} 
                                            fillOpacity={config.minimapSettings?.coneOpacity || 0.5}
                                            stroke={config.minimapSettings?.coneBorder ? (config.minimapSettings?.coneBorderColor || "white") : "none"}
                                            strokeWidth={config.minimapSettings?.coneBorder ? 2 : 0}
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                {/* Rotation Slider */}
                {activeScene.floorplanPosition && (
                    <div className="mt-4">
                        <label className="block text-xs text-gray-400 mb-2">
                            Bakış Açısı (Rotation): {Math.round(activeScene.floorplanPosition.rotation || 0)}°
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            value={activeScene.floorplanPosition.rotation || 0}
                            onChange={(e) => {
                                const rotation = parseInt(e.target.value);
                                handleUpdateScene(activeSceneId, {
                                    floorplanPosition: {
                                        ...activeScene.floorplanPosition!,
                                        rotation
                                    }
                                });
                            }}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0°</span>
                            <span>180°</span>
                            <span>360°</span>
                        </div>
                    </div>
                )}

                {/* Minimap Settings */}
                <div className="mt-4 border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-semibold mb-2">Minimap Appearance</h4>
                    <div className="space-y-2">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Cone Color</label>
                            <input 
                                type="color" 
                                value={config.minimapSettings?.coneColor || "#3b82f6"}
                                onChange={(e) => setConfig({
                                    ...config,
                                    minimapSettings: { ...config.minimapSettings, coneColor: e.target.value }
                                })}
                                className="w-full h-6 rounded cursor-pointer bg-gray-800 border border-gray-700"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Opacity ({config.minimapSettings?.coneOpacity || 0.5})</label>
                            <input 
                                type="range" 
                                min="0.1" 
                                max="1" 
                                step="0.1"
                                value={config.minimapSettings?.coneOpacity || 0.5}
                                onChange={(e) => setConfig({
                                    ...config,
                                    minimapSettings: { ...config.minimapSettings, coneOpacity: parseFloat(e.target.value) }
                                })}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="coneBorder"
                                checked={config.minimapSettings?.coneBorder || false}
                                onChange={(e) => setConfig({
                                    ...config,
                                    minimapSettings: { ...config.minimapSettings, coneBorder: e.target.checked }
                                })}
                                className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="coneBorder" className="text-xs text-gray-300">Show Border</label>
                        </div>
                        {config.minimapSettings?.coneBorder && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Border Color</label>
                                <input 
                                    type="color" 
                                    value={config.minimapSettings?.coneBorderColor || "#ffffff"}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        minimapSettings: { ...config.minimapSettings, coneBorderColor: e.target.value }
                                    })}
                                    className="w-full h-6 rounded cursor-pointer bg-gray-800 border border-gray-700"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <div className="mt-auto pt-4 border-t border-gray-800 space-y-3">
            {isLocalMode ? (
              <>
                <button 
                    onClick={async () => {
                      const files = Array.from(localFiles.values());
                      await handleExportZIP(config, files);
                    }}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/20"
                >
                    <Download size={20} /> Export Project ZIP
                </button>
                <button 
                    onClick={() => setShowSaveModal(true)}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                >
                    <Upload size={20} /> Sunucuya Kaydet
                </button>
                <p className="text-xs text-gray-500 text-center">
                    ZIP: Config + dosyalar indir<br/>
                    Sunucuya: Dosyalari + config'i aktif storage'a yukle
                </p>
              </>
            ) : (
              <>
                <button 
                    onClick={handleDownload}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                >
                    <Download size={20} /> Download Config
                </button>
                <button 
                    onClick={() => setShowSaveModal(true)}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                >
                    <Save size={20} /> Sunucuya Kaydet
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    Download: config.json indir<br/>
                    Sunucuya Kaydet: Şifre ile direkt kaydet
                </p>
              </>
            )}
        </div>
      </div>
      )}

      {/* Save to Server Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-purple-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Lock size={20} />
                <span className="font-semibold">Sunucuya Kaydet</span>
              </div>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveStatus('idle');
                  setSaveMessage('');
                }}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-400">
                {isLocalMode ? (
                  <>
                    <span className="text-purple-400 font-medium">{localFiles.size} dosya</span> + config sunucuya yüklenecek.<br/>
                    Düzenleme şifresini girin.
                  </>
                ) : (
                                    'Config\'i aktif storage\'a kaydetmek için düzenleme şifresini girin.'
                )}
              </p>
              
              <div>
                <label className="block text-sm text-gray-300 mb-2">Düzenleme Şifresi</label>
                <input
                  type="password"
                  value={editSecret}
                  onChange={(e) => setEditSecret(e.target.value)}
                  placeholder="EDIT_SECRET"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveToServer()}
                />
              </div>

              {(saveMessage || saveStatus === 'saving') && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  saveStatus === 'success' ? 'bg-green-900/30 text-green-400' :
                  saveStatus === 'error' ? 'bg-red-900/30 text-red-400' :
                  saveStatus === 'saving' ? 'bg-purple-900/30 text-purple-400' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {saveStatus === 'success' && <CheckCircle size={18} />}
                  {saveStatus === 'error' && <AlertCircle size={18} />}
                  {saveStatus === 'saving' && <Loader2 size={18} className="animate-spin" />}
                  {saveMessage || 'Hazırlanıyor...'}
                </div>
              )}

              <button
                onClick={handleSaveToServer}
                disabled={saveStatus === 'saving'}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${
                  saveStatus === 'saving' 
                    ? 'bg-gray-600 cursor-wait' 
                    : 'bg-purple-600 hover:bg-purple-500'
                } text-white`}
              >
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Kaydet
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                💡 Şifre .env dosyasındaki EDIT_SECRET değişkenidir
              </p>
                            <p className="text-xs text-gray-500 text-center">
                                Aktif storage: PROJECTS_STORAGE_PATH varsa local klasor, yoksa Blob.
                            </p>
            </div>
          </div>
        </div>
      )}

      {/* Viewer Area */}
      <div className="flex-1 relative bg-black">
        <div ref={viewerContainerRef} className={`w-full h-full ${isPicking ? 'cursor-crosshair' : ''}`} />
        {!activeSceneId && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Select a scene to start editing
            </div>
        )}
        
        {/* VR Settings Panel */}
        {activeSceneId && (
          <VRSettingsPanel
            config={config}
            vrConfig={vrConfig}
            activeSceneId={activeSceneId}
            selectedHotspotId={selectedHotspotId}
            projectCode={projectCode}
                        resolveImageUrl={resolveEditorImageUrl}
            onVRConfigChange={handleVRConfigChange}
          />
        )}
      </div>
    </div>
  );
}
