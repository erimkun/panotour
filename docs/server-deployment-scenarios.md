# Sunucudan Sunma Senaryolari

Bu dokuman, uygulamayi sunucudan nasil servis edebileceginizi farkli senaryolarla anlatir.

Ama once temel prensip:

- kod ayri yasamali
- proje dosyalari ayri yasamali
- deploy sirasinda icerik silinmemeli
- buyuk dosya upload akisi dikkate alinmali

## Mimariyi Belirleyen Sorular

Asagidaki sorular secimi belirler:

1. Tek VPS mi var, yoksa birden fazla ortam olacak mi?
2. Docker kullanmak istiyor musunuz?
3. Proje dosyalari local diskte mi kalacak, object storage'a mi cikacak?
4. Deploy'u sadece siz mi yapacaksiniz, ekip de yapacak mi?

## Senaryo 1: Tek VPS, En Az Karmasa

Bu en sade ve en guvenli baslangic modelidir.

Yapi:

- Nginx reverse proxy
- Next.js app `systemd` ile ayakta
- proje dosyalari `/var/www/panotour-data/projects` altinda
- backup cron, rsync veya snapshot ile

Avantajlar:

- debug kolaydir
- log toplamak kolaydir
- buyuk upload boyutlarini kontrol etmek kolaydir
- maliyet dusuktur

Dezavantajlar:

- deploy otomasyonu elle kurulur
- branch preview gibi ozellikler dogal gelmez

Kime uygun:

- tek operator veya kucuk ekip
- once stabil calissin, sonra otomasyon eklerim diyenler

## Senaryo 2: Tek VPS, Panel Destekli Kolay Deploy

Burada Coolify, Dokploy veya Easypanel devreye girer.

Yapi:

- VPS uzerinde panel
- uygulama Docker container olarak deploy edilir
- domain, SSL, env panelden yonetilir
- veri volume veya harici object storage'ta tutulur

Avantajlar:

- deploy, restart, rollback daha rahattir
- ekip ici gorunurluk artar
- birden fazla servis yonetmek kolaylasir

Dezavantajlar:

- Docker bilgisi gerekir
- volume, mount, backup ve disk dolulugu dikkat ister

Kime uygun:

- sunucu sizin ama yonetim paneli de istiyorsunuz
- birden fazla proje veya ortam yoneteceksiniz

## Senaryo 3: Kod Managed Platformda, Veri Harici Storage'da

Burada uygulama Vercel, Render veya benzeri platformda calisir; veri ise Blob/S3/object storage tarafina gider.

Yapi:

- app managed platformda deploy edilir
- proje dosyalari object storage'ta durur
- CDN ve edge taraflari platformca yonetilir

Avantajlar:

- en hizli deploy deneyimi
- rollback ve build pipeline kolaydir
- altyapi operasyonu azalir

Dezavantajlar:

- storage stratejisi mecburen harici olur
- lokal disk beklentisi olan akislar uyarlanmalidir
- maliyet ve vendor lock-in artabilir

Kime uygun:

- altyapi yerine urune odaklanmak isteyen ekip
- harici storage kullanmaya hazir takim

## Senaryo 4: Uygulama Ayri, Veri Ayri, Gelecege Hazir Kurulum

Bu, biraz daha profesyonel ama halen gereksiz karmasaya girmeyen yapidir.

Yapi:

- app container veya process olarak ayri deploy edilir
- proje dosyalari object storage veya ayri mounted diskte tutulur
- backup ayridir
- CI/CD ayridir
- gerekirse staging ortami eklenir

Avantajlar:

- buyumeye uygun olur
- veri tasima ve yedek stratejisi netlesir
- deploy ile icerik karismaz

Dezavantajlar:

- ilk kurulum dusunce olarak daha ciddidir
- storage ve permission tasarimi basta netlestirilmelidir

Kime uygun:

- orta vadede trafik, ekip veya proje sayisi artacaksa

## Karsilastirma Tablosu

| Senaryo | Kurulum Hizi | Bakim Kolayligi | Buyume Potansiyeli | En Dogru Veri Stratejisi |
|---|---:|---:|---:|---|
| Tek VPS + Nginx + systemd | Yuksek | Orta | Orta | Ayri disk path |
| VPS + Coolify/Dokploy/Easypanel | Yuksek | Yuksek | Orta-Yuksek | Volume veya object storage |
| Vercel/Render + object storage | Cok yuksek | Cok yuksek | Yuksek | Object storage |
| Ayri app + ayri storage mimarisi | Orta | Yuksek | Cok yuksek | Object storage veya ayrik disk |

## Hangi Sunucu Tipiyle Baslanmali

Genelde su sira mantikli olur:

| Asama | Oneri |
|---|---|
| Baslangic | 1 VPS, 2-4 vCPU, 4-8 GB RAM, SSD |
| Buyuyen ortam | Ayrik storage veya object storage ekle |
| Ekipli kullanim | Staging + production ayir |
| Surekli yayin | Panel veya CI/CD pipeline ekle |

## Pratik Oneri

Bu proje icin asagidaki karar akisi genelde dogru olur:

1. Eger hemen yayin almak istiyorsaniz Nginx + systemd ile baslayin.
2. Eger deploy'u panelden yonetmek istiyorsaniz Coolify tarafina gecin.
3. Eger medya ve proje dosyasi sayisi artacaksa local diski merkez yapmayin; object storage planlayin.
4. Eger ekip buyuyecekse staging ve production ayrimini erken kurun.

## Panotour Icin Onerilen Yol

En dengeli yol genelde su olur:

- production app ayri deploy olsun
- proje icerigi koddan ayri saklansin
- backup otomatik olsun
- deploy pipeline uygulamayi guncellesin ama proje dosyalarina dokunmasin

Yani "sunucudan servis etme" konusunu sadece web server olarak degil, veri omru ve deploy guvenligi olarak dusunmek gerekir.