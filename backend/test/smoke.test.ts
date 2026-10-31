// Uçtan uca duman testi. Ağ bağlantısı kullanmaz: istekler light-my-request ile
// doğrudan Express uygulamasına verilir. Geçici bir SQLite dosyası kullanır.
// Çalıştırma: npm run test:smoke
import assert from 'node:assert/strict';
import fs from 'node:fs';
import inject from 'light-my-request';

const DB = './data/smoke-test.db';
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
process.env.DB_PATH = DB;

type Res = { status: number; data: any };

async function main() {
  const { app } = await import('../src/app');
  const { db } = await import('../src/db');
  const { seedSampleJobs } = await import('../src/seed');
  seedSampleJobs();

  const call = async (
    path: string,
    opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; token?: string } = {},
  ): Promise<Res> => {
    const res = await inject(app as any, {
      method: opts.method ?? 'GET',
      url: `/api${path}`,
      payload: opts.body as any,
      headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    });
    return { status: res.statusCode, data: res.payload ? JSON.parse(res.payload) : null };
  };

  // Demo hesabı kaldırılmış olmalı, Admin hesabı (IGAREN24 / 852725193As) hazır gelmeli
  let r = await call('/auth/login', { method: 'POST', body: { email: 'demo@kamuilan.local', password: 'demo123' } });
  assert.equal(r.status, 401, 'demo hesabı kaldırılmış olmalı');

  r = await call('/auth/login', { method: 'POST', body: { username: 'IGAREN24', password: '852725193As' } });
  assert.equal(r.status, 200, 'admin hesabıyla giriş');
  assert.equal(r.data.user.isAdmin, true, 'admin yetkisi olmalı');
  const adminStats = await call('/admin/stats', { token: r.data.token });
  assert.equal(adminStats.status, 200, 'admin istatistiklerine erişim');

  // Meta API kontrolü (kpssTypes ve bölümler dönmeli)
  const metaRes = await call('/jobs/meta');
  assert.equal(metaRes.status, 200);
  assert.ok(metaRes.data.kpssTypes.some((t: any) => t.label === 'Ortaöğretim' && t.value === 'P94'));
  assert.ok(metaRes.data.undergradDepartments.includes('Bilgisayar Mühendisliği'));
  assert.ok(metaRes.data.undergradDepartments.length > 50);

  r = await call('/auth/register', {
    method: 'POST',
    body: { email: 'Test@Example.com', password: 'secret1', fullName: 'Ali Veli' },
  });
  assert.equal(r.status, 201, 'kayıt');
  assert.equal(r.data.requiresVerification, true, 'doğrulama adımı gerekmeli');
  const dbRecord = db.prepare('SELECT code FROM email_verifications WHERE LOWER(email) = LOWER(?)').get('test@example.com') as { code: string };
  const code = dbRecord.code;
  assert.ok(code && code.length === 6, '6 haneli rastgele kod üretilmiş olmalı');

  // Doğrulama yapılmadan giriş 403 Forbidden ile engellenmeli
  r = await call('/auth/login', { method: 'POST', body: { email: 'test@example.com', password: 'secret1' } });
  assert.equal(r.status, 403, 'onaylanmamış hesapla giriş engellenmeli');
  assert.equal(r.data.requiresVerification, true);

  // Yanlış kod reddedilmeli
  r = await call('/auth/verify-email', { method: 'POST', body: { email: 'test@example.com', code: '000000' } });
  assert.equal(r.status, 400, 'hatalı kod reddedilmeli');

  // Doğru kodla doğrulama yapılmalı ve token alınmalı
  r = await call('/auth/verify-email', { method: 'POST', body: { email: 'test@example.com', code } });
  assert.equal(r.status, 200, 'doğru kodla hesap onaylanmalı');
  const token = r.data.token as string;
  assert.ok(token, 'onay sonrası token dönmeli');

  // Tekrar kayıt olma denenirse 409 vermeli
  r = await call('/auth/register', { method: 'POST', body: { email: 'test@example.com', password: 'secret1' } });
  assert.equal(r.status, 409, 'aynı e-posta ikinci kez kayıt olamaz');

  // Yanlış şifre denemesi
  r = await call('/auth/login', { method: 'POST', body: { email: 'test@example.com', password: 'yanlis!' } });
  assert.equal(r.status, 401, 'yanlış şifre');

  // Doğrulanmış hesapla normal şifreyle giriş başarılı olmalı
  r = await call('/auth/login', { method: 'POST', body: { email: 'test@example.com', password: 'secret1' } });
  assert.equal(r.status, 200, 'doğrulandıktan sonra giriş başarılı olmalı');

  r = await call('/profile', {
    method: 'PUT',
    token,
    body: {
      fullName: 'Ali Veli', birthYear: 1998, educationLevel: 'lisans', department: 'Bilgisayar Mühendisliği',
      kpssScore: 72, kpssType: 'p3', experienceYears: 0, cities: ['Ankara', 'İstanbul'],
      jobTypes: ['sozlesmeli'], notificationsEnabled: true,
    },
  });
  assert.equal(r.status, 200, `profil: ${JSON.stringify(r.data)}`);
  assert.equal(r.data.profile.kpssType, 'P3');
  assert.equal(r.data.profile.department, 'Bilgisayar Mühendisliği', 'lisansta bölüm saklanır');

  r = await call('/jobs?limit=50', { token });
  assert.equal(r.status, 200);
  assert.ok(r.data.total >= 12, 'örnek ilanlar yüklenmeli');
  const kpssJob = r.data.items.find((j: any) => j.kpssRequired === true);
  assert.ok(kpssJob, 'KPSS şartlı ilan bulunmalı');
  assert.ok(kpssJob.historicalPlacement, 'KPSS şartlı ilanda geçmiş yıllar atama ortalaması bulunmalı');
  assert.ok(kpssJob.historicalPlacement.avgScore > 65, 'Ortalama puan hesaplanmış olmalı');
  assert.ok(
    r.data.items.every((j: any) => !j.url || new URL(j.url).pathname.replace(/\/+$/, '').length > 0),
    'hiçbir ilan ana sayfa (/) bağlantısı içermemeli',
  );
  const find = (t: string) => r.data.items.find((j: any) => j.title.includes(t));
  assert.equal(find('Bilişim Personeli').eligibility.overall, 'ok', 'KPSS 72≥70, bölüm+eğitim uygun → ✅');
  assert.equal(find('Zabıt Katibi').eligibility.overall, 'fail', 'KPSS 72<75 → ❌');
  assert.equal(find('Hemşire').eligibility.overall, 'fail', 'bölüm uyumsuz → ❌');
  assert.equal(find('Büro Personeli').eligibility.overall, 'warn', 'taban puan belirsiz → ⚠️');
  assert.equal(find('Temizlik İşçisi').eligibility.overall, 'ok', "KPSS'siz → ✅");

  r = await call('/jobs?kpss=no&limit=50');
  assert.ok(r.data.items.length > 0 && r.data.items.every((j: any) => j.kpssRequired === false), "KPSS'siz filtresi");
  r = await call('/jobs?query=hemsire');
  assert.equal(r.data.total, 1, 'Türkçe karakter duyarsız arama (hemsire → Hemşire)');
  r = await call('/jobs?city=Ankara');
  assert.ok(r.data.items.length > 0 && r.data.items.every((j: any) => j.city === 'Ankara'), 'şehir filtresi');
  r = await call('/jobs?query=cankurtaran');
  assert.ok(r.data.total >= 1, 'sertifika adıyla arama');

  r = await call('/jobs/matches?limit=50', { token });
  assert.equal(r.status, 200);
  assert.ok(r.data.items.every((j: any) => j.eligibility.overall !== 'fail'), 'eşleşmelerde ❌ olmamalı');
  const scores: number[] = r.data.items.map((j: any) => j.eligibility.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'puana göre sıralı');
  const jobId = r.data.items[0].id;

  r = await call(`/jobs/${jobId}`, { token });
  assert.ok(r.data.eligibility.checks.length > 0, 'detayda şart listesi');

  assert.equal((await call(`/favorites/${jobId}`, { method: 'PUT', token })).status, 200);
  r = await call('/favorites', { token });
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.items[0].isFavorite, true);
  await call(`/favorites/${jobId}`, { method: 'DELETE', token });
  assert.equal((await call('/favorites', { token })).data.items.length, 0);

  r = await call(`/applications/${jobId}`, {
    method: 'PUT', token, body: { status: 'applied', notes: 'Başvuru no: 123' },
  });
  assert.equal(r.status, 200);
  r = await call('/applications', { token });
  assert.equal(r.data.items[0].status, 'applied');
  assert.equal(r.data.items[0].notes, 'Başvuru no: 123');

  assert.equal((await call('/profile')).status, 401, 'tokensız erişim engellenmeli');
  assert.equal((await call('/notifications', { token })).status, 200);

  // Bildirim akışı: yeni uygun ilan eklenince kullanıcı için bildirim kaydı oluşmalı (push token yok → sadece kayıt)
  const { upsertJob } = await import('../src/services/jobsRepo');
  const { notifyForNewJobs } = await import('../src/services/notifier');
  const { id } = upsertJob({
    source: 'test', externalId: 'n1', title: 'Yeni Yazılım Uzmanı', institution: 'Test Kurumu', city: 'Ankara',
    description: 'test', url: null, publishedAt: new Date().toISOString(), deadline: null, kpssRequired: true,
    minKpssScore: 60, kpssType: 'P3', minEducation: 'lisans', requiredDepartments: ['Bilgisayar Mühendisliği'],
    requiredCertificates: [], certificateMode: 'all',
    minExperienceYears: null, maxAge: null, positions: 1, jobType: 'sozlesmeli',
  });
  const res = await notifyForNewJobs([id]);
  assert.ok(res.matched >= 1, 'uygun yeni ilan için bildirim oluşmalı');
  r = await call('/notifications', { token });
  assert.ok(r.data.items.length >= 1);
  assert.ok(r.data.unread >= 1);
  assert.equal((await notifyForNewJobs([id])).matched, 0, 'aynı ilan için ikinci bildirim gitmemeli');

  // --- Lise ve altı: bölüm alanı temizlenir; sertifika şartları kontrol edilir ---
  const putProfile = (over: Record<string, unknown>) =>
    call('/profile', {
      method: 'PUT', token,
      body: {
        fullName: 'Ali Veli', birthYear: 1998, educationLevel: 'lise', department: 'Bilgisayar Mühendisliği',
        kpssScore: 70, kpssType: 'P93', experienceYears: 0, cities: ['Ankara'], jobTypes: [], notificationsEnabled: true,
        certificates: [], ...over,
      },
    });
  const jobByTitle = async (t: string) => {
    const list = await call('/jobs?limit=50&includeExpired=true', { token });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const found = list.data.items.find((j: any) => j.title.includes(t));
    assert.ok(found, `ilan bulunamadı: ${t}`);
    return (await call(`/jobs/${found.id}`, { token })).data; // şart listesi detayda döner
  };
  const chk = (job: any, key: string): string => {
    const c = job.eligibility.checks.find((x: any) => x.key === key);
    assert.ok(c, `${job.title}: '${key}' kontrolü yok → ${JSON.stringify(job.eligibility.checks.map((x: any) => x.key))}`);
    return c.status;
  };

  // Lisans ve üstü öğrencinin havuz dışı uydurma bölüm girmesi engellenmeli
  const invalidDeptRes = await call('/profile', {
    method: 'PUT',
    token,
    body: {
      fullName: 'Ali Veli',
      educationLevel: 'lisans',
      department: 'Rastgele Uydurma Bolum 123',
    },
  });
  assert.equal(invalidDeptRes.status, 400, 'lisans ve üstü için havuz dışı bölüm reddedilmeli');

  r = await putProfile({});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.profile.department, '', 'lise mezununda bölüm kaydedilmemeli');
  assert.equal(chk(await jobByTitle('Hemşire'), 'department'), 'fail', 'lise + bölüm şartı → ❌');

  let pool = await jobByTitle('Havuz Görevlisi');
  assert.equal(chk(pool, 'certificate'), 'warn', 'sertifika yok → ⚠️');

  await putProfile({ certificates: ['Aşçılık Belgesi'] });
  pool = await jobByTitle('Havuz Görevlisi');
  assert.equal(chk(pool, 'certificate'), 'fail', 'yanlış sertifika → ❌');
  assert.equal(pool.eligibility.overall, 'fail');

  r = await putProfile({ certificates: ['havuz operatörü belgesi', 'Cankurtaran Belgesi', 'Cankurtaran Belgesi'] });
  assert.equal(r.data.profile.certificates.length, 2, 'tekrarlar silinmeli ve katalog adına çevrilmeli');
  assert.ok(r.data.profile.certificates.includes('Havuz Suyu Operatörü Belgesi'));
  pool = await jobByTitle('Havuz Görevlisi');
  assert.equal(chk(pool, 'certificate'), 'ok', 'doğru sertifikalar → ✅');
  assert.equal(pool.eligibility.overall, 'ok');

  // "A veya B": biri yeterli
  await putProfile({ certificates: ['Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi'] });
  assert.equal(chk(await jobByTitle('Bilgisayar İşletmeni'), 'certificate'), 'ok', 'veya → biri yeterli');

  // Sürücü belgesi sınıfları
  await putProfile({ certificates: ['B Sınıfı Sürücü Belgesi', 'SRC Belgesi'] });
  assert.equal(chk(await jobByTitle('SRC Belgeli'), 'certificate'), 'fail', 'B ≠ E');

  r = await call('/jobs/meta');
  assert.ok(r.data.certificates.includes('Havuz Suyu Operatörü Belgesi'), 'meta: sertifika kataloğu');
  assert.deepEqual(r.data.noDepartmentLevels, ['ilkokul', 'ortaokul', 'lise']);

  // Mobil kurulum (PWA manifest, Service Worker, QR ve mobil bilgi uç noktaları)
  const manifestRes = await inject(app as any, { method: 'GET', url: '/manifest.webmanifest' });
  assert.equal(manifestRes.statusCode, 200, 'PWA manifest erişilebilir olmalı');
  assert.equal(JSON.parse(manifestRes.payload).display, 'standalone', 'PWA standalone modda olmalı');

  const swRes = await inject(app as any, { method: 'GET', url: '/sw.js' });
  assert.equal(swRes.statusCode, 200, 'Service worker erişilebilir olmalı');

  const indirRes = await inject(app as any, { method: 'GET', url: '/indir' });
  assert.equal(indirRes.statusCode, 200, 'Mobil indirme merkezi erişilebilir olmalı');

  r = await call('/mobile-info');
  assert.equal(r.status, 200, 'mobile-info uç noktası');
  assert.ok(r.data.primaryInstallUrl, 'primaryInstallUrl dönmeli');

  const qrRes = await inject(app as any, { method: 'GET', url: '/api/qr.svg?text=https://kamuilan.local' });
  assert.equal(qrRes.statusCode, 200, 'QR SVG üretilmeli');
  assert.ok(qrRes.payload.startsWith('<svg'), 'QR çıktısı geçerli SVG olmalı');

  // --- CV Yorumlama ve Puanlama Motoru testleri ---
  let cvRes = await call('/cv', { token });
  assert.equal(cvRes.status, 200);
  assert.equal(cvRes.data.saved, null, 'başlangıçta kayıtlı CV olmamalı');

  // 1) Eksik CV -> düşük puan + kesinti nedenleri toplamı tam 100 - score olmalı
  cvRes = await call('/cv/analyze', {
    method: 'POST',
    token,
    body: {
      cvText: 'Merhaba ben Ali Yılmaz, Ankara ilinde yaşıyorum ve memur kadrolarına başvurmak istiyorum.',
      targetTrack: 'memur',
    },
  });
  assert.equal(cvRes.status, 200);
  const weak = cvRes.data.analysis;
  assert.ok(weak.score < 45, `eksik CV düşük puan almalı: ${weak.score}`);
  assert.equal(weak.score + weak.totalDeducted, 100, 'puan + toplam kesinti = 100');
  assert.equal(
    weak.deductions.reduce((s: number, d: any) => s + d.pointsLost, 0),
    weak.totalDeducted,
    'kesinti maddelerinin toplamı tam olarak kırılan puana eşit olmalı',
  );
  assert.ok(weak.deductions.some((d: any) => d.id === 'contact_email'), 'e-posta eksikliği gösterilmeli');
  assert.ok(weak.deductions.some((d: any) => d.id === 'exam_or_vocational'), 'KPSS eksikliği gösterilmeli');

  // 2) Güçlü CV (.txt dosya yükleme simülasyonu + profile aktarım)
  const strongCvText = `Ahmet Kaya
Ankara | 0532 444 55 66 | ahmet.kaya@gmail.com | linkedin.com/in/ahmetkaya | B Sınıfı Sürücü Belgesi

PROFESYONEL ÖZET
Bilgisayar Mühendisliği lisans mezunu olarak kamu kurumlarında yazılım geliştirme ve veri analizi süreçlerinde 3 yıl deneyime sahibim. Güçlü analitik düşünme ve problem çözme becerilerimle kamu dijital dönüşüm projelerine katkı sağlamayı hedefliyorum.

EĞİTİM BİLGİLERİ
Hacettepe Üniversitesi - Mühendislik Fakültesi, Bilgisayar Mühendisliği (Lisans) | 2018 - 2022 | GANO: 3.42 / 4.00

İŞ VE STAJ DENEYİMİ
Strateji Kurumu Bilgi İşlem Müdürlüğü - Yazılım Mühendisi (2022 - 2025)
- Kurum içi EBYS entegrasyon modüllerini geliştirdim ve bakım süreçlerini yürüttüm.
- 250+ personelin kullandığı raporlama ekranlarını tasarladım, işlem süresini %35 iyileştirdim.
- 6 kişilik teknik ekiple veri tabanı analiz ve koordinasyon çalışmalarını gerçekleştirdim.

SINAV, YABANCI DİL VE SERTİFİKALAR
2024 KPSS Lisans P3: 84,5
Yabancı Dil: İngilizce - İleri Seviye (B2, YDS: 78)
Belgeler: MEB Onaylı Bilgisayar İşletmenliği Sertifikası, İş Sağlığı ve Güvenliği Sertifikası

TEKNİK VE KİŞİSEL YETKİNLİKLER
Python, TypeScript, SQL, MS Office (Excel, Word, PowerPoint), EBYS, Linux
Ekip Çalışması, Zaman Yönetimi, Analitik Düşünme, Etkili İletişim

PROJELER VE REFERANSLAR
Proje: Kamu İlan Eşleştirme ve Doküman Yönetim Sistemi
Referans: Prof. Dr. Mehmet Demir - Hacettepe Üniversitesi (mehmet.demir@uni.edu.tr)`;

  cvRes = await call('/cv/analyze', {
    method: 'POST',
    token,
    body: {
      fileName: 'ozgecmis.txt',
      fileBase64: Buffer.from(strongCvText, 'utf8').toString('base64'),
      targetTrack: 'sozlesmeli',
    },
  });
  assert.equal(cvRes.status, 200, JSON.stringify(cvRes.data));
  const strong = cvRes.data.analysis;
  assert.ok(strong.score >= 92, `güçlü CV yüksek puan almalı: ${strong.score}`);
  assert.equal(strong.score + strong.totalDeducted, 100);

  const savedCvRes = await call('/cv', { token });
  assert.equal(savedCvRes.data.saved.analysis.score, strong.score, 'son CV analizi kaydedilmeli');

  const applyRes = await call('/cv/apply-to-profile', { method: 'POST', token });
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.data.profile.educationLevel, 'lisans');
  assert.equal(applyRes.data.profile.department, 'Bilgisayar Mühendisliği');
  assert.equal(applyRes.data.profile.kpssScore, 84.5);
  assert.equal(applyRes.data.profile.kpssType, 'P3');

  // APK indirme uç noktaları kontrolü
  assert.ok(indirRes.payload.includes('kamu-ilan-asistani.apk'), '/indir APK bağlantısını içermeli');

  const apkRes = await inject(app as any, { method: 'GET', url: '/kamu-ilan-asistani.apk' });
  assert.equal(apkRes.statusCode, 200, '/kamu-ilan-asistani.apk indirilebilir olmalı');
  assert.equal(apkRes.headers['content-type'], 'application/vnd.android.package-archive');
  assert.ok(apkRes.rawPayload.length > 200_000, 'APK boyutu geçerli olmalı');
  assert.equal(apkRes.rawPayload[0], 0x50, 'APK geçerli ZIP (PK) imzasıyla başlamalı');
  assert.equal(apkRes.rawPayload[1], 0x4b, 'APK geçerli ZIP (PK) imzasıyla başlamalı');

  const shortApkRes = await inject(app as any, { method: 'GET', url: '/apk' });
  assert.equal(shortApkRes.statusCode, 200, '/apk kısa indirme linki çalışmalı');

  const mobileInfoRes = await call('/mobile-info');
  assert.equal(mobileInfoRes.status, 200);
  assert.equal(mobileInfoRes.data.apkAvailable, true);
  assert.ok(mobileInfoRes.data.apkDownloadUrl.endsWith('/kamu-ilan-asistani.apk'));

  console.log('✅ Tüm duman testleri geçti');
}

const cleanup = async () => {
  try {
    (await import('../src/db')).db.close(); // Windows'ta açık dosya silinemez
    for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  } catch {
    /* geçici dosya; bir sonraki çalıştırmada silinir */
  }
};

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('❌ Test başarısız:', e.message);
    await cleanup();
    process.exit(1);
  });
