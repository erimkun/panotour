import { NextRequest, NextResponse } from 'next/server';
import { listProjectSummaries } from '@/utils/projects';

export async function GET(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password');

  if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
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