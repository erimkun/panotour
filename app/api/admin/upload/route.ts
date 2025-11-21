import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

// Edge runtime kullan - body size limiti yok
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    // Şifre kontrolü
    const password = request.headers.get('x-admin-password');
    
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    // FormData'yı al
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectCode = formData.get('projectCode') as string;

    if (!file || !projectCode) {
      return NextResponse.json(
        { error: 'Dosya veya proje kodu eksik' },
        { status: 400 }
      );
    }

    console.log(`[UPLOAD] Starting upload: ${projectCode}, size: ${file.size} bytes`);

    // Dosyayı direkt Blob'a yükle (stream olarak)
    const blob = await put(`temp/${projectCode}.zip`, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    console.log(`[UPLOAD] Upload complete: ${blob.url}`);

    return NextResponse.json({
      success: true,
      blobUrl: blob.url,
      projectCode,
    });
  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Upload başarısız',
        details: String(error)
      },
      { status: 500 }
    );
  }
}

