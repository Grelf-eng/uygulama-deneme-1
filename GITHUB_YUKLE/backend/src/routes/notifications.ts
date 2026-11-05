import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { sendTestPush } from '../services/notifier';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res) => {
  const items = db
    .prepare(
      `SELECT id, job_id AS jobId, title, body, read, created_at AS createdAt
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all(req.userId!);
  const unread = (
    db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.userId!) as {
      c: number;
    }
  ).c;
  res.json({ items, unread });
});

notificationsRouter.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.userId!);
  res.json({ ok: true });
});

notificationsRouter.post('/test', async (req, res) => {
  const latestJob = db
    .prepare('SELECT id, title, institution FROM jobs ORDER BY id DESC LIMIT 1')
    .get() as { id: number; title: string; institution: string } | undefined;

  const jobId = latestJob ? latestJob.id : null;
  const title = '🎯 Size uygun 1 yeni ilan çıktı!';
  const body = latestJob
    ? `${latestJob.title} (${latestJob.institution || 'Kamu Kurumu'})`
    : 'Profilinize uygun yeni kamu ilanları yayınlandı.';

  // Bildirimi kullanıcının bildirim kutusuna kaydet
  try {
    db.prepare(
      'INSERT INTO notifications (user_id, job_id, title, body, read) VALUES (?, ?, ?, ?, 0)',
    ).run(req.userId!, jobId, title, body);
  } catch (e) {
    // ignore
  }

  const row = db.prepare('SELECT push_token FROM profiles WHERE user_id = ?').get(req.userId!) as
    | { push_token: string | null }
    | undefined;

  let expoSent = false;
  if (row?.push_token) {
    try {
      expoSent = await sendTestPush(row.push_token);
    } catch (e) {
      // ignore
    }
  }

  res.json({ ok: true, jobId, title, body, expoSent });
});
