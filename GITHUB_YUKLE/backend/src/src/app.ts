import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { db } from './db';
import { optionalAuth } from './middleware/auth';
import { adminRouter } from './routes/admin';
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
app.use('/api/admin', adminRouter);

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
