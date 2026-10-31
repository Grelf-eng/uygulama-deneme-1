import fs from 'fs';
import path from 'path';
import { CERTIFICATE_CATALOG, describeCatalog } from '../src/constants/certificates';
import { CITIES } from '../src/constants/cities';
import { db } from '../src/db';
import { NO_DEPARTMENT_LEVELS } from '../src/services/profileRepo';
import { KPSS_TYPE_OPTIONS, estimateHistoricalPlacement } from '../src/constants/kpss';
import { UNDERGRAD_PLUS_DEPARTMENTS, ASSOCIATE_DEPARTMENTS, POOL_ONLY_EDUCATION_LEVELS } from '../src/constants/departments';

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'android-apk', 'assets', 'www');
fs.mkdirSync(outDir, { recursive: true });

interface DbJobRow {
  id: number;
  source: string;
  external_id: string;
  title: string;
  institution: string | null;
  city: string | null;
  description: string;
  url: string | null;
  published_at: string;
  deadline: string | null;
  kpss_required: number | null;
  min_kpss_score: number | null;
  kpss_type: string | null;
  min_education: string | null;
  required_departments: string;
  required_certificates: string;
  certificate_mode: string;
  min_experience_years: number | null;
  max_age: number | null;
  positions: number | null;
  job_type: string;
}

const rows = db
  .prepare(
    `SELECT * FROM jobs
     WHERE source != 'ornek'
       AND (deadline IS NULL OR deadline >= date('now'))
     ORDER BY (source = 'memurlar') DESC, published_at DESC, id DESC`,
  )
  .all() as DbJobRow[];

const jobs = rows.map((r) => {
  const kpssRequired = r.kpss_required === null ? null : Boolean(r.kpss_required);
  const minKpssScore = r.min_kpss_score;
  const kpssType = r.kpss_type;
  const minEducation = r.min_education as any;
  const jobType = r.job_type as any;
  const historicalPlacement = estimateHistoricalPlacement({
    title: r.title,
    institution: r.institution,
    description: r.description,
    kpssRequired,
    minKpssScore,
    kpssType,
    minEducation,
    jobType,
  });

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
    kpssRequired,
    minKpssScore,
    kpssType,
    minEducation,
    requiredDepartments: JSON.parse(r.required_departments || '[]'),
    requiredCertificates: JSON.parse(r.required_certificates || '[]'),
    certificateMode: r.certificate_mode === 'any' ? 'any' : 'all',
    minExperienceYears: r.min_experience_years,
    maxAge: r.max_age,
    positions: r.positions,
    jobType,
    historicalPlacement,
  };
});

let liveTunnelUrl = 'https://175662d2db5ca2.lhr.life';
try {
  const linksPath = path.join(root, 'backend', 'data', 'mobile-links.json');
  if (fs.existsSync(linksPath)) {
    const data = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
    if (data.tunnelUrl) liveTunnelUrl = data.tunnelUrl;
  }
} catch {}

const meta = {
  cities: CITIES,
  certificates: describeCatalog(),
  noDepartmentLevels: NO_DEPARTMENT_LEVELS,
  defaultServerUrl: liveTunnelUrl,
  lanServerUrl: 'http://192.168.1.31:4000',
  educationLevels: [
    { value: 'ilkokul', label: 'İlkokul' },
    { value: 'ortaokul', label: 'Ortaokul' },
    { value: 'lise', label: 'Lise' },
    { value: 'onlisans', label: 'Ön Lisans' },
    { value: 'lisans', label: 'Lisans' },
    { value: 'yuksek_lisans', label: 'Yüksek Lisans' },
    { value: 'doktora', label: 'Doktora' },
  ],
  jobTypes: [
    { value: 'memur', label: 'Memur' },
    { value: 'sozlesmeli', label: 'Sözleşmeli (4/B)' },
    { value: 'isci', label: 'İşçi' },
    { value: 'akademik', label: 'Akademik' },
    { value: 'diger', label: 'Diğer' },
  ],
  kpssTypes: KPSS_TYPE_OPTIONS,
  undergradDepartments: UNDERGRAD_PLUS_DEPARTMENTS,
  associateDepartments: ASSOCIATE_DEPARTMENTS,
  poolOnlyEducationLevels: POOL_ONLY_EDUCATION_LEVELS,
  certPatterns: CERTIFICATE_CATALOG.map((c) => ({
    name: c.name,
    regexes: c.patterns.map((p) => ({ source: p.source, flags: p.flags })),
  })),
};

const content = `window.__KAMU_SEED__ = ${JSON.stringify({ meta, jobs })};\n`;
fs.writeFileSync(path.join(outDir, 'jobs-seed.js'), content, 'utf8');
db.close();
console.log(`APK veri paketi hazırlandı: ${jobs.length} gerçek kamu ilanı aktarıldı.`);
