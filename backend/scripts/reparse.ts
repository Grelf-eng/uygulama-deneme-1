// Veritabanındaki mevcut ilanların başlıklarını, açıklamalarını (bitişik yazıları ayırarak)
// ve KPSS / eğitim / son başvuru şartlarını yeniden düzenler; eski ve mükerrer kayıtları temizler.
import { db } from '../src/db';
import { deduplicateAndCleanJobs } from '../src/scrapers';
import { beautifyTurkishText, buildStructuredFallbackDescription } from '../src/scrapers/format';
import { parseListDeadline } from '../src/scrapers/generic';
import { cleanListingTitle, extractInstitution, parseRequirements } from '../src/scrapers/parse';
import { norm } from '../src/utils/text';

db.prepare("DELETE FROM jobs WHERE source IN ('kamuilan', 'ornek')").run();

// İlk temizlik (arşiv / eski yıllar / haberler)
deduplicateAndCleanJobs();

const rows = db.prepare('SELECT * FROM jobs').all() as any[];

for (const r of rows) {
  const cleanTitle = cleanListingTitle(r.title);
  // Önceki ham/eski özet açıklamaları tespit et
  const rawDesc: string = r.description || '';
  const isStubDesc =
    r.source === 'kamuilan' ||
    rawDesc.length < 100 ||
    norm(rawDesc) === norm(r.title) ||
    norm(rawDesc) === norm(cleanTitle) ||
    rawDesc.includes('ana sayfasındaki listede yer almaktadır') ||
    rawDesc.startsWith('📌 İlan Özeti:');

  const cleanedBody = isStubDesc ? '' : beautifyTurkishText(rawDesc, cleanTitle);
  const req = parseRequirements(cleanTitle, cleanedBody);
  const inst =
    extractInstitution(cleanTitle, cleanedBody) ??
    (r.institution && r.institution !== 'Kamu İlan Platformu' ? cleanListingTitle(r.institution) : r.institution);
  const city = req.city ?? r.city;
  const deadline = req.deadline ?? parseListDeadline(r.title) ?? r.deadline;

  const finalDesc =
    cleanedBody.length >= 100
      ? cleanedBody
      : buildStructuredFallbackDescription({
          title: cleanTitle,
          institution: inst,
          city,
          jobType: req.jobType,
          positions: req.positions ?? r.positions,
          kpssRequired: req.kpssRequired,
          minKpssScore: req.minKpssScore,
          kpssType: req.kpssType,
          minEducation: req.minEducation,
          deadline,
          source: r.source,
        });

  const finalUrl = r.source === 'kamuilan' ? 'https://kamuilan.sbb.gov.tr/' : r.url;
  const searchText = norm(`${cleanTitle} ${inst ?? ''} ${city ?? ''} ${req.requiredCertificates.join(' ')} ${finalDesc}`);

  db.prepare(
    `UPDATE jobs SET
      title = ?, institution = ?, city = ?, description = ?, url = ?, deadline = ?,
      kpss_required = ?, min_kpss_score = ?, kpss_type = ?, min_education = ?,
      required_certificates = ?, certificate_mode = ?, min_experience_years = ?,
      max_age = ?, positions = COALESCE(?, positions), job_type = ?, search_text = ?
    WHERE id = ?`,
  ).run(
    cleanTitle,
    inst,
    city,
    finalDesc,
    finalUrl,
    deadline,
    req.kpssRequired === null ? null : req.kpssRequired ? 1 : 0,
    req.minKpssScore,
    req.kpssType,
    req.minEducation,
    JSON.stringify(req.requiredCertificates),
    req.certificateMode,
    req.minExperienceYears,
    req.maxAge,
    req.positions,
    req.jobType,
    searchText,
    r.id,
  );
}

deduplicateAndCleanJobs();

const summary = db
  .prepare('SELECT source, kpss_required, COUNT(*) as count FROM jobs GROUP BY source, kpss_required ORDER BY source')
  .all();
console.log('Yeniden düzenleme tamamlandı:', summary);
