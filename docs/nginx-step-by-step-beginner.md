# Nginx Sunucuda Prod Kurulum Rehberi

Bu rehber, hic bilmeyen biri icin adim adim yazildi.

Amac:

- uygulamayi sunucuya kurmak
- projeleri ayri klasorde saklamak
- admin panelden yeni proje ekleyebilmek
- deploy sonrasi da sistemin bozulmadan calismasini saglamak

## Adim 1. Sunucuda iki klasor mantigini anla

Iki sey ayri olacak:

1. uygulama kodu
2. proje dosyalari

Ornek:

```text
/var/www/panotour-app
/var/www/panotour-data/projects
```

Birinci klasor kod icin.
Ikinci klasor tum panoramalar, config dosyalari ve assetler icin.

## Adim 2. Sunucuya baglan

SSH ile sunucuya gir.

Ornek:

```bash
ssh kullanici@sunucu-ip
```

## Adim 3. Gerekli paketleri kur

Sunucuda asagidakiler olmali:

1. Node.js
2. npm
3. Nginx

Ubuntu ornegi:

```bash
sudo apt update
sudo apt install -y nginx
```

Node.js icin LTS surum kullan.

## Adim 4. Uygulama klasorunu olustur

```bash
sudo mkdir -p /var/www/panotour-app
sudo mkdir -p /var/www/panotour-data/projects
```

## Adim 5. GitHub kodunu sunucuya al

Sunucuda uygulama klasorune gir:

```bash
cd /var/www
```

Repo klonla:

```bash
git clone REPO_URL panotour-app
```

Eger repo zaten varsa:

```bash
cd /var/www/panotour-app
git pull
```

## Adim 6. Veri klasorune yazma izni ver

Sunucuda uygulamayi calistiracak kullanici bu klasore yazabilmeli.

Ornek:

```bash
sudo chown -R www-data:www-data /var/www/panotour-data
sudo chmod -R 775 /var/www/panotour-data
```

## Adim 7. Uygulama icin env dosyasi olustur

Uygulama klasorunde `.env.production` dosyasi olustur.

Icerik ornegi:

```env
NODE_ENV=production
PORT=3000
PROJECTS_STORAGE_PATH=/var/www/panotour-data/projects
EDIT_SECRET=guclu-bir-editor-sifresi
ADMIN_PASSWORD=guclu-bir-admin-sifresi
```

Not:

- self-hosted kullaniyorsan `PROJECTS_STORAGE_PATH` mutlaka olmali
- eger Blob kullanmayacaksan `BLOB_READ_WRITE_TOKEN` ekleme

## Adim 8. Bagimliliklari yukle

```bash
cd /var/www/panotour-app
npm ci
```

## Adim 9. Production build al

```bash
npm run build
```

Bu adim hata vermezse kod prod icin hazirdir.

## Adim 10. Uygulamayi calistir

En temiz yol `systemd` kullanmaktir.

Repo icinde hazir ornek var:

```text
deploy/systemd/panotour.service.example
```

Sunucuda bu dosyayi service olarak olustur:

```bash
sudo nano /etc/systemd/system/panotour.service
```

Ornek icerik:

```ini
[Unit]
Description=Panotour Next.js App
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/panotour-app
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=www-data
EnvironmentFile=/var/www/panotour-app/.env.production

[Install]
WantedBy=multi-user.target
```

## Adim 11. Service'i aktif et

```bash
sudo systemctl daemon-reload
sudo systemctl enable panotour
sudo systemctl start panotour
sudo systemctl status panotour
```

Status ekraninda hata yoksa uygulama 3000 portunda ayaktadir.

## Adim 12. Nginx ayarini yap

Repo icinde hazir ornek var:

```text
deploy/nginx/panotour.conf.example
```

Sunucuda nginx config dosyasi olustur:

```bash
sudo nano /etc/nginx/sites-available/panotour
```

Ornek icerik:

```nginx
server {
    listen 80;
    server_name alanadiniz.com;

    client_max_body_size 2G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Adim 13. Nginx config'i aktif et

```bash
sudo ln -s /etc/nginx/sites-available/panotour /etc/nginx/sites-enabled/panotour
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` hata vermezse config dogrudur.

## Adim 14. Tarayicida siteyi ac

Sunucunun domainini veya IP adresini ac.

Kontrol et:

1. ana sayfa aciliyor mu
2. `/admin` aciliyor mu
3. admin sifresi ile giriliyor mu

## Adim 15. Test projesi olustur

`/admin` ekranina gir.

Sonra:

1. zip ile bir test proje yukle
2. veya zip'siz yeni proje ac
3. editor icinde bir iki resim ekle
4. `Sunucuya Kaydet` de

## Adim 16. Dosyalarin gercekten dis klasore yazildigini kontrol et

Sunucuda kontrol et:

```bash
ls -la /var/www/panotour-data/projects
```

Orada proje klasorleri gorunmeli.

Ornek:

```text
/var/www/panotour-data/projects/proje-kodu/config.json
/var/www/panotour-data/projects/proje-kodu/images
```

## Adim 17. Project status mantigini unutma

Yeni proje `draft` ise public tarafta gozukmez.

Bu durumda:

1. editoru ac
2. status'u `published` yap
3. kaydet

Sonra ana sayfada ve public URL'de gorunur.

## Adim 18. Sonraki deploy nasil yapilir

Yeni kod geldiginde:

```bash
cd /var/www/panotour-app
git pull
npm ci
npm run build
sudo systemctl restart panotour
```

Bu sirada proje datasi silinmez.

Cunku proje dosyalari kod klasorunde degil, ayri data klasorundedir.

## Adim 19. Yedekleme yap

En az su iki yeri yedekle:

1. `/var/www/panotour-data/projects`
2. `/var/www/panotour-app/.env.production`

## Adim 20. Sorun olursa ilk nereye bakilir

Uygulama loglari:

```bash
sudo journalctl -u panotour -f
```

Nginx loglari:

```bash
sudo tail -f /var/log/nginx/error.log
```

## Kisa Ozet

Kurulum ozeti su:

1. kodu sunucuya al
2. data klasorunu ayir
3. env dosyasini yaz
4. build al
5. systemd ile ayaga kaldir
6. nginx ile proxy et
7. admin panelden proje ekle
