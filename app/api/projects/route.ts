import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { list } from '@vercel/blob';

interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  source: 'local' | 'blob';
}

export async function GET() {
  try {
    const projects: ProjectSummary[] = [];
    const projectsSet = new Set<string>();

    // 1. Read local projects (public/projects)
    const projectsDir = path.join(process.cwd(), 'public', 'projects');
    if (fs.existsSync(projectsDir)) {
      const folders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const folder of folders) {
        const configPath = path.join(projectsDir, folder, 'config.json');
        
        if (!fs.existsSync(configPath)) continue;

        try {
          const fileContents = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(fileContents);
          
          const firstSceneImage = config.scenes?.[0]?.image;
          const thumbnail = firstSceneImage 
            ? `/projects/${folder}/images/${firstSceneImage}`
            : '/placeholder-thumbnail.jpg';
          
          projects.push({
            id: folder,
            name: config.name || folder,
            thumbnail,
            source: 'local'
          });
          projectsSet.add(folder);
        } catch (error) {
          console.error(`Error reading config for ${folder}:`, error);
        }
      }
    }

    // 2. Read Blob projects
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { blobs } = await list({
          prefix: 'projects/',
        });

        // Group blobs by project
        const blobProjects = new Map<string, any[]>();
        
        for (const blob of blobs) {
          // Extract project code from path: projects/{projectCode}/...
          const pathParts = blob.pathname.split('/');
          if (pathParts.length < 2) continue;
          
          const projectCode = pathParts[1];
          if (!blobProjects.has(projectCode)) {
            blobProjects.set(projectCode, []);
          }
          blobProjects.get(projectCode)!.push(blob);
        }

        // Process each blob project
        for (const [projectCode, blobs] of blobProjects.entries()) {
          // Skip if already have local version
          if (projectsSet.has(projectCode)) continue;

          // Find config.json
          const configBlob = blobs.find(b => b.pathname.endsWith('config.json'));
          if (!configBlob) continue;

          try {
            const response = await fetch(configBlob.url);
            const config = await response.json();
            
            const firstSceneImage = config.scenes?.[0]?.image;
            const thumbnail = firstSceneImage 
              ? blobs.find(b => b.pathname.endsWith(`images/${firstSceneImage}`))?.url || ''
              : '';
            
            projects.push({
              id: projectCode,
              name: config.name || projectCode,
              thumbnail,
              source: 'blob'
            });
          } catch (error) {
            console.error(`Error reading blob config for ${projectCode}:`, error);
          }
        }
      } catch (error) {
        console.error('Error listing blob projects:', error);
      }
    }
    
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

