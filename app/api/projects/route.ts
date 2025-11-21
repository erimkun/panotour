import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
}

export async function GET() {
  try {
    const projectsDir = path.join(process.cwd(), 'public', 'projects');
    
    // Check if projects directory exists
    if (!fs.existsSync(projectsDir)) {
      return NextResponse.json([]);
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
            : '/placeholder-thumbnail.jpg'; // Fallback
          
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
    
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

