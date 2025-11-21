import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
}

function getProjects(): ProjectSummary[] {
  try {
    const projectsDir = path.join(process.cwd(), 'public', 'projects');
    
    // Check if projects directory exists
    if (!fs.existsSync(projectsDir)) {
      return [];
    }

    // Read all directories in projects folder
    const folders = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Map folders to project summaries
    const projects: ProjectSummary[] = folders
      .map(folder => {
        const configPath = path.join(projectsDir, folder, 'config.json');
        
        // Check if config.json exists
        if (!fs.existsSync(configPath)) {
          return null;
        }

        try {
          const fileContents = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(fileContents);
          
          // Use first scene's image as thumbnail
          const firstSceneImage = config.scenes?.[0]?.image;
          const thumbnail = firstSceneImage 
            ? `/projects/${folder}/images/${firstSceneImage}`
            : '/placeholder-thumbnail.jpg';
          
          return {
            id: folder,
            name: config.name || folder,
            thumbnail
          };
        } catch (error) {
          console.error(`Error reading config for ${folder}:`, error);
          return null;
        }
      })
      .filter((project): project is ProjectSummary => project !== null);
    
    return projects;
  } catch (error) {
    console.error('Error listing projects:', error);
    return [];
  }
}

export default function MainPage() {
  const projects = getProjects();

  return (
    <main className="min-h-screen p-8 md:p-16">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Panoramic Tours
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl">
            Explore our collection of immersive 360-degree apartment tours.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => (
            <Link 
              key={project.id} 
              href={`/${project.id}`}
              className="group relative block h-80 rounded-2xl overflow-hidden bg-white/5 border border-white/10 backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-white/30"
            >
              {/* Image Background */}
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${project.thumbnail})` }}
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-2 group-hover:translate-y-0 transition-transform">
                <h2 className="text-2xl font-bold text-white mb-2">{project.name}</h2>
                <div className="flex items-center text-blue-300 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity delay-100">
                  Start Tour <ArrowRight size={16} className="ml-2" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {projects.length === 0 && (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
            <p className="text-gray-400 text-xl">No projects found.</p>
            <p className="text-gray-500 mt-2">Check public/projects.json</p>
          </div>
        )}
      </div>
    </main>
  );
}
