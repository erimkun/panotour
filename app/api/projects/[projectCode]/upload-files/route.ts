import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, getClientIP } from '@/utils/rateLimiter';
import { shouldUseLocalProjectStorage, writeProjectFile } from '@/utils/storage';
import { getEditSecret } from '@/utils/runtimeSettings';

/**
 * POST - Upload multiple files (images, audio) for a project
 * Requires EDIT_SECRET env variable to be set
 * Header: x-edit-secret must match EDIT_SECRET
 * Body: FormData with 'files' field and 'folder' (images or audio)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectCode: string }> }
) {
  const resolvedParams = await params;
  const { projectCode } = resolvedParams;

  // Get client IP for rate limiting
  const clientIP = getClientIP(request);
  console.log(`[UPLOAD-FILES] POST request from IP: ${clientIP}`);

  try {
    // Check rate limit first
    const rateLimitCheck = await checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      console.log(`[UPLOAD-FILES] IP ${clientIP} is banned until ${rateLimitCheck.bannedUntil}`);
      return NextResponse.json(
        { 
          error: rateLimitCheck.message,
          bannedUntil: rateLimitCheck.bannedUntil?.toISOString(),
          remainingAttempts: 0
        },
        { status: 429 }
      );
    }

    // Check if editing is enabled
    const editSecret = getEditSecret();
    if (!editSecret) {
      return NextResponse.json(
        { error: 'Editing is disabled. Set EDIT_SECRET in admin settings or env.' },
        { status: 403 }
      );
    }

    // Verify password
    const providedSecret = request.headers.get('x-edit-secret');
    if (providedSecret !== editSecret) {
      // Record failed attempt
      const failResult = await recordFailedAttempt(clientIP);
      console.log(`[UPLOAD-FILES] Failed attempt for IP ${clientIP}. Remaining: ${failResult.remainingAttempts}`);
      
      return NextResponse.json(
        { 
          error: failResult.message,
          remainingAttempts: failResult.remainingAttempts,
          banned: failResult.banned,
          bannedUntil: failResult.bannedUntil?.toISOString()
        },
        { status: failResult.banned ? 429 : 401 }
      );
    }

    // Password correct - reset rate limit
    await resetRateLimit(clientIP);
    console.log(`[UPLOAD-FILES] Successful auth for IP ${clientIP}, rate limit reset`);

    // Parse FormData
    const formData = await request.formData();
    const folder = (formData.get('folder') as string) === 'audio' ? 'audio' : 'images';
    
    // Get all files
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`[UPLOAD-FILES] Uploading ${files.length} files for project: ${projectCode}/${folder}`);

    // Upload all files to Blob
    const uploadedFiles: { name: string; url: string }[] = [];
    const errors: { name: string; error: string }[] = [];
    const useLocalStorage = shouldUseLocalProjectStorage(projectCode);

    if (!useLocalStorage && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'No storage configured. Set PROJECTS_STORAGE_PATH or BLOB_READ_WRITE_TOKEN.' },
        { status: 500 }
      );
    }

    for (const file of files) {
      try {
        if (useLocalStorage) {
          const fileBuffer = Buffer.from(await file.arrayBuffer());
          writeProjectFile(projectCode, `${folder}/${file.name}`, fileBuffer);
          const fileUrl = `/projects/${projectCode}/${folder}/${encodeURIComponent(file.name)}`;
          uploadedFiles.push({ name: file.name, url: fileUrl });
          console.log(`[UPLOAD-FILES] Saved locally: ${file.name} -> ${fileUrl}`);
          continue;
        }

        const blobPath = `projects/${projectCode}/${folder}/${file.name}`;
        console.log(`[UPLOAD-FILES] Uploading: ${blobPath}`);

        const blob = await put(blobPath, file, {
          access: 'public',
          allowOverwrite: true,
        });

        uploadedFiles.push({ name: file.name, url: blob.url });
        console.log(`[UPLOAD-FILES] Uploaded: ${file.name} -> ${blob.url}`);
      } catch (err) {
        console.error(`[UPLOAD-FILES] Failed to upload ${file.name}:`, err);
        errors.push({ name: file.name, error: String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedFiles,
      errors: errors,
      total: files.length,
      successCount: uploadedFiles.length,
      errorCount: errors.length,
    });

  } catch (error) {
    console.error(`[UPLOAD-FILES] Error:`, error);
    return NextResponse.json(
      { error: 'Failed to upload files', details: String(error) },
      { status: 500 }
    );
  }
}
