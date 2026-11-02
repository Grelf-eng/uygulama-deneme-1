import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { db } from './db';
import { optionalAuth } from './middleware/auth';
import { authRouter } from './routes/auth';
import { cvRouter } from './routes/cv';
import { jobsRouter } from './routes/jobs';
import { mobileInfoRouter } from './routes/mobileInfo';
import { notificationsRouter } from './routes/notifications';
import { profileRouter } from './routes/profile';
import { applicationsRouter, favoritesRouter } from './routes/userLists';
import { runAllScrapers } from './scrapers';
import { ensureAdminUser } from './seed';
import { syncCloudUser } from './services/cloudDb';

ensureAdminUser();

export const app = express();
app.disable('x-powered-by');

// Güvenlik Başlıkları (Security Headers)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '8mb' }));

const publicDir = fs.existsSync(path.join(process.cwd(), 'public'))
  ? path.join(process.cwd(), 'public')
  : path.join(__dirname, '..', 'public');
app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.join(publicDir, 'manifest.webmanifest'));
});
function serveApk(_req: Request, res: Response) {
  const apkPath = path.join(publicDir, 'kamu-ilan-asistani.apk');
  if (!fs.existsSync(apkPath)) {
    res.status(404).send('APK dosyası bulunamadı');
    return;
  }
  res.sendFile(apkPath, {
    cacheControl: false,
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Disposition': 'attachment; filename="kamu-ilan-asistani.apk"',
    },
  });
}
app.get('/kamu-ilan-asistani.apk', serveApk);
app.get('/apk', serveApk);
app.get('/indir', (_req, res) => {
  res.sendFile(path.join(publicDir, 'indir.html'));
});
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  const jobsCount = (db.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number })?.c || 0;
  const usersCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number })?.c || 0;
  res.json({
    status: 'ok',
    service: 'kamu-ilan-backend',
    uptime: Math.round(process.uptime()),
    jobsCount,
    usersCount,
    timestamp: new Date().toISOString(),
  });
});
app.use('/api', mobileInfoRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/cv', cvRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/notifications', notificationsRouter);

function isAdminRequest(req: Request): boolean {
  if (config.adminKey && req.headers['x-admin-key'] === config.adminKey) return true;
  if (!req.userId) return false;
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId) as { is_admin: number } | undefined;
  return row?.is_admin === 1;
}

app.get('/api/admin/stats', optionalAuth, (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: 'Yetkisiz' });
    return;
  }
  const jobCount = (db.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number }).c;
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const bySource = db
    .prepare('SELECT source, COUNT(*) AS count FROM jobs GROUP BY source ORDER BY count DESC')
    .all();
  res.json({ jobCount, userCount, bySource });
});

// Admin: Kayıtlı kullanıcıları ve onay durumlarını listele
app.get('/api/admin/users', optionalAuth, (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: 'Yetkisiz' });
    return;
  }
  const users = db.prepare('SELECT id, email, is_admin, is_verified, created_at FROM users ORDER BY id DESC LIMIT 50').all();
  res.json({ users });
});

// Admin: Bekleyen bir kullanıcıyı tek tıkla onayla
app.post('/api/admin/users/:id/verify', optionalAuth, (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: 'Yetkisiz' });
    return;
  }
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email, password_hash, is_admin FROM users WHERE id = ?').get(userId) as {
    email: string;
    password_hash: string;
    is_admin: number;
  } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    return;
  }
  db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userId);
  syncCloudUser(u.email, u.password_hash, u.is_admin, 1);
  res.json({ success: true, message: `${u.email} hesabı başarıyla onaylandı.` });
});

// Manuel scraping tetikleme (Admin oturumu veya x-admin-key başlığı gerekir)
app.post('/api/admin/scrape', optionalAuth, async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: 'Yetkisiz' });
    return;
  }
  try {
    res.json(await runAllScrapers(Array.isArray(req.body?.sources) ? req.body.sources : undefined));
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Bulunamadı' }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'Geçersiz JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası' });
});
