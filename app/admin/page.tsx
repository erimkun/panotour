'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, CheckCircle, XCircle, RefreshCw, ExternalLink, Pencil, FlaskConical } from 'lucide-react';
import WebGLBackground from '@/components/WebGLBackground';

interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  source: 'local' | 'blob';
  status: 'draft' | 'published';
}

interface AdminRuntimeSettings {
  PANORAMA_AI_PROVIDER: string;
  PANORAMA_AI_API_URL: string;
  PANORAMA_AI_MODEL: string;
  PANORAMA_AI_API_KEY: string;
  PANORAMA_OLLAMA_BASE_URL: string;
  PANORAMA_OLLAMA_MODEL: string;
  PANORAMA_VLLM_BASE_URL: string;
  PANORAMA_VLLM_MODEL: string;
  PANORAMA_VLLM_API_KEY: string;
  PANORAMA_GEMINI_API_KEY: string;
  PANORAMA_GEMINI_MODEL: string;
  PANORAMA_GEMINI_API_URL: string;
  PANORAMA_GROK_API_KEY: string;
  PANORAMA_GROK_MODEL: string;
  PANORAMA_GROK_API_URL: string;
  PANORAMA_VERTEX_API_URL: string;
  PANORAMA_VERTEX_PROJECT_ID: string;
  PANORAMA_VERTEX_LOCATION: string;
  PANORAMA_VERTEX_MODEL: string;
  PANORAMA_VERTEX_ACCESS_TOKEN: string;
  PANORAMA_VERTEX_AUTH_MODE: string;
  PANORAMA_VERTEX_EXPRESS_API_KEY: string;
}

const EMPTY_RUNTIME_SETTINGS: AdminRuntimeSettings = {
  PANORAMA_AI_PROVIDER: '',
  PANORAMA_AI_API_URL: '',
  PANORAMA_AI_MODEL: '',
  PANORAMA_AI_API_KEY: '',
  PANORAMA_OLLAMA_BASE_URL: '',
  PANORAMA_OLLAMA_MODEL: '',
  PANORAMA_VLLM_BASE_URL: '',
  PANORAMA_VLLM_MODEL: '',
  PANORAMA_VLLM_API_KEY: '',
  PANORAMA_GEMINI_API_KEY: '',
  PANORAMA_GEMINI_MODEL: '',
  PANORAMA_GEMINI_API_URL: '',
  PANORAMA_GROK_API_KEY: '',
  PANORAMA_GROK_MODEL: '',
  PANORAMA_GROK_API_URL: '',
  PANORAMA_VERTEX_API_URL: '',
  PANORAMA_VERTEX_PROJECT_ID: '',
  PANORAMA_VERTEX_LOCATION: '',
  PANORAMA_VERTEX_MODEL: '',
  PANORAMA_VERTEX_ACCESS_TOKEN: '',
  PANORAMA_VERTEX_AUTH_MODE: '',
  PANORAMA_VERTEX_EXPRESS_API_KEY: '',
};

const PROVIDER_OPTIONS = ['gemini', 'vertex-ai', 'ollama', 'vllm', 'openai-compatible', 'grok'] as const;
type ProviderOption = (typeof PROVIDER_OPTIONS)[number];
type VertexAuthMode = 'oauth' | 'express-api-key';

const PROVIDER_MODELS: Record<ProviderOption, string[]> = {
  gemini: ['gemini-3.1-flash-image-preview', 'gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash'],
  'vertex-ai': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-001'],
  ollama: ['llava:latest', 'llama3.2-vision', 'qwen2.5vl:latest'],
  vllm: ['Qwen/Qwen2.5-VL-7B-Instruct', 'meta-llama/Llama-3.2-11B-Vision-Instruct'],
  'openai-compatible': ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1'],
  grok: ['grok-2-vision-latest', 'grok-2-latest'],
};

function applyProviderDefaults(settings: AdminRuntimeSettings): AdminRuntimeSettings {
  const provider = PROVIDER_OPTIONS.includes(settings.PANORAMA_AI_PROVIDER as ProviderOption)
    ? (settings.PANORAMA_AI_PROVIDER as ProviderOption)
    : 'gemini';

  const next = { ...settings, PANORAMA_AI_PROVIDER: provider };

  if (provider === 'gemini') {
    next.PANORAMA_GEMINI_API_URL = next.PANORAMA_GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
    next.PANORAMA_GEMINI_MODEL = next.PANORAMA_GEMINI_MODEL || PROVIDER_MODELS.gemini[0];
  }

  if (provider === 'vertex-ai') {
    next.PANORAMA_VERTEX_API_URL = next.PANORAMA_VERTEX_API_URL || 'https://aiplatform.googleapis.com/v1';
    next.PANORAMA_VERTEX_LOCATION = next.PANORAMA_VERTEX_LOCATION || 'us-central1';
    next.PANORAMA_VERTEX_MODEL = next.PANORAMA_VERTEX_MODEL || PROVIDER_MODELS['vertex-ai'][0];
    next.PANORAMA_VERTEX_AUTH_MODE = next.PANORAMA_VERTEX_AUTH_MODE || 'oauth';
  }

  if (provider === 'openai-compatible') {
    next.PANORAMA_AI_API_URL = next.PANORAMA_AI_API_URL || 'https://api.openai.com';
    next.PANORAMA_AI_MODEL = next.PANORAMA_AI_MODEL || PROVIDER_MODELS['openai-compatible'][0];
  }

  if (provider === 'ollama') {
    next.PANORAMA_OLLAMA_BASE_URL = next.PANORAMA_OLLAMA_BASE_URL || 'http://localhost:11434';
    next.PANORAMA_OLLAMA_MODEL = next.PANORAMA_OLLAMA_MODEL || PROVIDER_MODELS.ollama[0];
  }

  if (provider === 'vllm') {
    next.PANORAMA_VLLM_BASE_URL = next.PANORAMA_VLLM_BASE_URL || 'http://localhost:8000';
    next.PANORAMA_VLLM_MODEL = next.PANORAMA_VLLM_MODEL || PROVIDER_MODELS.vllm[0];
  }

  if (provider === 'grok') {
    next.PANORAMA_GROK_API_URL = next.PANORAMA_GROK_API_URL || 'https://api.x.ai';
    next.PANORAMA_GROK_MODEL = next.PANORAMA_GROK_MODEL || PROVIDER_MODELS.grok[0];
  }

  return next;
}

export default function AdminPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [newProjectCode, setNewProjectCode] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingSettings, setTestingSettings] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [runtimeSettings, setRuntimeSettings] = useState<AdminRuntimeSettings>(EMPTY_RUNTIME_SETTINGS);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const normalizedProjectCode = newProjectCode.trim().toLowerCase().replace(/\s+/g, '-');

  const loadProjects = async () => {
    if (!password) {
      return;
    }

    setLoadingProjects(true);
    try {
      const response = await fetch('/api/admin/projects', {
        headers: {
          'x-admin-password': password,
        },
      });

      if (!response.ok) {
        throw new Error('Projeler alinamadi');
      }

      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Project list error:', error);
      setMessage({ type: 'error', text: 'Proje listesi alinamadi.' });
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadRuntimeSettings = async () => {
    if (!password) {
      return;
    }

    setLoadingSettings(true);
    try {
      const response = await fetch('/api/admin/settings', {
        headers: {
          'x-admin-password': password,
        },
      });

      if (!response.ok) {
        throw new Error('Ayarlar alinamadi');
      }

      const data = (await response.json()) as Partial<AdminRuntimeSettings>;
      setRuntimeSettings(applyProviderDefaults({ ...EMPTY_RUNTIME_SETTINGS, ...data }));
    } catch (error) {
      console.error('Settings load error:', error);
      setMessage({ type: 'error', text: 'AI ayarlari alinamadi.' });
    } finally {
      setLoadingSettings(false);
    }
  };

  const saveRuntimeSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setMessage({ type: 'error', text: 'Admin sifresi gerekli.' });
      return;
    }

    setSavingSettings(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(runtimeSettings),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Ayarlar kaydedilemedi');
      }

      setMessage({
        type: 'success',
        text: 'AI ayarlari sadece bu sunucu oturumu icin uygulandi. Sunucu restart olursa sifirlanir.',
      });
    } catch (error) {
      console.error('Settings save error:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Ayarlar kaydedilemedi.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const selectedProvider = PROVIDER_OPTIONS.includes(runtimeSettings.PANORAMA_AI_PROVIDER as ProviderOption)
    ? (runtimeSettings.PANORAMA_AI_PROVIDER as ProviderOption)
    : 'gemini';

  const selectedVertexAuthMode: VertexAuthMode = runtimeSettings.PANORAMA_VERTEX_AUTH_MODE === 'express-api-key'
    ? 'express-api-key'
    : 'oauth';

  const handleProviderChange = (provider: ProviderOption) => {
    setRuntimeSettings(prev => applyProviderDefaults({ ...prev, PANORAMA_AI_PROVIDER: provider }));
    setTestMessage(null);
  };

  const handleModelChange = (model: string) => {
    setRuntimeSettings(prev => {
      const next = { ...prev };
      if (selectedProvider === 'gemini') next.PANORAMA_GEMINI_MODEL = model;
      else if (selectedProvider === 'vertex-ai') next.PANORAMA_VERTEX_MODEL = model;
      else if (selectedProvider === 'ollama') next.PANORAMA_OLLAMA_MODEL = model;
      else if (selectedProvider === 'vllm') next.PANORAMA_VLLM_MODEL = model;
      else if (selectedProvider === 'grok') next.PANORAMA_GROK_MODEL = model;
      else next.PANORAMA_AI_MODEL = model;
      return next;
    });
  };

  const runSettingsTest = async () => {
    if (!password) {
      setTestMessage({ type: 'error', text: 'Test icin admin sifresi gerekli.' });
      return;
    }

    setTestingSettings(true);
    setTestMessage(null);
    try {
      const response = await fetch('/api/admin/settings/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ provider: selectedProvider, settings: runtimeSettings }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Endpoint testi basarisiz');
      }

      setTestMessage({
        type: 'success',
        text: `${payload.provider} baglandi (${payload.latencyMs} ms)`,
      });
    } catch (error) {
      setTestMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Test hatasi',
      });
    } finally {
      setTestingSettings(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadProjects();
      void loadRuntimeSettings();
    }
  }, [isAuthenticated]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        setMessage({ type: 'success', text: 'Giriş başarılı! 🎉' });
      } else {
        setMessage({ type: 'error', text: 'Yanlış şifre!' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bir hata oluştu.' });
    }
  };

  const handleCreateProject = () => {
    if (!normalizedProjectCode) {
      setMessage({ type: 'error', text: 'Yeni proje için proje kodu girin.' });
      return;
    }

    if (projects.some(project => project.id === normalizedProjectCode)) {
      setMessage({ type: 'error', text: 'Bu proje kodu zaten var. Mevcut projeyi listeden edit edin.' });
      return;
    }

    router.push(`/${encodeURIComponent(normalizedProjectCode)}/edit`);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const projectCode = file.name.replace('.zip', '').replace(/\s+/g, '-').toLowerCase();

      if (projects.some(project => project.id === projectCode)) {
        setMessage({ type: 'error', text: 'Bu zip proje kodu zaten var. Aynı kodla yeni yükleme engellendi.' });
        return;
      }

      setMessage({ type: 'success', text: 'Zip yükleniyor ve işleniyor...' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectCode', projectCode);
      formData.append('password', password);

      const processRes = await fetch('/api/admin/process-zip', {
        method: 'POST',
        body: formData,
      });

      const processData = await processRes.json();

      if (processRes.ok) {
        setMessage({ 
          type: 'success', 
          text: `✅ Proje başarıyla yüklendi: ${processData.projectCode} (${processData.filesUploaded} dosya, ${processData.storage})` 
        });
        setFile(null);
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        await loadProjects();
      } else {
        setMessage({ type: 'error', text: processData.error || 'İşlem başarısız!' });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Bir hata oluştu.' 
      });
    } finally {
      setUploading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1d1a15] relative overflow-hidden p-4">
        <WebGLBackground />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(208,187,149,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(208,187,149,0.1),_transparent_28%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
          <div className="w-full rounded-[28px] border border-[#3d3428] bg-[#1d1a15]/80 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D0BB95]/12 text-[#D0BB95] ring-1 ring-[#D0BB95]/25">
                <Upload className="h-8 w-8" />
              </div>
              <div className="mb-3 inline-flex items-center rounded-full border border-[#3d3428] bg-[#D0BB95]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-[#D0BB95]">
                PanoTour Admin
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Yonetim Girisi</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">Projeleri olusturmak, duzenlemek ve yayin akisini kontrol etmek icin giris yapin.</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[#D0BB95]">
                  Admin Sifresi
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-[#3d3428] bg-[#15120f] px-4 py-3 text-base text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                  placeholder="Sifreyi girin"
                  required
                />
              </div>

              {message && (
                <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
                  message.type === 'success'
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/20 bg-red-500/10 text-red-300'
                }`}>
                  {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  <span>{message.text}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-2xl bg-[#D0BB95] px-5 py-3 font-semibold text-[#1d1a15] transition hover:bg-[#ddc9a7] hover:shadow-[0_12px_32px_rgba(208,187,149,0.2)]"
              >
                Giris Yap
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1d1a15] relative overflow-hidden p-4 md:p-8">
      <WebGLBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(208,187,149,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(208,187,149,0.08),_transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl pt-4">
        <div className="rounded-[32px] border border-[#3d3428] bg-[#1d1a15]/85 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-8">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="mb-3 inline-flex items-center rounded-full border border-[#3d3428] bg-[#D0BB95]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-[#D0BB95]">
                PanoTour Control Room
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Proje Yonetimi</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">Yeni tur olustur, zip yukle, taslaklari izle ve yayin durumlarini yonet.</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D0BB95]/12 text-[#D0BB95] ring-1 ring-[#D0BB95]/25">
              <CheckCircle className="h-8 w-8" />
            </div>
          </div>

          <div className="mb-8 rounded-3xl border border-[#3d3428] bg-[#15120f]/80 p-5 md:p-6">
            <h2 className="text-lg font-semibold text-white">AI Ayarlari (Oturumluk)</h2>
            <p className="mt-1 text-sm text-gray-400">
              Burada girdigin API key ve model ayarlari dosyaya yazilmaz. Sadece sunucu belleginde tutulur ve restart sonrasinda silinir.
            </p>

            {loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#3d3428] bg-[#1d1a15] p-4 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI ayarlari yukleniyor...
              </div>
            ) : (
              <form onSubmit={saveRuntimeSettings} className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#D0BB95]">Saglayici</label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => handleProviderChange(e.target.value as ProviderOption)}
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    >
                      {PROVIDER_OPTIONS.map(provider => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#D0BB95]">Model</label>
                    <select
                      value={
                        selectedProvider === 'gemini'
                          ? runtimeSettings.PANORAMA_GEMINI_MODEL
                          : selectedProvider === 'vertex-ai'
                            ? runtimeSettings.PANORAMA_VERTEX_MODEL
                          : selectedProvider === 'ollama'
                            ? runtimeSettings.PANORAMA_OLLAMA_MODEL
                            : selectedProvider === 'vllm'
                              ? runtimeSettings.PANORAMA_VLLM_MODEL
                              : selectedProvider === 'grok'
                                ? runtimeSettings.PANORAMA_GROK_MODEL
                              : runtimeSettings.PANORAMA_AI_MODEL
                      }
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    >
                      {(PROVIDER_MODELS[selectedProvider] || []).map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedProvider === 'gemini' && (
                  <>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_GEMINI_API_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_GEMINI_API_URL: e.target.value }))}
                      placeholder="Gemini API URL"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <input
                      type="password"
                      value={runtimeSettings.PANORAMA_GEMINI_API_KEY}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_GEMINI_API_KEY: e.target.value }))}
                      placeholder="Gemini API Key"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <a className="inline-flex items-center text-xs text-[#D0BB95] hover:text-[#ddc9a7]" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                      API key al (Google AI Studio)
                    </a>
                  </>
                )}

                {selectedProvider === 'vertex-ai' && (
                  <>
                    <select
                      value={selectedVertexAuthMode}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_AUTH_MODE: e.target.value }))}
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    >
                      <option value="oauth">OAuth Access Token (standart Vertex)</option>
                      <option value="express-api-key">Express API Key</option>
                    </select>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_VERTEX_API_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_API_URL: e.target.value }))}
                      placeholder="Vertex API URL (ornek: https://aiplatform.googleapis.com/v1)"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    {selectedVertexAuthMode === 'oauth' ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input
                            type="text"
                            value={runtimeSettings.PANORAMA_VERTEX_PROJECT_ID}
                            onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_PROJECT_ID: e.target.value }))}
                            placeholder="Vertex Project ID"
                            className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                          />
                          <input
                            type="text"
                            value={runtimeSettings.PANORAMA_VERTEX_LOCATION}
                            onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_LOCATION: e.target.value }))}
                            placeholder="Vertex Location (ornek: us-central1)"
                            className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                          />
                        </div>
                        <input
                          type="password"
                          value={runtimeSettings.PANORAMA_VERTEX_ACCESS_TOKEN}
                          onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_ACCESS_TOKEN: e.target.value }))}
                          placeholder="Vertex Access Token (Bearer)"
                          className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                        />
                      </>
                    ) : (
                      <input
                        type="password"
                        value={runtimeSettings.PANORAMA_VERTEX_EXPRESS_API_KEY}
                        onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VERTEX_EXPRESS_API_KEY: e.target.value }))}
                        placeholder="Vertex Express API Key"
                        className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                      />
                    )}
                    <a className="inline-flex items-center text-xs text-[#D0BB95] hover:text-[#ddc9a7]" href="https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart" target="_blank" rel="noreferrer">
                      Vertex AI hizli baslangic dokumani
                    </a>
                  </>
                )}

                {selectedProvider === 'ollama' && (
                  <>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_OLLAMA_BASE_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_OLLAMA_BASE_URL: e.target.value }))}
                      placeholder="Ollama Base URL (ornek: http://localhost:11434)"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <a className="inline-flex items-center text-xs text-[#D0BB95] hover:text-[#ddc9a7]" href="https://ollama.com/library" target="_blank" rel="noreferrer">
                      Model sec (Ollama Library)
                    </a>
                  </>
                )}

                {selectedProvider === 'vllm' && (
                  <>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_VLLM_BASE_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VLLM_BASE_URL: e.target.value }))}
                      placeholder="vLLM Base URL (ornek: http://localhost:8000)"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <input
                      type="password"
                      value={runtimeSettings.PANORAMA_VLLM_API_KEY}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_VLLM_API_KEY: e.target.value }))}
                      placeholder="vLLM API Key (varsa)"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                  </>
                )}

                {selectedProvider === 'openai-compatible' && (
                  <>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_AI_API_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_AI_API_URL: e.target.value }))}
                      placeholder="OpenAI Compatible Base URL"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <input
                      type="password"
                      value={runtimeSettings.PANORAMA_AI_API_KEY}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_AI_API_KEY: e.target.value }))}
                      placeholder="OpenAI Compatible API Key"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <a className="inline-flex items-center text-xs text-[#D0BB95] hover:text-[#ddc9a7]" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                      API key al (OpenAI)
                    </a>
                  </>
                )}

                {selectedProvider === 'grok' && (
                  <>
                    <input
                      type="text"
                      value={runtimeSettings.PANORAMA_GROK_API_URL}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_GROK_API_URL: e.target.value }))}
                      placeholder="Grok Base URL"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <input
                      type="password"
                      value={runtimeSettings.PANORAMA_GROK_API_KEY}
                      onChange={(e) => setRuntimeSettings(prev => ({ ...prev, PANORAMA_GROK_API_KEY: e.target.value }))}
                      placeholder="Grok API Key"
                      className="w-full rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
                    />
                    <a className="inline-flex items-center text-xs text-[#D0BB95] hover:text-[#ddc9a7]" href="https://console.x.ai/" target="_blank" rel="noreferrer">
                      API key al (xAI Console)
                    </a>
                  </>
                )}

                {testMessage && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    testMessage.type === 'success'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/20 bg-red-500/10 text-red-300'
                  }`}>
                    {testMessage.text}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runSettingsTest()}
                    disabled={testingSettings}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-5 py-3 text-sm font-semibold text-[#D0BB95] transition hover:border-[#D0BB95]/40 hover:bg-[#221d17] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                    Endpointi Test Et
                  </button>

                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#D0BB95] px-5 py-3 font-semibold text-[#1d1a15] transition hover:bg-[#ddc9a7] disabled:cursor-not-allowed disabled:bg-[#5a5146] disabled:text-[#d5cec2]"
                  >
                    {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Oturum Icin Uygula
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mb-8 rounded-3xl border border-[#3d3428] bg-[#15120f]/80 p-5 md:p-6">
            <h2 className="text-lg font-semibold text-white">Zip'siz Yeni Proje</h2>
            <p className="mt-1 text-sm text-gray-400">
              Proje kodunu girin, boş editör sihirbazı açılsın. En sonda ZIP indirebilir veya direkt sunucuya yazabilirsiniz.
            </p>

            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={newProjectCode}
                onChange={(e) => setNewProjectCode(e.target.value)}
                placeholder="ornek-proje-kodu"
                className="flex-1 rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-[#D0BB95]/70 focus:ring-2 focus:ring-[#D0BB95]/20"
              />
              <button
                type="button"
                onClick={handleCreateProject}
                className="rounded-2xl bg-[#D0BB95] px-5 py-3 font-semibold text-[#1d1a15] transition hover:bg-[#ddc9a7]"
              >
                Editorde Olustur
              </button>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Proje kodu URL olur. Ornek: <span className="font-mono text-[#D0BB95]">/{normalizedProjectCode || 'ornek-proje-kodu'}</span>
            </p>
            {normalizedProjectCode && projects.some(project => project.id === normalizedProjectCode) && (
              <p className="mt-2 text-xs text-red-300">
                Bu proje kodu zaten kullaniliyor.
              </p>
            )}
          </div>

          <form onSubmit={handleUpload} className="space-y-6">
            <div 
              className="cursor-pointer rounded-3xl border-2 border-dashed border-[#3d3428] bg-[#15120f]/70 p-8 text-center transition hover:border-[#D0BB95]/50"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-[#D0BB95]', 'bg-[#221d17]');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-[#D0BB95]', 'bg-[#221d17]');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-[#D0BB95]', 'bg-[#221d17]');
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && droppedFile.name.endsWith('.zip')) {
                  setFile(droppedFile);
                }
              }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload className="mx-auto mb-4 h-12 w-12 text-[#D0BB95]" />
              <p className="mb-2 font-medium text-[#D0BB95]">
                Dosya Seç veya Sürükle Bırak
              </p>
              <p className="text-sm text-gray-500">Sadece .zip dosyalari</p>
              
              <input
                id="file-input"
                type="file"
                accept=".zip"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                required
              />
              
              {file && (
                <div className="mt-4 inline-block rounded-2xl border border-[#3d3428] bg-[#1d1a15] p-3">
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-[#D0BB95]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
            </div>

            {message && (
              <div className={`flex items-center gap-2 rounded-2xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/20 bg-red-500/10 text-red-300'
              }`}>
                {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <span>{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || !file}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D0BB95] py-4 font-semibold text-[#1d1a15] transition hover:bg-[#ddc9a7] disabled:cursor-not-allowed disabled:bg-[#5a5146] disabled:text-[#d5cec2]"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Projeyi Yükle
                </>
              )}
            </button>
          </form>

          <div className="mt-8 rounded-3xl border border-[#3d3428] bg-[#15120f]/80 p-5">
            <h3 className="mb-2 font-semibold text-white">Zip Dosyasi Formati</h3>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>• Zip dosya adı proje kodu olacak (örn: yeni-proje.zip)</li>
              <li>• Icinde <code className="rounded bg-[#1d1a15] px-1 text-[#D0BB95]">config.json</code> dosyasi olmali</li>
              <li>• Icinde <code className="rounded bg-[#1d1a15] px-1 text-[#D0BB95]">images/</code> klasoru olmali</li>
              <li>• Sunucu ayarına göre proje local klasöre veya Blob storage'a yazılır</li>
            </ul>
          </div>

          <div className="mt-8 rounded-3xl border border-[#3d3428] bg-[#15120f]/80 p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Mevcut Projeler</h2>
                <p className="text-sm text-gray-400">Taslak ve yayindaki tum projeleri buradan takip edin.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#3d3428] bg-[#1d1a15] px-3 py-2 text-sm text-[#D0BB95] transition hover:border-[#D0BB95]/40 hover:bg-[#221d17]"
              >
                <RefreshCw className={`h-4 w-4 ${loadingProjects ? 'animate-spin' : ''}`} />
                Yenile
              </button>
            </div>

            {loadingProjects ? (
              <div className="flex items-center gap-2 rounded-2xl border border-[#3d3428] bg-[#1d1a15] p-4 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Projeler yukleniyor...
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-[#3d3428] bg-[#1d1a15] p-4 text-sm text-gray-400">
                Henuz proje yok.
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div key={project.id} className="flex flex-col gap-3 rounded-2xl border border-[#3d3428] bg-[#1d1a15] p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{project.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${project.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                          {project.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        <span className="rounded-full bg-[#D0BB95]/10 px-2 py-0.5 text-xs text-[#D0BB95]">
                          {project.source === 'blob' ? 'Blob' : 'Local'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-sm text-gray-500">/{project.id}</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/${encodeURIComponent(project.id)}/edit`)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#D0BB95] px-3 py-2 text-sm font-semibold text-[#1d1a15] transition hover:bg-[#ddc9a7]"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(project.status === 'draft' ? `/${encodeURIComponent(project.id)}/edit` : `/${encodeURIComponent(project.id)}`)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#3d3428] bg-transparent px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-[#D0BB95]/40 hover:bg-[#221d17] hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {project.status === 'draft' ? 'Taslagi Ac' : 'Ac'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

