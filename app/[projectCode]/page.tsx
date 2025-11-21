import { notFound } from 'next/navigation';
import TourViewer from '@/components/TourViewer';
import { TourConfig } from '@/types/tour';
import fs from 'fs';
import path from 'path';
import { list } from '@vercel/blob';

interface PageProps {
  params: Promise<{
    projectCode: string;
  }>;
}

async function getProjectConfig(projectCode: string): Promise<TourConfig | null> {
  try {
    console.log(`[PAGE] Loading config for ${projectCode}`);
    
    // 1. Try to read from local public/projects first
    const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');
    
    if (fs.existsSync(configPath)) {
      console.log(`[PAGE] Found local config for ${projectCode}`);
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(fileContents);
      return { ...config, source: 'local' };
    }

    console.log(`[PAGE] Not found locally, checking Blob...`);
    
    // 2. If not found locally, try Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({
        prefix: `projects/${projectCode}/`,
      });

      const configBlob = blobs.find(b => b.pathname.endsWith('config.json'));
      
      if (configBlob) {
        console.log(`[PAGE] Found config.json in Blob for ${projectCode}`);
        const response = await fetch(configBlob.url);
        const config = await response.json();
        
        // Convert all relative paths to absolute Blob URLs
        const blobMap = new Map(blobs.map(b => {
          const filename = b.pathname.split('/').slice(2).join('/');
          return [filename, b.url];
        }));

        // Update image and audio paths in config
        if (config.scenes) {
          config.scenes = config.scenes.map((scene: any) => ({
            ...scene,
            image: blobMap.get(`images/${scene.image}`) || scene.image,
            audio: scene.audio ? (blobMap.get(`audio/${scene.audio}`) || scene.audio) : scene.audio,
            hotspots: scene.hotspots?.map((hs: any) => ({
              ...hs,
              image: hs.image ? (blobMap.get(`images/${hs.image}`) || hs.image) : hs.image,
            })) || [],
          }));
        }

        if (config.floorplanImage) {
          config.floorplanImage = blobMap.get(`images/${config.floorplanImage}`) || config.floorplanImage;
        }

        console.log(`[PAGE] Config loaded successfully for ${projectCode}`);
        return { ...config, source: 'blob' };
      }
    }

    console.log(`[PAGE] Config not found for ${projectCode}`);
    return null;
  } catch (error) {
    console.error(`[PAGE] Error loading config for ${projectCode}:`, error);
    return null;
  }
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectCode } = await params;
  const config = await getProjectConfig(projectCode);

  if (!config) {
    return notFound();
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      <TourViewer config={config} projectCode={projectCode} />
    </div>
  );
}
