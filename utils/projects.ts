import fs from 'fs';
import { list } from '@vercel/blob';
import { ProjectStatus } from '@/types/tour';
import { getProjectConfigPath, getProjectsStoragePath, isBlobStorageConfigured, readJsonFile } from '@/utils/storage';

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  source: 'local' | 'blob';
  status: ProjectStatus;
}

export function getProjectStatus(config: { status?: string } | null | undefined): ProjectStatus {
  return config?.status === 'draft' ? 'draft' : 'published';
}

export async function projectExists(projectCode: string): Promise<boolean> {
  const localConfigPath = getProjectConfigPath(projectCode);
  if (fs.existsSync(localConfigPath)) {
    return true;
  }

  if (!isBlobStorageConfigured()) {
    return false;
  }

  const { blobs } = await list({ prefix: `projects/${projectCode}/` });
  return blobs.some(blob => blob.pathname.endsWith('config.json'));
}

export async function listProjectSummaries(includeDrafts: boolean = false): Promise<ProjectSummary[]> {
  const projects: ProjectSummary[] = [];
  const projectsSet = new Set<string>();

  const projectsDir = getProjectsStoragePath();
  if (fs.existsSync(projectsDir)) {
    const folders = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folder of folders) {
      const configPath = `${projectsDir}/${folder}/config.json`;
      if (!fs.existsSync(configPath)) {
        continue;
      }

      try {
        const config = readJsonFile<any>(configPath);
        const status = getProjectStatus(config);

        if (!includeDrafts && status === 'draft') {
          continue;
        }

        const firstSceneImage = config.scenes?.[0]?.image;
        const thumbnail = firstSceneImage
          ? `/projects/${folder}/images/${firstSceneImage}`
          : '/placeholder-thumbnail.jpg';

        projects.push({
          id: folder,
          name: config.name || folder,
          thumbnail,
          source: 'local',
          status,
        });
        projectsSet.add(folder);
      } catch (error) {
        console.error(`Error reading config for ${folder}:`, error);
      }
    }
  }

  if (isBlobStorageConfigured()) {
    try {
      const { blobs } = await list({ prefix: 'projects/' });
      const blobProjects = new Map<string, any[]>();

      for (const blob of blobs) {
        const pathParts = blob.pathname.split('/');
        if (pathParts.length < 2) {
          continue;
        }

        const projectCode = pathParts[1];
        if (!blobProjects.has(projectCode)) {
          blobProjects.set(projectCode, []);
        }
        blobProjects.get(projectCode)!.push(blob);
      }

      for (const [projectCode, projectBlobs] of blobProjects.entries()) {
        if (projectsSet.has(projectCode)) {
          continue;
        }

        const configBlob = projectBlobs.find(blob => blob.pathname.endsWith('config.json'));
        if (!configBlob) {
          continue;
        }

        try {
          const response = await fetch(configBlob.url);
          const config = await response.json();
          const status = getProjectStatus(config);

          if (!includeDrafts && status === 'draft') {
            continue;
          }

          let initialScene = config.scenes?.[0];
          if (config.initialSceneId && config.scenes) {
            const foundScene = config.scenes.find((scene: any) => scene.id === config.initialSceneId);
            if (foundScene) {
              initialScene = foundScene;
            }
          }

          const initialSceneImage = initialScene?.image;
          let thumbnail = '';

          if (initialSceneImage) {
            const imageName = initialSceneImage.split('/').pop();
            const imageBlob = projectBlobs.find(blob => {
              const blobName = blob.pathname.split('/').pop();
              return (
                blob.pathname.endsWith(`images/${initialSceneImage}`) ||
                blob.pathname.includes(`/images/${initialSceneImage}`) ||
                blob.pathname.endsWith(initialSceneImage) ||
                blobName === imageName
              );
            });
            thumbnail = imageBlob?.url || '';
          }

          if (!thumbnail && config.scenes) {
            for (const scene of config.scenes) {
              if (!scene.image) {
                continue;
              }

              const imageName = scene.image.split('/').pop();
              const imageBlob = projectBlobs.find(blob => {
                const blobName = blob.pathname.split('/').pop();
                return blobName === imageName || blob.pathname.endsWith(scene.image);
              });
              if (imageBlob) {
                thumbnail = imageBlob.url;
                break;
              }
            }
          }

          projects.push({
            id: projectCode,
            name: config.name || projectCode,
            thumbnail,
            source: 'blob',
            status,
          });
        } catch (error) {
          console.error(`Error reading blob config for ${projectCode}:`, error);
        }
      }
    } catch (error) {
      console.error('Error listing blob projects:', error);
    }
  }

  return projects.sort((left, right) => left.name.localeCompare(right.name, 'tr'));
}
