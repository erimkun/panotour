'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';

interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  source: 'local' | 'blob';
}

// WebGL Animated Background Component
function WebGLBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: false, 
      alpha: true, 
      powerPreference: 'high-performance',
      stencil: false,
      depth: false
    });
    
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Shader Code
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uIntensity;
      uniform float uGlowAmount;
      uniform float uPillarWidth;
      uniform float uPillarHeight;
      
      varying vec2 vUv;

      mat2 rot(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, -s, s, c);
      }
      
      void main() {
        vec2 fragCoord = vUv * uResolution;
        vec2 uv = (fragCoord * 2.0 - uResolution) / uResolution.y;
        
        vec3 origin = vec3(0.0, 0.0, -10.0);
        vec3 direction = normalize(vec3(uv, 1.0));
        
        mat2 rotX = rot(uMouse.x * 0.5);

        vec3 color = vec3(0.0);
        float depth = 0.1;

        for(float i = 0.0; i < 64.0; i++) {
          vec3 pos = origin + direction * depth;
          pos.xz *= rotX;

          vec3 deformed = pos;
          deformed.y *= uPillarHeight;
          
          float wave = cos(deformed.y * 2.0 + uTime) * 0.2;
          deformed.x += wave;
          
          float d = length(cos(deformed.xz)) - 0.2;
          
          float bound = length(pos.xz) - uPillarWidth;
          d = max(d, -bound); 
          
          float glow = 0.02 / (abs(d) + 0.01);
          
          float yGradient = smoothstep(2.0, -2.0, pos.y);
          vec3 col = mix(uBottomColor, uTopColor, yGradient);
          
          color += col * glow * uGlowAmount;
          
          depth += max(abs(d) * 0.5, 0.02);
          if(depth > 20.0) break;
        }
        
        float vig = 1.0 - length(uv) * 0.3;
        color *= vig;
        
        gl_FragColor = vec4(color * uIntensity, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uTopColor: { value: new THREE.Color('#D0BB95') }, // Gold/Cream
        uBottomColor: { value: new THREE.Color('#3d3428') }, // Dark gold
        uIntensity: { value: 1.0 },
        uGlowAmount: { value: 0.05 },
        uPillarWidth: { value: 3.5 },
        uPillarHeight: { value: 0.6 }
      },
      transparent: true,
      depthWrite: false,
      depthTest: false
    });

    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    // Animation
    let time = 0;
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      time += 0.005;
      material.uniforms.uTime.value = time;
      renderer.render(scene, camera);
    };

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      material.uniforms.uResolution.value.set(w, h);
    };

    // Mouse handler
    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -(event.clientY / window.innerHeight) * 2 + 1;
      material.uniforms.uMouse.value.set(x, y);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: '#1d1a15' }}
    />
  );
}

// Feature Card Component
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  footer?: React.ReactNode;
}

function FeatureCard({ icon, title, description, footer }: FeatureCardProps) {
  return (
    <div 
      className="group relative overflow-hidden rounded-2xl border border-[#3d3428] bg-[#1d1a15]/60 backdrop-blur-xl p-6 transition-all hover:border-[#D0BB95]/50 hover:shadow-lg hover:shadow-[#D0BB95]/10"
      style={{ boxShadow: 'rgba(50, 50, 93, 0.15) 0px 30px 60px -12px inset, rgba(0, 0, 0, 0.2) 0px 18px 36px -18px inset' }}
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#D0BB95]/10 text-[#D0BB95] ring-1 ring-[#D0BB95]/20">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      {footer && (
        <div className="mt-4 pt-4 border-t border-[#3d3428]/50">
          {footer}
        </div>
      )}
    </div>
  );
}

// Project Card Component
function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/${project.id}`}
      className="group relative block h-48 rounded-2xl overflow-hidden border border-[#3d3428] bg-[#1d1a15]/60 backdrop-blur-xl transition-all hover:border-[#D0BB95]/50 hover:shadow-lg hover:shadow-[#D0BB95]/10 hover:scale-[1.02]"
    >
      {/* Image Background */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url(${project.thumbnail})` }}
      />
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
      
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-2 group-hover:translate-y-0 transition-transform">
        <div className="flex items-center gap-2 mb-1">
          {project.source === 'blob' && (
            <span className="text-[10px] bg-[#D0BB95]/20 text-[#D0BB95] px-2 py-0.5 rounded-full">Cloud</span>
          )}
        </div>
        <h3 className="text-lg font-semibold text-white">{project.name}</h3>
        <div className="flex items-center text-[#D0BB95] text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity delay-100">
          Tura Başla 
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function MainPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch projects from API
  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  // Filter projects by search
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
        if (!searchQuery) {
          setIsSearchOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  // Focus input when search opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Navigate to project
  const goToProject = useCallback((projectId: string) => {
    router.push(`/${projectId}`);
    setShowResults(false);
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#1d1a15] relative overflow-x-hidden">
      {/* WebGL Animated Background */}
      <WebGLBackground />

      {/* Main Content */}
      <main className="relative z-10 min-h-screen flex items-center justify-center p-4 md:p-8">
        <div className="max-w-5xl w-full">
          
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4">
              PanoTour VR
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Web tabanlı 360° sanal tur ve panoramik görüntüleme platformu
            </p>
          </div>

          {/* Search Bar */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <div ref={searchRef} className="relative">
              <div 
                className={`flex items-center bg-[#1d1a15]/80 backdrop-blur-xl border border-[#3d3428] rounded-xl overflow-hidden transition-all duration-300 ease-out ${
                  isSearchOpen 
                    ? 'w-80 border-[#D0BB95]/50' 
                    : 'w-12 cursor-pointer hover:border-[#D0BB95]/30 hover:bg-[#1d1a15]'
                }`}
                onClick={() => !isSearchOpen && setIsSearchOpen(true)}
              >
                <div className={`text-gray-500 transition-all duration-300 ${isSearchOpen ? 'pl-4' : 'p-3 hover:text-[#D0BB95]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Proje ara..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  className={`bg-transparent text-white placeholder-gray-500 focus:outline-none transition-all duration-300 ${
                    isSearchOpen ? 'w-full px-3 py-3 opacity-100' : 'w-0 p-0 opacity-0'
                  }`}
                />
                {isSearchOpen && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSearchOpen(false);
                      setSearchQuery('');
                      setShowResults(false);
                    }}
                    className="pr-3 text-gray-500 hover:text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showResults && searchQuery && isSearchOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1d1a15]/95 backdrop-blur-xl border border-[#3d3428] rounded-xl overflow-hidden shadow-2xl z-50">
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => goToProject(project.id)}
                        className="w-full px-4 py-3 text-left text-white hover:bg-[#D0BB95]/10 transition-colors flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span>{project.name}</span>
                        {project.source === 'blob' && (
                          <span className="text-[10px] bg-[#D0BB95]/20 text-[#D0BB95] px-2 py-0.5 rounded-full ml-auto">Cloud</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-gray-500 text-sm">
                      Sonuç bulunamadı
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Admin Button */}
            <Link
              href="/admin"
              className="bg-[#D0BB95] hover:bg-[#D0BB95]/80 text-[#1d1a15] p-3 rounded-xl transition-all hover:shadow-lg hover:shadow-[#D0BB95]/20"
              title="Yönetim Paneli"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>

          {/* Projects Section */}
          {projects.length > 0 && (
            <div className="mb-12">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Mevcut Turlar
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#D0BB95] border-r-transparent"></div>
              <p className="mt-4 text-gray-400">Projeler yükleniyor...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && projects.length === 0 && (
            <div className="text-center py-12 bg-[#1d1a15]/60 rounded-2xl border border-[#3d3428] backdrop-blur-xl mb-12">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-400 text-lg">Henüz proje bulunmuyor</p>
              <p className="text-gray-500 mt-2 text-sm">Yönetim panelinden yeni bir tur ekleyebilirsiniz</p>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 mt-4 bg-[#D0BB95] hover:bg-[#D0BB95]/80 text-[#1d1a15] px-6 py-2 rounded-xl transition-all font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Yeni Tur Ekle
              </Link>
            </div>
          )}

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Feature 1: 360° Navigation */}
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              title="360° Panoramik Görüntüleme"
              description="Mekanları tam 360 derece panoramik görüntülerle keşfedin. Mouse veya dokunmatik kontroller ile özgürce gezinin."
              footer={
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                    Mouse
                  </span>
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Mobil
                  </span>
                </div>
              }
            />

            {/* Feature 2: VR Support */}
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
              title="WebXR & VR Desteği"
              description="WebXR teknolojisi ile VR gözlüklerinde tam sürükleyici deneyim. Sanal gerçeklik cihazlarınızla turları deneyimleyin."
              footer={
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    WebXR
                  </span>
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Gaze Control
                  </span>
                </div>
              }
            />

            {/* Feature 3: Interactive Hotspots */}
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="İnteraktif Bilgi Noktaları"
              description="Mekan içindeki önemli noktalara tıklayarak detaylı bilgi, açıklama ve görsellere ulaşın. Hotspot'lar ile zengin içerik."
              footer={
                <div className="grid grid-cols-3 gap-2">
                  {['Bilgi', 'Sahne', 'Link'].map((type, i) => (
                    <div key={i} className="text-center">
                      <div className="h-1 w-full bg-[#D0BB95] rounded-full mb-1" style={{ opacity: 1 - i * 0.3 }} />
                      <span className="text-[10px] text-gray-500 font-semibold">{type}</span>
                    </div>
                  ))}
                </div>
              }
            />

            {/* Feature 4: Easy Upload */}
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              }
              title="Kolay Yükleme & Yönetim"
              description="ZIP dosyası ile panoramik görsellerinizi kolayca yükleyin. Görsel editör ile hotspot'ları ve sahneleri düzenleyin."
              footer={
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ZIP Upload
                  </span>
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#D0BB95]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cloud Storage
                  </span>
                </div>
              }
            />

          </div>

          {/* Footer */}
          <footer className="mt-16 text-center text-gray-500 text-sm">
            <p>© 2026 PanoTour VR - 360° Sanal Tur Platformu</p>
          </footer>

        </div>
      </main>
    </div>
  );
}
