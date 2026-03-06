'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function WebGLBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: false,
    });

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

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
        uTopColor: { value: new THREE.Color('#D0BB95') },
        uBottomColor: { value: new THREE.Color('#3d3428') },
        uIntensity: { value: 1.0 },
        uGlowAmount: { value: 0.05 },
        uPillarWidth: { value: 3.5 },
        uPillarHeight: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    let time = 0;
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      time += 0.005;
      material.uniforms.uTime.value = time;
      renderer.render(scene, camera);
    };

    const handleResize = () => {
      const currentWidth = container.clientWidth;
      const currentHeight = container.clientHeight;
      renderer.setSize(currentWidth, currentHeight);
      material.uniforms.uResolution.value.set(currentWidth, currentHeight);
    };

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
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
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