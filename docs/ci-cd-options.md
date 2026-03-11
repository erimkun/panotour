# CI/CD Secenekleri

Bu dokuman, bu uygulama icin uygulanabilir CI/CD seceneklerini anlatir.

Ana hedefler:

- deploy sureci tekrarlanabilir olsun
- rollback mumkun olsun
- kod deploy'u proje verisini bozmasin
- build ve release adimlari olabildigince otomatik olsun

## Ozet Tablo

| Pipeline | Kurulum Zorlugu | Deploy Hizi | Geri Alma | En Uygun Senaryo |
|---|---:|---:|---:|---|
| GitHub Actions + SSH + systemd restart | Dusuk | Yuksek | Orta | Klasik VPS + Nginx |
| GitHub Actions + rsync + build on server | Dusuk-Orta | Orta | Dusuk-Orta | Kucuk ekip, tek sunucu |
| GitHub Actions + Docker image + Coolify/Dokploy | Orta | Yuksek | Yuksek | Panel tabanli self-hosted deploy |
| Git push ile platform auto deploy | Cok dusuk | Yuksek | Yuksek | Vercel, Render, Railway |
| Manuel git pull + npm ci + restart | Cok dusuk | Dusuk | Dusuk | Gecici veya baslangic asamasi |

## 1. GitHub Actions + SSH + systemd

En pratik ve en sade VPS pipeline seceneklerinden biridir.

Akis:

1. `main` branch'e push olur
2. GitHub Actions sunucuya SSH ile baglanir
3. repo guncellenir
4. `npm ci` ve `npm run build` calisir
5. `systemctl restart panotour` yapilir

Artlari:

- mevcut Nginx + systemd yapisina birebir uyar
- Docker gerektirmez
- sunucudaki klasor yapisi degismez

Eksileri:

- rollback icin ek disiplin gerekir
- build sunucuda calisiyorsa deploy suresi uzayabilir

Bu repo icin uygun mu:

- evet, cok uygun

## 2. GitHub Actions + Build Artifact + SSH Deploy

Burada build CI tarafinda alinip sunucuya hazir artifact tasinir.

Akis:

1. CI ortaminda test ve build calisir
2. hazir cikti veya paket olusturulur
3. sunucuya kopyalanir
4. servis yeniden baslatilir

Artlari:

- sunucu ustunde build yuku azalir
- daha kontrollu release paketleri olur

Eksileri:

- Next.js cikti yapisi ve runtime gereksinimleri iyi yonetilmelidir
- artifact paketleme adimi ekstra dikkat ister

Ne zaman mantikli:

- build suresi uzunsa
- release surecini daha formal hale getirmek istiyorsaniz

## 3. GitHub Actions + Docker Registry + Coolify/Dokploy

Bu, self-hosted ama modern bir pipeline kurmak isteyenler icin en temiz modellerden biridir.

Akis:

1. GitHub Actions Docker image build eder
2. image registry'ye push edilir
3. Coolify veya Dokploy yeni image'i cekip deploy eder
4. volume veya storage kalici kalir

Artlari:

- rollback daha kolaydir
- deploy sonucu daha deterministik olur
- birden fazla ortam yonetmek kolaylasir

Eksileri:

- Dockerfile, registry ve image versionlama disiplini gerekir
- ilk kurulum klasik SSH akisina gore daha uzundur

Bu repo icin uygun mu:

- eger panel tabanli self-hosted hedefleniyorsa cok uygun

## 4. Vercel veya Benzeri Platform CI/CD

Burada CI/CD neredeyse platform tarafinda hazir gelir.

Akis:

1. Git push edilir
2. platform otomatik build alir
3. yeni release yayinlanir
4. object storage veya Blob ile veri ayri kalir

Artlari:

- en az operasyon
- preview deployment kolay
- rollback kolay

Eksileri:

- storage mantigi ayri kurulur
- platform limitleri ve maliyetleri izlenmelidir

Bu repo icin uygun mu:

- ancak proje dosyalari harici storage'a tasinacaksa uygun

## Onerilen Pipeline'lar

### Secenek A: En hizli baslangic

Nginx + systemd kullaniyorsaniz:

- GitHub Actions
- SSH deploy
- `npm ci`
- `npm run build`
- `systemctl restart`

Bu en az riskli baslangic yoludur.

### Secenek B: En dengeli uzun vadeli kurulum

Coolify kullaniyorsaniz:

- GitHub Actions ile image build
- registry push
- Coolify auto deploy
- proje dosyalari volume veya object storage'ta

Bu en iyi developer experience + operasyon dengesi verir.

### Secenek C: En az operasyonel yuk

Vercel veya benzeri managed platform kullaniyorsaniz:

- git push
- otomatik build/deploy
- veri Blob/object storage'ta

Bu da en rahat akistir ama self-hosted degildir.

## Ornek Karar Tablosu

| Ihtiyac | Onerilen CI/CD |
|---|---|
| Tek VPS, en az kurulum | GitHub Actions + SSH |
| Tek VPS ama panel rahatligi | GitHub Actions + Docker + Coolify |
| Ekip buyuyecek, rollback onemli | Docker image tabanli pipeline |
| Altyapi ile ugrasmak istemiyorum | Vercel auto deploy |

## Bu Repo Icin Net Tavsiye

Su sira ile gitmek mantikli olur:

1. Once GitHub Actions + SSH deploy kurun.
2. Proje buyurse Coolify veya Dokploy tarafina gecin.
3. Proje dosyalari kritik hale geldiginde local disk bagimliligini azaltip object storage dusunun.

Yani ilk adimda asiri buyuk CI/CD mimarisi kurmaya gerek yok. Ama deploy ile veri klasorunun ayrik tutulmasi ilk gunden zorunlu bir tasarim karari olmali.