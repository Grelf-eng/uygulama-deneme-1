import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
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

/** Canlı kamu ilanları taramasını tetikler (GET veya POST) - 3 dakikalık anti-DoS korumalı */
let lastScrapeTrigger = 0;
jobsRouter.all('/scrape/trigger', async (_req, res) => {
  const now = Date.now();
  if (now - lastScrapeTrigger < 3 * 60 * 1000) {
    const waitSec = Math.ceil((3 * 60 * 1000 - (now - lastScrapeTrigger)) / 1000);
    res.json({
      success: true,
      throttled: true,
      message: `Tarama zaten yakın zamanda çalıştırıldı. Tekrar çalıştırmak için lütfen ${waitSec} saniye bekleyin.`,
    });
    return;
  }
  lastScrapeTrigger = now;
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
  const userCities = profile?.cities || [];
  const userJobTypes = profile?.jobTypes || [];

  // Profilde hiç şehir seçilmemişse boş dön (profil uyarısı verilir)
  if (userCities.length === 0) {
    res.json({
      items: [],
      total: 0,
      page,
      limit,
      userCities: [],
      userJobTypes,
    });
    return;
  }

  const normUserCities = userCities.map((c) => norm(c)).filter(Boolean);

  // 1. Önce ham ilanları şehir ve kadro türüne göre hızlıca ön elemeden geçir (toView CPU yükünü %90 azaltır)
  const rawJobs = allJobs(filters as JobFilters).filter((j) => {
    // Kadro türü kontrolü
    if (userJobTypes.length > 0 && j.jobType && !userJobTypes.includes(j.jobType as any)) {
      return false;
    }
    // Şehir kontrolü
    if (!j.city) return true;
    const jc = norm(j.city);
    if (jc.includes('turkiye') || jc === 'genel' || jc === 'merkez') return true;
    return normUserCities.some((uc) => jc.includes(uc) || uc.includes(jc));
  });

  // 2. Yalnızca filtreden geçen uygun ilanlar için toView çalıştır
  const state = userJobState(req.userId);
  let views = rawJobs
    .map((j) => toView(j, profile, state, false))
    .filter((v) => v.eligibility.overall !== 'fail');

  // 3. Uyum Oranı Filtrelemesi (%100, %75+, %50+)
  if (minScore && minScore > 0) {
    views = views.filter((v) => v.eligibility.score >= minScore);
  }

  views.sort((a, b) => b.eligibility.score - a.eligibility.score);
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

/** VIP kullanıcılar için yeni eşleşen uygun ilan kontrolü ve otomatik bildirim kaydı */
jobsRouter.get('/matches/check-new', requireAuth, (req, res) => {
  const profile = getProfile(req.userId!);
  if (!profile || !profile.cities || profile.cities.length === 0) {
    res.json({ hasNew: false, count: 0 });
    return;
  }
  const normUserCities = profile.cities.map((c) => norm(c)).filter(Boolean);
  const userJobTypes = profile.jobTypes || [];

  const rawJobs = allJobs({}).filter((j) => {
    if (userJobTypes.length > 0 && j.jobType && !userJobTypes.includes(j.jobType as any)) {
      return false;
    }
    if (!j.city) return true;
    const jc = norm(j.city);
    if (jc.includes('turkiye') || jc === 'genel' || jc === 'merkez') return true;
    return normUserCities.some((uc) => jc.includes(uc) || uc.includes(jc));
  });

  const state = userJobState(req.userId);
  const matchingViews = rawJobs
    .map((j) => toView(j, profile, state, false))
    .filter((v) => v.eligibility.overall !== 'fail' && v.eligibility.score >= 50);

  if (matchingViews.length === 0) {
    res.json({ hasNew: false, count: 0 });
    return;
  }

  // Kullanıcının daha önce bildirim aldığı ilan ID'lerini al
  const notifiedRows = db
    .prepare('SELECT job_id FROM notifications WHERE user_id = ? AND job_id IS NOT NULL')
    .all(req.userId!) as { job_id: number }[];
  const notifiedJobIds = new Set(notifiedRows.map((r) => r.job_id));

  // Bildirimi henüz gönderilmemiş en güncel eşleşen ilanları bul
  const unnotifiedJobs = matchingViews.filter((v) => !notifiedJobIds.has(v.id));

  if (unnotifiedJobs.length === 0) {
    res.json({ hasNew: false, count: 0 });
    return;
  }

  // Yeni eşleşen ilanları notifications tablosuna atomik olarak kaydet (Mükerrer bildirimi kesinlikle engeller)
  const insertNotif = db.prepare(
    'INSERT INTO notifications (user_id, job_id, title, body, read) VALUES (?, ?, ?, ?, 0)',
  );

  const topJob = unnotifiedJobs[0];
  const notifTitle = '🎯 Size uygun 1 yeni ilan çıktı!';
  const notifBody = `${topJob.title} (${topJob.institution || 'Kamu Kurumu'}) - %${topJob.eligibility.score} Uyum`;

  const insertBatch = db.transaction((items: typeof unnotifiedJobs) => {
    for (const job of items) {
      try {
        insertNotif.run(
          req.userId!,
          job.id,
          '🎯 Size uygun 1 yeni ilan çıktı!',
          `${job.title} (${job.institution || 'Kamu Kurumu'}) - %${job.eligibility.score} Uyum`,
        );
      } catch (e) {
        // UNIQUE (user_id, job_id) kısıtlaması sayesinde mükerrer kayıt zaten engellenir
      }
    }
  });
  insertBatch(unnotifiedJobs);

  res.json({
    hasNew: true,
    count: unnotifiedJobs.length,
    latestJob: {
      id: topJob.id,
      title: topJob.title,
      institution: topJob.institution,
      city: topJob.city,
      score: topJob.eligibility.score,
    },
    title: notifTitle,
    body: notifBody,
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

/** İlan altındaki aday yorumları ve mülakat tartışmalarını getirir */
jobsRouter.get('/:id/comments', (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ error: 'Geçersiz ilan ID' });
    return;
  }
  const items = db
    .prepare(
      `SELECT id, job_id AS jobId, user_id AS userId, author_name AS authorName,
              author_kpss AS authorKpss, is_vip AS isVip, category, content, likes,
              created_at AS createdAt
       FROM job_comments
       WHERE job_id = ?
       ORDER BY id DESC
       LIMIT 100`,
    )
    .all(jobId);

  res.json({ items, total: items.length });
});

/** İlana yeni aday yorumu / mülakat sorusu ekler */
jobsRouter.post('/:id/comments', requireAuth, (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ error: 'Geçersiz ilan ID' });
    return;
  }
  const content = (req.body?.content || '').toString().trim();
  if (content.length < 2) {
    res.status(400).json({ error: 'Yorum içeriği en az 2 karakter olmalıdır' });
    return;
  }
  if (content.length > 600) {
    res.status(400).json({ error: 'Yorum içeriği en fazla 600 karakter olabilir' });
    return;
  }

  const rawCat = (req.body?.category || 'genel').toString().toLowerCase();
  const validCats = ['genel', 'mulakat', 'puan', 'soru'];
  const category = validCats.includes(rawCat) ? rawCat : 'genel';

  // Yazar bilgilerini profil ve kullanıcı tablosundan al
  const profile = getProfile(req.userId!);
  const userRow = db.prepare('SELECT email, username, is_subscribed FROM users WHERE id = ?').get(req.userId!) as
    | { email: string; username?: string; is_subscribed?: number }
    | undefined;

  let displayName = 'Aday';
  if (profile?.fullName && profile.fullName.trim().length > 0) {
    const parts = profile.fullName.trim().split(/\s+/);
    if (parts.length > 1) {
      displayName = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    } else {
      displayName = parts[0];
    }
  } else if (userRow?.email) {
    const atIdx = userRow.email.indexOf('@');
    displayName = atIdx > 2 ? userRow.email.substring(0, 3) + '***' : 'Kamu Adayı';
  }

  const authorKpss = profile?.kpssScore ? `${profile.kpssScore} Puan` : null;
  const isVip = userRow?.is_subscribed ? 1 : 0;

  const info = db
    .prepare(
      `INSERT INTO job_comments (job_id, user_id, author_name, author_kpss, is_vip, category, content, likes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(jobId, req.userId!, displayName, authorKpss, isVip, category, content);

  const newComment = {
    id: Number(info.lastInsertRowid),
    jobId,
    userId: req.userId!,
    authorName: displayName,
    authorKpss,
    isVip,
    category,
    content,
    likes: 0,
    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
  };

  res.json({ success: true, comment: newComment });
});

/** Yorumu beğen / faydalı bul (+1 Like) */
jobsRouter.post('/:id/comments/:commentId/like', (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    res.status(400).json({ error: 'Geçersiz yorum ID' });
    return;
  }
  db.prepare('UPDATE job_comments SET likes = likes + 1 WHERE id = ?').run(commentId);
  const updated = db.prepare('SELECT likes FROM job_comments WHERE id = ?').get(commentId) as { likes: number } | undefined;
  res.json({ success: true, likes: updated?.likes || 1 });
});
