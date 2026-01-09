'use client';

import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Move } from 'lucide-react';
import * as THREE from 'three';
import { Hotspot } from '@/types/tour';

interface VRPreviewPopupProps {
  hotspot: Hotspot;
  vrPitch?: number;
  vrYaw?: number;
  originalPitch: number;
  originalYaw: number;
  panoramaUrl: string;
  onClose: () => void;
  onPitchChange: (pitch: number) => void;
  onYawChange: (yaw: number) => void;
}

export default function VRPreviewPopup({
  hotspot,
  vrPitch,
  vrYaw,
  originalPitch,
  originalYaw,
  panoramaUrl,
  onClose,
  onPitchChange,
  onYawChange,
}: VRPreviewPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const hotspotMeshRef = useRef<THREE.Mesh | null>(null);
  const isDraggingRef = useRef(false);
  const previousMouseRef = useRef({ x: 0, y: 0 });
  
  const [currentPitch, setCurrentPitch] = useState(vrPitch ?? originalPitch);
  const [currentYaw, setCurrentYaw] = useState(vrYaw ?? originalYaw);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraRotation, setCameraRotation] = useState({ pitch: 0, yaw: currentYaw });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Load panorama texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(panoramaUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
    });

    // Create hotspot indicator
    const hotspotGeometry = new THREE.SphereGeometry(3, 16, 16);
    const hotspotMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.9,
    });
    const hotspotMesh = new THREE.Mesh(hotspotGeometry, hotspotMaterial);
    scene.add(hotspotMesh);
    hotspotMeshRef.current = hotspotMesh;

    // Add ring around hotspot
    const ringGeometry = new THREE.RingGeometry(4, 5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    hotspotMesh.add(ring);

    // Add pulsing animation ring
    const pulseGeometry = new THREE.RingGeometry(5, 7, 32);
    const pulseMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const pulseRing = new THREE.Mesh(pulseGeometry, pulseMaterial);
    hotspotMesh.add(pulseRing);

    // Animation loop
    let animationId: number;
    let time = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      time += 0.02;
      
      // Pulse animation
      const scale = 1 + Math.sin(time * 2) * 0.2;
      pulseRing.scale.set(scale, scale, 1);
      pulseMaterial.opacity = 0.5 - Math.sin(time * 2) * 0.3;
      
      // Make ring face camera
      ring.lookAt(camera.position);
      pulseRing.lookAt(camera.position);
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [panoramaUrl]);

  // Update hotspot position when pitch/yaw changes
  useEffect(() => {
    if (!hotspotMeshRef.current) return;

    const pitchRad = THREE.MathUtils.degToRad(currentPitch);
    const yawRad = THREE.MathUtils.degToRad(currentYaw);
    const radius = 50;

    const x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
    const y = radius * Math.sin(pitchRad);
    const z = -radius * Math.cos(pitchRad) * Math.cos(yawRad);

    hotspotMeshRef.current.position.set(x, y, z);
  }, [currentPitch, currentYaw]);

  // Update camera rotation
  useEffect(() => {
    if (!cameraRef.current) return;
    
    const camera = cameraRef.current;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = THREE.MathUtils.degToRad(-cameraRotation.yaw);
    camera.rotation.x = THREE.MathUtils.degToRad(cameraRotation.pitch);
  }, [cameraRotation]);

  // Mouse handlers for camera rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      isDraggingRef.current = true;
      setIsDragging(true);
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - previousMouseRef.current.x;
    const deltaY = e.clientY - previousMouseRef.current.y;

    setCameraRotation(prev => ({
      pitch: Math.max(-85, Math.min(85, prev.pitch + deltaY * 0.3)),
      yaw: prev.yaw + deltaX * 0.3,
    }));

    previousMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  // Center camera on hotspot
  const centerOnHotspot = () => {
    setCameraRotation({ pitch: -currentPitch, yaw: currentYaw });
  };

  // Reset to PC values
  const resetToOriginal = () => {
    setCurrentPitch(originalPitch);
    setCurrentYaw(originalYaw);
    onPitchChange(originalPitch);
    onYawChange(originalYaw);
  };

  // Apply changes
  const handlePitchChange = (value: number) => {
    setCurrentPitch(value);
    onPitchChange(value);
  };

  const handleYawChange = (value: number) => {
    setCurrentYaw(value);
    onYawChange(value);
  };

  const hasChanges = currentPitch !== originalPitch || currentYaw !== originalYaw;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="bg-purple-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Move size={20} />
            <span className="font-semibold">VR Önizleme: {hotspot.text}</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Preview */}
        <div 
          ref={containerRef}
          className={`w-full h-80 bg-black ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Controls */}
        <div className="p-4 space-y-4">
          {/* Instructions */}
          <p className="text-xs text-gray-400 text-center">
            🖱️ Sürükleyerek etrafı görebilirsiniz • Mavi nokta hotspot konumunu gösterir
          </p>

          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Pitch */}
            <div>
              <label className="flex items-center justify-between text-sm text-gray-300 mb-2">
                <span>Pitch (Dikey)</span>
                <span className="text-xs text-gray-500">PC: {originalPitch.toFixed(1)}°</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-90"
                  max="90"
                  step="0.5"
                  value={currentPitch}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <input
                  type="number"
                  value={currentPitch.toFixed(1)}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white text-center"
                />
              </div>
            </div>

            {/* Yaw */}
            <div>
              <label className="flex items-center justify-between text-sm text-gray-300 mb-2">
                <span>Yaw (Yatay)</span>
                <span className="text-xs text-gray-500">PC: {originalYaw.toFixed(1)}°</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="0.5"
                  value={currentYaw}
                  onChange={(e) => handleYawChange(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <input
                  type="number"
                  value={currentYaw.toFixed(1)}
                  onChange={(e) => handleYawChange(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white text-center"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <button
                onClick={centerOnHotspot}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                <Move size={16} />
                Hotspot'a Git
              </button>
              {hasChanges && (
                <button
                  onClick={resetToOriginal}
                  className="px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  PC Değerine Dön
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-xs text-yellow-400 mr-2">
                  ⚠️ VR için özelleştirildi
                </span>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
