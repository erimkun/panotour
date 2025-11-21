import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { put } from '@vercel/blob';

// Node.js runtime kullan - JSZip için gerekli
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { blobUrl, projectCode, password } = await request.json();

    console.log('[PROCESS] Starting process for:', projectCode);
    console.log('[PROCESS] Blob URL:', blobUrl);

    // Şifre kontrolü
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      console.error('[PROCESS] Auth failed');
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    if (!blobUrl || !projectCode) {
      console.error('[PROCESS] Missing parameters');
      return NextResponse.json(
        { error: 'Eksik parametreler' },
        { status: 400 }
      );
    }

    // Blob'dan zip dosyasını indir
    console.log('[PROCESS] Fetching zip from blob...');
    const response = await fetch(blobUrl);
    
    if (!response.ok) {
      console.error('[PROCESS] Failed to fetch blob:', response.status);
      throw new Error(`Failed to fetch blob: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log('[PROCESS] Downloaded zip size:', arrayBuffer.byteLength, 'bytes');

    if (arrayBuffer.byteLength === 0) {
      throw new Error('Downloaded zip file is empty');
    }

    console.log('[PROCESS] Loading zip with JSZip...');
    const zip = await JSZip.loadAsync(arrayBuffer, { 
      checkCRC32: true 
    });

    console.log('[PROCESS] Zip loaded successfully');
    console.log('[PROCESS] Files in zip:', Object.keys(zip.files).length);

    // Config.json kontrolü
    const configFile = zip.file('config.json');
    if (!configFile) {
      console.error('[PROCESS] config.json not found in zip');
      console.log('[PROCESS] Available files:', Object.keys(zip.files));
      return NextResponse.json(
        { error: 'Zip içinde config.json bulunamadı' },
        { status: 400 }
      );
    }

    console.log('[PROCESS] config.json found, uploading files to blob...');

    // Tüm dosyaları Blob'a yükle
    const uploadPromises: Promise<any>[] = [];
    const uploadedFiles: string[] = [];

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) {
        console.log('[PROCESS] Skipping directory:', filename);
        continue;
      }

      console.log('[PROCESS] Processing file:', filename);
      const content = await zipEntry.async('nodebuffer');
      const blobPath = `projects/${projectCode}/${filename}`;

      const uploadPromise = put(blobPath, content, {
        access: 'public',
        addRandomSuffix: false,
      }).then((blob) => {
        console.log('[PROCESS] Uploaded:', filename, '→', blob.url);
        uploadedFiles.push(blob.url);
        return blob;
      });

      uploadPromises.push(uploadPromise);
    }

    console.log('[PROCESS] Waiting for all uploads...');
    await Promise.all(uploadPromises);

    console.log('[PROCESS] All files uploaded successfully');

    return NextResponse.json({
      success: true,
      projectCode,
      filesUploaded: uploadedFiles.length,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('[PROCESS] Error:', error);
    return NextResponse.json(
      { error: 'İşlem sırasında hata oluştu', details: String(error) },
      { status: 500 }
    );
  }
}

