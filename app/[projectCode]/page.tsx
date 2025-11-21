import { notFound } from 'next/navigation';
import TourViewer from '@/components/TourViewer';
import { TourConfig } from '@/types/tour';

interface PageProps {
  params: Promise<{
    projectCode: string;
  }>;
}

async function getProjectConfig(projectCode: string): Promise<TourConfig | null> {
  try {
    // Use the API endpoint to get config (handles both local and blob)
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const res = await fetch(`${baseUrl}/api/projects/${projectCode}/config`, {
      cache: 'no-store', // Always get fresh data
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectCode } = await params;
  const config = await getProjectConfig(projectCode);

  if (!config) {
    return notFound();
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      <TourViewer config={config} projectCode={projectCode} />
    </div>
  );
}
