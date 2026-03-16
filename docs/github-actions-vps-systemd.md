# VPS Deployment with GitHub Actions (Nginx + systemd)

Bu rehber, Panotour uygulamanızı Nginx ve `systemd` ile barındırdığınız bir VPS (Sanal Sunucu) ortamına **GitHub Actions** aracılığıyla nasıl otomatik olarak dağıtacağınızı (deploy) anlatır.

## Ön Koşullar

GitHub Actions'ı yapılandırmadan önce, `nginx-self-hosted.md` dosyasında anlatıldığı gibi temel kurulumu tamamladığınızdan emin olun:
- Uygulama kodları `/var/www/panotour-app` dizininde olmalı.
- Kaybolmaması gereken proje verileri `/var/www/panotour-data/projects` dizininde olmalı.
- `panotour.service` adındaki bir `systemd` servisi sürekli çalışır durumda olmalı.
- Sunucuya erişim için bir SSH anahtar çiftiniz (`private/public key`) bulunmalı.

## Adım 1: GitHub Secrets (Gizli Değişkenler) Eklenmesi

GitHub Actions'ın sunucunuza güvenli bir şekilde bağlanabilmesi için SSH giriş bilgilerinizi GitHub deponuza eklemelisiniz.

1. GitHub'da deponuzu açın.
2. **Settings > Secrets and variables > Actions** sekmesine gidin.
3. **New repository secret** butonuna tıklayarak aşağıdaki 4 değişkeni ekleyin:
   - `HOST`: Sunucunuzun IP adresi (örn: `198.51.100.23`).
   - `PORT`: SSH bağlantı portunuz (genellikle `22` olur).
   - `USERNAME`: SSH ile giriş yapan kullanıcı (örn: `root`, `ubuntu` veya deploy işlemi için açılan bir kullanıcı).
   - `SSH_KEY`: **Private (Özel)** SSH anahtarınız (genellikle `-----BEGIN OPENSSH PRIVATE KEY-----` ile başlar).

## Adım 2: Workflow Dosyasının Oluşturulması

Projenizin ana dizininde (root) `.github/workflows/deploy.yml` yolunu takip ederek yeni bir dosya oluşturun ve şu kodları yapıştırın:

```yaml
name: Deploy to Production Server

on:
  push:
    branches:
      - main # Yalnızca main dalına (branch) kod gönderildiğinde tetiklenir

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.3 # SSH üzerinden sunucuya bağlanmayı sağlayan resmi action eklentisi
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          port: ${{ secrets.PORT }}
          script: |
            # 1. Uygulamanın bulunduğu klasöre git
            cd /var/www/panotour-app
            
            # 2. Main branch'teki taze kodları sunucuya indir
            git pull origin main
            
            # 3. Bağımlılıkları temiz bir şekilde kur ve projeyi derle
            npm ci
            npm run build
            
            # 4. Arka planda çalışan systemd servisini yeniden başlat
            sudo systemctl restart panotour
            
            # 5. Hata ayıklama (debug) için servisin güncel durumunu terminale yazdır
            sudo systemctl status panotour --no-pager
```

## Adım 3: Sistem Nasıl Çalışıyor?

1. **Tetiklenme:** Siz yerel bilgisayarınızdan `git push origin main` komutunu çalıştırdığınız anda bu süreç başlar.
2. **Bağlantı Oluşturma:** `appleboy/ssh-action` eklentisi GitHub Secrets alanına girdiğiniz şifreleri kullanarak VPS'inize SSH üzerinden izole ve güvenli bir şekilde bağlanır.
3. **İndirme ve Derleme:** `/var/www/panotour-app` dizinine giderek en temiz güncel kodları çeker, paketleri yükler (`npm ci`) ve Next.js'i yayına (production) hazırlar (`npm run build`).
4. **Yeniden Başlatma:** Tüm arka plan işlemleri bitince, `panotour` isimli `systemd` servisi yeniden başlatılır ve yeni versiyon sıfır veya minimum kesintiyle Nginx üzerinden son kullanıcıya sunulur.

## Sorun Giderme (Troubleshooting)

- **`git pull` sırasında Permission Denied hatası:** GitHub eklentisi ile bağlanan SSH kullanıcısı `root` değilse, `/var/www/panotour-app` klasöründe yazma/okuma yetkisi olduğundan (`chown`/`chmod` ayarları) emin olun.
- **Sudo Şifre İstemi Engeli:** SSH kullanıcınız `root` değilse terminalde `sudo systemctl restart...` derken şifre soracağı için işlem kilitlenir. Bunu aşmak için sunucuda `visudo` komutu ile systemctl komutuna, şifre istemeyecek (/NOPASSWD) şekilde izin verebilirsiniz.
- **`npm run build` sırasında hafızanın bitmesi (OOM Kills):** Sunucunuzun RAM belleği 1GB'tan küçük ise derleme aşamasında çökme yaşanabilir. Sunucu tarafında `swap` (sanal bellek) dosyası oluşturmayı deneyebilirsiniz. 
