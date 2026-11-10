import { db } from '../db';
import { upsertJob } from '../services/jobsRepo';
import { notifyForNewJobs } from '../services/notifier';
import { norm, todayISO } from '../utils/text';
import { ALWAYS_EXCLUDE, isArchivedOldAnnouncement } from './generic';
import { scrapers } from './sources';

export interface ScrapeReport {
  source: string;
  found: number;
  added: number;
  error?: string;
}

export interface ScrapeStatus {
  running: boolean;
  currentSource: string;
  foundCount: number;
  addedCount: number;
  totalSources: number;
  completedSources: number;
  startedAt: number;
  lastFinishedAt?: number;
  lastDurationSeconds?: number;
  lastSummary?: string;
  error?: string;
}

export let scrapeProgress: ScrapeStatus = {
  running: false,
  currentSource: '',
  foundCount: 0,
  addedCount: 0,
  totalSources: 0,
  completedSources: 0,
  startedAt: 0,
  lastFinishedAt: 0,
  lastDurationSeconds: 0,
  lastSummary: '',
};

export function isScrapingRunning(): boolean {
  if (scrapeProgress.running && Date.now() - scrapeProgress.startedAt > 3 * 60 * 1000) {
    // 3 dakikadan uzun sürmüşse kilitlenmiş demektir, kilidi kaldır
    console.warn('[scraper] 3 dakikalık zaman aşımı: kilitlenen tarama sıfırlandı.');
    scrapeProgress.running = false;
  }
  return scrapeProgress.running;
}

export function getScrapeStatus(): ScrapeStatus {
  isScrapingRunning();
  return { ...scrapeProgress };
}

function instKey(inst: string | null): string {
  const words = norm(inst ?? '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bturkiye is kurumu\b/g, 'iskur')
    .replace(/\bturk akreditasyon kurumu\b/g, 'turkak')
    .replace(/\bdevlet su isleri\b/g, 'dsi')
    .replace(/\borman genel mudurlugu\b/g, 'ogm')
    .replace(/\bsosyal guvenlik kurumu\b/g, 'sgk')
    .replace(/\bmilli egitim bakanligi\b/g, 'meb')
    .replace(/\bkarayollari genel mudurlugu\b/g, 'kgm')
    .replace(
      /\b(tc|belediye|baskanligi|belediyesi|rektorlugu|universitesi|genel|mudurlugu|bakanligi|kurumu|ili)\b/g,
      ' ',
    )
    .split(/\s+/)
    .filter(Boolean);
  return [...new Set(words)].sort().join(' ');
}

/**
 * Her tarama sonrasında:
 * 1) Süresi geçmiş veya arşiv/haber niteliğindeki kayıtları siler,
 * 2) Tam metni `memurlar` kaynağında mevcut olan `kamuilan` özet kayıtlarını tekilleştirir.
 */
export function deduplicateAndCleanJobs(): void {
  const today = todayISO();
  db.prepare('DELETE FROM jobs WHERE deadline IS NOT NULL AND deadline < ?').run(today);

  const all = db
    .prepare('SELECT id, source, title, institution, description, url, job_type, positions FROM jobs')
    .all() as {
    id: number;
    source: string;
    title: string;
    institution: string | null;
    description: string;
    url: string | null;
    job_type: string;
    positions: number | null;
  }[];

  for (const r of all) {
    if (r.source === 'ornek' || r.source === 'test') continue;
    let isHomepageOnly = !r.url;
    if (r.url) {
      try {
        const u = new URL(r.url);
        if (!u.pathname || u.pathname.replace(/\/+$/, '') === '') isHomepageOnly = true;
        // memurlar eski arşiv ID'lerini (85000 altı) temizle
        const mId = u.pathname.match(/^\/ilan\/(\d+)\//);
        if (mId && Number(mId[1]) < 85000) isHomepageOnly = true;
      } catch {
        isHomepageOnly = true;
      }
    }
    if (isHomepageOnly || ALWAYS_EXCLUDE.test(norm(r.title)) || isArchivedOldAnnouncement(r.title, r.description)) {
      db.prepare('DELETE FROM jobs WHERE id = ?').run(r.id);
    }
  }

  const memurlarRows = db
    .prepare("SELECT institution, job_type, positions FROM jobs WHERE source = 'memurlar'")
    .all() as { institution: string | null; job_type: string; positions: number | null }[];

  const memKeys = memurlarRows.map((m) => ({
    key: instKey(m.institution),
    jobType: m.job_type,
    positions: m.positions,
  }));

  const kamuRows = db
    .prepare("SELECT id, title, institution, job_type, positions FROM jobs WHERE source = 'kamuilan'")
    .all() as { id: number; title: string; institution: string | null; job_type: string; positions: number | null }[];

  const seenKamu = new Set<string>();
  for (const k of kamuRows) {
    const nt = norm(k.title);
    const ik = instKey(k.institution);
    const dupOfMemurlar =
      ik.length >= 3 &&
      memKeys.some(
        (m) =>
          m.key.length >= 3 &&
          (ik === m.key || (ik.length >= 5 && m.key.length >= 5 && (ik.includes(m.key) || m.key.includes(ik)))) &&
          (m.positions === k.positions || m.jobType === k.job_type || k.job_type === 'diger'),
      );
    if (seenKamu.has(nt) || dupOfMemurlar) {
      db.prepare('DELETE FROM jobs WHERE id = ?').run(k.id);
    } else {
      seenKamu.add(nt);
    }
  }
}

/** Tüm kaynakları çalıştırır, mükerrerleri temizler ve yeni ilanlar için bildirim gönderir. */
export async function runAllScrapers(only?: string[]): Promise<{
  reports: ScrapeReport[];
  notifications: { matched: number; pushed: number };
}> {
  if (isScrapingRunning()) throw new Error('İlan taraması zaten devam ediyor. Lütfen biraz bekleyin.');
  
  const activeScrapers = scrapers.filter((x) => (only ? only.includes(x.name) : x.enabled));
  const startTime = Date.now();
  scrapeProgress = {
    running: true,
    currentSource: 'Başlatılıyor...',
    foundCount: 0,
    addedCount: 0,
    totalSources: activeScrapers.length,
    completedSources: 0,
    startedAt: startTime,
    lastSummary: 'Tarama başlatıldı...',
  };

  const reports: ScrapeReport[] = [];
  const newIds: number[] = [];
  try {
    for (let i = 0; i < activeScrapers.length; i++) {
      const s = activeScrapers[i];
      scrapeProgress.currentSource = s.name;
      const report: ScrapeReport = { source: s.name, found: 0, added: 0 };
      try {
        const jobs = await s.run();
        report.found = jobs.length;
        scrapeProgress.foundCount += jobs.length;
        for (const j of jobs) {
          const { id, isNew } = upsertJob(j);
          if (isNew) {
            report.added++;
            newIds.push(id);
            scrapeProgress.addedCount++;
          }
        }
      } catch (err) {
        report.error = (err as Error).message;
        console.error(`[scraper:${s.name}]`, report.error);
      }
      scrapeProgress.completedSources = i + 1;
      console.log(`[scraper:${s.name}] bulunan=${report.found} yeni=${report.added}`);
      reports.push(report);
    }
    deduplicateAndCleanJobs();

    // Taranan yeni kamu ilanlarını Neon PostgreSQL bulutuna hızlı ve kalıcı kaydet
    try {
      const { syncLocalJobsToCloud } = await import('../services/cloudDb');
      if (newIds.length > 0) {
        await syncLocalJobsToCloud(newIds);
      } else {
        await syncLocalJobsToCloud();
      }
    } catch {}

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    scrapeProgress.lastFinishedAt = Date.now();
    scrapeProgress.lastDurationSeconds = durationSec;
    scrapeProgress.lastSummary = `Tarama ${durationSec} saniyede tamamlandı. ${scrapeProgress.foundCount} ilan incelendi, ${newIds.length} yeni ilan sisteme eklendi.`;

    const validNewIds = newIds.filter((id) => db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(id));
    const notifications = await notifyForNewJobs(validNewIds);
    return { reports, notifications };
  } finally {
    scrapeProgress.running = false;
  }
}
