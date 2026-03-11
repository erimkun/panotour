# Dokploy Ile Tek VPS Deploy Rehberi

Bu rehber, bu uygulamayi Dokploy kullanarak tek VPS uzerinde sifirdan nasil deploy edeceginizi anlatir.

Senaryo:

- kod sadece GitHub'da duruyor
- sunucuda henuz Docker yok
- sunucuda henuz deploy altyapisi yok
- siz panelden yonetilen ama self-hosted bir yapi istiyorsunuz

Bu uygulama acisindan en kritik konu yine ayni:

- deploy baska bir sey
- kalici panorama proje verisi baska bir sey

Yani container yeniden olussa bile proje dosyalari silinmemeli.

## 1. Hedef Mimari

Kuracagimiz yapi su olacak:

1. VPS uzerine Dokploy kurulacak
2. GitHub repo Dokploy'e baglanacak
3. Repo Dockerfile ile build edilecek
4. Uygulama container olarak calisacak
5. Proje dosyalari sunucuda kalici path'e yazilacak

## 2. Gerekenler

- Linux VPS
- SSH erisimi
- GitHub repository erisimi
- domain veya test icin IP

Sunucuda Docker kurulu olmak zorunda degil. Dokploy kurulumunda gerekli container altyapisi kurulur veya yonetilir.

## 3. Once Repo'yu Container'a Hazirla

Bu repo su an Dockerfile icermiyor. Bu nedenle once repo kokune `Dockerfile` ve `.dockerignore` eklemelisiniz.

## 4. Dockerfile Olustur

Proje kokunde `Dockerfile` olusturun.

Icerik:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
```

## 5. .dockerignore Olustur

Proje kokunde `.dockerignore` olusturun.

Icerik:

```text
.git
.gitignore
.next
node_modules
npm-debug.log
README.md
docs
deploy
```

## 6. Opsiyonel: Gelistirici Bilgisayarinda Docker Ile Yerel Test Yap

Sunucuya gecmeden once image'in lokal makinede build aldigini test etmek iyi bir pratiktir.

Proje kokunde:

```bash
docker build -t panotour:local .
```

Sonra container'i test amacli calistirin:

```bash
docker run --rm -p 3000:3000 \
	-e NODE_ENV=production \
	-e PORT=3000 \
	-e PROJECTS_STORAGE_PATH=/data/projects \
	-e EDIT_SECRET=test-secret \
	-e ADMIN_PASSWORD=test-admin \
	panotour:local
```

Tarayicidan `http://localhost:3000` adresini acin.

Bu asama sunu kontrol eder:

- Dockerfile dogru mu
- image build oluyor mu
- uygulama production modda aciliyor mu

Not:

- burada host mount kurmak zorunda degilsiniz
- asil persistent storage ayari Dokploy panelinde yapilacak

## 7. GitHub'a Push Edin

Docker dosyalari GitHub'da olmali cunku Dokploy repodan build alacak.

```bash
git add Dockerfile .dockerignore
git commit -m "Add Docker files for Dokploy deployment"
git push
```

## 8. Kalici Veri Yolunu Simdiden Belirleyin

Sunucuda su klasoru hedef alin:

```text
/var/lib/panotour/projects
```

Container icinde de su yola mount edin:

```text
/data/projects
```

Sonra env tarafinda sunu kullanin:

```env
PROJECTS_STORAGE_PATH=/data/projects
```

## 9. Sunucuya SSH Ile Girin

```bash
ssh kullanici@sunucu-ip
```

## 10. Dokploy Kur

Dokploy de genelde kendi kurulum komutuyla kurulur.

Kurulum mantigi aynidir:

1. Dokploy servisleri sunucuya kurulur
2. web panel acilir
3. admin kullanici ayarlanir

Kurulum komutlari zamanla degisebilir. Bu nedenle guncel kurulum komutunu Dokploy resmi dokumantasyonundan alin.

Kurulum tamamlandiginda elinizde bir panel adresi olur.

## 11. Dokploy Panelini Acin

Tarayicidan paneli acin ve ilk admin hesabini olusturun.

Sonra genelde asagidaki mantikla ilerlenir:

- project olusturulur
- repository baglanir
- application veya service tanimlanir

## 12. GitHub Repository'yi Baglayin

Dokploy'un repo cekebilmesi icin GitHub baglantisi verin.

Bu islem token, deploy key veya entegrasyon mantigiyla olabilir.

Baslangic icin amac su:

- dogru repo baglansin
- deploy edilecek branch `main` olsun

## 13. Yeni App veya Service Olusturun

Dokploy icinde yeni bir app ekleyin.

Secimler genelde su sekilde olur:

- source: GitHub repository
- branch: `main`
- build method: Dockerfile
- Dockerfile path: `/Dockerfile`
- app port: `3000`

Bu uygulama container icinde 3000 portunda calisacak.

## 14. Environment Variable'lari Ekleyin

Su degiskenleri girin:

```env
NODE_ENV=production
PORT=3000
PROJECTS_STORAGE_PATH=/data/projects
EDIT_SECRET=guclu-bir-editor-sifresi
ADMIN_PASSWORD=guclu-bir-admin-sifresi
```

Blob kullanmayacaksaniz `BLOB_READ_WRITE_TOKEN` gerekmez.

## 15. Volume veya Bind Mount Tanimlayin

Bu adim cok onemli.

Dokploy icinde persistent storage tanimlayin.

Mantik su olmali:

- host path: `/var/lib/panotour/projects`
- container path: `/data/projects`

Boylece deploy sonrasi container yenilense bile proje dosyalari kaybolmaz.

## 16. Domain Ayarini Yapin

Domain kullanacaksaniz DNS tarafinda sunucu IP'sine yonlendirme yapin.

Ornek:

- `tour.sizin-domain.com -> VPS_IP`

Sonra Dokploy icinde uygulamaya domain baglayin.

SSL destegi varsa aktif edin.

## 17. Ilk Deploy'u Baslatin

Deploy baslatildiginda genelde su olur:

1. repo cekilir
2. Docker image build edilir
3. container ayaga kalkar
4. proxy/domain baglantisi aktif olur

Deploy loglarini dikkatle okuyun.

## 18. Uygulamayi Test Edin

Kontrol listesi:

1. ana sayfa aciliyor mu
2. `/admin` sayfasi aciliyor mu
3. admin sifresi ile giriliyor mu
4. test proje yuklenebiliyor mu

## 19. Kalici Veri Kontrolu Yapin

Sunucuda SSH uzerinden bakin:

```bash
ls -la /var/lib/panotour/projects
```

Test yukleme sonrasi burada dosyalarin olusmasi gerekir.

Bu kontrol olmadan deploy'u tamamlandi saymayin.

## 20. En SIk Yapilan Hatalar

### Hata 1: Veri container icine yaziliyor

Sebep:

- mount tanimlanmamistir
- `PROJECTS_STORAGE_PATH` yanlistir

Dogrusu:

- container path `/data/projects`
- env `PROJECTS_STORAGE_PATH=/data/projects`

### Hata 2: Uygulama acilmiyor

Sebep:

- port yanlis tanimlanmistir
- build sirasinda hata vardir
- env eksiktir

Kontrol:

- app port `3000`
- build logs
- runtime logs

### Hata 3: Buyuk ZIP yuklenmiyor

Sebep:

- panel veya ters proxy body size limiti dusuktur

Ne yapilir:

- once kucuk ZIP ile test edin
- sonra platformun proxy limit ayarlarini yukseltin

## 21. Neden Dokploy Tercih Edilebilir

Dokploy su durumda mantikli olabilir:

- self-hosted kalsin istiyorsunuz
- panelden deploy gormek istiyorsunuz
- container mantigi kabul edilebilir
- gelecekte birkac servisi ayni yerde yonetmek istiyorsunuz

## 22. Baslangic Icin En Guvenli Kurulum

Ilk asamada sunu yapin:

1. tek VPS
2. tek Dokploy kurulumu
3. tek uygulama
4. local host path ile kalici proje verisi

Sonra isterseniz registry, CI/CD ve staging gibi katmanlari eklersiniz.