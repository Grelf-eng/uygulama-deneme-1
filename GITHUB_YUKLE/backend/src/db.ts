import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  is_admin          INTEGER NOT NULL DEFAULT 0,
  is_verified       INTEGER NOT NULL DEFAULT 0,
  is_subscribed     INTEGER NOT NULL DEFAULT 0,
  subscription_tier TEXT NOT NULL DEFAULT 'standart',
  session_token     TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL DEFAULT '',
  birth_year            INTEGER,
  education_level       TEXT,
  department            TEXT NOT NULL DEFAULT '',
  certificates          TEXT NOT NULL DEFAULT '[]',
  kpss_score            REAL,
  kpss_type             TEXT,
  experience_years      REAL NOT NULL DEFAULT 0,
  cities                TEXT NOT NULL DEFAULT '[]',
  job_types             TEXT NOT NULL DEFAULT '[]',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  push_token            TEXT,
  profile_edit_count    INTEGER NOT NULL DEFAULT 0,
  last_profile_update   INTEGER NOT NULL DEFAULT 0,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source                TEXT NOT NULL,
  external_id           TEXT NOT NULL,
  title                 TEXT NOT NULL,
  institution           TEXT,
  city                  TEXT,
  description           TEXT NOT NULL DEFAULT '',
  url                   TEXT,
  published_at          TEXT NOT NULL,
  deadline              TEXT,
  kpss_required         INTEGER,
  min_kpss_score        REAL,
  kpss_type             TEXT,
  min_education         TEXT,
  required_departments  TEXT NOT NULL DEFAULT '[]',
  required_certificates TEXT NOT NULL DEFAULT '[]',
  certificate_mode      TEXT NOT NULL DEFAULT 'all',
  min_experience_years  REAL,
  max_age               INTEGER,
  positions             INTEGER,
  job_type              TEXT NOT NULL DEFAULT 'diger',
  search_text           TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_published ON jobs(published_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'planned',
  notes      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pushed     INTEGER NOT NULL DEFAULT 0,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS cv_analyses (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cv_text      TEXT NOT NULL DEFAULT '',
  target_track TEXT NOT NULL DEFAULT 'genel',
  score        INTEGER NOT NULL DEFAULT 0,
  result_json  TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS email_verifications (
  email       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_sent   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_kpss TEXT,
  is_vip      INTEGER NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'genel',
  content     TEXT NOT NULL,
  likes       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_comments_job ON job_comments(job_id);
`);

// Mevcut veritabanlarını yeni sütunlarla günceller (CREATE TABLE IF NOT EXISTS eski tabloya sütun eklemez)
function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumnIfMissing('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'is_verified', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'is_subscribed', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'subscription_tier', "TEXT NOT NULL DEFAULT 'standart'");
addColumnIfMissing('users', 'session_token', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('profiles', 'certificates', "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing('profiles', 'profile_edit_count', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('profiles', 'last_profile_update', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('jobs', 'required_certificates', "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing('jobs', 'certificate_mode', "TEXT NOT NULL DEFAULT 'all'");
addColumnIfMissing('email_verifications', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('email_verifications', 'last_sent', 'INTEGER NOT NULL DEFAULT 0');
