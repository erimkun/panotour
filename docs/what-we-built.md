# Bu Projede Ne Yaptik

Bu dokuman, burada yaptigimiz mimari ve urun gelistirmelerini baska projelerde tekrar kullanabilmek icin hazirlandi.

## 1. Temel Problem Neydi

Uygulama sadece tek bir sabit icerik klasoru gibi dusunuluyordu.

Ihtiyaclar su yondeydi:

- yeni projeler deploy almadan eklenebilsin
- modelci veya editor kullanan kisi teknik olmayan bir akisla proje ekleyebilsin
- hem Vercel + Blob hem de self-hosted + local disk ayni kod tabaninda desteklensin
- proje icerikleri uygulama kodundan ayrilsin
- draft ve published mantigi olsun
- admin panelden zipli ve zipsiz proje olusturulabilsin

## 2. Storage Mimarisi

En kritik mimari degisiklik storage katmani oldu.

Artik sistem iki farkli yapiyi ayni anda destekliyor:

1. Local storage
2. Vercel Blob storage

Karar mekanizmasi:

- `PROJECTS_STORAGE_PATH` varsa yazma islemleri local klasore gider
- `PROJECTS_STORAGE_PATH` yoksa ve `BLOB_READ_WRITE_TOKEN` varsa Blob kullanilir
- okuma tarafinda once local, sonra Blob kontrol edilir

Bu mantik su avantajlari saglar:

- ayni kod hem Vercel hem Nginx sunucuda calisir
- local test ile prod benzeri akis kurulabilir
- deploy ile proje datasi birbirinden ayrilir

## 3. Hardcode public/projects Bagimliligi Kaldirildi

Eskiden `public/projects` varsayimi vardi.

Bu degisti.

Artik proje klasor yolu env ile yonetiliyor.

Ornek:

```env
PROJECTS_STORAGE_PATH=/var/www/panotour-data/projects
```

Bu sayede:

- uygulama kodu ayri klasorde kalir
- proje dosyalari ayri klasorde kalir
- deploy oldugunda proje datasi kaybolmaz

## 4. Admin Upload Akisi Gelistirildi

Admin panel iki farkli proje ekleme yolunu destekler hale geldi.

### A. ZIP ile proje yukleme

- admin panele girilir
- zip yuklenir
- backend zip'i acar
- secilen storage'a yazar
- proje canliya hazir olur

### B. ZIP'siz proje olusturma

- admin panelde proje kodu girilir
- bos editor wizard acilir
- proje adi ve ilk dosyalar secilir
- sonra su 3 secenekten biri kullanilir:

1. editorde ac
2. zip indir
3. sunucuya yaz

Bu, teknik ekip bagimliligini ciddi azaltir.

## 5. Editor Icine Icerik Yukleme Akislari Eklendi

Editor sadece ilk acilis aninda dosya alan bir yapi olmaktan cikarildi.

Artik editor icinde:

- yeni panorama dosyalari eklenebilir
- yeni sahne eklerken sonradan resim yuklenebilir
- floorplan icin ayri resim yuklenebilir
- ses dosyasi sonradan atanabilir

Bu cok onemli cunku gercek hayatta modelci tum dosyalari ilk adimda hazir etmeyebilir.

## 6. Local Preview Mantigi Eklendi

Kaydetmeden once secilen dosyalar editor icinde gorulebilsin diye local preview mantigi kuruldu.

Bu sayede:

- secilen panoramalar aninda izlenebiliyor
- floorplan kaydetmeden once gorunuyor
- VR preview kaydetmeden once calisiyor

Yani editor sadece serverdan veri okuyan bir yer degil, ayni zamanda local draft alanina donustu.

## 7. Draft / Published Durumu Eklendi

Projelere durum alani eklendi.

Durumlar:

- `draft`
- `published`

Kurallar:

- draft projeler public listede gozukmez
- draft projeler public proje sayfasinda acilmaz
- published projeler listede gozukur ve public tarafta acilir

Bu, eksik projelerin yanlislikla canliya cikmasini engeller.

## 8. Admin Panel Yonetim Aracina Donustu

Admin panel sadece zip yukleyen bir ekran olmaktan cikarildi.

Artik:

- mevcut projeler listeleniyor
- proje source bilgisi gorunuyor: local veya blob
- proje status gorunuyor: draft veya published
- proje kodu cakismalari engelleniyor
- taslak proje varsa editor'e yonleniyor

Bu yapi baska multi-project CMS benzeri uygulamalarda da tekrar kullanilabilir.

## 9. WebGL Arka Plan ve Tema Birlestirildi

Ana sayfadaki hareketli 3D serit arka plan ortak component haline getirildi.

Boylece:

- admin panel ana uygulamadan kopuk durmuyor
- ayni gorsel dil korunuyor
- dashboard ve login ekranlari ayni tasarim sisteminde kaliyor

## 10. Dokumantasyon ve Operasyon Hazirlandi

Sadece kod degil, operasyon tarafi da hazirlandi.

Eklenen dokuman tipleri:

- modelci kullanim rehberi
- self-hosted Nginx deployment rehberi
- env ornekleri
- systemd ve nginx template dosyalari

Bu cok degerli cunku benzer uygulamalarda asil zaman kaybi genelde deploy ve operasyon bilgisinin daginik olmasindan gelir.

## 11. Bu Mimariyi Baska Projelerde Nasil Kullanabilirsin

Asagidaki desen tekrar kullanilabilir:

1. Kod ve icerigi ayir
2. Storage secimini env ile yonet
3. Editor icine local draft mantigi ekle
4. Draft ve published durumlari ekle
5. Admin panelde zipli ve zipsiz akis sun
6. Proje kodu cakismalarini admin seviyesinde engelle
7. Modelci veya editor kullanan kisi icin teknik dosya operasyonlarini UI arkasina gizle

## 12. Bu Yapinin Ozu

Bu calismada yaptigimiz sey sadece bir editor eklemek degildi.

Aslinda soyle bir yapi kurduk:

- multi-project content management
- self-hosted veya cloud-compatible storage abstraction
- editor-first proje olusturma
- deploydan bagimsiz icerik yonetimi
- teknik olmayan kullaniciya uygun operasyon akisi

Bu desen, panorama projeleri disinda su alanlarda da calisir:

- 3D model viewer sistemleri
- katalog tabanli medya uygulamalari
- bina/daire tanitim sistemleri
- proje bazli microsite yonetimleri
- medya agirlikli CMS turevleri
