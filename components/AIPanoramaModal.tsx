'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Loader2, Sparkles, X, Upload, Camera as CameraIcon, FolderOpen, ChevronDown, ChevronUp } from 'lucide-react';
import CameraCaptureTab from './panorama-ai-capture/CameraCaptureTab';
import { isDeviceOrientationSupported } from './panorama-ai-capture/useDeviceOrientationV2';
import { TOTAL_POINTS } from './panorama-ai-capture/guide-points-16';

type PanoramaProvider = 'env' | 'gemini' | 'vertex-ai' | 'openai-compatible' | 'ollama' | 'vllm' | 'grok';
type SourceTab = 'file' | 'camera';

interface AIPanoramaModalProps {
  open: boolean;
  onClose: () => void;
  onPanoramaReady: (file: File, sceneTitle: string) => void;
}

const MIN_FILES = 4;
const MAX_FILES = 16;

function detectMimeTypeFromBase64(base64: string): string | null {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized) return null;

  if (normalized.startsWith('iVBORw0KGgo')) return 'image/png';
  if (normalized.startsWith('/9j/')) return 'image/jpeg';
  if (normalized.startsWith('UklGR')) return 'image/webp';

  return null;
}

function resolveMimeType(preferredMimeType: string | undefined, base64: string): string {
  const inferred = detectMimeTypeFromBase64(base64);
  if (!preferredMimeType) return inferred || 'image/jpeg';
  if (inferred && preferredMimeType.toLowerCase() !== inferred.toLowerCase()) {
    return inferred;
  }
  return preferredMimeType;
}

export default function AIPanoramaModal({
  open,
  onClose,
  onPanoramaReady,
}: AIPanoramaModalProps) {
  const [sceneTitle, setSceneTitle] = useState('AI Panorama Sahnesi');
  const [prompt, setPrompt] = useState(
    [
      'Ayni mekanda farkli acilardan cekilmis bu fotograflari tek bir 360 derece equirectangular panoramaya birlestir.',
      'Sahnedeki hicbir nesneyi ekleme, silme, tasima veya degistirme.',
      'Olcegi, geometriyi, perspektifi, renkleri ve isigi gercege sadik koru.',
      'Yalnizca gorus acilarini birlestir; yeni icerik uretme ve hayali detay ekleme.',
      'Dikis izlerini ve hayaletlenmeyi minimuma indir, dogal ve tutarli tek bir oda panoramasi uret.',
    ].join(' ')
  );
  const [provider, setProvider] = useState<PanoramaProvider>('env');
  const [files, setFiles] = useState<File[]>([]);
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<SourceTab>('file');
  const [gyroSupported, setGyroSupported] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const filesHint = useMemo(() => {
    if (files.length === 0) return `${MIN_FILES}-${MAX_FILES} adet foto secin`;
    if (files.length < MIN_FILES) return `En az ${MIN_FILES} foto gerekli`;
    if (files.length > MAX_FILES) return `En fazla ${MAX_FILES} foto secilebilir`;
    return `${files.length} foto secildi`;
  }, [files.length]);

  const activeFiles = activeTab === 'camera' ? capturedFiles : files;
  const canGenerate = activeFiles.length >= MIN_FILES && activeFiles.length <= MAX_FILES;

  // Detect gyroscope support once when the modal opens so we can enable/disable
  // the camera tab. Desktop users fall back to the file picker tab.
  useEffect(() => {
    if (!open) return;
    setGyroSupported(isDeviceOrientationSupported());
  }, [open]);

  // Reset all state when the modal fully closes so reopening starts clean.
  useEffect(() => {
    if (open) return;
    setFiles([]);
    setCapturedFiles([]);
    setActiveTab('file');
    setSettingsOpen(true);
    setError('');
    setIsGenerating(false);
  }, [open]);

  // Auto-collapse the settings panel when switching to the camera tab so the
  // camera view has room to breathe on mobile. Re-expand when going back to
  // the file tab.
  useEffect(() => {
    setSettingsOpen(activeTab !== 'camera');
  }, [activeTab]);

  if (!open) return null;

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'));
    setFiles(selected.slice(0, MAX_FILES));
    setError('');
    event.target.value = '';
  };

  const handleGenerate = async () => {
    const source = activeTab === 'camera' ? capturedFiles : files;
    if (source.length < MIN_FILES || source.length > MAX_FILES) {
      setError(
        activeTab === 'camera'
          ? `Lutfen ${TOTAL_POINTS} noktayi da cekin.`
          : `Lutfen ${MIN_FILES}-${MAX_FILES} arasi foto secin.`,
      );
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const formData = new FormData();
      source.forEach(file => formData.append('files', file));
      formData.append('provider', provider);
      formData.append('prompt', prompt);

      const response = await fetch('/api/panorama/generate', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Panorama olusturulamadi');
      }

      const base64Image = payload.imageBase64 as string;
      if (!base64Image) {
        throw new Error('Modelden gecerli bir goruntu donmedi');
      }

      const mimeType = resolveMimeType(payload.mimeType, base64Image);

      const binary = atob(base64Image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const fileName = `ai-panorama-${Date.now()}.${extension}`;
      const panoramaFile = new File([bytes], fileName, { type: mimeType });

      onPanoramaReady(panoramaFile, sceneTitle.trim() || 'AI Panorama Sahnesi');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilinmeyen bir hata olustu');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="flex h-full max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border-gray-700 bg-gray-900 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl sm:border">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">AI Panorama Uret</h2>
            <p className="text-xs text-gray-400">
              {activeTab === 'camera' ? `${TOTAL_POINTS} noktayi cek ve AI ile birlestir` : '4-16 kareyi tek panoramaya donustur'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            disabled={isGenerating}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Collapsible settings — auto-collapsed on camera tab to free up space */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/40">
            <button
              type="button"
              onClick={() => setSettingsOpen(v => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white"
            >
              <span>Ayarlar {sceneTitle && <span className="ml-2 text-gray-500">· {sceneTitle}</span>}</span>
              {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {settingsOpen && (
              <div className="space-y-3 border-t border-gray-800 p-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Sahne Basligi</label>
                  <input
                    type="text"
                    value={sceneTitle}
                    onChange={(event) => setSceneTitle(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Ornek: Salon AI Panorama"
                    disabled={isGenerating}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-gray-400">Saglayici</label>
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as PanoramaProvider)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    disabled={isGenerating}
                  >
                    <option value="env">Env Ayari (onerilen)</option>
                    <option value="gemini">Gemini (AI Studio)</option>
                    <option value="vertex-ai">Vertex AI (Google Cloud)</option>
                    <option value="grok">Grok (xAI)</option>
                    <option value="ollama">Ollama</option>
                    <option value="vllm">vLLM</option>
                    <option value="openai-compatible">OpenAI Compatible</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-gray-400">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="h-24 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    disabled={isGenerating}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs text-gray-400">Kaynak Fotograflar</label>

            {/* Tab switcher: file picker vs camera capture */}
            <div className="mb-2 flex gap-1 rounded-lg border border-gray-700 bg-gray-800/60 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                disabled={isGenerating}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'file'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <FolderOpen size={14} /> Dosya Yukle
              </button>
              <button
                type="button"
                onClick={() => gyroSupported && setActiveTab('camera')}
                disabled={isGenerating || !gyroSupported}
                title={gyroSupported ? 'Kamera ile cekim' : 'Sadece mobil cihazlarda'}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'camera'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white disabled:cursor-not-allowed disabled:text-gray-500'
                }`}
              >
                <CameraIcon size={14} /> Kamera
                {!gyroSupported && <span className="ml-1 text-[10px] text-gray-500">(mobil)</span>}
              </button>
            </div>

            {activeTab === 'file' && (
              <>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 bg-gray-800/60 px-4 py-6 text-sm text-gray-300 transition-colors hover:border-blue-500 hover:text-white">
                  <Upload size={16} />
                  Fotograflari Sec
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilePick}
                    className="hidden"
                    disabled={isGenerating}
                  />
                </label>
                <p className="mt-2 text-xs text-gray-400">{filesHint}</p>
                {files.length > 0 && (
                  <div className="mt-2 max-h-28 overflow-auto rounded border border-gray-800 bg-gray-950 px-2 py-2 text-xs text-gray-300">
                    {files.map(file => (
                      <div key={`${file.name}-${file.size}`} className="truncate py-0.5">
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'camera' && gyroSupported && (
              <div className="flex min-h-[60dvh] flex-col">
                <CameraCaptureTab
                  active={activeTab === 'camera' && !isGenerating}
                  onFilesReady={(captured) => {
                    setCapturedFiles(captured);
                    setError('');
                  }}
                  onError={(message) => setError(message)}
                />
                <p className="mt-2 text-xs text-gray-400">
                  {capturedFiles.length === TOTAL_POINTS
                    ? `${TOTAL_POINTS} kare hazir — asagidaki "Panoramayi Uret" ile devam edin.`
                    : `${capturedFiles.length}/${TOTAL_POINTS} kare hazir`}
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-800 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
            disabled={isGenerating}
          >
            Iptal
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Panoramayi Uret
          </button>
        </div>
      </div>
    </div>
  );
}
