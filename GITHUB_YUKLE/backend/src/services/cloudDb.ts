import { db } from '../db';
import { ensureProfile } from './profileRepo';

let pool: any = null;

function getPool() {
  if (pool) return pool;
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  // Node-postgres için channel_binding parametresini temizle (Neon hatasını kesin çözer)
  dbUrl = dbUrl.replace(/&?channel_binding=[^&]+/g, '');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    return pool;
  } catch (err: any) {
    console.warn('[cloud-db] pg yüklenemedi veya DATABASE_URL geçersiz:', err.message);
    return null;
  }
}

/**
 * Sunucu her başladığında Neon PostgreSQL'e bağlanır,
 * kalıcı kullanıcıları ve verileri yerel SQLite belleğine geri yükler.
 * Böylece Render uykuya geçse bile hiçbir kullanıcı hesabı silinmez!
 */
export async function initCloudSync(): Promise<void> {
  const p = getPool();
  if (!p) {
    console.log('[cloud-db] Yerel SQLite modu devrede (DATABASE_URL henüz eklenmedi).');
    return;
  }

  try {
    // 1. Neon PostgreSQL kalıcı tablolarını garantiye al
    await p.query(`
      CREATE TABLE IF NOT EXISTS cloud_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_subscribed INTEGER NOT NULL DEFAULT 0,
        subscription_tier TEXT NOT NULL DEFAULT 'standart',
        session_token TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE cloud_users ADD COLUMN IF NOT EXISTS is_subscribed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cloud_users ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'standart';
      ALTER TABLE cloud_users ADD COLUMN IF NOT EXISTS session_token TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS cloud_verifications (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cloud_favorites (
        user_id INTEGER NOT NULL,
        job_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, job_id)
      );

      CREATE TABLE IF NOT EXISTS cloud_profiles (
        user_email TEXT PRIMARY KEY,
        full_name TEXT,
        birth_year INTEGER,
        education_level TEXT,
        department TEXT,
        certificates TEXT NOT NULL DEFAULT '[]',
        kpss_score REAL,
        kpss_type TEXT,
        experience_years REAL DEFAULT 0,
        cities TEXT NOT NULL DEFAULT '[]',
        job_types TEXT NOT NULL DEFAULT '["memur","sozlesmeli","isci","akademik"]',
        notifications_enabled INTEGER DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cloud_jobs (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        institution TEXT,
        city TEXT,
        description TEXT NOT NULL DEFAULT '',
        url TEXT,
        published_at TEXT NOT NULL,
        deadline TEXT,
        kpss_required INTEGER,
        min_kpss_score REAL,
        kpss_type TEXT,
        min_education TEXT,
        required_departments TEXT NOT NULL DEFAULT '[]',
        required_certificates TEXT NOT NULL DEFAULT '[]',
        certificate_mode TEXT NOT NULL DEFAULT 'all',
        min_experience_years REAL,
        max_age INTEGER,
        positions INTEGER,
        job_type TEXT NOT NULL DEFAULT 'diger',
        search_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (source, external_id)
      );
    `);

    // 2. Neon'daki tüm gerçek kamu ilanlarını yerel SQLite'a aktar
    const jobsRes = await p.query("SELECT * FROM cloud_jobs WHERE source != 'ornek'");
    if (jobsRes.rows.length > 0) {
      const insertJob = db.prepare(`
        INSERT INTO jobs (
          source, external_id, title, institution, city, description, url,
          published_at, deadline, kpss_required, min_kpss_score, kpss_type,
          min_education, required_departments, required_certificates,
          certificate_mode, min_experience_years, max_age, positions, job_type, search_text
        ) VALUES (
          @source, @external_id, @title, @institution, @city, @description, @url,
          @published_at, @deadline, @kpss_required, @min_kpss_score, @kpss_type,
          @min_education, @required_departments, @required_certificates,
          @certificate_mode, @min_experience_years, @max_age, @positions, @job_type, @search_text
        ) ON CONFLICT(source, external_id) DO UPDATE SET
          title = excluded.title,
          institution = excluded.institution,
          city = excluded.city,
          description = excluded.description,
          url = excluded.url,
          published_at = excluded.published_at,
          deadline = excluded.deadline,
          kpss_required = excluded.kpss_required,
          min_kpss_score = excluded.min_kpss_score,
          kpss_type = excluded.kpss_type,
          min_education = excluded.min_education,
          required_departments = excluded.required_departments,
          required_certificates = excluded.required_certificates,
          certificate_mode = excluded.certificate_mode,
          min_experience_years = excluded.min_experience_years,
          max_age = excluded.max_age,
          positions = excluded.positions,
          job_type = excluded.job_type,
          search_text = excluded.search_text
      `);

      for (const j of jobsRes.rows) {
        insertJob.run(j);
      }
      console.log(`[cloud-db] 📋 Neon'dan ${jobsRes.rows.length} gerçek kamu ilanı yerel sisteme aktarıldı.`);
    }

    // 3. Neon'daki tüm kayıtlı kullanıcıları yerel SQLite'a aktar
    const usersRes = await p.query('SELECT * FROM cloud_users');
    let importedUsers = 0;
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier, session_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        password_hash = excluded.password_hash,
        is_admin = excluded.is_admin,
        is_verified = excluded.is_verified,
        is_subscribed = excluded.is_subscribed,
        subscription_tier = excluded.subscription_tier,
        session_token = excluded.session_token
    `);

    for (const u of usersRes.rows) {
      insertUser.run(
        u.id,
        u.email,
        u.password_hash,
        u.is_admin,
        u.is_verified,
        u.is_subscribed ?? 0,
        u.subscription_tier || 'standart',
        u.session_token || '',
        String(u.created_at)
      );
      ensureProfile(u.id);
      importedUsers++;
    }

    // 3.5. Neon'daki kayıtlı profilleri yerel SQLite'a aktar
    const profRes = await p.query('SELECT * FROM cloud_profiles');
    for (const cp of profRes.rows) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(cp.user_email) as { id: number } | undefined;
      if (u) {
        db.prepare(`
          INSERT INTO profiles (
            user_id, full_name, birth_year, education_level, department,
            certificates, kpss_score, kpss_type, experience_years, cities, job_types, notifications_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            full_name = excluded.full_name,
            birth_year = excluded.birth_year,
            education_level = excluded.education_level,
            department = excluded.department,
            certificates = excluded.certificates,
            kpss_score = excluded.kpss_score,
            kpss_type = excluded.kpss_type,
            experience_years = excluded.experience_years,
            cities = excluded.cities,
            job_types = excluded.job_types,
            notifications_enabled = excluded.notifications_enabled
        `).run(
          u.id, cp.full_name || '', cp.birth_year, cp.education_level, cp.department || '',
          cp.certificates || '[]', cp.kpss_score, cp.kpss_type, cp.experience_years ?? 0,
          cp.cities || '[]', cp.job_types || '["memur","sozlesmeli","isci","akademik"]', cp.notifications_enabled ?? 1
        );
      }
    }

    // 3. Neon'daki aktif doğrulama kodlarını aktar
    const verifRes = await p.query('SELECT * FROM cloud_verifications');
    const insertVerif = db.prepare(`
      INSERT INTO email_verifications (email, code, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        code = excluded.code,
        expires_at = excluded.expires_at
    `);
    for (const v of verifRes.rows) {
      insertVerif.run(v.email, v.code, Number(v.expires_at), String(v.created_at));
    }

    // 4. Neon'daki favorileri aktar
    const favRes = await p.query('SELECT * FROM cloud_favorites');
    const insertFav = db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, job_id, created_at) VALUES (?, ?, ?)
    `);
    for (const f of favRes.rows) {
      insertFav.run(f.user_id, f.job_id, String(f.created_at));
    }

    // 5. Yereldeki admin hesabını da Neon'a garanti yedekle
    const localUsers = db.prepare('SELECT id, email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier, session_token FROM users').all() as any[];
    for (const lu of localUsers) {
      await p.query(`
        INSERT INTO cloud_users (email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier, session_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          is_admin = EXCLUDED.is_admin,
          is_verified = EXCLUDED.is_verified,
          is_subscribed = EXCLUDED.is_subscribed,
          subscription_tier = EXCLUDED.subscription_tier,
          session_token = EXCLUDED.session_token
      `, [lu.email, lu.password_hash, lu.is_admin, lu.is_verified, lu.is_subscribed ?? 0, lu.subscription_tier || 'standart', lu.session_token || '']);
    }

    console.log(`[cloud-db] 🚀 Neon PostgreSQL kalıcı bağlantısı kuruldu! ${importedUsers} kullanıcı hesabı buluttan yüklendi.`);
  } catch (err: any) {
    console.error(`[cloud-db] ⚠️ Neon PostgreSQL eşitleme hatası: ${err.message}`);
  }
}

/**
 * Kullanıcı kaydolduğunda veya onaylandığında doğrudan Neon PostgreSQL'e yazar.
 */
export function syncCloudUser(
  email: string,
  passwordHash: string,
  isAdmin: number,
  isVerified: number,
  isSubscribed: number = 0,
  subscriptionTier: string = 'standart'
): void {
  const p = getPool();
  if (!p) return;
  p.query(`
    INSERT INTO cloud_users (email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      is_admin = EXCLUDED.is_admin,
      is_verified = EXCLUDED.is_verified,
      is_subscribed = EXCLUDED.is_subscribed,
      subscription_tier = EXCLUDED.subscription_tier
  `, [email.toLowerCase(), passwordHash, isAdmin, isVerified, isSubscribed, subscriptionTier]).catch((err: any) => {
    console.error(`[cloud-db] Kullanıcı Neon'a kaydedilemedi:`, err.message);
  });
}

/**
 * Kullanıcı abonelik durumunu doğrudan Neon PostgreSQL'e eşitler.
 */
export function syncCloudSubscription(email: string, isSubscribed: number, subscriptionTier: string = 'standart'): void {
  const p = getPool();
  if (!p) return;
  p.query(`
    UPDATE cloud_users
    SET is_subscribed = $1, subscription_tier = $2
    WHERE LOWER(email) = LOWER($3)
  `, [isSubscribed, subscriptionTier, email.toLowerCase()]).catch((err: any) => {
    console.error(`[cloud-db] Abonelik Neon'a kaydedilemedi:`, err.message);
  });
}

/**
 * Kullanıcı giriş yaptığında tekil aktif oturum anahtarını (Single Active Session) Neon'a eşitler.
 */
export function syncCloudSession(email: string, sessionToken: string): void {
  const p = getPool();
  if (!p) return;
  p.query(`
    UPDATE cloud_users
    SET session_token = $1
    WHERE LOWER(email) = LOWER($2)
  `, [sessionToken, email.toLowerCase()]).catch((err: any) => {
    console.error(`[cloud-db] Oturum Neon'a kaydedilemedi:`, err.message);
  });
}

/**
 * Üretilen 6 haneli güvenlik kodunu Neon PostgreSQL'e kalıcı olarak yazar.
 */
export function syncCloudVerification(email: string, code: string, expiresAt: number): void {
  const p = getPool();
  if (!p) return;
  p.query(`
    INSERT INTO cloud_verifications (email, code, expires_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(email) DO UPDATE SET
      code = EXCLUDED.code,
      expires_at = EXCLUDED.expires_at
  `, [email.toLowerCase(), code, expiresAt]).catch((err: any) => {
    console.error(`[cloud-db] Doğrulama kodu Neon'a kaydedilemedi:`, err.message);
  });
}

/**
 * Kod onaylandığında Neon'dan siler.
 */
export function removeCloudVerification(email: string): void {
  const p = getPool();
  if (!p) return;
  p.query('DELETE FROM cloud_verifications WHERE LOWER(email) = LOWER($1)', [email.toLowerCase()]).catch(() => {});
}

/**
 * Favori ekleme/silmeyi Neon'a yansıtır.
 */
export function syncCloudFavorite(userId: number, jobId: number, isFavorite: boolean): void {
  const p = getPool();
  if (!p) return;
  if (isFavorite) {
    p.query(`
      INSERT INTO cloud_favorites (user_id, job_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [userId, jobId]).catch(() => {});
  } else {
    p.query('DELETE FROM cloud_favorites WHERE user_id = $1 AND job_id = $2', [userId, jobId]).catch(() => {});
  }
}

/**
 * Yerelde taranan tüm gerçek ilanları Neon PostgreSQL bulutuna yedekler.
 */
export async function syncLocalJobsToCloud(): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    const localJobs = db.prepare("SELECT * FROM jobs WHERE source != 'ornek'").all() as any[];
    if (localJobs.length === 0) return;

    for (const j of localJobs) {
      await p.query(`
        INSERT INTO cloud_jobs (
          source, external_id, title, institution, city, description, url,
          published_at, deadline, kpss_required, min_kpss_score, kpss_type,
          min_education, required_departments, required_certificates,
          certificate_mode, min_experience_years, max_age, positions, job_type, search_text
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        ) ON CONFLICT(source, external_id) DO UPDATE SET
          title = EXCLUDED.title,
          institution = EXCLUDED.institution,
          city = EXCLUDED.city,
          description = EXCLUDED.description,
          url = EXCLUDED.url,
          published_at = EXCLUDED.published_at,
          deadline = EXCLUDED.deadline,
          kpss_required = EXCLUDED.kpss_required,
          min_kpss_score = EXCLUDED.min_kpss_score,
          kpss_type = EXCLUDED.kpss_type,
          min_education = EXCLUDED.min_education,
          required_departments = EXCLUDED.required_departments,
          required_certificates = EXCLUDED.required_certificates,
          certificate_mode = EXCLUDED.certificate_mode,
          min_experience_years = EXCLUDED.min_experience_years,
          max_age = EXCLUDED.max_age,
          positions = EXCLUDED.positions,
          job_type = EXCLUDED.job_type,
          search_text = EXCLUDED.search_text
      `, [
        j.source, j.external_id, j.title, j.institution, j.city, j.description || '', j.url,
        j.published_at, j.deadline, j.kpss_required, j.min_kpss_score, j.kpss_type,
        j.min_education, j.required_departments || '[]', j.required_certificates || '[]',
        j.certificate_mode || 'all', j.min_experience_years, j.max_age, j.positions, j.job_type || 'diger', j.search_text || ''
      ]);
    }
    console.log(`[cloud-db] 💾 ${localJobs.length} gerçek kamu ilanı Neon PostgreSQL bulutuna kalıcı olarak yedeklendi.`);
  } catch (err: any) {
    console.error(`[cloud-db] İlanlar Neon'a yedeklenirken hata:`, err.message);
  }
}

/**
 * Kullanıcı profilini Neon bulutuna kalıcı olarak senkronize eder.
 */
export async function syncCloudProfile(email: string, p: any): Promise<void> {
  const pool = getPool();
  if (!pool || !email) return;
  try {
    await pool.query(`
      INSERT INTO cloud_profiles (
        user_email, full_name, birth_year, education_level, department,
        certificates, kpss_score, kpss_type, experience_years, cities, job_types, notifications_enabled, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      ON CONFLICT(user_email) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        birth_year = EXCLUDED.birth_year,
        education_level = EXCLUDED.education_level,
        department = EXCLUDED.department,
        certificates = EXCLUDED.certificates,
        kpss_score = EXCLUDED.kpss_score,
        kpss_type = EXCLUDED.kpss_type,
        experience_years = EXCLUDED.experience_years,
        cities = EXCLUDED.cities,
        job_types = EXCLUDED.job_types,
        notifications_enabled = EXCLUDED.notifications_enabled,
        updated_at = CURRENT_TIMESTAMP
    `, [
      email.toLowerCase(),
      p.fullName || '',
      p.birthYear || null,
      p.educationLevel || null,
      p.department || '',
      JSON.stringify(p.certificates || []),
      p.kpssScore ?? null,
      p.kpssType || null,
      p.experienceYears ?? 0,
      JSON.stringify(p.cities || []),
      JSON.stringify(p.jobTypes || ['memur', 'sozlesmeli', 'isci', 'akademik']),
      p.notificationsEnabled ? 1 : 0
    ]);
  } catch (err: any) {
    console.error(`[cloud-db] Profil buluta yedeklenirken hata:`, err.message);
  }
}
