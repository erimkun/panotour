import fs from 'fs';
import path from 'path';

const DEFAULT_PROJECTS_STORAGE_PATH = path.join(process.cwd(), 'public', 'projects');

export function getProjectsStoragePath(): string {
  const customPath = process.env.PROJECTS_STORAGE_PATH?.trim();
  return customPath || DEFAULT_PROJECTS_STORAGE_PATH;
}

export function hasCustomProjectsStoragePath(): boolean {
  return Boolean(process.env.PROJECTS_STORAGE_PATH?.trim());
}

export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getProjectDirectory(projectCode: string): string {
  return path.join(getProjectsStoragePath(), projectCode);
}

export function getProjectConfigPath(projectCode: string): string {
  return path.join(getProjectDirectory(projectCode), 'config.json');
}

export function getProjectVrConfigPath(projectCode: string): string {
  return path.join(getProjectDirectory(projectCode), 'vrConfig.json');
}

export function shouldUseLocalProjectStorage(projectCode?: string): boolean {
  if (hasCustomProjectsStoragePath()) {
    return true;
  }

  if (projectCode && fs.existsSync(getProjectDirectory(projectCode))) {
    return true;
  }

  return !isBlobStorageConfigured();
}

export function ensureProjectDirectory(projectCode: string): string {
  const projectDir = getProjectDirectory(projectCode);
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

export function resolveProjectPath(projectCode: string, ...segments: string[]): string {
  const projectDir = path.resolve(getProjectDirectory(projectCode));
  const targetPath = path.resolve(projectDir, ...segments);

  if (targetPath !== projectDir && !targetPath.startsWith(`${projectDir}${path.sep}`)) {
    throw new Error('Invalid project path');
  }

  return targetPath;
}

export function ensureProjectSubdirectory(projectCode: string, ...segments: string[]): string {
  const targetDir = resolveProjectPath(projectCode, ...segments);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

export function writeProjectFile(projectCode: string, relativePath: string, content: string | Buffer): string {
  const normalizedParts = relativePath
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);

  const filePath = resolveProjectPath(projectCode, ...normalizedParts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function getRateLimitStoragePath(): string {
  if (hasCustomProjectsStoragePath()) {
    return path.join(getProjectsStoragePath(), '..', '.system', 'rate-limits');
  }

  return path.join(process.cwd(), '.data', 'rate-limits');
}
