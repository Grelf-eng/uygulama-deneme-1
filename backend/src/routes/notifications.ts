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
  const row = db.prepare('SELECT push_token FROM profiles WHERE user_id = ?').get(req.userId!) as
    | { push_token: string | null }
    | undefined;
  if (!row?.push_token) {
    res.status(400).json({ error: 'Cihaz için push token kayıtlı değil' });
    return;
  }
  try {
    const ok = await sendTestPush(row.push_token);
    res.json({ ok });
  } catch (e) {
    res.status(502).json({ error: 'Bildirim gönderilemedi' });
  }
});
