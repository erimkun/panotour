import { NextRequest, NextResponse } from 'next/server';
import { resolveRuntimeSetting } from '@/utils/runtimeSettings';

const MIN_FILES = 4;
const MAX_FILES = 16;

type PanoramaProvider = 'openai-compatible' | 'ollama' | 'vllm' | 'grok' | 'vertex-ai';
type AllPanoramaProvider = PanoramaProvider | 'gemini';

interface ProviderConfig {
  provider: AllPanoramaProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  accessToken?: string;
  vertexAuthMode?: 'oauth' | 'express-api-key';
  expressApiKey?: string;
  projectId?: string;
  location?: string;
}

function parseTimeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = parseTimeoutMs(process.env.PANORAMA_PROVIDER_TIMEOUT_MS, 120_000);
const LONG_PROVIDER_FETCH_TIMEOUT_MS = parseTimeoutMs(process.env.PANORAMA_LONG_PROVIDER_TIMEOUT_MS, 480_000);

function resolveProviderTimeoutMs(provider: AllPanoramaProvider, imageCount: number): number {
  if (provider === 'gemini' || provider === 'vertex-ai') {
    // Large multimodal requests may take several minutes on hosted models.
    const adaptive = 120_000 + imageCount * 30_000;
    return Math.max(DEFAULT_PROVIDER_FETCH_TIMEOUT_MS, Math.min(LONG_PROVIDER_FETCH_TIMEOUT_MS, adaptive));
  }

  return DEFAULT_PROVIDER_FETCH_TIMEOUT_MS;
}

function hasValue(value: string): boolean {
  return Boolean(value && value.trim());
}

function detectMimeTypeFromBase64(base64: string): string | null {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized) return null;

  try {
    const sample = Buffer.from(normalized.slice(0, 128), 'base64');

    if (
      sample.length >= 8 &&
      sample[0] === 0x89 &&
      sample[1] === 0x50 &&
      sample[2] === 0x4e &&
      sample[3] === 0x47 &&
      sample[4] === 0x0d &&
      sample[5] === 0x0a &&
      sample[6] === 0x1a &&
      sample[7] === 0x0a
    ) {
      return 'image/png';
    }

    if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) {
      return 'image/jpeg';
    }

    if (
      sample.length >= 12 &&
      sample[0] === 0x52 &&
      sample[1] === 0x49 &&
      sample[2] === 0x46 &&
      sample[3] === 0x46 &&
      sample[8] === 0x57 &&
      sample[9] === 0x45 &&
      sample[10] === 0x42 &&
      sample[11] === 0x50
    ) {
      return 'image/webp';
    }
  } catch {
    return null;
  }

  return null;
}

function resolveMimeType(preferredMimeType: string | undefined, base64: string): string {
  const inferred = detectMimeTypeFromBase64(base64);
  if (!preferredMimeType) {
    return inferred || 'image/jpeg';
  }

  if (inferred && preferredMimeType.toLowerCase() !== inferred.toLowerCase()) {
    return inferred;
  }

  return preferredMimeType;
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

async function fetchWithProviderTimeout(endpoint: string, init: RequestInit, timeoutMs = DEFAULT_PROVIDER_FETCH_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const url = new URL(endpoint);
    const detail = extractFetchErrorMessage(error);
    throw new Error(`Saglayiciya erisilemedi (${url.host}): ${detail}`);
  }
}

function stripDataPrefix(value: string): { mimeType: string; base64: string } {
  const dataUrlMatch = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] };
  }

  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new Error('Model cikti formati gecersiz');
  }
  const base64 = normalized.replace(/\s+/g, '');
  return { mimeType: resolveMimeType('image/jpeg', base64), base64 };
}

function extractBase64Image(rawText: string): { mimeType: string; base64: string } {
  const fencedJsonMatch = rawText.match(/```json\s*([\s\S]*?)```/i);
  const text = fencedJsonMatch ? fencedJsonMatch[1] : rawText;

  try {
    const parsed = JSON.parse(text) as {
      panorama_base64?: string;
      image_base64?: string;
      image?: string;
      mime_type?: string;
    };

    const candidate = parsed.panorama_base64 || parsed.image_base64 || parsed.image;
    if (!candidate) {
      throw new Error('JSON ciktisinda panorama_base64 alani yok');
    }

    const normalized = stripDataPrefix(candidate);
    return {
      mimeType: resolveMimeType(parsed.mime_type || normalized.mimeType, normalized.base64),
      base64: normalized.base64,
    };
  } catch {
    const dataUrlMatch = text.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) {
      return { mimeType: resolveMimeType(dataUrlMatch[1], dataUrlMatch[2]), base64: dataUrlMatch[2] };
    }

    const rawBase64Match = text.match(/([A-Za-z0-9+/]{800,}={0,2})/);
    if (rawBase64Match) {
      return {
        mimeType: resolveMimeType('image/jpeg', rawBase64Match[1]),
        base64: rawBase64Match[1],
      };
    }

    throw new Error('Model cevabindan panorama goruntusu ayristirilamadi');
  }
}

function buildProviderConfig(requestedProvider: string | null): ProviderConfig {
  const envProvider = resolveRuntimeSetting('PANORAMA_AI_PROVIDER');
  const runtimeGeminiKey = resolveRuntimeSetting('PANORAMA_GEMINI_API_KEY');
  const runtimeVertexToken = resolveRuntimeSetting('PANORAMA_VERTEX_ACCESS_TOKEN');
  const runtimeVertexExpressKey = resolveRuntimeSetting('PANORAMA_VERTEX_EXPRESS_API_KEY');
  const runtimeVertexProjectId = resolveRuntimeSetting('PANORAMA_VERTEX_PROJECT_ID');
  const runtimeVertexAuthMode = resolveRuntimeSetting('PANORAMA_VERTEX_AUTH_MODE') || 'oauth';

  let resolvedProvider = (requestedProvider === 'env' ? envProvider : requestedProvider) || envProvider;

  if (requestedProvider === 'env') {
    const hasVertexCredentials = runtimeVertexAuthMode === 'express-api-key'
      ? hasValue(runtimeVertexExpressKey)
      : hasValue(runtimeVertexToken) && hasValue(runtimeVertexProjectId);

    if (resolvedProvider === 'gemini' && !hasValue(runtimeGeminiKey) && hasVertexCredentials) {
      resolvedProvider = 'vertex-ai';
    }
  }

  if (resolvedProvider === 'ollama') {
    return {
      provider: 'ollama',
      baseUrl: resolveRuntimeSetting('PANORAMA_OLLAMA_BASE_URL') || 'http://localhost:11434',
      model: resolveRuntimeSetting('PANORAMA_OLLAMA_MODEL') || 'llava:latest',
    };
  }

  if (resolvedProvider === 'vllm') {
    return {
      provider: 'vllm',
      baseUrl: resolveRuntimeSetting('PANORAMA_VLLM_BASE_URL') || resolveRuntimeSetting('PANORAMA_AI_API_URL') || 'http://localhost:8000',
      model: resolveRuntimeSetting('PANORAMA_VLLM_MODEL') || resolveRuntimeSetting('PANORAMA_AI_MODEL'),
      apiKey: resolveRuntimeSetting('PANORAMA_VLLM_API_KEY') || resolveRuntimeSetting('PANORAMA_AI_API_KEY') || undefined,
    };
  }

  if (resolvedProvider === 'gemini') {
    return {
      provider: 'gemini',
      baseUrl: resolveRuntimeSetting('PANORAMA_GEMINI_API_URL') || 'https://generativelanguage.googleapis.com/v1beta',
      model: resolveRuntimeSetting('PANORAMA_GEMINI_MODEL') || 'gemini-3.1-flash-image-preview',
      apiKey: runtimeGeminiKey || undefined,
    };
  }

  if (resolvedProvider === 'vertex-ai') {
    const authMode = runtimeVertexAuthMode;
    return {
      provider: 'vertex-ai',
      baseUrl: resolveRuntimeSetting('PANORAMA_VERTEX_API_URL') || 'https://aiplatform.googleapis.com/v1',
      model: resolveRuntimeSetting('PANORAMA_VERTEX_MODEL') || 'gemini-2.5-flash',
      vertexAuthMode: authMode === 'express-api-key' ? 'express-api-key' : 'oauth',
      expressApiKey: runtimeVertexExpressKey || undefined,
      projectId: runtimeVertexProjectId || undefined,
      location: resolveRuntimeSetting('PANORAMA_VERTEX_LOCATION') || 'us-central1',
      accessToken: runtimeVertexToken || undefined,
    };
  }

  if (resolvedProvider === 'grok') {
    return {
      provider: 'grok',
      baseUrl: resolveRuntimeSetting('PANORAMA_GROK_API_URL') || 'https://api.x.ai',
      model: resolveRuntimeSetting('PANORAMA_GROK_MODEL') || 'grok-2-vision-latest',
      apiKey: resolveRuntimeSetting('PANORAMA_GROK_API_KEY') || undefined,
    };
  }

  return {
    provider: 'openai-compatible',
    baseUrl: resolveRuntimeSetting('PANORAMA_AI_API_URL') || 'https://api.openai.com',
    model: resolveRuntimeSetting('PANORAMA_AI_MODEL') || 'gpt-4.1-mini',
    apiKey: resolveRuntimeSetting('PANORAMA_AI_API_KEY') || undefined,
  };
}

function assertProviderConfig(config: ProviderConfig) {
  if (!config.baseUrl) {
    throw new Error('Saglayici base URL eksik. .env icinde ilgili PANORAMA_* URL degerini girin.');
  }

  if (!config.model) {
    throw new Error('Model adi eksik. .env icinde ilgili PANORAMA_* MODEL degerini girin.');
  }

  if (config.provider === 'gemini' && !config.apiKey) {
    throw new Error('Gemini icin PANORAMA_GEMINI_API_KEY gerekli.');
  }

  if (config.provider === 'grok' && !config.apiKey) {
    throw new Error('Grok icin PANORAMA_GROK_API_KEY gerekli.');
  }

  if (config.provider === 'vertex-ai' && config.vertexAuthMode !== 'express-api-key' && !config.projectId) {
    throw new Error('Vertex icin PANORAMA_VERTEX_PROJECT_ID gerekli.');
  }

  if (config.provider === 'vertex-ai' && config.vertexAuthMode !== 'express-api-key' && !config.accessToken) {
    throw new Error('Vertex icin PANORAMA_VERTEX_ACCESS_TOKEN gerekli.');
  }

  if (config.provider === 'vertex-ai' && config.vertexAuthMode === 'express-api-key' && !config.expressApiKey) {
    throw new Error('Vertex express mode icin PANORAMA_VERTEX_EXPRESS_API_KEY gerekli.');
  }
}

function buildInstruction(prompt: string, count: number): string {
  return [
    `Kullanici ayni mekani farkli acilardan cekilen ${count} adet fotograf gonderdi.`,
    'ANA GOREV: Bu fotograflari tek bir 2:1 oranli equirectangular panorama goruntusune birlestir.',
    'KRITIK KURAL: Sahnedeki hicbir seyi degistirme. Nesne ekleme, nesne silme, nesne tasima, yeniden tasarlama, stilize etme, hayali detay uretme yok.',
    'KRITIK KURAL: Mekanin gercek geometrisini, perspektifini, olcegini, doku ve renk tutarliligini koru.',
    'KRITIK KURAL: Yalnizca verilen acilari birlestir; eksik bolgelerde de gercege en yakin tutarli devam uret, dikkat cekici yapay icerik ekleme.',
    'KALITE: Dikis izleri, hayaletlenme ve deformasyonu minimuma indir; sonuc tek bir gercekci oda panoramasi olsun.',
    'CIKTI FORMATI: Sadece JSON don. Alanlar: panorama_base64 ve mime_type.',
    'CIKTI FORMATI: panorama_base64 sadece base64 icerigi olmali; aciklama, markdown, kod blogu veya ek metin yazma.',
    `KULLANICI NOTU: ${prompt}`,
  ].join(' ');
}

async function requestOpenAICompatible(config: ProviderConfig, prompt: string, images: string[]) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const content = [
    {
      type: 'text',
      text: prompt,
    },
    ...images.map(image => ({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${image}`,
      },
    })),
  ];

  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
    }),
  }, resolveProviderTimeoutMs(config.provider, images.length));

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Model istegi basarisiz: ${text.slice(0, 400)}`);
  }

  const parsed = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const contentText = parsed.choices?.[0]?.message?.content;
  if (!contentText) {
    throw new Error('Model bos cevap dondu');
  }

  return extractBase64Image(contentText);
}

async function requestOllama(config: ProviderConfig, prompt: string, images: string[]) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/api/chat`;

  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      format: 'json',
      stream: false,
      messages: [
        {
          role: 'user',
          content: prompt,
          images,
        },
      ],
    }),
  }, resolveProviderTimeoutMs(config.provider, images.length));

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama istegi basarisiz: ${text.slice(0, 400)}`);
  }

  const parsed = JSON.parse(text) as { message?: { content?: string } };
  const contentText = parsed.message?.content;
  if (!contentText) {
    throw new Error('Ollama bos cevap dondu');
  }

  return extractBase64Image(contentText);
}

async function requestGemini(config: ProviderConfig, prompt: string, images: string[]) {
  const endpointBase = config.baseUrl.replace(/\/$/, '');
  const endpoint = `${endpointBase}/models/${encodeURIComponent(config.model)}:generateContent`;

  const parts = [
    { text: prompt },
    ...images.map(image => ({
      inline_data: {
        mime_type: 'image/jpeg',
        data: image,
      },
    })),
  ];

  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'x-goog-api-key': config.apiKey } : {}),
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  }, resolveProviderTimeoutMs(config.provider, images.length));

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini istegi basarisiz: ${text.slice(0, 400)}`);
  }

  const parsed = JSON.parse(text) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
  };

  const partsOut = parsed.candidates?.[0]?.content?.parts || [];
  for (const part of partsOut) {
    const inlineA = part.inlineData;
    if (inlineA?.data) {
      return {
        mimeType: resolveMimeType(inlineA.mimeType || 'image/jpeg', inlineA.data),
        base64: inlineA.data,
      };
    }

    const inlineB = part.inline_data;
    if (inlineB?.data) {
      return {
        mimeType: resolveMimeType(inlineB.mime_type || 'image/jpeg', inlineB.data),
        base64: inlineB.data,
      };
    }
  }

  const textPart = partsOut.map(part => part.text || '').find(Boolean);
  if (!textPart) {
    throw new Error('Gemini bos cevap dondu');
  }

  return extractBase64Image(textPart);
}

async function requestVertex(config: ProviderConfig, prompt: string, images: string[]) {
  const endpointBase = config.baseUrl.replace(/\/$/, '');
  const endpoint = config.vertexAuthMode === 'express-api-key'
    ? `${endpointBase}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`
    : `${endpointBase}/projects/${encodeURIComponent(config.projectId || '')}/locations/${encodeURIComponent(config.location || 'us-central1')}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`;

  const parts = [
    { text: prompt },
    ...images.map(image => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: image,
      },
    })),
  ];

  const response = await fetchWithProviderTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.vertexAuthMode === 'express-api-key'
        ? (config.expressApiKey ? { 'x-goog-api-key': config.expressApiKey } : {})
        : (config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {})),
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  }, resolveProviderTimeoutMs(config.provider, images.length));

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vertex istegi basarisiz: ${text.slice(0, 400)}`);
  }

  const parsed = JSON.parse(text) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
  };

  const partsOut = parsed.candidates?.[0]?.content?.parts || [];
  for (const part of partsOut) {
    const inlineA = part.inlineData;
    if (inlineA?.data) {
      return {
        mimeType: resolveMimeType(inlineA.mimeType || 'image/jpeg', inlineA.data),
        base64: inlineA.data,
      };
    }

    const inlineB = part.inline_data;
    if (inlineB?.data) {
      return {
        mimeType: resolveMimeType(inlineB.mime_type || 'image/jpeg', inlineB.data),
        base64: inlineB.data,
      };
    }
  }

  const textPart = partsOut.map(part => part.text || '').find(Boolean);
  if (!textPart) {
    throw new Error('Vertex bos cevap dondu');
  }

  return extractBase64Image(textPart);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const provider = String(formData.get('provider') || 'env');
    const userPrompt = String(formData.get('prompt') || '').trim();

    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File && entry.type.startsWith('image/'));

    if (files.length < MIN_FILES || files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Lutfen ${MIN_FILES}-${MAX_FILES} arasi gecerli fotograf gonderin.` },
        { status: 400 }
      );
    }

    const imageBuffers = await Promise.all(
      files.map(async file => Buffer.from(await file.arrayBuffer()).toString('base64'))
    );

    const instruction = buildInstruction(
      userPrompt ||
        'Goruntunun geometri ve perspektif butunlugunu koru. Dikis izlerini ve hayaletlenmeyi minimumda tut.',
      files.length
    );

    const providerConfig = buildProviderConfig(provider);
    assertProviderConfig(providerConfig);

    const result =
      providerConfig.provider === 'ollama'
        ? await requestOllama(providerConfig, instruction, imageBuffers)
        : providerConfig.provider === 'gemini'
          ? await requestGemini(providerConfig, instruction, imageBuffers)
          : providerConfig.provider === 'vertex-ai'
            ? await requestVertex(providerConfig, instruction, imageBuffers)
          : await requestOpenAICompatible(providerConfig, instruction, imageBuffers);

    return NextResponse.json({
      success: true,
      imageBase64: result.base64,
      mimeType: result.mimeType,
      provider: providerConfig.provider,
      imageCount: files.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Panorama olusturma hatasi';
    console.error('[PANORAMA-GENERATE] Error:', error);
    const lower = message.toLowerCase();
    const isTimeout = lower.includes('timeout') || lower.includes('aborted');
    const isConnectivity = lower.includes('saglayiciya erisilemedi');

    const status = isTimeout ? 504 : isConnectivity ? 502 : 500;
    const errorMessage = isTimeout
      ? `${message}. Islem zaman asimina ugradi; daha az resimle ya da daha kucuk gorsellerle tekrar deneyin.`
      : message;

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
