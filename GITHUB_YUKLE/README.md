# Kamu İlan Asistanı

KPSS'li / KPSS'siz kamu ilanlarını toplayan, profilinize göre eşleştiren ve şartları kontrol eden mobil uygulama.

```
backend/   Node.js + Express + TypeScript + SQLite (better-sqlite3)
mobile/    React Native + Expo (TypeScript)
```

## Özellikler

| Özellik | Nerede |
|---|---|
| Kayıt / giriş (JWT), profil (eğitim, bölüm, KPSS puanı/türü, deneyim, doğum yılı, şehir ve iş türü tercihleri) | `backend/src/routes/auth.ts`, `profile.ts` · `mobile/src/screens/AuthScreen.tsx`, `ProfileScreen.tsx` |
| İlan listeleme, arama, filtre (KPSS'li/KPSS'siz, şehir, iş türü, sıralama) | `GET /api/jobs` · `JobsScreen.tsx` |
| Akıllı eşleştirme (❌ içermeyenler, uyum puanına göre) | `GET /api/jobs/matches` · `services/eligibility.ts` |
| Şart kontrolü ✅ ❌ ⚠️ (KPSS, eğitim, bölüm, deneyim, yaş, son tarih, şehir) | `services/eligibility.ts` · `JobDetailScreen.tsx` |
| Push bildirim (yeni ve uygun ilan) | `services/notifier.ts` (Expo Push) · `mobile/src/push.ts` |
| Favoriler ve başvuru takibi (planlandı / başvuruldu / mülakat / kabul / olumsuz + not) | `routes/userLists.ts` · `ListScreens.tsx` |
| Scraping: memurlar.net, DPB/Kamu İlan, İŞKUR, Resmi Gazete | `backend/src/scrapers/` |

**Şart kontrolü anlamları:** ✅ şart sağlanıyor · ❌ sağlanmıyor · ⚠️ ilanda belirtilmemiş veya profilinizde eksik bilgi var (doğrulanamıyor).

## Kurulum

Gereksinim: **Node.js 20+ (LTS)**.

### Backend

```bash
cd backend
npm install
copy .env.example .env      # JWT_SECRET'ı değiştirin
npm run dev                 # http://localhost:4000
```

İlk açılışta veritabanı boşsa uygulamayı denemek için **örnek (uydurma) ilanlar** eklenir
(`SEED_SAMPLE=false` ile kapatılır). Gerçek ilanları çekmek için:

```bash
npm run scrape                 # tüm kaynaklar
npm run scrape -- memurlar     # tek kaynak
```

Scraper her `SCRAPE_CRON` zamanında (varsayılan 3 saatte bir) otomatik çalışır; yeni gelen ilanlar,
bildirimleri açık kullanıcıların profiline göre kontrol edilir ve uygun olanlar için push gönderilir.
`POST /api/admin/scrape` (başlık: `x-admin-key: <ADMIN_KEY>`) ile elle de tetiklenebilir.

### Telefona Kurulum ve Mobil Uygulama

Uygulamayı telefonunuza kurup denemek için 3 yöntem hazırlandı (`http://localhost:4000/indir` sayfasından canlı QR kodlara erişebilirsiniz):

1. **Doğrudan Telefona Kurulum (PWA / WebAPK — Android & iPhone, Ek Uygulama Gerekmez):**
   ```bash
   cd backend
   npm run dev            # Arka uç + Mobil PWA sunucusu (http://localhost:4000)
   npm run mobile:bridge  # HTTPS tüneli + Expo sunucusu
   ```
   - Tarayıcıda `http://localhost:4000/indir` adresini açıp QR kodu telefon kameranızla okutun.
   - **Android (Chrome):** Üstteki **"📲 Uygulamayı Telefona Yükle"** butonuna dokunarak doğrudan uygulama çekmecenize kurun.
   - **iPhone (Safari):** Alt ortadaki **Paylaş (⬆️) → Ana Ekrana Ekle** adımıyla ana ekranınıza kurun.

2. **Native React Native Uygulaması (`mobile/` — Expo Go ile):**
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
   - Mağazadan **Expo Go** indirip QR kodu okutun (`mobile/src/api.ts` HTTPS tünelini ve yerel IP'yi otomatik algılar; giriş ekranından tek dokunuşla demo hesaba girebilirsiniz).

3. **Bağımsız Android `.apk` Paketi (`kamu-ilan-asistani.apk`):**
   - Proje kök dizininde ve `backend/public/kamu-ilan-asistani.apk` altında hazır imzalı `.apk` dosyası yer alır (`http://localhost:4000/indir` üzerinden QR kodla doğrudan telefona indirilebilir).
   - Yeniden derlemek için:
     ```bash
     cd backend
     npm run apk:build
     ```

## Önemli notlar

- **Scraper'lar ilk sürümdür ve test edilmemiştir.** Siteler HTML yapısını değiştirebilir; İŞKUR e‑şube ve
  kamuilan gibi bazı sayfalar içeriği JavaScript ile yükleyebilir (bu durumda HTML'den ilan çıkmaz).
  Seçiciler/URL'ler `backend/src/scrapers/sources.ts` içinde tek yerde toplandı. Kullanmadan önce her sitenin
  kullanım şartlarını ve `robots.txt` dosyasını kontrol edin.
- İlan metninden şart çıkarma (KPSS puanı, eğitim, deneyim, yaş, son tarih) sezgiseldir (`scrapers/parse.ts`);
  hatalı/eksik çıkarımlarda uygulama ⚠️ gösterir. **Başvuru öncesi resmi ilan metnini mutlaka kontrol edin.**
  Aranan bölümler otomatik çıkarılmaz (sadece örnek ilanlarda var).
- Ödev/üretim için: `JWT_SECRET` değiştirin, HTTPS arkasında çalıştırın.

## API özeti

```
POST /api/auth/register | /api/auth/login
GET/PUT /api/profile            PUT /api/profile/push-token
GET /api/jobs?query=&city=&kpss=yes|no&jobType=&education=&sort=newest|deadline&page=&limit=
GET /api/jobs/matches           GET /api/jobs/:id (şart kontrolü ile)     GET /api/jobs/meta
GET /api/favorites              PUT|DELETE /api/favorites/:jobId
GET /api/applications           PUT|DELETE /api/applications/:jobId   {status, notes}
GET /api/notifications          POST /api/notifications/read-all | /test
```
