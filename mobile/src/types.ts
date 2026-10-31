export type EducationLevel =
  | 'ilkokul'
  | 'ortaokul'
  | 'lise'
  | 'onlisans'
  | 'lisans'
  | 'yuksek_lisans'
  | 'doktora';
export type JobType = 'memur' | 'sozlesmeli' | 'isci' | 'akademik' | 'diger';
export type CheckStatus = 'ok' | 'warn' | 'fail';
export type ApplicationStatus = 'planned' | 'applied' | 'interview' | 'accepted' | 'rejected';

export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  soft?: boolean;
}

export interface Eligibility {
  overall: CheckStatus;
  score: number;
  summary: { ok: number; warn: number; fail: number };
  checks?: Check[];
}

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
  title: string;
  institution: string | null;
  city: string | null;
  description: string;
  url: string | null;
  publishedAt: string;
  deadline: string | null;
  kpssRequired: boolean | null;
  minKpssScore: number | null;
  kpssType: string | null;
  minEducation: EducationLevel | null;
  requiredDepartments: string[];
  requiredCertificates: string[];
  certificateMode: 'all' | 'any';
  minExperienceYears: number | null;
  maxAge: number | null;
  positions: number | null;
  jobType: JobType;
  isFavorite: boolean;
  applicationStatus: ApplicationStatus | null;
  eligibility: Eligibility;
  historicalPlacement?: HistoricalPlacement | null;
}

export interface Profile {
  fullName: string;
  birthYear: number | null;
  educationLevel: EducationLevel | null;
  department: string;
  certificates: string[];
  kpssScore: number | null;
  kpssType: string | null;
  experienceYears: number;
  cities: string[];
  jobTypes: JobType[];
  notificationsEnabled: boolean;
}

export interface Meta {
  cities: string[];
  educationLevels: { value: EducationLevel; label: string }[];
  jobTypes: { value: JobType; label: string }[];
  certificates: string[];
  /** Bu eğitim seviyelerinde "bölüm / program" sorulmaz */
  noDepartmentLevels: EducationLevel[];
  kpssTypes?: { value: string; label: string }[];
  undergradDepartments?: string[];
  associateDepartments?: string[];
  poolOnlyEducationLevels?: EducationLevel[];
  sources: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AppNotification {
  id: number;
  jobId: number | null;
  title: string;
  body: string;
  read: number;
  createdAt: string;
}

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  ilkokul: 'İlkokul',
  ortaokul: 'Ortaokul',
  lise: 'Lise',
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yuksek_lisans: 'Yüksek Lisans',
  doktora: 'Doktora',
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  memur: 'Memur',
  sozlesmeli: 'Sözleşmeli (4/B)',
  isci: 'İşçi',
  akademik: 'Akademik',
  diger: 'Diğer',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  planned: 'Planlandı',
  applied: 'Başvuruldu',
  interview: 'Mülakat / Sınav',
  accepted: 'Kabul edildi',
  rejected: 'Olumsuz',
};
