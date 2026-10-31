import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { getJob, getJobsByIds } from '../services/jobsRepo';
import { toView, userJobState } from '../services/jobView';
import { getProfile } from '../services/profileRepo';
import { APPLICATION_STATUSES } from '../types';

export const favoritesRouter = Router();
export const applicationsRouter = Router();
favoritesRouter.use(requireAuth);
applicationsRouter.use(requireAuth);

function parseJobId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && getJob(id) ? id : null;
}

favoritesRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT job_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.userId!) as { job_id: number }[];
  const jobs = getJobsByIds(rows.map((r) => r.job_id));
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const profile = getProfile(req.userId!);
  const state = userJobState(req.userId);
  const items = rows
    .map((r) => byId.get(r.job_id))
    .filter((j): j is NonNullable<typeof j> => !!j)
    .map((j) => toView(j, profile, state, false));
  res.json({ items });
});

favoritesRouter.put('/:jobId', (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (!jobId) {
    res.status(404).json({ error: 'İlan bulunamadı' });
    return;
  }
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, job_id) VALUES (?, ?)').run(req.userId!, jobId);
  res.json({ ok: true });
});

favoritesRouter.delete('/:jobId', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND job_id = ?').run(req.userId!, Number(req.params.jobId));
  res.json({ ok: true });
});

applicationsRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT job_id, status, notes, updated_at FROM applications WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.userId!) as { job_id: number; status: string; notes: string; updated_at: string }[];
  const jobs = getJobsByIds(rows.map((r) => r.job_id));
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const profile = getProfile(req.userId!);
  const state = userJobState(req.userId);
  const items = rows
    .filter((r) => byId.has(r.job_id))
    .map((r) => ({
      status: r.status,
      notes: r.notes,
      updatedAt: r.updated_at,
      job: toView(byId.get(r.job_id)!, profile, state, false),
    }));
  res.json({ items });
});

const appSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).default('planned'),
  notes: z.string().max(2000).default(''),
});

applicationsRouter.put('/:jobId', (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (!jobId) {
    res.status(404).json({ error: 'İlan bulunamadı' });
    return;
  }
  const parsed = appSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  db.prepare(
    `INSERT INTO applications (user_id, job_id, status, notes) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET status = excluded.status, notes = excluded.notes,
       updated_at = datetime('now')`,
  ).run(req.userId!, jobId, parsed.data.status, parsed.data.notes);
  res.json({ ok: true, ...parsed.data });
});

applicationsRouter.delete('/:jobId', (req, res) => {
  db.prepare('DELETE FROM applications WHERE user_id = ? AND job_id = ?').run(req.userId!, Number(req.params.jobId));
  res.json({ ok: true });
});
