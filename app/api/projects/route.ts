import { NextRequest, NextResponse } from 'next/server';
import { listProjectSummaries } from '@/utils/projects';

export async function GET(request: NextRequest) {
  try {
    const includeDrafts = request.nextUrl.searchParams.get('includeDrafts') === 'true';
    const projects = await listProjectSummaries(includeDrafts);
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

