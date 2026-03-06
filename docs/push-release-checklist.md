# Push / Release Checklist

Bu kisa liste, GitHub'a push atmadan veya sunucuya yeni surum cikmadan once son kontrol icin kullanilir.

## GitHub Push Oncesi

1. `git status` temiz mi kontrol et.
2. Secret dosyalari commit'e girmiyor mu kontrol et:
   - `.env.local`
   - `.env.production`
   - `.env.vercel`
3. Gerekliyse `.env.example` ve `.env.production.example` guncel mi bak.
4. Dokuman linkleri kirik mi kisa gozden gecir.
5. `npm run build` calistir.
6. Gerekirse `git diff --stat` ile degisenleri son kez kontrol et.

## Commit Oncesi Icerik Kontrolu

1. Storage secimi dogru mu:
   - self-hosted icin `PROJECTS_STORAGE_PATH`
   - Vercel icin `BLOB_READ_WRITE_TOKEN`
2. Admin ve editor akislarinda secret isimleri dogru mu:
   - `ADMIN_PASSWORD`
   - `EDIT_SECRET`
3. Draft / published davranisi beklenen gibi mi.
4. Yeni dokumanlar README icinde linklenmis mi.

## Release Oncesi Teknik Kontrol

1. `/admin` girisi calisiyor mu.
2. Bir proje edit sayfasi aciliyor mu.
3. Gorsel upload akisi calisiyor mu.
4. `draft` proje public tarafta gizli mi.
5. `published` proje public tarafta aciliyor mu.

## Push Komutlari

```bash
git add .
git commit -m "feat: add self-hosted project storage workflow"
git push origin main
```

## Sunucuya Cikis Sonrasi

1. Sunucuda yeni kodu cek.
2. `npm ci`
3. `npm run build`
4. Servisi restart et.
5. `/admin` ve bir canli proje ile smoke test yap.