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
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    console.log(`[PAGE] Fetching config for ${projectCode} from ${baseUrl}`);
    
    const res = await fetch(`${baseUrl}/api/projects/${projectCode}/config`, {
      cache: 'no-store', // Always get fresh data
    });

    console.log(`[PAGE] Config API response status: ${res.status}`);

    if (!res.ok) {
      console.error(`[PAGE] Config API failed for ${projectCode}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`[PAGE] Config loaded successfully for ${projectCode}`);
    return data;
  } catch (error) {
    console.error(`[PAGE] Error loading config for ${projectCode}:`, error);
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
