import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { analyzeCv, CV_TRACK_LABELS, CV_TRACKS, CvAnalysisResult, CvTrack } from '../services/cvAnalyzer';
import { ensureProfile, getProfile, saveProfile } from '../services/profileRepo';
import { extractTextFromUploadedFile } from '../utils/cvFileExtract';
import { resolveDepartmentFromPool, isPoolOnlyDepartmentLevel } from '../constants/departments';

export const cvRouter = Router();

const analyzeSchema = z.object({
  cvText: z.string().max(120000).optional(),
  fileName: z.string().max(260).optional(),
  fileBase64: z.string().max(9_000_000).optional(),
  targetTrack: z.enum(CV_TRACKS).default('genel'),
});

const trackList = CV_TRACKS.map((value) => ({ value, label: CV_TRACK_LABELS[value] }));

cvRouter.get('/', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT cv_text, target_track, score, result_json, updated_at FROM cv_analyses WHERE user_id = ?')
    .get(req.userId!) as
    | { cv_text: string; target_track: CvTrack; score: number; result_json: string; updated_at: string }
    | undefined;

  if (!row) {
    res.json({ tracks: trackList, saved: null });
    return;
  }

  let analysis: CvAnalysisResult;
  try {
    analysis = JSON.parse(row.result_json) as CvAnalysisResult;
  } catch {
    analysis = analyzeCv(row.cv_text, row.target_track);
  }

  res.json({
    tracks: trackList,
    saved: {
      cvText: row.cv_text,
      targetTrack: row.target_track,
      analysis,
      updatedAt: row.updated_at,
    },
  });
});

cvRouter.post('/analyze', requireAuth, (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Geçersiz istek' });
    return;
  }

  let text = (parsed.data.cvText ?? '').trim();
  if (parsed.data.fileName && parsed.data.fileBase64) {
    try {
      text = extractTextFromUploadedFile(parsed.data.fileName, parsed.data.fileBase64);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
  }

  if (text.length < 15) {
    res.status(400).json({ error: 'Lütfen değerlendirmek için CV metninizi kutuya yapıştırın veya dosya (.pdf / .docx / .txt) yükleyin.' });
    return;
  }

  const targetTrack = parsed.data.targetTrack;
  const analysis = analyzeCv(text, targetTrack);

  db.prepare(
    `INSERT INTO cv_analyses (user_id, cv_text, target_track, score, result_json, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       cv_text = excluded.cv_text,
       target_track = excluded.target_track,
       score = excluded.score,
       result_json = excluded.result_json,
       updated_at = datetime('now')`,
  ).run(req.userId!, text, targetTrack, analysis.score, JSON.stringify(analysis));

  res.json({
    cvText: text,
    targetTrack,
    analysis,
    updatedAt: new Date().toISOString(),
  });
});

cvRouter.post('/apply-to-profile', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT result_json FROM cv_analyses WHERE user_id = ?')
    .get(req.userId!) as { result_json: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Önce CV analizi yapmalısınız.' });
    return;
  }

  const analysis = JSON.parse(row.result_json) as CvAnalysisResult;
  const ext = analysis.extractedProfile;

  ensureProfile(req.userId!);
  const current = getProfile(req.userId!)!;

  const mergedCerts = [...new Set([...current.certificates, ...(ext.certificates || [])])];
  const mergedCities = ext.city && !current.cities.includes(ext.city) ? [...current.cities, ext.city] : current.cities;

  const targetEduLevel = ext.educationLevel ?? current.educationLevel;
  let targetDepartment = ext.department || current.department;
  if (isPoolOnlyDepartmentLevel(targetEduLevel)) {
    const resolved = resolveDepartmentFromPool(targetDepartment, targetEduLevel);
    targetDepartment = resolved || '';
  }

  const updated = {
    ...current,
    fullName: ext.fullName || current.fullName,
    educationLevel: targetEduLevel,
    department: targetDepartment,
    kpssScore: ext.kpssScore ?? current.kpssScore,
    kpssType: ext.kpssType ?? current.kpssType,
    experienceYears: ext.experienceYears ?? current.experienceYears,
    certificates: mergedCerts,
    cities: mergedCities,
  };

  saveProfile(req.userId!, updated);
  res.json({ profile: getProfile(req.userId!) });
});
