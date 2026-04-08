import { NextRequest, NextResponse } from 'next/server';
import { listProjectSummaries } from '@/utils/projects';
import { getAdminPassword } from '@/utils/runtimeSettings';

export async function GET(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password');
  const expectedPassword = getAdminPassword();

  if (!expectedPassword || adminPassword !== expectedPassword) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  try {
    const projects = await listProjectSummaries(true);
    return NextResponse.json(projects);
  } catch (error) {
    console.error('[ADMIN PROJECTS] Error listing projects:', error);
    return NextResponse.json({ error: 'Projeler listelenemedi' }, { status: 500 });
  }
}