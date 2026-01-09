import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { list, put } from '@vercel/blob';
import { TourConfig } from '@/types/tour';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, getClientIP } from '@/utils/rateLimiter';

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

/**
 * POST - Save config with password protection
 * Requires EDIT_SECRET env variable to be set
 * Header: x-edit-secret must match EDIT_SECRET
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;

  // Get client IP for rate limiting
  const clientIP = getClientIP(request);
  console.log(`[CONFIG] POST request from IP: ${clientIP}`);

  try {
    // Check rate limit first
    const rateLimitCheck = await checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      console.log(`[CONFIG] IP ${clientIP} is banned until ${rateLimitCheck.bannedUntil}`);
      return NextResponse.json(
        { 
          error: rateLimitCheck.message,
          bannedUntil: rateLimitCheck.bannedUntil?.toISOString(),
          remainingAttempts: 0
        },
        { status: 429 }
      );
    }

    // Check if editing is enabled
    const editSecret = process.env.EDIT_SECRET;
    if (!editSecret) {
      return NextResponse.json(
        { error: 'Editing is disabled. Set EDIT_SECRET env variable to enable.' },
        { status: 403 }
      );
    }

    // Verify password
    const providedSecret = request.headers.get('x-edit-secret');
    if (providedSecret !== editSecret) {
      // Record failed attempt
      const failResult = await recordFailedAttempt(clientIP);
      console.log(`[CONFIG] Failed attempt for IP ${clientIP}. Remaining: ${failResult.remainingAttempts}`);
      
      return NextResponse.json(
        { 
          error: failResult.message,
          remainingAttempts: failResult.remainingAttempts,
          banned: failResult.banned,
          bannedUntil: failResult.bannedUntil?.toISOString()
        },
        { status: failResult.banned ? 429 : 401 }
      );
    }

    // Password correct - reset rate limit
    await resetRateLimit(clientIP);
    console.log(`[CONFIG] Successful auth for IP ${clientIP}, rate limit reset`);

    const config: TourConfig = await request.json();
    console.log(`[CONFIG] Saving config for project: ${projectCode}`);

    // Validate config structure
    if (!config || !config.id || !config.scenes) {
      return NextResponse.json({ error: 'Invalid config structure' }, { status: 400 });
    }

    // Ensure project ID matches
    config.id = projectCode;

    // 1. Try to save locally first
    const projectDir = path.join(process.cwd(), 'public', 'projects', projectCode);
    const configPath = path.join(projectDir, 'config.json');

    if (fs.existsSync(projectDir)) {
      console.log(`[CONFIG] Saving locally to: ${configPath}`);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true, source: 'local' });
    }

    // 2. If project folder doesn't exist locally, save to Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log(`[CONFIG] Saving to Blob storage`);
      const blob = await put(
        `projects/${projectCode}/config.json`,
        JSON.stringify(config, null, 2),
        {
          access: 'public',
          contentType: 'application/json',
          allowOverwrite: true, // Allow updating existing config
        }
      );
      return NextResponse.json({ success: true, source: 'blob', url: blob.url });
    }

    return NextResponse.json({ error: 'No storage available' }, { status: 500 });

  } catch (error) {
    console.error(`[CONFIG] Error saving config:`, error);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}