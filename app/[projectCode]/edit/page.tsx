import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import TourEditor from '@/components/TourEditor';
import { TourConfig } from '@/types/tour';

interface PageProps {
  params: Promise<{
    projectCode: string;
  }>;
}

export default async function EditPage({ params }: PageProps) {
  const { projectCode } = await params;
  const configPath = path.join(process.cwd(), 'public', 'projects', projectCode, 'config.json');

  let config: TourConfig;

  try {
    if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(fileContents);
    } else {
        // Initialize empty config to trigger wizard
        config = {
            id: projectCode,
            name: "",
            initialSceneId: "",
            scenes: []
        };
    }
  } catch (e) {
    console.error("Error loading config", e);
    // Return empty config on error to show wizard
    config = {
        id: projectCode,
        name: "",
        initialSceneId: "",
        scenes: []
    };
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white">
      <TourEditor initialConfig={config} projectCode={projectCode} />
    </div>
  );
}
