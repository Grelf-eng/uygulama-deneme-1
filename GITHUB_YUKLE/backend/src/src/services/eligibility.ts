import {
  EDUCATION_LABELS,
  Job,
  Profile,
  educationRank,
  hasDepartment,
} from '../types';
import { certificatesMatch } from '../constants/certificates';
import { norm, todayISO } from '../utils/text';
import { formatKpssType, normalizeKpssType, estimateHistoricalPlacement } from '../constants/kpss';

export type CheckStatus = 'ok' | 'fail' | 'warn';

export interface Check {
  key: 'education' | 'kpss' | 'department' | 'certificate' | 'experience' | 'age' | 'deadline' | 'city';
  label: string;
  status: CheckStatus;
  detail: string;
  /** soft=true ise genel sonucu etkilemez (örn. şehir tercihi) */
  soft?: boolean;
}

export interface Eligibility {
  /** ok=✅ tüm şartlar sağlanıyor, warn=⚠️ doğrulanamayan şart var, fail=❌ şart sağlanmıyor */
  overall: CheckStatus;
  /** 0-100 eşleşme puanı (fail ise 0-30 aralığında) */
  score: number;
  checks: Check[];
  summary: { ok: number; warn: number; fail: number };
}

function departmentMatches(profileDept: string, required: string[]): boolean {
  const p = norm(profileDept);
  if (!p) return false;
  return required.some((r) => {
    const n = norm(r);
    if (!n) return false;
    if (n.includes(p) || p.includes(n)) return true;
    // Kelime bazlı örtüşme (ör. "Bilgisayar Mühendisliği" ~ "Bilgisayar ve Yazılım Mühendisliği")
    const pw = p.split(' ').filter((w) => w.length > 3);
    const nw = n.split(' ').filter((w) => w.length > 3);
    return pw.length > 0 && pw.every((w) => nw.some((x) => x.startsWith(w.slice(0, 5))));
  });
}

export function checkEligibility(job: Job, profile: Profile | null): Eligibility {
  const checks: Check[] = [];

  // Süre
  if (job.deadline) {
    const expired = job.deadline < todayISO();
    checks.push({
      key: 'deadline',
      label: 'Son başvuru',
      status: expired ? 'fail' : 'ok',
      detail: expired ? `Süresi doldu (${job.deadline})` : `Son gün: ${job.deadline}`,
    });
  }

  // KPSS
  if (job.kpssRequired === false) {
    checks.push({ key: 'kpss', label: 'KPSS', status: 'ok', detail: "KPSS şartı aranmıyor" });
  } else if (job.kpssRequired === null) {
    checks.push({
      key: 'kpss',
      label: 'KPSS',
      status: 'warn',
      detail: 'İlanda KPSS şartı net değil, ilan metnini kontrol edin',
    });
  } else {
    const jobTypeLabel = formatKpssType(job.kpssType) || job.kpssType;
    const typeLabel = jobTypeLabel ? ` (${jobTypeLabel})` : '';
    const normJobType = normalizeKpssType(job.kpssType);
    const normProfileType = normalizeKpssType(profile?.kpssType);
    if (profile?.kpssScore == null) {
      checks.push({
        key: 'kpss',
        label: 'KPSS',
        status: 'warn',
        detail: `KPSS${typeLabel} aranıyor; profilinize KPSS puanınızı ekleyin`,
      });
    } else if (job.minKpssScore == null) {
      const historical = estimateHistoricalPlacement(job);
      if (historical && profile.kpssScore >= historical.avgScore) {
        checks.push({
          key: 'kpss',
          label: 'KPSS (Ortalama Üstü)',
          status: 'ok',
          detail: `🏆 Taban puan ilanda belirtilmemiş ancak puanınız (${profile.kpssScore}) geçmiş atama ortalamasının (${historical.avgScore.toFixed(1)}) üzerinde!`,
        });
      } else {
        checks.push({
          key: 'kpss',
          label: 'KPSS',
          status: 'warn',
          detail: `KPSS${typeLabel} aranıyor, taban puan ilanda belirtilmemiş (puanınız: ${profile.kpssScore})`,
        });
      }
    } else if (profile.kpssScore < job.minKpssScore) {
      checks.push({
        key: 'kpss',
        label: 'KPSS',
        status: 'fail',
        detail: `En az ${job.minKpssScore} puan gerekli, sizin puanınız ${profile.kpssScore}`,
      });
    } else if (normJobType && normProfileType && normJobType !== normProfileType) {
      const profTypeLabel = formatKpssType(profile?.kpssType) || profile?.kpssType;
      checks.push({
        key: 'kpss',
        label: 'KPSS',
        status: 'warn',
        detail: `Puan yeterli (${profile.kpssScore} ≥ ${job.minKpssScore}) ancak ilan ${jobTypeLabel} istiyor, sizin türünüz ${profTypeLabel}`,
      });
    } else {
      const historical = estimateHistoricalPlacement(job);
      const isAboveAvg = historical && profile.kpssScore >= historical.avgScore;
      checks.push({
        key: 'kpss',
        label: isAboveAvg ? 'KPSS (Ortalama Üstü)' : 'KPSS',
        status: 'ok',
        detail: isAboveAvg
          ? `🏆 Puanınız yeterli ve geçmiş atama ortalamasının üzerinde! (${profile.kpssScore} ≥ ${historical.avgScore.toFixed(1)} ort.)`
          : `Puanınız yeterli (${profile.kpssScore} ≥ ${job.minKpssScore})`,
      });
    }
  }

  // Eğitim
  if (job.minEducation) {
    const need = educationRank(job.minEducation);
    const have = educationRank(profile?.educationLevel);
    const needLabel = EDUCATION_LABELS[job.minEducation];
    if (!profile?.educationLevel) {
      checks.push({
        key: 'education',
        label: 'Eğitim',
        status: 'warn',
        detail: `En az ${needLabel} aranıyor; profilinize eğitim seviyenizi ekleyin`,
      });
    } else if (have >= need) {
      checks.push({
        key: 'education',
        label: 'Eğitim',
        status: 'ok',
        detail: `${EDUCATION_LABELS[profile.educationLevel]} ≥ ${needLabel}`,
      });
    } else {
      checks.push({
        key: 'education',
        label: 'Eğitim',
        status: 'fail',
        detail: `En az ${needLabel} gerekli, sizin seviyeniz ${EDUCATION_LABELS[profile.educationLevel]}`,
      });
    }
  }

  // Bölüm
  if (job.requiredDepartments.length > 0) {
    if (profile && !hasDepartment(profile.educationLevel)) {
      // Lise ve altı eğitimde bölüm yoktur; bölüm şartı olan ilana başvurulamaz
      checks.push({
        key: 'department',
        label: 'Bölüm',
        status: 'fail',
        detail: `Aranan bölümler: ${job.requiredDepartments.join(', ')} (lise ve altı eğitimle sağlanamaz)`,
      });
    } else if (!profile?.department) {
      checks.push({
        key: 'department',
        label: 'Bölüm',
        status: 'warn',
        detail: `Aranan bölümler: ${job.requiredDepartments.join(', ')}. Profilinize bölümünüzü ekleyin`,
      });
    } else if (departmentMatches(profile.department, job.requiredDepartments)) {
      checks.push({
        key: 'department',
        label: 'Bölüm',
        status: 'ok',
        detail: `"${profile.department}" aranan bölümlerle uyumlu`,
      });
    } else {
      checks.push({
        key: 'department',
        label: 'Bölüm',
        status: 'fail',
        detail: `Aranan bölümler: ${job.requiredDepartments.join(', ')}`,
      });
    }
  }

  // Sertifika / belge
  if (job.requiredCertificates.length > 0) {
    const have = profile?.certificates ?? [];
    const missing = job.requiredCertificates.filter((r) => !have.some((h) => certificatesMatch(h, r)));
    const matched = job.requiredCertificates.length - missing.length;
    const any = job.certificateMode === 'any';
    const satisfied = any ? matched > 0 : missing.length === 0;
    const wanted = job.requiredCertificates.join(any ? ' veya ' : ', ');
    if (satisfied) {
      checks.push({
        key: 'certificate',
        label: 'Sertifika',
        status: 'ok',
        detail: `Gerekli belge(ler) profilinizde var: ${wanted}`,
      });
    } else if (have.length === 0) {
      checks.push({
        key: 'certificate',
        label: 'Sertifika',
        status: 'warn',
        detail: `${any ? 'Şunlardan biri' : 'Şunlar'} aranıyor: ${wanted}. Profilinize sertifikalarınızı ekleyin`,
      });
    } else {
      checks.push({
        key: 'certificate',
        label: 'Sertifika',
        status: 'fail',
        detail: any ? `Şunlardan biri gerekli: ${wanted}` : `Eksik belge(ler): ${missing.join(', ')}`,
      });
    }
  }

  // Deneyim
  if (job.minExperienceYears && job.minExperienceYears > 0) {
    const have = profile?.experienceYears ?? 0;
    checks.push({
      key: 'experience',
      label: 'Deneyim',
      status: have >= job.minExperienceYears ? 'ok' : 'fail',
      detail:
        have >= job.minExperienceYears
          ? `${have} yıl deneyim ≥ ${job.minExperienceYears} yıl`
          : `En az ${job.minExperienceYears} yıl gerekli, sizde ${have} yıl var`,
    });
  }

  // Yaş
  if (job.maxAge) {
    if (!profile?.birthYear) {
      checks.push({
        key: 'age',
        label: 'Yaş',
        status: 'warn',
        detail: `Azami yaş ${job.maxAge}; profilinize doğum yılınızı ekleyin`,
      });
    } else {
      const age = new Date().getFullYear() - profile.birthYear;
      checks.push({
        key: 'age',
        label: 'Yaş',
        status: age <= job.maxAge ? 'ok' : 'fail',
        detail: age <= job.maxAge ? `Yaşınız ${age} ≤ ${job.maxAge}` : `Azami yaş ${job.maxAge}, sizin yaşınız ${age}`,
      });
    }
  }

  // Şehir tercihi (bilgilendirme amaçlı)
  if (job.city && profile && profile.cities.length > 0) {
    const match = profile.cities.some((c) => norm(c) === norm(job.city));
    checks.push({
      key: 'city',
      label: 'Şehir',
      status: match ? 'ok' : 'warn',
      soft: true,
      detail: match ? `${job.city} tercih ettiğiniz şehirlerden` : `${job.city} tercih listenizde yok`,
    });
  }

  const hard = checks.filter((c) => !c.soft);
  const overall: CheckStatus = hard.some((c) => c.status === 'fail')
    ? 'fail'
    : hard.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok';

  const summary = {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };

  return { overall, score: computeScore(job, profile, overall, checks), checks, summary };
}

function computeScore(job: Job, profile: Profile | null, overall: CheckStatus, checks: Check[]): number {
  if (overall === 'fail') {
    const hard = checks.filter((c) => !c.soft);
    const okRatio = hard.length ? hard.filter((c) => c.status === 'ok').length / hard.length : 0;
    return Math.round(okRatio * 30);
  }

  const hasWarn = checks.some((c) => c.status === 'warn');
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  // Şehir kontrolü
  const cityMatch =
    !job.city ||
    !profile ||
    !profile.cities ||
    profile.cities.length === 0 ||
    profile.cities.some((c) => norm(c) === norm(job.city) || norm(job.city).includes(norm(c)));

  const historical = estimateHistoricalPlacement(job);
  const isKpssAboveAvg = Boolean(
    profile?.kpssScore != null && historical && profile.kpssScore >= historical.avgScore
  );

  if (overall === 'ok') {
    // KPSS ortalamadan yüksekse ve şehir uyuyorsa direkt %100 Uyum
    if (isKpssAboveAvg && cityMatch) {
      return 100;
    }
    // Hiçbir şartta eksik/uyarı yoksa ve şehir tutuyorsa %100 tam uyum
    if (!hasWarn && cityMatch) {
      return 100;
    }
    // 1 küçük uyarı varsa (örn. sertifika opsiyonel)
    if (warnCount === 1) {
      return isKpssAboveAvg ? 95 : (cityMatch ? 85 : 75);
    }
    return isKpssAboveAvg ? 90 : (cityMatch ? 75 : 65);
  }

  // overall === 'warn' (şartlardan bazıları net teyit edilemedi ama ret de değil)
  if (isKpssAboveAvg && cityMatch) {
    // KPSS puanı atama ortalamasının üzerindeyse uyum oranını yüksek tut (85)
    return 85;
  }
  if (warnCount <= 1 && cityMatch) return 70;
  if (cityMatch) return 60;
  return 50;
}
