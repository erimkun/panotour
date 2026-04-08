export interface RuntimeSettings {
  ADMIN_PASSWORD?: string;
  EDIT_SECRET?: string;
  PANORAMA_AI_PROVIDER?: string;
  PANORAMA_AI_API_URL?: string;
  PANORAMA_AI_MODEL?: string;
  PANORAMA_AI_API_KEY?: string;
  PANORAMA_OLLAMA_BASE_URL?: string;
  PANORAMA_OLLAMA_MODEL?: string;
  PANORAMA_VLLM_BASE_URL?: string;
  PANORAMA_VLLM_MODEL?: string;
  PANORAMA_VLLM_API_KEY?: string;
  PANORAMA_GEMINI_API_KEY?: string;
  PANORAMA_GEMINI_MODEL?: string;
  PANORAMA_GEMINI_API_URL?: string;
  PANORAMA_GROK_API_KEY?: string;
  PANORAMA_GROK_MODEL?: string;
  PANORAMA_GROK_API_URL?: string;
  PANORAMA_VERTEX_API_URL?: string;
  PANORAMA_VERTEX_PROJECT_ID?: string;
  PANORAMA_VERTEX_LOCATION?: string;
  PANORAMA_VERTEX_MODEL?: string;
  PANORAMA_VERTEX_ACCESS_TOKEN?: string;
  PANORAMA_VERTEX_AUTH_MODE?: string;
  PANORAMA_VERTEX_EXPRESS_API_KEY?: string;
}

let sessionSettings: RuntimeSettings = {};

function sanitize(settings: Record<string, unknown>): RuntimeSettings {
  const allowedKeys: Array<keyof RuntimeSettings> = [
    'ADMIN_PASSWORD',
    'EDIT_SECRET',
    'PANORAMA_AI_PROVIDER',
    'PANORAMA_AI_API_URL',
    'PANORAMA_AI_MODEL',
    'PANORAMA_AI_API_KEY',
    'PANORAMA_OLLAMA_BASE_URL',
    'PANORAMA_OLLAMA_MODEL',
    'PANORAMA_VLLM_BASE_URL',
    'PANORAMA_VLLM_MODEL',
    'PANORAMA_VLLM_API_KEY',
    'PANORAMA_GEMINI_API_KEY',
    'PANORAMA_GEMINI_MODEL',
    'PANORAMA_GEMINI_API_URL',
    'PANORAMA_GROK_API_KEY',
    'PANORAMA_GROK_MODEL',
    'PANORAMA_GROK_API_URL',
    'PANORAMA_VERTEX_API_URL',
    'PANORAMA_VERTEX_PROJECT_ID',
    'PANORAMA_VERTEX_LOCATION',
    'PANORAMA_VERTEX_MODEL',
    'PANORAMA_VERTEX_ACCESS_TOKEN',
    'PANORAMA_VERTEX_AUTH_MODE',
    'PANORAMA_VERTEX_EXPRESS_API_KEY',
  ];

  const next: RuntimeSettings = {};
  for (const key of allowedKeys) {
    const value = settings[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        next[key] = trimmed;
      }
    }
  }

  return next;
}

export function getRuntimeSettings(): RuntimeSettings {
  return { ...sessionSettings };
}

export function saveRuntimeSettings(input: Partial<RuntimeSettings>): RuntimeSettings {
  const merged = sanitize({ ...sessionSettings, ...input });
  sessionSettings = merged;

  // Mirror runtime settings into process.env so other route handlers can read
  // the same values even when module-level memory isn't shared reliably.
  for (const [key, value] of Object.entries(sessionSettings)) {
    if (value) {
      process.env[key] = value;
    }
  }

  return { ...sessionSettings };
}

export function resolveRuntimeSetting(key: keyof RuntimeSettings): string {
  const runtime = getRuntimeSettings();
  const fromRuntime = runtime[key]?.trim();
  if (fromRuntime) {
    return fromRuntime;
  }

  const fromEnv = process.env[key]?.trim();
  return fromEnv || '';
}

export function getAdminPassword(): string {
  return resolveRuntimeSetting('ADMIN_PASSWORD');
}

export function getEditSecret(): string {
  return resolveRuntimeSetting('EDIT_SECRET');
}

export function getRuntimeSettingsForAdmin(): RuntimeSettings {
  const runtime = getRuntimeSettings();
  return {
    ADMIN_PASSWORD: runtime.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '',
    EDIT_SECRET: runtime.EDIT_SECRET || process.env.EDIT_SECRET || '',
    PANORAMA_AI_PROVIDER: runtime.PANORAMA_AI_PROVIDER || process.env.PANORAMA_AI_PROVIDER || '',
    PANORAMA_AI_API_URL: runtime.PANORAMA_AI_API_URL || process.env.PANORAMA_AI_API_URL || '',
    PANORAMA_AI_MODEL: runtime.PANORAMA_AI_MODEL || process.env.PANORAMA_AI_MODEL || '',
    PANORAMA_AI_API_KEY: runtime.PANORAMA_AI_API_KEY || process.env.PANORAMA_AI_API_KEY || '',
    PANORAMA_OLLAMA_BASE_URL: runtime.PANORAMA_OLLAMA_BASE_URL || process.env.PANORAMA_OLLAMA_BASE_URL || '',
    PANORAMA_OLLAMA_MODEL: runtime.PANORAMA_OLLAMA_MODEL || process.env.PANORAMA_OLLAMA_MODEL || '',
    PANORAMA_VLLM_BASE_URL: runtime.PANORAMA_VLLM_BASE_URL || process.env.PANORAMA_VLLM_BASE_URL || '',
    PANORAMA_VLLM_MODEL: runtime.PANORAMA_VLLM_MODEL || process.env.PANORAMA_VLLM_MODEL || '',
    PANORAMA_VLLM_API_KEY: runtime.PANORAMA_VLLM_API_KEY || process.env.PANORAMA_VLLM_API_KEY || '',
    PANORAMA_GEMINI_API_KEY: runtime.PANORAMA_GEMINI_API_KEY || process.env.PANORAMA_GEMINI_API_KEY || '',
    PANORAMA_GEMINI_MODEL: runtime.PANORAMA_GEMINI_MODEL || process.env.PANORAMA_GEMINI_MODEL || '',
    PANORAMA_GEMINI_API_URL: runtime.PANORAMA_GEMINI_API_URL || process.env.PANORAMA_GEMINI_API_URL || '',
    PANORAMA_GROK_API_KEY: runtime.PANORAMA_GROK_API_KEY || process.env.PANORAMA_GROK_API_KEY || '',
    PANORAMA_GROK_MODEL: runtime.PANORAMA_GROK_MODEL || process.env.PANORAMA_GROK_MODEL || '',
    PANORAMA_GROK_API_URL: runtime.PANORAMA_GROK_API_URL || process.env.PANORAMA_GROK_API_URL || '',
    PANORAMA_VERTEX_API_URL: runtime.PANORAMA_VERTEX_API_URL || process.env.PANORAMA_VERTEX_API_URL || '',
    PANORAMA_VERTEX_PROJECT_ID: runtime.PANORAMA_VERTEX_PROJECT_ID || process.env.PANORAMA_VERTEX_PROJECT_ID || '',
    PANORAMA_VERTEX_LOCATION: runtime.PANORAMA_VERTEX_LOCATION || process.env.PANORAMA_VERTEX_LOCATION || '',
    PANORAMA_VERTEX_MODEL: runtime.PANORAMA_VERTEX_MODEL || process.env.PANORAMA_VERTEX_MODEL || '',
    PANORAMA_VERTEX_ACCESS_TOKEN: runtime.PANORAMA_VERTEX_ACCESS_TOKEN || process.env.PANORAMA_VERTEX_ACCESS_TOKEN || '',
    PANORAMA_VERTEX_AUTH_MODE: runtime.PANORAMA_VERTEX_AUTH_MODE || process.env.PANORAMA_VERTEX_AUTH_MODE || '',
    PANORAMA_VERTEX_EXPRESS_API_KEY: runtime.PANORAMA_VERTEX_EXPRESS_API_KEY || process.env.PANORAMA_VERTEX_EXPRESS_API_KEY || '',
  };
}
