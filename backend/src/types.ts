export const EDUCATION_LEVELS = [
  'ilkokul',
  'ortaokul',
  'lise',
  'onlisans',
  'lisans',
  'yuksek_lisans',
  'doktora',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  ilkokul: 'İlkokul',
  ortaokul: 'Ortaokul',
  lise: 'Lise',
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};

export function educationRank(level: EducationLevel | null | undefined): number {
  return level ? EDUCATION_LEVELS.indexOf(level) + 1 : 0;
}

/** Lise ve altı eğitimde "bölüm / program" kavramı yoktur; profilde sorulmaz. */
export const NO_DEPARTMENT_LEVELS: readonly EducationLevel[] = ['ilkokul', 'ortaokul', 'lise'];
export const hasDepartment = (level: EducationLevel | null | undefined): boolean =>
  !level || !NO_DEPARTMENT_LEVELS.includes(level);

export const JOB_TYPES = ['memur', 'sozlesmeli', 'isci', 'akademik', 'diger'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  memur: 'Memur',
  sozlesmeli: 'Sözleşmeli (4/B)',
  isci: 'İşçi',
  akademik: 'Akademik',
  diger: 'Diğer',
};

export const APPLICATION_STATUSES = ['planned', 'applied', 'interview', 'accepted', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface HistoricalPlacement {
  avgScore: number;
  minPlacedScore: number;
  maxPlacedScore: number;
  period: string;
  cadreLabel: string;
  kpssTypeLabel: string;
  summary: string;
}

export interface Job {
  id: number;
  source: string;
  externalId: string;
  title: string;
  institution: string | null;
  city: string | null;
  description: string;
  url: string | null;
  publishedAt: string; // ISO
  deadline: string | null; // YYYY-MM-DD
  /** true: KPSS şart, false: KPSS'siz, null: ilandan anlaşılamadı */
  kpssRequired: boolean | null;
  minKpssScore: number | null;
  kpssType: string | null;
  minEducation: EducationLevel | null;
  requiredDepartments: string[];
  /** İlanda aranan sertifika/belgeler (standart adlarla) */
  requiredCertificates: string[];
  /** 'all': hepsi gerekli, 'any': biri yeterli ("A veya B") */
  certificateMode: 'all' | 'any';
  minExperienceYears: number | null;
  maxAge: number | null;
  positions: number | null;
  jobType: JobType;
  /** KPSS şartlı ilanlarda geçmiş yıllarda atananların puan ortalamaları */
  historicalPlacement?: HistoricalPlacement | null;
}

export type NewJob = Omit<Job, 'id'>;

export interface Profile {
  fullName: string;
  birthYear: number | null;
  educationLevel: EducationLevel | null;
  department: string;
  /** Sahip olunan sertifika/belgeler */
  certificates: string[];
  kpssScore: number | null;
  kpssType: string | null;
  experienceYears: number;
  cities: string[];
  jobTypes: JobType[];
  notificationsEnabled: boolean;
}
