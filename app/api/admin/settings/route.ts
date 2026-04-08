import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminPassword,
  getRuntimeSettingsForAdmin,
  saveRuntimeSettings,
  type RuntimeSettings,
} from '@/utils/runtimeSettings';

function isAuthorized(request: NextRequest): boolean {
  const provided = request.headers.get('x-admin-password') || '';
  const adminPassword = getAdminPassword();
  return Boolean(adminPassword && provided && provided === adminPassword);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz erisim' }, { status: 401 });
  }

  const settings = getRuntimeSettingsForAdmin();
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz erisim' }, { status: 401 });
  }

  try {
    // Session-only: values are kept in server memory and are never written to disk.
    const payload = (await request.json()) as Partial<RuntimeSettings>;
    const saved = saveRuntimeSettings(payload);
    return NextResponse.json({ success: true, settings: saved });
  } catch (error) {
    console.error('[ADMIN-SETTINGS] Save error:', error);
    return NextResponse.json({ error: 'Ayarlar kaydedilemedi' }, { status: 500 });
  }
}
