import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        console.log('[UPLOAD] onBeforeGenerateToken called');
        console.log('[UPLOAD] clientPayload:', clientPayload);
        console.log('[UPLOAD] pathname:', pathname);
        
        // clientPayload string olarak gelir, parse et
        let password: string | undefined;
        try {
          const payload = JSON.parse(clientPayload || '{}');
          password = payload.password;
        } catch (e) {
          console.error('[UPLOAD] Failed to parse clientPayload:', e);
          throw new Error('Invalid payload');
        }
        
        console.log('[UPLOAD] Password check:', { 
          hasPassword: !!password, 
          hasEnvPassword: !!process.env.ADMIN_PASSWORD 
        });
        
        if (!password || password !== process.env.ADMIN_PASSWORD) {
          console.error('[UPLOAD] Auth failed');
          throw new Error('Yetkisiz erişim');
        }

        console.log('[UPLOAD] Auth successful, generating token');

        // Dosyayı temp/ klasörüne kaydet
        const newPathname = pathname.startsWith('temp/') ? pathname : `temp/${pathname}`;
        console.log('[UPLOAD] Using pathname:', newPathname);

        return {
          allowedContentTypes: ['application/zip', 'application/x-zip-compressed'],
          tokenPayload: JSON.stringify({
            userId: 'admin',
            pathname: newPathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[UPLOAD] Upload completed successfully');
        console.log('[UPLOAD] Blob URL:', blob.url);
        console.log('[UPLOAD] Blob pathname:', blob.pathname);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

