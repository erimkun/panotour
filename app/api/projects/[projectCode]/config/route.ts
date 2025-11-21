import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { list } from '@vercel/blob';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  try {
    const { projectCode } = await params;

    // 1. Try to read from local public/projects first
    const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');
    
    if (fs.existsSync(configPath)) {
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(fileContents);
      return NextResponse.json({ ...config, source: 'local' });
    }

    // 2. If not found locally, try Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({
        prefix: `projects/${projectCode}/`,
      });

      const configBlob = blobs.find(b => b.pathname.endsWith('config.json'));
      
      if (configBlob) {
        const response = await fetch(configBlob.url);
        const config = await response.json();
        
        // Convert all relative paths to absolute Blob URLs
        const blobMap = new Map(blobs.map(b => {
          // Extract filename from pathname
          const filename = b.pathname.split('/').slice(2).join('/'); // Remove "projects/{projectCode}/"
          return [filename, b.url];
        }));

        // Update image paths in config
        if (config.scenes) {
          config.scenes = config.scenes.map((scene: any) => ({
            ...scene,
            image: blobMap.get(`images/${scene.image}`) || scene.image,
            hotspots: scene.hotspots?.map((hs: any) => ({
              ...hs,
              image: hs.image ? (blobMap.get(`images/${hs.image}`) || hs.image) : hs.image,
            })) || [],
          }));
        }

        if (config.floorplanImage) {
          config.floorplanImage = blobMap.get(`images/${config.floorplanImage}`) || config.floorplanImage;
        }

        return NextResponse.json({ ...config, source: 'blob' });
      }
    }

    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

