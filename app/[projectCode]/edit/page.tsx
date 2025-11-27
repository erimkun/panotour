import fs from 'fs';
import path from 'path';
import TourEditor from '@/components/TourEditor';
import { TourConfig } from '@/types/tour';
import { list } from '@vercel/blob';

interface PageProps {
  params: Promise<{
    projectCode: string;
  }>;
}

async function getProjectConfig(projectCode: string): Promise<TourConfig | null> {
  try {
    // 1. Try local public/projects
    const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');
    if (fs.existsSync(configPath)) {
      const fileContents = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(fileContents);
    }

    // 2. Try Vercel Blob if available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({ prefix: `projects/${projectCode}/` });
      const configBlob = blobs.find(b => b.pathname.endsWith('config.json'));

      if (configBlob) {
        const response = await fetch(configBlob.url);
        const config = await response.json();

        // Convert relative asset paths to absolute blob URLs
        const blobMap = new Map(blobs.map(b => {
          const filename = b.pathname.split('/').slice(2).join('/');
          return [filename, b.url];
        }));

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

        return config;
      }
    }

    return null;
  } catch (error) {
    console.error(`[EDIT PAGE] Error loading config for ${projectCode}:`, error);
    return null;
  }
}

export default async function EditPage({ params }: PageProps) {
  const { projectCode } = await params;

  let config = await getProjectConfig(projectCode);

  // If no config found, initialize an empty one to trigger wizard
  if (!config) {
    config = {
      id: projectCode,
      name: "",
      initialSceneId: "",
      scenes: []
    } as TourConfig;
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white">
      <TourEditor initialConfig={config} projectCode={projectCode} />
    </div>
  );
}
