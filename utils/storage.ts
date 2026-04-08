import fs from 'fs';
import path from 'path';

const DEV_RUNTIME_STORAGE_ROOT = path.resolve(process.cwd(), '..', '.panotour-data');
const LEGACY_PROJECTS_STORAGE_PATH = path.join(process.cwd(), 'public', 'projects');
const DEV_PROJECTS_STORAGE_PATH = path.join(DEV_RUNTIME_STORAGE_ROOT, 'projects');
const DEFAULT_PROJECTS_STORAGE_PATH =
  process.env.NODE_ENV === 'development' ? DEV_PROJECTS_STORAGE_PATH : LEGACY_PROJECTS_STORAGE_PATH;

function isWithinPath(basePath: string, targetPath: string): boolean {
  const base = path.resolve(basePath);
  const target = path.resolve(targetPath);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function toDevSafeWritePath(candidatePath: string, fallbackLeaf: string): string {
  if (process.env.NODE_ENV !== 'development') {
    return path.resolve(candidatePath);
  }

  const resolvedCandidate = path.resolve(candidatePath);
  const workspaceRoot = path.resolve(process.cwd());
  if (isWithinPath(workspaceRoot, resolvedCandidate)) {
    return path.join(DEV_RUNTIME_STORAGE_ROOT, fallbackLeaf);
  }

  return resolvedCandidate;
}

export function getProjectsStoragePath(): string {
  const customPath = process.env.PROJECTS_STORAGE_PATH?.trim();
  if (customPath) {
    return toDevSafeWritePath(customPath, 'projects');
  }

  return DEFAULT_PROJECTS_STORAGE_PATH;
}

export function getLegacyProjectsStoragePath(): string {
  return LEGACY_PROJECTS_STORAGE_PATH;
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

export function getReadableProjectConfigPath(projectCode: string): string {
  return resolveReadableProjectPath(projectCode, 'config.json');
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

export function resolveReadableProjectPath(projectCode: string, ...segments: string[]): string {
  const primaryPath = resolveProjectPath(projectCode, ...segments);
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }

  if (hasCustomProjectsStoragePath()) {
    return primaryPath;
  }

  const legacyProjectDir = path.resolve(path.join(getLegacyProjectsStoragePath(), projectCode));
  const legacyTargetPath = path.resolve(legacyProjectDir, ...segments);

  if (
    (legacyTargetPath === legacyProjectDir || legacyTargetPath.startsWith(`${legacyProjectDir}${path.sep}`)) &&
    fs.existsSync(legacyTargetPath)
  ) {
    return legacyTargetPath;
  }

  return primaryPath;
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

  if (process.env.NODE_ENV === 'development') {
    return path.join(DEV_RUNTIME_STORAGE_ROOT, '.system', 'rate-limits');
  }

  return path.join(process.cwd(), '.data', 'rate-limits');
}
