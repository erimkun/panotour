import { put, head } from '@vercel/blob';

interface RateLimitData {
  attempts: number;
  lastAttempt: number;
  bannedUntil: number | null;
}

const MAX_ATTEMPTS = 3;
const BAN_DURATION_MS = 12 * 60 * 60 * 1000; // 12 saat

function getRateLimitKey(ip: string): string {
  // IP adresini güvenli dosya adına çevir
  const safeIp = ip.replace(/[.:]/g, '_');
  return `rate-limits/${safeIp}.json`;
}

export async function getRateLimitData(ip: string): Promise<RateLimitData | null> {
  try {
    const key = getRateLimitKey(ip);
    const blobInfo = await head(key);
    
    if (blobInfo) {
      const response = await fetch(blobInfo.url);
      if (response.ok) {
        return await response.json();
      }
    }
  } catch {
    // Dosya yoksa null döner
  }
  return null;
}

export async function setRateLimitData(ip: string, data: RateLimitData): Promise<void> {
  const key = getRateLimitKey(ip);
  await put(key, JSON.stringify(data), {
    access: 'public',
    allowOverwrite: true,
  });
}

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  bannedUntil: Date | null;
  message: string;
}> {
  const now = Date.now();
  const data = await getRateLimitData(ip);

  // Hiç kayıt yoksa izin ver
  if (!data) {
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS,
      bannedUntil: null,
      message: '',
    };
  }

  // Ban süresi dolmuş mu kontrol et
  if (data.bannedUntil && data.bannedUntil > now) {
    const remainingMs = data.bannedUntil - now;
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
    
    return {
      allowed: false,
      remainingAttempts: 0,
      bannedUntil: new Date(data.bannedUntil),
      message: remainingHours > 1 
        ? `IP adresiniz ${remainingHours} saat boyunca engellenmiştir.`
        : `IP adresiniz ${remainingMinutes} dakika boyunca engellenmiştir.`,
    };
  }

  // Ban süresi dolduysa veya ban yoksa, kalan hakkı hesapla
  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - data.attempts);
  
  return {
    allowed: true,
    remainingAttempts,
    bannedUntil: null,
    message: '',
  };
}

export async function recordFailedAttempt(ip: string): Promise<{
  banned: boolean;
  remainingAttempts: number;
  bannedUntil: Date | null;
  message: string;
}> {
  const now = Date.now();
  let data = await getRateLimitData(ip);

  // Eğer ban süresi dolmuşsa veya kayıt yoksa sıfırla
  if (!data || (data.bannedUntil && data.bannedUntil <= now)) {
    data = {
      attempts: 0,
      lastAttempt: now,
      bannedUntil: null,
    };
  }

  // Deneme sayısını artır
  data.attempts += 1;
  data.lastAttempt = now;

  // 3 denemeden sonra banla
  if (data.attempts >= MAX_ATTEMPTS) {
    data.bannedUntil = now + BAN_DURATION_MS;
    await setRateLimitData(ip, data);
    
    return {
      banned: true,
      remainingAttempts: 0,
      bannedUntil: new Date(data.bannedUntil),
      message: 'Çok fazla başarısız deneme! IP adresiniz 12 saat boyunca engellenmiştir.',
    };
  }

  await setRateLimitData(ip, data);
  
  const remainingAttempts = MAX_ATTEMPTS - data.attempts;
  return {
    banned: false,
    remainingAttempts,
    bannedUntil: null,
    message: `Yanlış şifre! Kalan deneme hakkı: ${remainingAttempts}`,
  };
}

export async function resetRateLimit(ip: string): Promise<void> {
  // Başarılı girişte rate limit'i sıfırla
  const data: RateLimitData = {
    attempts: 0,
    lastAttempt: Date.now(),
    bannedUntil: null,
  };
  await setRateLimitData(ip, data);
}

export function getClientIP(request: Request): string {
  // Vercel ve Cloudflare header'ları
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  
  return 'unknown';
}
