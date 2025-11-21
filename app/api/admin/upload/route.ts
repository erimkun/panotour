import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 dakika timeout

export async function POST(request: NextRequest) {
  try {
    // Şifre kontrolü
    const formData = await request.formData();
    const password = formData.get('password') as string;
    const file = formData.get('file') as File;

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: 'Dosya bulunamadı' },
        { status: 400 }
      );
    }

    // Zip dosyasını aç
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Proje kodu: zip dosyasının adından .zip uzantısını çıkar
    const projectCode = file.name.replace('.zip', '');

    // Config.json ve images klasörünü kontrol et
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
      if (zipEntry.dir) continue; // Klasörleri atla

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
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload sırasında bir hata oluştu', details: String(error) },
      { status: 500 }
    );
  }
}

