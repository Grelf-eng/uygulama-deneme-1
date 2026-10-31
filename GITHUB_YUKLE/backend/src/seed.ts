import bcrypt from 'bcryptjs';
import { db } from './db';
import { upsertJob } from './services/jobsRepo';
import { ensureProfile } from './services/profileRepo';
import { REAL_JOBS } from './data/realJobs';

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
