import { db } from '../db';
import { Job, NewJob } from '../types';
import { norm, todayISO } from '../utils/text';

function rowToJob(r: any): Job {
  return {
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    title: r.title,
    institution: r.institution,
    city: r.city,
    description: r.description,
    url: r.url,
    publishedAt: r.published_at,
    deadline: r.deadline,
    kpssRequired: r.kpss_required === null ? null : r.kpss_required === 1,
    minKpssScore: r.min_kpss_score,
    kpssType: r.kpss_type,
    minEducation: r.min_education,
    requiredDepartments: JSON.parse(r.required_departments || '[]'),
    requiredCertificates: JSON.parse(r.required_certificates || '[]'),
    certificateMode: r.certificate_mode === 'any' ? 'any' : 'all',
    minExperienceYears: r.min_experience_years,
    maxAge: r.max_age,
    positions: r.positions,
    jobType: r.job_type,
  };
}

const upsertStmt = db.prepare(`
  INSERT INTO jobs (source, external_id, title, institution, city, description, url, published_at, deadline,
    kpss_required, min_kpss_score, kpss_type, min_education, required_departments, required_certificates,
    certificate_mode, min_experience_years, max_age, positions, job_type, search_text)
  VALUES (@source, @external_id, @title, @institution, @city, @description, @url, @published_at, @deadline,
    @kpss_required, @min_kpss_score, @kpss_type, @min_education, @required_departments, @required_certificates,
    @certificate_mode, @min_experience_years, @max_age, @positions, @job_type, @search_text)
  ON CONFLICT(source, external_id) DO UPDATE SET
    title = excluded.title, institution = excluded.institution, city = excluded.city,
    description = excluded.description, url = excluded.url, deadline = excluded.deadline,
    kpss_required = excluded.kpss_required, min_kpss_score = excluded.min_kpss_score,
    kpss_type = excluded.kpss_type, min_education = excluded.min_education,
    required_departments = excluded.required_departments,
    required_certificates = excluded.required_certificates, certificate_mode = excluded.certificate_mode,
    min_experience_years = excluded.min_experience_years, max_age = excluded.max_age,
    positions = excluded.positions, job_type = excluded.job_type, search_text = excluded.search_text
`);
const existsStmt = db.prepare('SELECT id FROM jobs WHERE source = ? AND external_id = ?');

/** İlanı ekler veya günceller. Yeni ise isNew=true döner. */
export function upsertJob(j: NewJob): { id: number; isNew: boolean } {
  const existing = existsStmt.get(j.source, j.externalId) as { id: number } | undefined;
  upsertStmt.run({
    source: j.source,
    external_id: j.externalId,
    title: j.title,
    institution: j.institution,
    city: j.city,
    description: j.description,
    url: j.url,
    published_at: j.publishedAt,
    deadline: j.deadline,
    kpss_required: j.kpssRequired === null ? null : j.kpssRequired ? 1 : 0,
    min_kpss_score: j.minKpssScore,
    kpss_type: j.kpssType,
    min_education: j.minEducation,
    required_departments: JSON.stringify(j.requiredDepartments),
    required_certificates: JSON.stringify(j.requiredCertificates),
    certificate_mode: j.certificateMode,
    min_experience_years: j.minExperienceYears,
    max_age: j.maxAge,
    positions: j.positions,
    job_type: j.jobType,
    search_text: norm(
      `${j.title} ${j.institution ?? ''} ${j.city ?? ''} ${j.requiredCertificates.join(' ')} ${j.description}`,
    ),
  });
  if (existing) return { id: existing.id, isNew: false };
  const row = existsStmt.get(j.source, j.externalId) as { id: number };
  return { id: row.id, isNew: true };
}

export function getJob(id: number): Job | null {
  const r = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return r ? rowToJob(r) : null;
}

export function getJobsByIds(ids: number[]): Job[] {
  if (ids.length === 0) return [];
  const rows = db
    .prepare(`SELECT * FROM jobs WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  return rows.map(rowToJob);
}

export interface JobFilters {
  query?: string;
  city?: string;
  kpss?: 'yes' | 'no';
  jobType?: string;
  education?: string;
  source?: string;
  includeExpired?: boolean;
  sort?: 'newest' | 'deadline';
}

function buildWhere(f: JobFilters): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  if (!f.includeExpired) {
    clauses.push('(deadline IS NULL OR deadline >= ?)');
    params.push(todayISO());
  }
  if (f.query) {
    for (const word of norm(f.query).split(' ').filter(Boolean)) {
      clauses.push('search_text LIKE ?');
      params.push(`%${word}%`);
    }
  }
  if (f.city) {
    clauses.push('city = ?');
    params.push(f.city);
  }
  if (f.kpss === 'yes') clauses.push('kpss_required = 1');
  if (f.kpss === 'no') clauses.push('kpss_required = 0');
  if (f.jobType) {
    clauses.push('job_type = ?');
    params.push(f.jobType);
  }
  if (f.education) {
    clauses.push('min_education = ?');
    params.push(f.education);
  }
  if (f.source) {
    clauses.push('source = ?');
    params.push(f.source);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function orderBy(sort?: string): string {
  return sort === 'deadline'
    ? 'ORDER BY deadline IS NULL, deadline ASC, id DESC'
    : "ORDER BY (source = 'memurlar') DESC, published_at DESC, id DESC";
}

export function searchJobs(f: JobFilters, limit: number, offset: number): { items: Job[]; total: number } {
  const { where, params } = buildWhere(f);
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM jobs ${where}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM jobs ${where} ${orderBy(f.sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { items: rows.map(rowToJob), total };
}

/** Eşleştirme için filtreye uyan tüm aktif ilanlar (sayfalama yapılmadan). */
export function allJobs(f: JobFilters): Job[] {
  const { where, params } = buildWhere(f);
  return db.prepare(`SELECT * FROM jobs ${where} ${orderBy(f.sort)}`).all(...params).map(rowToJob);
}

export function distinctSources(): string[] {
  return (db.prepare('SELECT DISTINCT source FROM jobs ORDER BY source').all() as { source: string }[]).map(
    (r) => r.source,
  );
}
