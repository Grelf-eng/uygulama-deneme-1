import { db } from '../db';
import { EducationLevel, JobType, Profile, hasDepartment } from '../types';

export function rowToProfile(r: any): Profile {
  return {
    fullName: r.full_name,
    birthYear: r.birth_year,
    educationLevel: (r.education_level as EducationLevel | null) ?? null,
    department: r.department,
    certificates: JSON.parse(r.certificates || '[]'),
    kpssScore: r.kpss_score,
    kpssType: r.kpss_type,
    experienceYears: r.experience_years,
    cities: JSON.parse(r.cities || '[]'),
    jobTypes: JSON.parse(r.job_types || '[]') as JobType[],
    notificationsEnabled: r.notifications_enabled === 1,
  };
}

export function ensureProfile(userId: number, fullName = ''): void {
  db.prepare('INSERT OR IGNORE INTO profiles (user_id, full_name) VALUES (?, ?)').run(userId, fullName);
}

export function getProfile(userId: number): Profile | null {
  const r = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  return r ? rowToProfile(r) : null;
}

export function saveProfile(userId: number, p: Profile): void {
  db.prepare(
    `UPDATE profiles SET full_name = @full_name, birth_year = @birth_year, education_level = @education_level,
      department = @department, certificates = @certificates, kpss_score = @kpss_score, kpss_type = @kpss_type,
      experience_years = @experience_years, cities = @cities, job_types = @job_types,
      notifications_enabled = @notifications_enabled, updated_at = datetime('now')
     WHERE user_id = @user_id`,
  ).run({
    user_id: userId,
    full_name: p.fullName,
    birth_year: p.birthYear,
    education_level: p.educationLevel,
    department: hasDepartment(p.educationLevel) ? p.department : '', // lise ve altında bölüm yok
    certificates: JSON.stringify(p.certificates),
    kpss_score: p.kpssScore,
    kpss_type: p.kpssType,
    experience_years: p.experienceYears,
    cities: JSON.stringify(p.cities),
    job_types: JSON.stringify(p.jobTypes),
    notifications_enabled: p.notificationsEnabled ? 1 : 0,
  });
}

export function setPushToken(userId: number, token: string | null): void {
  db.prepare('UPDATE profiles SET push_token = ? WHERE user_id = ?').run(token, userId);
}

export interface ProfileLimitInfo {
  editCount: number;
  initialRemaining: number;
  canEditNow: boolean;
  cooldownHours: number;
  cooldownRemainingMs: number;
  waitHours: number;
  waitMinutes: number;
  nextAllowedAt: number | null;
}

/**
 * 3 Kez Art Arda Değiştirme ve Sonrasında 48 Saat Soğuma Kuralı (Anti-Account Sharing)
 */
export function getProfileLimit(userId: number, isAdmin: boolean = false): ProfileLimitInfo {
  if (isAdmin) {
    return {
      editCount: 0,
      initialRemaining: 3,
      canEditNow: true,
      cooldownHours: 48,
      cooldownRemainingMs: 0,
      waitHours: 0,
      waitMinutes: 0,
      nextAllowedAt: null,
    };
  }
  const r = db
    .prepare('SELECT profile_edit_count, last_profile_update FROM profiles WHERE user_id = ?')
    .get(userId) as { profile_edit_count?: number; last_profile_update?: number } | undefined;

  const count = r?.profile_edit_count || 0;
  const lastUpdate = r?.last_profile_update || 0;
  const COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 saat

  if (count < 3) {
    return {
      editCount: count,
      initialRemaining: 3 - count,
      canEditNow: true,
      cooldownHours: 48,
      cooldownRemainingMs: 0,
      waitHours: 0,
      waitMinutes: 0,
      nextAllowedAt: null,
    };
  }

  const elapsed = Date.now() - lastUpdate;
  const remainingMs = Math.max(0, COOLDOWN_MS - elapsed);
  const canEdit = remainingMs === 0;

  return {
    editCount: count,
    initialRemaining: 0,
    canEditNow: canEdit,
    cooldownHours: 48,
    cooldownRemainingMs: remainingMs,
    waitHours: Math.floor(remainingMs / (1000 * 60 * 60)),
    waitMinutes: Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
    nextAllowedAt: remainingMs > 0 ? lastUpdate + COOLDOWN_MS : null,
  };
}

export function incrementProfileEditCount(userId: number): void {
  db.prepare(`
    UPDATE profiles
    SET profile_edit_count = profile_edit_count + 1,
        last_profile_update = ?
    WHERE user_id = ?
  `).run(Date.now(), userId);
}

export function resetProfileLimit(userId: number): void {
  db.prepare(`
    UPDATE profiles
    SET profile_edit_count = 0,
        last_profile_update = 0
    WHERE user_id = ?
  `).run(userId);
}

export interface NotifiableUser {
  userId: number;
  pushToken: string | null;
  profile: Profile;
}

export function listNotifiableUsers(): NotifiableUser[] {
  const rows = db.prepare('SELECT * FROM profiles WHERE notifications_enabled = 1').all() as any[];
  return rows.map((r) => ({ userId: r.user_id, pushToken: r.push_token, profile: rowToProfile(r) }));
}
