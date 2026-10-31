import { db } from '../db';

let pool: any = null;

function getPool() {
  if (pool) return pool;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

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
    `);

    // 2. Neon'daki tüm kayıtlı kullanıcıları yerel SQLite'a aktar
    const usersRes = await p.query('SELECT * FROM cloud_users');
    let importedUsers = 0;
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, is_admin, is_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        password_hash = excluded.password_hash,
        is_admin = excluded.is_admin,
        is_verified = excluded.is_verified
    `);

    for (const u of usersRes.rows) {
      insertUser.run(u.id, u.email, u.password_hash, u.is_admin, u.is_verified, String(u.created_at));
      importedUsers++;
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
    const localUsers = db.prepare('SELECT id, email, password_hash, is_admin, is_verified FROM users').all() as any[];
    for (const lu of localUsers) {
      await p.query(`
        INSERT INTO cloud_users (email, password_hash, is_admin, is_verified)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          is_admin = EXCLUDED.is_admin,
          is_verified = EXCLUDED.is_verified
      `, [lu.email, lu.password_hash, lu.is_admin, lu.is_verified]);
    }

    console.log(`[cloud-db] 🚀 Neon PostgreSQL kalıcı bağlantısı kuruldu! ${importedUsers} kullanıcı hesabı buluttan yüklendi.`);
  } catch (err: any) {
    console.error(`[cloud-db] ⚠️ Neon PostgreSQL eşitleme hatası: ${err.message}`);
  }
}

/**
 * Kullanıcı kaydolduğunda veya onaylandığında doğrudan Neon PostgreSQL'e yazar.
 */
export function syncCloudUser(email: string, passwordHash: string, isAdmin: number, isVerified: number): void {
  const p = getPool();
  if (!p) return;
  p.query(`
    INSERT INTO cloud_users (email, password_hash, is_admin, is_verified)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      is_admin = EXCLUDED.is_admin,
      is_verified = EXCLUDED.is_verified
  `, [email.toLowerCase(), passwordHash, isAdmin, isVerified]).catch((err: any) => {
    console.error(`[cloud-db] Kullanıcı Neon'a kaydedilemedi:`, err.message);
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
