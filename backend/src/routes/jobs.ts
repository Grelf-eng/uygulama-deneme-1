import { Router } from 'express';
import { z } from 'zod';
import { CITIES } from '../constants/cities';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { getJob, JobFilters, allJobs, searchJobs, distinctSources } from '../services/jobsRepo';
import { toView, userJobState } from '../services/jobView';
import { getProfile } from '../services/profileRepo';
import { EDUCATION_LABELS, EDUCATION_LEVELS, JOB_TYPE_LABELS, JOB_TYPES, NO_DEPARTMENT_LEVELS } from '../types';
import { describeCatalog } from '../constants/certificates';
import { KPSS_TYPE_OPTIONS } from '../constants/kpss';
import { UNDERGRAD_PLUS_DEPARTMENTS, ASSOCIATE_DEPARTMENTS, POOL_ONLY_EDUCATION_LEVELS } from '../constants/departments';
import { norm } from '../utils/text';

export const jobsRouter = Router();

const filterSchema = z.object({
  query: z.string().trim().max(100).optional(),
  city: z.string().trim().optional(),
  kpss: z.enum(['yes', 'no']).optional(),
  jobType: z.enum(JOB_TYPES).optional(),
  education: z.enum(EDUCATION_LEVELS).optional(),
  source: z.string().trim().optional(),
  certificate: z.string().trim().optional(),
  sort: z.enum(['newest', 'deadline']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  includeExpired: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(300).default(50),
});

jobsRouter.get('/meta', (_req, res) => {
  res.json({
    cities: CITIES,
    educationLevels: EDUCATION_LEVELS.map((v) => ({ value: v, label: EDUCATION_LABELS[v] })),
    jobTypes: JOB_TYPES.map((v) => ({ value: v, label: JOB_TYPE_LABELS[v] })),
    certificates: describeCatalog(),
    noDepartmentLevels: NO_DEPARTMENT_LEVELS,
    kpssTypes: KPSS_TYPE_OPTIONS,
    undergradDepartments: UNDERGRAD_PLUS_DEPARTMENTS,
    associateDepartments: ASSOCIATE_DEPARTMENTS,
    poolOnlyEducationLevels: POOL_ONLY_EDUCATION_LEVELS,
    sources: distinctSources(),
  });
});

/** Canlı kamu ilanları taramasını tetikler (GET veya POST) */
jobsRouter.all('/scrape/trigger', async (_req, res) => {
  const { runAllScrapers } = await import('../scrapers');
  const { syncLocalJobsToCloud } = await import('../services/cloudDb');
  runAllScrapers()
    .then(() => syncLocalJobsToCloud())
    .catch((e: any) => console.error('[trigger] Tarama hatası:', e.message));
  res.json({ success: true, message: 'Canlı kamu ilanları taraması başlatıldı. İlanlar birkaç saniye içinde güncellenecektir.' });
});

/** Profile göre uygun (❌ içermeyen) ilanlar, sadece kullanıcının profilindeki şehirler ve puana göre sıralı */
jobsRouter.get('/matches', requireAuth, (req, res) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { page, limit, minScore, ...filters } = parsed.data;
  const profile = getProfile(req.userId!);
  const state = userJobState(req.userId);
  let views = allJobs(filters as JobFilters)
    .map((j) => toView(j, profile, state, false))
    .filter((v) => v.eligibility.overall !== 'fail');

  // 1. Sadece kullanıcının profilinde seçtiği şehirler
  const userCities = profile?.cities || [];
  if (userCities.length > 0) {
    const normUserCities = userCities.map((c) => norm(c)).filter(Boolean);
    views = views.filter((v) => {
      // Şehir belirtilmemişse veya genel/türkiye ilanı ise gösterilebilir
      if (!v.city) return true;
      const jc = norm(v.city);
      if (jc.includes('turkiye') || jc === 'genel' || jc === 'merkez') return true;
      return normUserCities.some((uc) => jc.includes(uc) || uc.includes(jc));
    });
  } else {
    // Kullanıcı profilinde henüz şehir seçmemişse eşleşenler boş gelsin (profil uyarısı verilir)
    views = [];
  }

  // 2. Kullanıcının profilinde seçtiği kadro türleri (Memur, İşçi, Sözleşmeli vb.)
  const userJobTypes = profile?.jobTypes || [];
  if (userJobTypes.length > 0) {
    views = views.filter((v) => {
      if (!v.jobType) return true;
      return userJobTypes.includes(v.jobType as any);
    });
  }

  // 3. Uyum Oranı Filtrelemesi (%100, %75+, %50+)
  if (minScore && minScore > 0) {
    views = views.filter((v) => v.eligibility.score >= minScore);
  }

  views = views.sort((a, b) => b.eligibility.score - a.eligibility.score);
  const offset = (page - 1) * limit;
  res.json({
    items: views.slice(offset, offset + limit),
    total: views.length,
    page,
    limit,
    userCities,
    userJobTypes,
  });
});

jobsRouter.get('/', optionalAuth, (req, res) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { page, limit, ...filters } = parsed.data;
  const { items, total } = searchJobs(filters as JobFilters, limit, (page - 1) * limit);
  const profile = req.userId ? getProfile(req.userId) : null;
  const state = userJobState(req.userId);
  res.json({ items: items.map((j) => toView(j, profile, state, false)), total, page, limit });
});

jobsRouter.get('/:id', optionalAuth, (req, res) => {
  const id = Number(req.params.id);
  const job = Number.isInteger(id) ? getJob(id) : null;
  if (!job) {
    res.status(404).json({ error: 'İlan bulunamadı' });
    return;
  }
  const profile = req.userId ? getProfile(req.userId) : null;
  res.json(toView(job, profile, userJobState(req.userId), true));
});
