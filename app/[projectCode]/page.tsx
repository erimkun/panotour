import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import TourViewer from '@/components/TourViewer';
import { TourConfig } from '@/types/tour';

interface PageProps {
  params: Promise<{
    projectCode: string;
  }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectCode } = await params;
  const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');

  let config: TourConfig | null = null;

  try {
    if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(fileContents);
    }
  } catch (e) {
    console.error("Error loading config", e);
  }

  if (!config) {
      return notFound();
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      <TourViewer config={config} projectCode={projectCode} />
    </div>
  );
}
