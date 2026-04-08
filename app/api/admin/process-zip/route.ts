import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { put } from '@vercel/blob';
import { projectExists } from '@/utils/projects';
import { shouldUseLocalProjectStorage, writeProjectFile } from '@/utils/storage';
import { getAdminPassword } from '@/utils/runtimeSettings';

// Node.js runtime kullan - JSZip için gerekli
export const runtime = 'nodejs';
export const maxDuration = 300;

interface ProcessZipPayload {
  projectCode: string;
  password: string;
  zipBuffer: Buffer;
}

async function parseRequestPayload(request: NextRequest): Promise<ProcessZipPayload> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    const projectCode = String(formData.get('projectCode') || '');
    const password = String(formData.get('password') || '');

    if (!(file instanceof File)) {
      throw new Error('Zip dosyası bulunamadı');
    }

    return {
      projectCode,
      password,
      zipBuffer: Buffer.from(await file.arrayBuffer()),
    };
  }

  const { blobUrl, projectCode, password } = await request.json();

  if (!blobUrl) {
    throw new Error('Zip kaynağı bulunamadı');
  }

  const response = await fetch(blobUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.status}`);
  }

  return {
    projectCode,
    password,
    zipBuffer: Buffer.from(await response.arrayBuffer()),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { projectCode, password, zipBuffer } = await parseRequestPayload(request);

    console.log('[PROCESS] Starting process for:', projectCode);

    // Şifre kontrolü
    const expectedPassword = getAdminPassword();
    if (!password || !expectedPassword || password !== expectedPassword) {
      console.error('[PROCESS] Auth failed');
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    if (!projectCode) {
      console.error('[PROCESS] Missing parameters');
      return NextResponse.json(
        { error: 'Eksik parametreler' },
        { status: 400 }
      );
    }

    if (await projectExists(projectCode)) {
      return NextResponse.json(
        { error: 'Bu proje kodu zaten var. Mevcut projeyi editorden güncelleyin.' },
        { status: 409 }
      );
    }

    console.log('[PROCESS] Zip size:', zipBuffer.byteLength, 'bytes');

    if (zipBuffer.byteLength === 0) {
      throw new Error('Downloaded zip file is empty');
    }

    console.log('[PROCESS] Loading zip with JSZip...');
    const zip = await JSZip.loadAsync(zipBuffer, { 
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

    console.log('[PROCESS] config.json found, preparing storage upload...');

    const useLocalStorage = shouldUseLocalProjectStorage(projectCode);

    if (!useLocalStorage && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'No storage configured. Set PROJECTS_STORAGE_PATH or BLOB_READ_WRITE_TOKEN.' },
        { status: 500 }
      );
    }

    // Tüm dosyaları seçilen storage'a yükle
    const uploadPromises: Promise<any>[] = [];
    const uploadedFiles: string[] = [];

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) {
        console.log('[PROCESS] Skipping directory:', filename);
        continue;
      }

      console.log('[PROCESS] Processing file:', filename);
      const content = await zipEntry.async('nodebuffer');

      if (useLocalStorage) {
        const uploadPromise = Promise.resolve().then(() => {
          writeProjectFile(projectCode, filename, content);
          const fileUrl = `/projects/${projectCode}/${filename.split('/').map(encodeURIComponent).join('/')}`;
          console.log('[PROCESS] Saved locally:', filename, '→', fileUrl);
          uploadedFiles.push(fileUrl);
          return fileUrl;
        });

        uploadPromises.push(uploadPromise);
        continue;
      }

      const blobPath = `projects/${projectCode}/${filename}`;

      const uploadPromise = put(blobPath, content, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
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
      storage: useLocalStorage ? 'local' : 'blob',
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

