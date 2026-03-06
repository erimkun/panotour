import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { resolveProjectPath } from '@/utils/storage';

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

function getContentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectCode: string; assetPath: string[] }> }
) {
  const { projectCode, assetPath } = await params;

  try {
    const filePath = resolveProjectPath(projectCode, ...assetPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Cache-Control': 'public, max-age=604800, immutable',
        'Content-Type': getContentType(filePath),
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}