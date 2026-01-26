import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { list } from '@vercel/blob';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;
  
  try {
    console.log(`[CONFIG] Request for project: ${projectCode}`);

    // 1. Try to read from local public/projects first
    const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');
    console.log(`[CONFIG] Checking local path: ${configPath}`);
    
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] Found local config for ${projectCode}`);
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(fileContents);
      return NextResponse.json({ ...config, source: 'local' });
    }

    console.log(`[CONFIG] Not found locally, checking Blob...`);
    // 2. If not found locally, try Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log(`[CONFIG] BLOB_READ_WRITE_TOKEN exists, listing blobs with prefix: projects/${projectCode}/`);
      const { blobs } = await list({
        prefix: `projects/${projectCode}/`,
      });

      console.log(`[CONFIG] Found ${blobs.length} blobs for ${projectCode}`);
      console.log(`[CONFIG] Blob pathnames:`, blobs.map(b => b.pathname));

      const configBlob = blobs.find(b => b.pathname.endsWith('config.json'));
      
      if (configBlob) {
        console.log(`[CONFIG] Found config.json at: ${configBlob.url}`);
        const response = await fetch(configBlob.url);
        const config = await response.json();
        console.log(`[CONFIG] Config loaded successfully for ${projectCode}`);
        
        // Convert all relative paths to absolute Blob URLs
        const blobMap = new Map(blobs.map(b => {
          // Extract filename from pathname
          const filename = b.pathname.split('/').slice(2).join('/'); // Remove "projects/{projectCode}/"
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

        return NextResponse.json({ ...config, source: 'blob' });
      } else {
        console.log(`[CONFIG] config.json not found in blobs for ${projectCode}`);
      }
    } else {
      console.log(`[CONFIG] BLOB_READ_WRITE_TOKEN not set`);
    }

    console.log(`[CONFIG] Project not found: ${projectCode}`);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  } catch (error) {
    console.error(`[CONFIG] Error reading config for ${projectCode}:`, error);
    return NextResponse.json({ error: 'Failed to read config', details: String(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;
  
  try {
    const config = await request.json();
    console.log(`[CONFIG PUT] Saving config for project: ${projectCode}`);

    // Check if Vercel Blob is available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob');
      
      // Remove 'source' field before saving
      const { source, ...configToSave } = config;
      
      const blob = await put(`projects/${projectCode}/config.json`, JSON.stringify(configToSave, null, 2), {
        access: 'public',
        addRandomSuffix: false,
      });
      
      console.log(`[CONFIG PUT] Config saved to blob: ${blob.url}`);
      return NextResponse.json({ success: true, url: blob.url });
    } else {
      // Try local file system (development only)
      const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');
      const dir = path.dirname(configPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Remove 'source' field before saving
      const { source, ...configToSave } = config;
      fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
      
      console.log(`[CONFIG PUT] Config saved locally: ${configPath}`);
      return NextResponse.json({ success: true, path: configPath });
    }
  } catch (error) {
    console.error(`[CONFIG PUT] Error saving config for ${projectCode}:`, error);
    return NextResponse.json({ error: 'Failed to save config', details: String(error) }, { status: 500 });
  }
}

