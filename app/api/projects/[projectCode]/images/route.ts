import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const { projectCode } = await params;
  const imagesDir = path.join(process.cwd(), 'public', 'projects', projectCode, 'images');

  if (!fs.existsSync(imagesDir)) {
    return NextResponse.json([]);
  }

  try {
    const files = fs.readdirSync(imagesDir);
    const images = files.filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list images' }, { status: 500 });
  }
}
