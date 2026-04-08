import { NextResponse } from 'next/server';
import fs from 'fs';
import { list } from '@vercel/blob';
import { resolveReadableProjectPath } from '@/utils/storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const { projectCode } = await params;
  const images: string[] = [];

  // 1. Try local project storage first
  const imagesDir = resolveReadableProjectPath(projectCode, 'images');
  if (fs.existsSync(imagesDir)) {
    try {
      const files = fs.readdirSync(imagesDir);
      const localImages = files.filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
      images.push(...localImages);
    } catch (error) {
      console.error('[IMAGES API] Error reading local images:', error);
    }
  }

  // 2. Try Vercel Blob if available
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({
        prefix: `projects/${projectCode}/images/`,
      });

      // Extract just the filename from blob pathnames
      for (const blob of blobs) {
        const filename = blob.pathname.split('/').pop();
        if (filename && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
          // Don't add duplicates
          if (!images.includes(filename)) {
            images.push(filename);
          }
        }
      }
    } catch (error) {
      console.error('[IMAGES API] Error listing blobs:', error);
    }
  }

  return NextResponse.json(images);
}
