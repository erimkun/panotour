# Coolify Ile Tek VPS Deploy Rehberi

Bu rehber, hic bilmeyen biri icin yazildi.

Senaryo su:

- kodunuz su an sadece GitHub'da var
- sunucuda henuz Docker yok
- sunucuda henuz herhangi bir deploy yapisi yok
- tek VPS uzerinden bu uygulamayi yayinlamak istiyorsunuz
- deploy isini Coolify ile panelden yonetmek istiyorsunuz

Bu uygulama icin en kritik nokta sunudur:

- uygulama kodu container icinde calisabilir
- ama proje dosyalari kalici olarak ayri saklanmalidir

Yani deploy yaptiginizda container degisse bile, panorama proje dosyalari silinmemelidir.

## 1. Ne Kuracagiz

Kurulumun mantigi su olacak:

1. VPS uzerine Coolify kuracagiz
2. Bu repoya uygun bir Dockerfile hazirlayacagiz
3. Coolify uzerinden GitHub reposunu baglayacagiz
4. Uygulama container olarak deploy edilecek
5. Proje dosyalari host makinede kalici bir klasore yazilacak

## 2. Sizde ve Sunucuda Ne Olmali

Gerekli seyler:

- bir Linux VPS
- VPS'e SSH erisimi
- domain veya en azindan test icin sunucu IP'si
- GitHub repo erisimi

Sunucuda Docker kurulu olmak zorunda degil. Coolify kurulumunda gereken container altyapisi zaten kurulur.

## 3. Bu Proje Icinde Ne Eksik

Bu repo su an Dockerfile icermiyor.

Bu yuzden once repo icine en az su iki dosyayi eklemeniz gerekir:

- `Dockerfile`
- `.dockerignore`

Bu rehberde ikisini de sifirdan olusturacagiz.

## 4. Repo Icinde Dockerfile Olustur

Proje kokunde `Dockerfile` dosyasi olusturun.

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

Bu Dockerfile basit ve anlasilir bir yoldur. Ilk asamada amac, kolayca deploy alabilmektir.

## 5. Repo Icinde .dockerignore Olustur

Proje kokunde `.dockerignore` dosyasi olusturun.

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

Bu dosya gereksiz seylerin image icine girmesini engeller.

## 6. Opsiyonel: Gelistirici Bilgisayarinda Docker Ile Yerel Test Yap

Eger kendi bilgisayarinizda Docker kuruluysa, sunucuya gecmeden once image'in build aldigini test etmek cok faydalidir.

Proje kokunde su komutu calistirin:

```bash
docker build -t panotour:local .
```

Build basariliysa container'i calistirin:

```bash
docker run --rm -p 3000:3000 \
	-e NODE_ENV=production \
	-e PORT=3000 \
	-e PROJECTS_STORAGE_PATH=/data/projects \
	-e EDIT_SECRET=test-secret \
	-e ADMIN_PASSWORD=test-admin \
	panotour:local
```

Sonra tarayicida `http://localhost:3000` adresini acin.

Bu test sunu dogrular:

- Dockerfile build oluyor mu
- app production modda aciliyor mu
- temel runtime hatasi var mi

Not:

- Bu yerel testte kalici storage mount etmek zorunda degilsiniz
- asil kalici storage ayari sunucuda Coolify icinde yapilacak

## 7. Degisiklikleri GitHub'a Gonder

Bu iki dosyayi commitleyip GitHub'a push edin.

Ornek akis:

```bash
git add Dockerfile .dockerignore
git commit -m "Add Docker files for Coolify deployment"
git push
```

Coolify repo icinden build alacagi icin, dosyalarin GitHub'da olmasi gerekir.

## 8. Sunucuda Kalici Veri Klasoru Mantigini Belirle

Bu uygulamada panorama projeleri kalici olmali. Bunun icin host makinede kalici bir klasor belirleyin.

Ornek:

```text
/var/lib/panotour/projects
```

Container icinde ise su path'i kullanmak en temiz secimdir:

```text
/data/projects
```

Yani mantik su:

- sunucu diski: `/var/lib/panotour/projects`
- container ici: `/data/projects`

Sonra env icinde su degeri verecegiz:

```env
PROJECTS_STORAGE_PATH=/data/projects
```

## 9. Sunucuya Baglan

SSH ile VPS'e girin:

```bash
ssh kullanici@sunucu-ip
```

## 10. Coolify Kur

Coolify genelde kendi tek komutlu kurulumuyla kurulur.

Kurulumdan once sunucuda bos portlar ve temel internet erisimi oldugundan emin olun.

Resmi yaklasim degisebilir ama mantik aynidir: Coolify kurulum komutu calistirilir ve kendi servisleri ayaga kalkar.

Kurulum icin guncel komutu Coolify'nin resmi dokumantasyonundan alin.

Kurulumdan sonra genelde sunlari elde edersiniz:

- bir web panel adresi
- ilk admin kullanicisi olusturma ekrani

Not:

- Docker'i elle kurmaniza gerek kalmayabilir
- Coolify kurulum script'i bunu halleder

## 11. Coolify Paneline Gir

Tarayicidan Coolify panelini acin.

Genelde ilk acilista:

1. admin hesap olusturulur
2. server kaydi gorunur
3. kaynaklar ve environment hazir hale gelir

## 12. GitHub Erisimini Bagla

Coolify'nin repodan deploy yapabilmesi icin GitHub baglantisi gerekir.

Genelde iki yoldan biri kullanilir:

1. GitHub App baglamak
2. deploy key veya token ile repository baglamak

Baslangic icin en kolay yol paneldeki GitHub entegrasyonunu kullanmaktir.

Baglarken:

- dogru repo secin
- deploy edeceginiz branch'i secin, genelde `main`

## 13. Coolify Icinde Yeni Application Olustur

Panelden yeni bir application olusturun.

Secimler genelde soyle olur:

- source: GitHub repo
- branch: `main`
- build type: Dockerfile
- Dockerfile location: `/Dockerfile`
- exposed port: `3000`

Bu uygulama Next.js oldugu icin container icinde `npm run start` ile 3000 portunda calisacak.

## 14. Environment Variable'lari Gir

Coolify icinde application env alanina su degiskenleri ekleyin:

```env
NODE_ENV=production
PORT=3000
PROJECTS_STORAGE_PATH=/data/projects
EDIT_SECRET=guclu-bir-editor-sifresi
ADMIN_PASSWORD=guclu-bir-admin-sifresi
```

Eger object storage kullanmayacaksaniz `BLOB_READ_WRITE_TOKEN` eklemeniz gerekmez.

## 15. Persistent Storage Ekle

Bu adim en kritik adimdir.

Coolify icinde application storage veya volume ayarlarina gidin ve bir mapping tanimlayin.

Mantik su olmali:

- host path: `/var/lib/panotour/projects`
- container path: `/data/projects`

Boylece uygulama container silinse bile proje dosyalari sunucuda kalir.

## 16. Domain Bagla

Domain kullanacaksaniz DNS kaydini sunucu IP'sine yonlendirin.

Ornek:

- `A` kaydi
- `tour.sizin-domain.com -> VPS_IP`

Sonra Coolify panelinden bu uygulamaya domain ekleyin.

Coolify genelde SSL tarafini otomatik yonetebilir.

## 17. Ilk Deploy'u Baslat

Panelden deploy islemini baslatin.

Deploy sirasinda sunlar olur:

1. repo cekilir
2. Docker image build edilir
3. container ayaga kalkar
4. domain ve routing aktif olur

Deploy loglarinda hata varsa ilk bakilacak yer orasi olur.

## 18. Uygulamanin Acildigini Test Et

Kontrol edin:

1. ana sayfa aciliyor mu
2. `/admin` aciliyor mu
3. `ADMIN_PASSWORD` ile giris yapiliyor mu

## 19. Kalici Veriyi Test Et

Admin panelden test ZIP yukleyin veya yeni proje olusturun.

Sonra sunucuda klasoru kontrol edin:

```bash
ls -la /var/lib/panotour/projects
```

Iceride proje klasorleri gorunmeli.

Bu cok onemli cunku su seyi dogrular:

- veri container icinde degil
- veri host makinede kalici olarak duruyor

## 20. Ilk Deploy Sonrasi En Onemli Kontroller

Sunlari mutlaka deneyin:

1. `/admin` login
2. ZIP upload
3. proje sayfasini acma
4. editor ekraninda kaydetme
5. deploy yeniden yapildiginda eski projenin durdugunu gorme

## 21. Sorun Cikarsa Ilk Nereye Bakilir

### Uygulama acilmiyorsa

- Coolify deploy logs
- environment variable'lar
- port ayari `3000` mu

### Dosyalar kayboluyorsa

- storage mapping yanlis olabilir
- `PROJECTS_STORAGE_PATH=/data/projects` mi kontrol edin
- host path ile container path karismis olabilir

### Upload calismiyorsa

- once kucuk bir test ZIP ile deneyin
- ters proxy body size limitleri dusuk olabilir
- panel veya proxy tarafinda upload limiti ayari gerekebilir

## 22. Bu Yontemin Avantaji

Coolify ile sunlari elde edersiniz:

- panelden deploy
- panelden log goruntuleme
- domain ve SSL kolayligi
- container tabanli net bir yapi

Ama su prensibi bozmayin:

- uygulama image/container tarafinda yasasin
- proje dosyalari ise her zaman ayri kalici storage'da yasasin

## 23. Kisa Oneri

Ilk kurulumda sistemi fazla karmasiklastirmayin.

En iyi baslangic su olur:

1. tek VPS
2. tek Coolify sunucusu
3. tek app
4. local persistent host path

Sonra isterseniz object storage ve CI/CD iyilestirmesi eklersiniz.