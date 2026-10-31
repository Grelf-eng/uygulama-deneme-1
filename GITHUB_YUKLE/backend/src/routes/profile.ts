import { Router } from 'express';
import { z } from 'zod';
import { CITIES } from '../constants/cities';
import { canonicalCertificate, certificatesMatch } from '../constants/certificates';
import { normalizeKpssType } from '../constants/kpss';
import { isPoolOnlyDepartmentLevel, resolveDepartmentFromPool } from '../constants/departments';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { ensureProfile, getProfile, saveProfile, setPushToken } from '../services/profileRepo';
import { syncCloudProfile } from '../services/cloudDb';
import { EDUCATION_LEVELS, JOB_TYPES } from '../types';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const numOrNull = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(min).max(max).nullable());

const profileSchema = z.object({
  fullName: z.string().trim().max(100).default(''),
  birthYear: numOrNull(1940, new Date().getFullYear()),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable().default(null),
  department: z.string().trim().max(150).default(''),
  certificates: z
    .array(z.string().trim().min(2).max(100))
    .max(50)
    .default([])
    .transform((list) => {
      // Katalogdaki adlara çevir, tekrarları at
      const out: string[] = [];
      for (const c of list.map(canonicalCertificate)) if (!out.some((o) => certificatesMatch(o, c) && certificatesMatch(c, o))) out.push(c);
      return out;
    }),
  kpssScore: numOrNull(0, 100),
  kpssType: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .default(null)
    .transform((v) => normalizeKpssType(v)),
  experienceYears: z.coerce.number().min(0).max(60).default(0),
  cities: z.array(z.enum(CITIES as [string, ...string[]])).max(81).default([]),
  jobTypes: z.array(z.enum(JOB_TYPES)).default([]),
  notificationsEnabled: z.boolean().default(true),
});

profileRouter.get('/', (req, res) => {
  ensureProfile(req.userId!);
  const profile = getProfile(req.userId!);
  const user = db.prepare('SELECT email, is_admin FROM users WHERE id = ?').get(req.userId!) as {
    email: string;
    is_admin: number;
  } | undefined;
  res.json({ email: user?.email || '', username: user?.email || '', isAdmin: user?.is_admin === 1, profile: profile || {} });
});

profileRouter.put('/', (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    res.status(400).json({ error: `${i.path.join('.')}: ${i.message}` });
    return;
  }
  const data = parsed.data;
  if (isPoolOnlyDepartmentLevel(data.educationLevel)) {
    if (!data.department) {
      res.status(400).json({ error: 'Lisans ve üstü eğitim için lütfen listeden bölümünüzü seçin.' });
      return;
    }
    const resolved = resolveDepartmentFromPool(data.department, data.educationLevel);
    if (!resolved) {
      res.status(400).json({
        error: 'Geçersiz bölüm seçimi. Lisans ve üstü mezunlar yalnızca bölüm seçenek havuzundan seçim yapabilir.',
      });
      return;
    }
    data.department = resolved;
  }
  ensureProfile(req.userId!);
  saveProfile(req.userId!, data);
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId!) as { email: string } | undefined;
  if (user?.email) {
    syncCloudProfile(user.email, data).catch((e: any) => console.error('[cloud-db] Profil senkronizasyon hatası:', e.message));
  }
  res.json({ profile: getProfile(req.userId!) });
});

profileRouter.put('/push-token', (req, res) => {
  const parsed = z.object({ token: z.string().min(10).nullable() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz push token' });
    return;
  }
  setPushToken(req.userId!, parsed.data.token);
  res.json({ ok: true });
});
