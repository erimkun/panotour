/**
 * Texture Cache System
 * Single Responsibility: Caching and loading panorama textures
 * Prevents redundant loading and improves scene transition performance
 */

import * as THREE from 'three';

interface CacheEntry {
  texture: THREE.Texture;
  lastAccessed: number;
  size: number; // Estimated size in bytes
}

class TextureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private loading: Map<string, Promise<THREE.Texture>> = new Map();
  private loader: THREE.TextureLoader;
  private maxCacheSize: number;
  private currentSize: number = 0;

  constructor(maxCacheSizeMB: number = 100) {
    this.loader = new THREE.TextureLoader();
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Load a texture from URL, using cache if available
   * @param url - Texture URL
   * @param onProgress - Optional progress callback
   * @returns Promise resolving to the loaded texture
   */
  async load(
    url: string,
    onProgress?: (progress: number) => void
  ): Promise<THREE.Texture> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.texture;
    }

    // Check if already loading
    const loadingPromise = this.loading.get(url);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start new load
    const promise = this.loadTexture(url, onProgress);
    this.loading.set(url, promise);

    try {
      const texture = await promise;
      this.addToCache(url, texture);
      return texture;
    } finally {
      this.loading.delete(url);
    }
  }

  /**
   * Preload textures for upcoming scenes
   * @param urls - Array of texture URLs to preload
   */
  async preload(urls: string[]): Promise<void> {
    const promises = urls.map(url => this.load(url).catch(() => null));
    await Promise.all(promises);
  }

  /**
   * Check if a texture is cached
   * @param url - Texture URL
   * @returns True if cached
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Get a cached texture without loading
   * @param url - Texture URL
   * @returns Texture or undefined
   */
  get(url: string): THREE.Texture | undefined {
    const entry = this.cache.get(url);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.texture;
    }
    return undefined;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.forEach(entry => {
      entry.texture.dispose();
    });
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Remove a specific texture from cache
   * @param url - Texture URL
   */
  remove(url: string): void {
    const entry = this.cache.get(url);
    if (entry) {
      entry.texture.dispose();
      this.currentSize -= entry.size;
      this.cache.delete(url);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; sizeMB: number; maxSizeMB: number } {
    return {
      entries: this.cache.size,
      sizeMB: this.currentSize / (1024 * 1024),
      maxSizeMB: this.maxCacheSize / (1024 * 1024),
    };
  }

  private loadTexture(
    url: string,
    onProgress?: (progress: number) => void
  ): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        texture => {
          // Configure texture for equirectangular panorama
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          resolve(texture);
        },
        xhr => {
          if (onProgress && xhr.lengthComputable) {
            onProgress((xhr.loaded / xhr.total) * 100);
          }
        },
        error => {
          console.error(`Failed to load texture: ${url}`, error);
          reject(new Error(`Failed to load texture: ${url}`));
        }
      );
    });
  }

  private addToCache(url: string, texture: THREE.Texture): void {
    // Estimate texture size (width * height * 4 bytes per pixel)
    const image = texture.image as HTMLImageElement | undefined;
    const size = image?.width && image?.height ? image.width * image.height * 4 : 0;

    // Evict old entries if needed
    this.evictIfNeeded(size);

    this.cache.set(url, {
      texture,
      lastAccessed: Date.now(),
      size,
    });
    this.currentSize += size;
  }

  private evictIfNeeded(newSize: number): void {
    while (this.currentSize + newSize > this.maxCacheSize && this.cache.size > 0) {
      // Find least recently used entry
      let oldestUrl: string | null = null;
      let oldestTime = Infinity;

      this.cache.forEach((entry, url) => {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestUrl = url;
        }
      });

      if (oldestUrl) {
        this.remove(oldestUrl);
      } else {
        break;
      }
    }
  }
}

// Singleton instance
let textureCache: TextureCache | null = null;

/**
 * Get the global texture cache instance
 * @param maxCacheSizeMB - Maximum cache size in megabytes
 * @returns TextureCache instance
 */
export function getTextureCache(maxCacheSizeMB: number = 100): TextureCache {
  if (!textureCache) {
    textureCache = new TextureCache(maxCacheSizeMB);
  }
  return textureCache;
}

/**
 * Clear the global texture cache
 */
export function clearTextureCache(): void {
  if (textureCache) {
    textureCache.clear();
  }
}

export default TextureCache;
