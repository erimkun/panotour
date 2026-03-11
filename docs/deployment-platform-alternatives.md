# Deploy Platform Alternatifleri

Bu dokuman, uygulamayi sadece klasik Nginx + systemd ile degil, farkli deploy platformlariyla da nasil yayinlayabileceginizi anlatir.

Odak nokta su:

- uygulama Next.js tabanli
- proje dosyalari kalici olmali
- kod deploy'u ile icerik verisi birbirine karismamali
- mumkunse kolay rollback ve kolay guncelleme olmali

Bu repo icin en kritik konu, panorama proje dosyalarinin koddan ayri yasamasi. Yani hangi araci secerseniz secin, su mantigi koruyun:

- uygulama container veya app deployment ile yayinlansin
- proje dosyalari ayri disk, object storage veya Blob benzeri bir yerde dursun

## Kisa Ozet

En pratik alternatifler genelde sunlar olur:

| Secenek | Kurulum Kolayligi | Operasyon Yuku | Veri Kaliciligi Yonetimi | CI/CD Uyumu | En Uygun Senaryo |
|---|---|---:|---|---|---|
| Nginx + systemd | Orta | Dusuk-Orta | Manuel ama net | Cok iyi | Tek VPS, sade ve kontrollu kurulum |
| Coolify | Kolay | Dusuk | Volume ve env yonetimi rahat | Cok iyi | Docker tabanli, panelden yonetilen VPS |
| Dokploy | Kolay | Dusuk | Docker volume mantigi iyi | Iyi | Coolify benzeri ama daha hafif panel isteyenler |
| CapRover | Kolay-Orta | Dusuk-Orta | Volume ve app bazli deploy kolay | Iyi | Tek sunucuda hizli app yayinlamak |
| Easypanel | Kolay | Dusuk | GUI guclu, volume kolay | Iyi | Teknik olmayan ekiplerin de yonetebilecegi ortam |
| Vercel | Cok kolay | Cok dusuk | Yerel disk icin uygun degil, object storage ister | Cok iyi | Kod deploy'u cok hizli olsun, veri harici storage'da dursun |
| Render / Railway / Fly.io | Kolay | Dusuk | Kalici dosya mantigi sinirli veya harici storage ister | Iyi | Managed platform isteyenler |

## 1. Nginx + systemd

Bu repo icin zaten mevcut ve en net cozumlerden biri.

Artlari:

- En az surpriz yaratan yapi
- Log, servis, restart, reverse proxy kontrolu sizde olur
- Buyuk upload limitlerini Nginx tarafinda rahat yonetirsiniz
- Docker zorunlu degil

Eksileri:

- SSL, backup, deploy ve rollback akisini sizin kurmaniz gerekir
- Panel tabanli rahatlik yoktur
- Birden fazla ortam yonetimi manuel olabilir

Ne zaman mantikli:

- Tek VPS var
- Linux ve Nginx ile rahatsiniz
- En stabil ve az katmanli mimariyi istiyorsunuz

## 2. Coolify

Coolify, kendi sunucunuza kurdugunuz open-source bir PaaS panelidir. Vercel hissini kendi VPS'inize getirir.

Artlari:

- Git tabanli otomatik deploy kolay kurulur
- Environment variable, domain, SSL, container ve service yonetimi panelden yapilir
- Docker image veya repo tabanli deploy destekler
- Preview ve branch bazli akis kurmak daha kolaydir

Eksileri:

- Docker ve panel katmani ekledigi icin klasik systemd kadar yalin degildir
- Kalici dosya stratejisini yine sizin dogru tasarlamaniz gerekir
- Buyuk dosya upload, disk mount ve backup politikasini yine kontrol etmelisiniz

Bu repo icin not:

- Uygulamayi Coolify ile deploy edip proje dosyalarini host volume veya object storage tarafinda tutabilirsiniz
- En temiz yol genelde uygulamayi container icinde, proje dosyalarini ise ayri mount veya S3/Blob benzeri storage uzerinde tutmaktir

Ne zaman mantikli:

- VPS sizin ama Vercel benzeri rahat deploy istiyorsunuz
- Panelden yonetim istiyorsunuz
- Docker kullanmak sorun degil

## 3. Dokploy

Dokploy de benzer sekilde self-hosted deployment panelidir ve Docker tabanli calisir.

Artlari:

- Coolify benzeri deneyim sunar
- Git tabanli deploy kolaydir
- Tek sunucuda birden fazla app yonetmek pratiktir
- Arayuzu sadedir

Eksileri:

- Ek platform katmani vardir
- Backup, disk buyumesi, storage ayri planlanmalidir
- Topluluk ve ekosistem, bazi rakiplere gore daha dardir

Ne zaman mantikli:

- Hafif bir self-hosted deploy paneli istiyorsunuz
- Docker image ve volume mantigiyle calismak size uyuyor

## 4. CapRover

CapRover, uzun suredir kullanilan ve tek sunucu deploy isini kolaylastiran bir secenektir.

Artlari:

- Kurulumu gorece kolaydir
- Uygulama deploy etmek hizlidir
- Reverse proxy, SSL ve app routing tarafini kolaylastirir

Eksileri:

- Arayuz ve deneyim daha teknik kalabilir
- Modern CI/CD beklentileri icin bazen Docker registry akisi ile dusunmek gerekir
- Veri kaliciligi yine ayri planlanmalidir

Ne zaman mantikli:

- Hali hazirda CapRover biliyorsaniz
- Tek sunucuda birkac servisi hizli yonetmek istiyorsaniz

## 5. Easypanel

Easypanel, panel deneyimi ve sadelik arayanlar icin guclu bir alternatif olabilir.

Artlari:

- GUI tarafi gucludur
- Domain, env, volume gibi ayarlar rahat yonetilir
- Docker tabanli deploy akislari kolaydir

Eksileri:

- Yine Docker ve panel katmani getirir
- Tam kontrol yerine yonetilen bir arakatman kullandiginiz icin bazen derin debug daha dolayli olur

Ne zaman mantikli:

- Sunucuyu ekipce yonetecekseniz
- CLI yerine panel agirlikli akis istiyorsaniz

## 6. Vercel ve Managed Platformlar

Vercel, Render, Railway, Fly.io gibi platformlar kod deploy tarafini cok kolaylastirir. Ama bu uygulamada proje dosyalarinin kalici tutulmasi ana konu oldugu icin tek basina yeterli dusunulmemeli.

Artlari:

- Deploy cok hizli kurulur
- CI/CD neredeyse hazir gelir
- SSL, domain ve rollback genelde kolaydir

Eksileri:

- Yerel dosya sistemi kalici storage gibi dusunulemez
- Buyuk medya ve icerik dosyalari icin harici object storage gerekir
- Trafik ve storage buyudukce maliyet artabilir

Ne zaman mantikli:

- Kod deploy tarafini tam managed istiyorsaniz
- Proje dosyalarini Blob, S3 veya benzeri object storage'a tasiyacaksaniz

## Panotour Icin En Mantikli 4 Yol

| Yol | Oneri Seviyesi | Neden |
|---|---:|---|
| Nginx + systemd + ayri disk path | Cok yuksek | En sade, az hareketli parca, mevcut dokumana uyuyor |
| Coolify + host volume veya object storage | Cok yuksek | Panel rahatligi ile self-hosted kontrolu dengeler |
| Vercel + Blob/object storage | Yuksek | Kod deploy cok kolay olur, ama veri tarafini dogru tasarlamak sart |
| Dokploy veya Easypanel + volume | Orta-Yuksek | Self-hosted panel isteyen ekipler icin guzel alternatif |

## Hizli Secim Rehberi

Su soruya gore secim yapmak daha dogru olur:

| Sorun | Onerilen Yol |
|---|---|
| En az karmasa istiyorum | Nginx + systemd |
| VPS bende olsun ama panelden yoneteyim | Coolify |
| Docker tabanli ama hafif panel istiyorum | Dokploy |
| Teknik olmayan kisi de deploy gorebilsin | Easypanel |
| Sunucu isleriyle ugrasmayayim | Vercel + object storage |

## Son Tavsiye

Bu proje icin genel olarak en saglam karar su olur:

1. kucuk ve kontrollu baslangic icin Nginx + systemd
2. biraz buyuyunce veya ekip kullanimina gecince Coolify
3. eger kod deploy'unu tamamen rahatlatmak istiyorsaniz Vercel + harici storage

Eger hedefiniz "tek sunucuda kolay deploy + kolay rollback + az operasyon" ise en dengeli secim genelde Coolify olur.

Eger hedefiniz "en az katman, en az surpriz, en kolay debug" ise Nginx + systemd hala en temiz secimdir.