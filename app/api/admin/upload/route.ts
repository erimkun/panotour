import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 dakika timeout

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Şifre kontrolü
        const password = clientPayload as string;
        
        if (!password || password !== process.env.ADMIN_PASSWORD) {
          throw new Error('Yetkisiz erişim');
        }

        return {
          allowedContentTypes: ['application/zip', 'application/x-zip-compressed'],
          tokenPayload: JSON.stringify({
            uploadedBy: 'admin',
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed:', blob.url);
        // Burada isterseniz database'e kayıt yapabilirsiniz
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 }
    );
  }
}

