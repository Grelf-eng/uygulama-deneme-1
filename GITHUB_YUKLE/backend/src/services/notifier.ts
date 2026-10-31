import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { config } from '../config';
import { db } from '../db';
import { checkEligibility } from './eligibility';
import { getJobsByIds } from './jobsRepo';
import { listNotifiableUsers } from './profileRepo';
import { Job } from '../types';

const expo = new Expo({ accessToken: config.expoAccessToken });

function buildMessage(job: Job, score: number, warn: boolean): { title: string; body: string } {
  const where = job.city ? ` • ${job.city}` : '';
  return {
    title: warn ? '⚠️ Yeni ilan (kontrol edin)' : '✅ Yeni uygun ilan',
    body: `${job.title}${job.institution ? ` – ${job.institution}` : ''}${where} (uyum %${score})`,
  };
}

/**
 * Yeni eklenen ilanları kullanıcı profilleriyle eşleştirir; uygun olanları
 * bildirim tablosuna yazar ve Expo üzerinden push gönderir.
 */
export async function notifyForNewJobs(newJobIds: number[]): Promise<{ matched: number; pushed: number }> {
  if (newJobIds.length === 0) return { matched: 0, pushed: 0 };
  const jobs = getJobsByIds(newJobIds);
  const users = listNotifiableUsers();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO notifications (user_id, job_id, title, body) VALUES (?, ?, ?, ?)',
  );

  const messages: ExpoPushMessage[] = [];
  const pushedRows: { userId: number; jobId: number }[] = [];
  let matched = 0;

  for (const user of users) {
    for (const job of jobs) {
      const e = checkEligibility(job, user.profile);
      if (e.overall === 'fail' || e.score < config.notifyMinScore) continue;
      const { title, body } = buildMessage(job, e.score, e.overall === 'warn');
      const info = insert.run(user.userId, job.id, title, body);
      if (info.changes === 0) continue; // daha önce bildirildi
      matched++;
      if (user.pushToken && Expo.isExpoPushToken(user.pushToken)) {
        messages.push({
          to: user.pushToken,
          sound: 'default',
          title,
          body,
          data: { jobId: job.id },
        });
        pushedRows.push({ userId: user.userId, jobId: job.id });
      }
    }
  }

  let pushed = 0;
  const markPushed = db.prepare('UPDATE notifications SET pushed = 1 WHERE user_id = ? AND job_id = ?');
  let idx = 0;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((t, i) => {
        if (t.status === 'ok') {
          const row = pushedRows[idx + i];
          markPushed.run(row.userId, row.jobId);
          pushed++;
        } else {
          console.warn('[push] hata:', t.message);
        }
      });
    } catch (err) {
      console.error('[push] gönderim başarısız:', err);
    }
    idx += chunk.length;
  }
  return { matched, pushed };
}

export async function sendTestPush(token: string): Promise<boolean> {
  if (!Expo.isExpoPushToken(token)) return false;
  const [ticket] = await expo.sendPushNotificationsAsync([
    { to: token, sound: 'default', title: 'Test bildirimi', body: 'Bildirimler çalışıyor 🎉' },
  ]);
  return ticket.status === 'ok';
}
