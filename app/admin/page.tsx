'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', password);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: `Proje başarıyla yüklendi: ${data.projectCode}` });
        setFile(null);
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setMessage({ type: 'error', text: data.error || 'Upload başarısız!' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bir hata oluştu.' });
    } finally {
      setUploading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Proje yönetimi için giriş yapın</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition"
                placeholder="Admin şifresini girin"
                required
              />
            </div>

            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                <span className="text-sm">{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Proje Yükle</h1>
              <p className="text-gray-600 mt-2">Panoramik tur projelerini yükleyin</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>

          <form onSubmit={handleUpload} className="space-y-6">
            <div 
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-50');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50');
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && droppedFile.name.endsWith('.zip')) {
                  setFile(droppedFile);
                }
              }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-indigo-600 font-medium hover:text-indigo-700 mb-2">
                Dosya Seç veya Sürükle Bırak
              </p>
              <p className="text-gray-500 text-sm">Sadece .zip dosyaları</p>
              
              <input
                id="file-input"
                type="file"
                accept=".zip"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                required
              />
              
              {file && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-lg inline-block">
                  <p className="text-sm text-indigo-700 font-medium">{file.name}</p>
                  <p className="text-xs text-indigo-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
            </div>

            {message && (
              <div className={`flex items-center gap-2 p-4 rounded-lg ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                <span>{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full bg-indigo-600 text-white py-4 rounded-lg font-medium hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Projeyi Yükle
                </>
              )}
            </button>
          </form>

          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">📝 Zip Dosyası Formatı:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Zip dosya adı proje kodu olacak (örn: yeni-proje.zip)</li>
              <li>• İçinde <code className="bg-gray-200 px-1 rounded">config.json</code> dosyası olmalı</li>
              <li>• İçinde <code className="bg-gray-200 px-1 rounded">images/</code> klasörü olmalı</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

