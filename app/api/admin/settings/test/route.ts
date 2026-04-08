import { NextRequest, NextResponse } from 'next/server';
import { getAdminPassword, resolveRuntimeSetting, type RuntimeSettings } from '@/utils/runtimeSettings';

type Provider = 'gemini' | 'vertex-ai' | 'ollama' | 'vllm' | 'openai-compatible' | 'grok';
const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

function isAuthorized(request: NextRequest): boolean {
  const provided = request.headers.get('x-admin-password') || '';
  const adminPassword = getAdminPassword();
  return Boolean(adminPassword && provided && provided === adminPassword);
}

function val(input: Partial<RuntimeSettings>, key: keyof RuntimeSettings): string {
  const fromInput = (input[key] || '').trim();
  if (fromInput) return fromInput;
  return resolveRuntimeSetting(key);
}

function extractFetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'bilinmeyen baglanti hatasi';
  }

  const cause = (error as Error & { cause?: unknown }).cause as
    | { code?: string; message?: string }
    | undefined;

  const pieces = [error.message || 'fetch failed'];
  if (cause?.code) {
    pieces.push(`code=${cause.code}`);
  }
  if (cause?.message && cause.message !== error.message) {
    pieces.push(cause.message);
  }

  return pieces.join(' | ');
}

async function fetchWithProviderTimeout(endpoint: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const url = new URL(endpoint);
    const detail = extractFetchErrorMessage(error);
    throw new Error(`Saglayiciya erisilemedi (${url.host}): ${detail}`);
  }
}

async function testGemini(input: Partial<RuntimeSettings>) {
  const baseUrl = val(input, 'PANORAMA_GEMINI_API_URL') || 'https://generativelanguage.googleapis.com/v1beta';
  const model = val(input, 'PANORAMA_GEMINI_MODEL') || 'gemini-3.1-flash-image-preview';
  const apiKey = val(input, 'PANORAMA_GEMINI_API_KEY');

  if (!apiKey) {
    throw new Error('Gemini API key gerekli');
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'reply with: ok' }] }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini hata: ${response.status} ${text.slice(0, 220)}`);
  }

  return { endpoint, detail: 'Gemini baglantisi basarili' };
}

async function testVertex(input: Partial<RuntimeSettings>) {
  const apiUrl = val(input, 'PANORAMA_VERTEX_API_URL') || 'https://aiplatform.googleapis.com/v1';
  const authMode = val(input, 'PANORAMA_VERTEX_AUTH_MODE') || 'oauth';
  const projectId = val(input, 'PANORAMA_VERTEX_PROJECT_ID');
  const location = val(input, 'PANORAMA_VERTEX_LOCATION') || 'us-central1';
  const model = val(input, 'PANORAMA_VERTEX_MODEL') || 'gemini-2.5-flash';
  const accessToken = val(input, 'PANORAMA_VERTEX_ACCESS_TOKEN');
  const expressApiKey = val(input, 'PANORAMA_VERTEX_EXPRESS_API_KEY');

  if (authMode === 'express-api-key' && !expressApiKey) {
    throw new Error('Vertex Express API key gerekli');
  }

  if (authMode !== 'express-api-key' && !projectId) {
    throw new Error('Vertex project id gerekli');
  }

  if (authMode !== 'express-api-key' && !accessToken) {
    throw new Error('Vertex access token gerekli');
  }

  const endpoint = authMode === 'express-api-key'
    ? `${apiUrl.replace(/\/$/, '')}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    : `${apiUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authMode === 'express-api-key'
        ? { 'x-goog-api-key': expressApiKey }
        : { Authorization: `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'reply with: ok' }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vertex hata: ${response.status} ${text.slice(0, 220)}`);
  }

  return { endpoint, detail: 'Vertex baglantisi basarili' };
}

async function testOllama(input: Partial<RuntimeSettings>) {
  const baseUrl = val(input, 'PANORAMA_OLLAMA_BASE_URL') || 'http://localhost:11434';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;

  const response = await fetchWithProviderTimeout(endpoint, { method: 'GET' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama hata: ${response.status} ${text.slice(0, 220)}`);
  }

  return { endpoint, detail: 'Ollama baglantisi basarili' };
}

async function testOpenAICompatible(input: Partial<RuntimeSettings>, mode: 'openai-compatible' | 'vllm') {
  const baseUrl = mode === 'vllm'
    ? (val(input, 'PANORAMA_VLLM_BASE_URL') || val(input, 'PANORAMA_AI_API_URL') || 'http://localhost:8000')
    : (val(input, 'PANORAMA_AI_API_URL') || 'https://api.openai.com');

  if (!baseUrl) {
    throw new Error('Base URL gerekli');
  }

  const apiKey = mode === 'vllm'
    ? (val(input, 'PANORAMA_VLLM_API_KEY') || val(input, 'PANORAMA_AI_API_KEY'))
    : val(input, 'PANORAMA_AI_API_KEY');

  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/models`;
  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'GET',
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${mode} hata: ${response.status} ${text.slice(0, 220)}`);
  }

  return { endpoint, detail: `${mode} baglantisi basarili` };
}

async function testGrok(input: Partial<RuntimeSettings>) {
  const baseUrl = val(input, 'PANORAMA_GROK_API_URL') || 'https://api.x.ai';
  const apiKey = val(input, 'PANORAMA_GROK_API_KEY');

  if (!apiKey) {
    throw new Error('Grok API key gerekli');
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/models`;
  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`grok hata: ${response.status} ${text.slice(0, 220)}`);
  }

  return { endpoint, detail: 'grok baglantisi basarili' };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz erisim' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      provider?: string;
      settings?: Partial<RuntimeSettings>;
    };

    const input = body.settings || {};
    const provider = ((body.provider || val(input, 'PANORAMA_AI_PROVIDER') || 'gemini').trim()) as Provider;

    const start = Date.now();

    const result =
      provider === 'gemini'
        ? await testGemini(input)
        : provider === 'vertex-ai'
          ? await testVertex(input)
        : provider === 'ollama'
          ? await testOllama(input)
          : provider === 'grok'
            ? await testGrok(input)
          : provider === 'vllm'
            ? await testOpenAICompatible(input, 'vllm')
            : await testOpenAICompatible(input, 'openai-compatible');

    return NextResponse.json({
      success: true,
      provider,
      endpoint: result.endpoint,
      detail: result.detail,
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test basarisiz';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
