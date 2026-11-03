import bcrypt from 'bcryptjs';
import { db } from './db';
import { upsertJob } from './services/jobsRepo';
import { ensureProfile } from './services/profileRepo';
import { syncCloudUser } from './services/cloudDb';
import { REAL_JOBS } from './data/realJobs';

export function ensureAdminUser(): void {
  // Eski demo hesabını kaldır
  db.prepare("DELETE FROM users WHERE LOWER(email) = 'demo@kamuilan.local'").run();

  // Yönetici (Admin) hesabı: otaner963@gmail.com / 852725193As
  const adminEmail = 'otaner963@gmail.com';
  const adminPass = '852725193As';

  // Eğer eski IGAREN24 kullanıcısı varsa, onu doğrudan otaner963@gmail.com hesabına dönüştür
  const oldAdmin = db.prepare("SELECT id FROM users WHERE LOWER(email) = 'igaren24'").get() as { id: number } | undefined;
  if (oldAdmin) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(adminEmail, oldAdmin.id);
  }

  const existingAdmin = db
    .prepare('SELECT id, password_hash, is_admin FROM users WHERE LOWER(email) = LOWER(?)')
    .get(adminEmail) as { id: number; password_hash: string; is_admin: number } | undefined;

  const hash = bcrypt.hashSync(adminPass, 10);

  if (!existingAdmin) {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier) VALUES (?, ?, 1, 1, 1, ?)')
      .run(adminEmail, hash, 'vip');
    const adminId = Number(info.lastInsertRowid);
    ensureProfile(adminId, 'Osman Taner (Yönetici)');
    syncCloudUser(adminEmail, hash, 1, 1, 1, 'vip');
  } else {
    db.prepare('UPDATE users SET email = ?, password_hash = ?, is_admin = 1, is_verified = 1, is_subscribed = 1, subscription_tier = ? WHERE id = ?').run(
      adminEmail,
      hash,
      'vip',
      existingAdmin.id,
    );
    ensureProfile(existingAdmin.id, 'Osman Taner (Yönetici)');
    syncCloudUser(adminEmail, hash, 1, 1, 1, 'vip');
  }
}

export function seedSampleJobs(): number {
  ensureAdminUser();

  // Eski sahte 'ornek' taslak ilanları tamamen temizle
  db.prepare("DELETE FROM jobs WHERE source = 'ornek'").run();

  // Gerçek ilanlar zaten yüklüyse tekrar ekleme
  const realCount = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE source != 'ornek'").get() as { c: number }).c;
  if (realCount >= 50) return 0;

  let inserted = 0;
  for (const j of REAL_JOBS as unknown as any[]) {
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
      requiredDepartments: typeof j.required_departments === 'string' ? JSON.parse(j.required_departments || '[]') : (j.required_departments || []),
      requiredCertificates: typeof j.required_certificates === 'string' ? JSON.parse(j.required_certificates || '[]') : (j.required_certificates || []),
      certificateMode: j.certificate_mode || 'all',
      minExperienceYears: j.min_experience_years,
      maxAge: j.max_age,
      positions: j.positions,
      jobType: j.job_type || 'diger',
    });
    inserted++;
  }
  console.log(`[seed] ${inserted} gerçek kamu ilanı sisteme başarıyla mühürlendi.`);
  return inserted;
}

if (require.main === module) {
  console.log(`${seedSampleJobs()} gerçek kamu ilanı eklendi.`);
}
