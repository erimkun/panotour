import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { list, put } from '@vercel/blob';
import { VRConfig, DEFAULT_VR_CONFIG } from '@/types/tour';
import { ensureProjectDirectory, getProjectDirectory, getProjectVrConfigPath, readJsonFile, shouldUseLocalProjectStorage } from '@/utils/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;
  
  try {
    console.log(`[VR-CONFIG] Request for project: ${projectCode}`);

    // 1. Try to read from local project storage first
    const vrConfigPath = getProjectVrConfigPath(projectCode);
    console.log(`[VR-CONFIG] Checking local path: ${vrConfigPath}`);
    
    if (fs.existsSync(vrConfigPath)) {
      console.log(`[VR-CONFIG] Found local VR config for ${projectCode}`);
      const vrConfig = readJsonFile<VRConfig>(vrConfigPath);
      return NextResponse.json({ ...vrConfig, source: 'local' });
    }

    console.log(`[VR-CONFIG] Not found locally, checking Blob...`);
    
    // 2. If not found locally, try Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({
        prefix: `projects/${projectCode}/`,
      });

      const vrConfigBlob = blobs.find(b => b.pathname.endsWith('vrConfig.json'));
      
      if (vrConfigBlob) {
        console.log(`[VR-CONFIG] Found vrConfig.json at: ${vrConfigBlob.url}`);
        const response = await fetch(vrConfigBlob.url);
        const vrConfig = await response.json();
        return NextResponse.json({ ...vrConfig, source: 'blob' });
      }
    }

    // 3. Return default VR config if not found
    console.log(`[VR-CONFIG] No VR config found, returning defaults for ${projectCode}`);
    return NextResponse.json({ ...DEFAULT_VR_CONFIG, source: 'default' });
    
  } catch (error) {
    console.error(`[VR-CONFIG] Error:`, error);
    return NextResponse.json({ error: 'Failed to load VR config' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;
  
  try {
    const vrConfig: VRConfig = await request.json();
    console.log(`[VR-CONFIG] Saving VR config for project: ${projectCode}`);

    // Validate VR config structure
    if (!vrConfig || typeof vrConfig !== 'object') {
      return NextResponse.json({ error: 'Invalid VR config' }, { status: 400 });
    }

    // Ensure required fields
    const sanitizedConfig: VRConfig = {
      visibleScenes: Array.isArray(vrConfig.visibleScenes) ? vrConfig.visibleScenes : [],
      hotspotOverrides: vrConfig.hotspotOverrides || {},
    };

    // 1. Prefer local project storage when explicitly configured or project exists locally
    const projectDir = getProjectDirectory(projectCode);
    const vrConfigPath = getProjectVrConfigPath(projectCode);
    
    if (shouldUseLocalProjectStorage(projectCode)) {
      ensureProjectDirectory(projectCode);
      console.log(`[VR-CONFIG] Saving locally to: ${vrConfigPath}`);
      fs.writeFileSync(vrConfigPath, JSON.stringify(sanitizedConfig, null, 2));
      return NextResponse.json({ success: true, source: 'local' });
    }

    // 2. If project folder doesn't exist locally, save to Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log(`[VR-CONFIG] Saving to Blob storage`);
      const blob = await put(
        `projects/${projectCode}/vrConfig.json`,
        JSON.stringify(sanitizedConfig, null, 2),
        {
          access: 'public',
          contentType: 'application/json',
          allowOverwrite: true,
        }
      );
      return NextResponse.json({ success: true, source: 'blob', url: blob.url });
    }

    return NextResponse.json({ error: 'No storage available' }, { status: 500 });
    
  } catch (error) {
    console.error(`[VR-CONFIG] Error saving:`, error);
    return NextResponse.json({ error: 'Failed to save VR config' }, { status: 500 });
  }
}
