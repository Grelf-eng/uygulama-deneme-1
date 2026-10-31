import bcrypt from 'bcryptjs';
import { db } from './db';
import { upsertJob } from './services/jobsRepo';
import { ensureProfile } from './services/profileRepo';
import { NewJob } from './types';

const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

const base = {
  source: 'ornek',
  description: '',
  url: null as string | null,
  requiredDepartments: [] as string[],
  requiredCertificates: [] as string[],
  certificateMode: 'all' as 'all' | 'any',
  minKpssScore: null as number | null,
  kpssType: null as string | null,
  minEducation: null as NewJob['minEducation'],
  minExperienceYears: null as number | null,
  maxAge: null as number | null,
  positions: null as number | null,
};

/** Geliştirme/demoda uygulamanın boş görünmemesi için örnek (uydurma) ilanlar. */
const samples: NewJob[] = [
  {
    ...base, externalId: 's1', title: 'Sözleşmeli Bilişim Personeli (4/B)', institution: 'Örnek Üniversitesi',
    city: 'Ankara', jobType: 'sozlesmeli', kpssRequired: true, kpssType: 'P3', minKpssScore: 70,
    minEducation: 'lisans', requiredDepartments: ['Bilgisayar Mühendisliği', 'Yazılım Mühendisliği'],
    positions: 3, deadline: iso(10), publishedAt: iso(-1),
    description: 'KPSSP3 puan türünden en az 70 puan almış, bilgisayar/yazılım mühendisliği mezunu adaylar.',
  },
  {
    ...base, externalId: 's2', title: 'Zabıt Katibi Alımı', institution: 'Adalet Bakanlığı',
    city: 'İstanbul', jobType: 'memur', kpssRequired: true, kpssType: 'P93', minKpssScore: 75,
    minEducation: 'lise', maxAge: 35, positions: 120, deadline: iso(14), publishedAt: iso(-2),
    description: 'KPSS P93 puanı en az 75 olan, 35 yaşını doldurmamış lise ve dengi okul mezunları.',
  },
  {
    ...base, externalId: 's3', title: 'Belediye Temizlik İşçisi (KPSS şartsız)', institution: 'Örnek Belediyesi',
    city: 'İzmir', jobType: 'isci', kpssRequired: false, minEducation: 'ilkokul', positions: 25,
    deadline: iso(7), publishedAt: iso(-1), description: 'İŞKUR üzerinden kura ile alınacak, KPSS şartı aranmaz.',
  },
  {
    ...base, externalId: 's4', title: 'Güvenlik Görevlisi (Özel Güvenlik Belgeli)', institution: 'Devlet Hastanesi',
    city: 'Bursa', jobType: 'isci', kpssRequired: false, minEducation: 'lise', maxAge: 40, positions: 10,
    deadline: iso(5), publishedAt: iso(0), description: 'Geçerli özel güvenlik kimlik kartı olan adaylar.',
  },
  {
    ...base, externalId: 's5', title: 'Araştırma Görevlisi', institution: 'Örnek Teknik Üniversitesi',
    city: 'Konya', jobType: 'akademik', kpssRequired: false, minEducation: 'yuksek_lisans',
    requiredDepartments: ['Elektrik-Elektronik Mühendisliği'], positions: 2, deadline: iso(20),
    publishedAt: iso(-3), description: 'ALES şartı aranır. Yüksek lisans öğrencisi veya mezunu olmak.',
  },
  {
    ...base, externalId: 's6', title: 'Mühendis (Sözleşmeli 4/B)', institution: 'Karayolları Bölge Müdürlüğü',
    city: 'Trabzon', jobType: 'sozlesmeli', kpssRequired: true, kpssType: 'P3', minKpssScore: 65,
    minEducation: 'lisans', requiredDepartments: ['İnşaat Mühendisliği'], minExperienceYears: 2, positions: 4,
    deadline: iso(12), publishedAt: iso(-2), description: 'En az 2 yıl deneyimli inşaat mühendisi aranmaktadır.',
  },
  {
    ...base, externalId: 's7', title: 'Memur – Veri Hazırlama ve Kontrol İşletmeni', institution: 'Sağlık Bakanlığı',
    city: 'Ankara', jobType: 'memur', kpssRequired: true, kpssType: 'P93', minKpssScore: 70,
    minEducation: 'onlisans', positions: 15, deadline: iso(9), publishedAt: iso(-1),
    description: 'Ön lisans mezunu, KPSS P93 puanı en az 70.',
  },
  {
    ...base, externalId: 's8', title: 'Büro Personeli', institution: 'Örnek İl Özel İdaresi',
    city: 'Samsun', jobType: 'sozlesmeli', kpssRequired: true, kpssType: 'P93', minKpssScore: null,
    minEducation: 'onlisans', positions: 2, deadline: iso(15), publishedAt: iso(-4),
    description: 'KPSS puan şartı ilan metninde ayrıca belirtilmiştir.',
  },
  {
    ...base, externalId: 's9', title: 'Sürekli İşçi Alımı (Şoför, E Sınıfı Ehliyetli)', institution: 'Karayolları',
    city: 'Antalya', jobType: 'isci', kpssRequired: null, minEducation: 'ortaokul', minExperienceYears: 3,
    positions: 8, deadline: iso(6), publishedAt: iso(0), description: 'En az 3 yıl deneyimli olmak.',
  },
  {
    ...base, externalId: 's10', title: 'Hemşire Alımı (4/B)', institution: 'Örnek Şehir Hastanesi',
    city: 'Eskişehir', jobType: 'sozlesmeli', kpssRequired: true, kpssType: 'P3', minKpssScore: 60,
    minEducation: 'lisans', requiredDepartments: ['Hemşirelik'], positions: 30, deadline: iso(11),
    publishedAt: iso(-1), description: 'Hemşirelik lisans mezunu adaylar.',
  },
  {
    ...base, externalId: 's11', title: 'Kamu Bankası Gişe Memuru', institution: 'Örnek Banka', city: 'İstanbul',
    jobType: 'memur', kpssRequired: true, kpssType: 'P93', minKpssScore: 90, minEducation: 'lise', positions: 5,
    deadline: iso(3), publishedAt: iso(-5), description: 'Yüksek puanlı adaylar için.',
  },
  {
    ...base, externalId: 's12', title: 'Park ve Bahçe İşçisi', institution: 'Örnek Belediyesi', city: 'Ankara',
    jobType: 'isci', kpssRequired: false, minEducation: 'ilkokul', positions: 12, deadline: null,
    publishedAt: iso(-6), description: 'KPSS aranmaz, son başvuru tarihi belli değil.',
  },
  {
    ...base, externalId: 's13', title: 'Havuz Görevlisi (Havuz Suyu Operatörü)', institution: 'Örnek Belediyesi Spor Müdürlüğü',
    city: 'Ankara', jobType: 'isci', kpssRequired: false, minEducation: 'lise', positions: 3, deadline: iso(8),
    publishedAt: iso(0), requiredCertificates: ['Havuz Suyu Operatörü Belgesi', 'Cankurtaran Belgesi'],
    description: 'Havuz suyu operatörü belgesi ve cankurtaran belgesi olan, lise mezunu adaylar.',
  },
  {
    ...base, externalId: 's14', title: 'Büro Elemanı (Bilgisayar İşletmeni)', institution: 'Örnek İl Sağlık Müdürlüğü',
    city: 'İstanbul', jobType: 'sozlesmeli', kpssRequired: true, kpssType: 'P93', minKpssScore: 65, minEducation: 'lise',
    positions: 6, deadline: iso(13), publishedAt: iso(-1),
    requiredCertificates: ['Bilgisayar İşletmenliği Sertifikası', 'Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi'],
    certificateMode: 'any',
    description: 'Bilgisayar İşletmenliği Sertifikası veya Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi sahibi olmak.',
  },
  {
    ...base, externalId: 's15', title: 'Şoför (E Sınıfı Ehliyetli, SRC Belgeli)', institution: 'Örnek Büyükşehir Belediyesi',
    city: 'İzmir', jobType: 'isci', kpssRequired: false, minEducation: 'ortaokul', positions: 4, deadline: iso(9),
    publishedAt: iso(-2), requiredCertificates: ['E Sınıfı Sürücü Belgesi', 'SRC Belgesi'],
    description: 'E sınıfı sürücü belgesi ve SRC belgesi olmak.',
  },
];

export function ensureAdminUser(): void {
  // Eski demo hesabını kaldır
  db.prepare("DELETE FROM users WHERE LOWER(email) = 'demo@kamuilan.local'").run();

  // Yönetici (Admin) hesabını oluştur veya güncelle: IGAREN24 / 852725193As
  const adminUsername = 'IGAREN24';
  const adminPass = '852725193As';
  const existingAdmin = db
    .prepare('SELECT id, password_hash, is_admin FROM users WHERE LOWER(email) = LOWER(?)')
    .get(adminUsername) as { id: number; password_hash: string; is_admin: number } | undefined;

  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 10);
    const info = db
      .prepare('INSERT INTO users (email, password_hash, is_admin, is_verified) VALUES (?, ?, 1, 1)')
      .run(adminUsername, hash);
    const adminId = Number(info.lastInsertRowid);
    ensureProfile(adminId, 'IGAREN24');
  } else {
    const passMatches = bcrypt.compareSync(adminPass, existingAdmin.password_hash);
    if (!passMatches || existingAdmin.is_admin !== 1) {
      const hash = bcrypt.hashSync(adminPass, 10);
      db.prepare('UPDATE users SET email = ?, password_hash = ?, is_admin = 1, is_verified = 1 WHERE id = ?').run(
        adminUsername,
        hash,
        existingAdmin.id,
      );
    } else {
      db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(existingAdmin.id);
    }
    ensureProfile(existingAdmin.id, 'IGAREN24');
  }
}

export function seedSampleJobs(): number {
  ensureAdminUser();

  // Eski sahte 'ornek' taslak ilanları tamamen temizle
  db.prepare("DELETE FROM jobs WHERE source = 'ornek'").run();

  // Gerçek ilanlar zaten yüklüyse tekrar ekleme
  const realCount = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE source != 'ornek'").get() as { c: number }).c;
  if (realCount >= 50) return 0;

  try {
    const fs = require('fs');
    const path = require('path');
    const seedFile = path.join(__dirname, 'data', 'realJobs.json');
    if (fs.existsSync(seedFile)) {
      const realJobs = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      for (const j of realJobs) {
        upsertJob({
          source: j.source,
          externalId: j.external_id,
          title: j.title,
          institution: j.institution,
          city: j.city,
          description: j.description || '',
          url: j.url,
          publishedAt: j.published_at,
          deadline: j.deadline,
          kpssRequired: j.kpss_required === 1 ? true : j.kpss_required === 0 ? false : null,
          minKpssScore: j.min_kpss_score,
          kpssType: j.kpss_type,
          minEducation: j.min_education,
          requiredDepartments: JSON.parse(j.required_departments || '[]'),
          requiredCertificates: JSON.parse(j.required_certificates || '[]'),
          certificateMode: j.certificate_mode || 'all',
          minExperienceYears: j.min_experience_years,
          maxAge: j.max_age,
          positions: j.positions,
          jobType: j.job_type || 'diger',
        });
      }
      console.log(`[seed] 115 gerçek kamu ilanı başarıyla sisteme mühürlendi.`);
      return realJobs.length;
    }
  } catch (err: any) {
    console.error('[seed] Gerçek ilan yükleme hatası:', err.message);
  }

  // Yedek olarak samples
  const count = (db.prepare("SELECT COUNT(*) AS c FROM jobs").get() as { c: number }).c;
  if (count >= samples.length) return 0;
  for (const j of samples) upsertJob(j);
  return samples.length - count;
}

if (require.main === module) {
  console.log(`${seedSampleJobs()} örnek ilan eklendi.`);
}
