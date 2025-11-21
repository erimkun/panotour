import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { blobUrl, projectCode, password } = await request.json();

    // Şifre kontrolü
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    if (!blobUrl || !projectCode) {
      return NextResponse.json(
        { error: 'Eksik parametreler' },
        { status: 400 }
      );
    }

    // Blob'dan zip dosyasını indir
    const response = await fetch(blobUrl);
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Config.json kontrolü
    const configFile = zip.file('config.json');
    if (!configFile) {
      return NextResponse.json(
        { error: 'Zip içinde config.json bulunamadı' },
        { status: 400 }
      );
    }

    // Tüm dosyaları Blob'a yükle
    const uploadPromises: Promise<any>[] = [];
    const uploadedFiles: string[] = [];

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;

      const content = await zipEntry.async('blob');
      const blobPath = `projects/${projectCode}/${filename}`;

      const uploadPromise = put(blobPath, content, {
        access: 'public',
        addRandomSuffix: false,
      }).then((blob) => {
        uploadedFiles.push(blob.url);
        return blob;
      });

      uploadPromises.push(uploadPromise);
    }

    await Promise.all(uploadPromises);

    return NextResponse.json({
      success: true,
      projectCode,
      filesUploaded: uploadedFiles.length,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Process error:', error);
    return NextResponse.json(
      { error: 'İşlem sırasında hata oluştu', details: String(error) },
      { status: 500 }
    );
  }
}

