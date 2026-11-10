import { db } from '../db';
import { Job, Profile } from '../types';
import { Eligibility, checkEligibility } from './eligibility';
import { estimateHistoricalPlacement } from '../constants/kpss';
import { estimateJobSalary, EstimatedSalary } from '../constants/salary';

export interface JobView extends Job {
  isFavorite: boolean;
  applicationStatus: string | null;
  historicalPlacement?: any;
  estimatedSalary?: EstimatedSalary;
  eligibility: Omit<Eligibility, 'checks'> & { checks?: Eligibility['checks'] };
}

export function userJobState(userId: number | undefined): {
  favorites: Set<number>;
  applications: Map<number, string>;
} {
  if (!userId) return { favorites: new Set(), applications: new Map() };
  const favorites = new Set(
    (db.prepare('SELECT job_id FROM favorites WHERE user_id = ?').all(userId) as { job_id: number }[]).map(
      (r) => r.job_id,
    ),
  );
  const applications = new Map(
    (db.prepare('SELECT job_id, status FROM applications WHERE user_id = ?').all(userId) as {
      job_id: number;
      status: string;
    }[]).map((r) => [r.job_id, r.status]),
  );
  return { favorites, applications };
}

export function toView(
  job: Job,
  profile: Profile | null,
  state: ReturnType<typeof userJobState>,
  withChecks: boolean,
): JobView {
  const e = checkEligibility(job, profile);
  const { checks, ...rest } = e;
  const historicalPlacement = estimateHistoricalPlacement(job);
  const estimatedSalary = estimateJobSalary(job);
  return {
    ...job,
    historicalPlacement,
    estimatedSalary,
    isFavorite: state.favorites.has(job.id),
    applicationStatus: state.applications.get(job.id) ?? null,
    eligibility: withChecks ? { ...rest, checks } : rest,
  };
}
