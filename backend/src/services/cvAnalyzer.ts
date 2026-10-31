import { CITIES } from '../constants/cities';
import { extractCertificates } from '../constants/certificates';
import { EDUCATION_LABELS, EducationLevel } from '../types';
import { norm } from '../utils/text';
import { formatKpssType, normalizeKpssType } from '../constants/kpss';
import { resolveDepartmentFromPool, UNDERGRAD_PLUS_DEPARTMENTS, ASSOCIATE_DEPARTMENTS } from '../constants/departments';

export const CV_TRACKS = ['genel', 'memur', 'sozlesmeli', 'uzman', 'isci', 'akademik', 'bilisim'] as const;
export type CvTrack = (typeof CV_TRACKS)[number];

export const CV_TRACK_LABELS: Record<CvTrack, string> = {
  genel: 'Genel Kamu & Özel Sektör CV',
  memur: 'Memur / KPSS-B Kadroları',
  sozlesmeli: '4/B Sözleşmeli Personel',
  uzman: 'KPSS-A / Uzman & Müfettiş Yrd.',
  isci: 'Kamu İşçisi (İŞKUR / Belediye)',
  akademik: 'Akademik Personel (Öğr. Gör. / Arş. Gör.)',
  bilisim: 'Sözleşmeli Bilişim Personeli',
};

export interface CvCategoryScore {
  key: string;
  label: string;
  earned: number;
  maxPoints: number;
  lost: number;
}

export interface CvDeduction {
  id: string;
  category: string;
  title: string;
  pointsLost: number;
  reason: string;
  suggestion: string;
}

export interface CvStrength {
  category: string;
  title: string;
  detail: string;
}

export interface ExtractedCvProfile {
  fullName: string | null;
  educationLevel: EducationLevel | null;
  educationLabel: string | null;
  department: string | null;
  kpssScore: number | null;
  kpssType: string | null;
  experienceYears: number | null;
  city: string | null;
  certificates: string[];
}

export interface CvAnalysisResult {
  score: number;
  maxScore: 100;
  totalDeducted: number;
  level: 'excellent' | 'good' | 'fair' | 'weak';
  levelLabel: string;
  targetTrack: CvTrack;
  targetTrackLabel: string;
  wordCount: number;
  overallComment: string;
  categories: CvCategoryScore[];
  deductions: CvDeduction[];
  strengths: CvStrength[];
  extractedProfile: ExtractedCvProfile;
}

const DEPARTMENTS_LIST = [
  'Bilgisayar Mühendisliği',
  'Yazılım Mühendisliği',
  'Elektrik-Elektronik Mühendisliği',
  'Makine Mühendisliği',
  'İnşaat Mühendisliği',
  'Endüstri Mühendisliği',
  'Çevre Mühendisliği',
  'Gıda Mühendisliği',
  'Ziraat Mühendisliği',
  'Harita Mühendisliği',
  'Mimarlık',
  'Şehir ve Bölge Planlama',
  'Hukuk',
  'İktisat',
  'İşletme',
  'Maliye',
  'Kamu Yönetimi',
  'Siyaset Bilimi ve Kamu Yönetimi',
  'Uluslararası İlişkiler',
  'Çalışma Ekonomisi ve Endüstri İlişkileri',
  'Ekonometri',
  'Muhasebe ve Finansman',
  ' Hemşirelik',
  'Ebelik',
  'Fizyoterapi ve Rehabilitasyon',
  'Beslenme ve Diyetetik',
  'Psikoloji',
  'Sosyal Hizmet',
  'Sosyoloji',
  'Çocuk Gelişimi',
  'Tıbbi Dokümantasyon ve Sekreterlik',
  'İlk ve Acil Yardım',
  'Anestezi',
  'Tıbbi Görüntüleme Teknikleri',
  'Tıbbi Laboratuvar Teknikleri',
  'Bilgisayar Programcılığı',
  'Büro Yönetimi ve Yönetici Asistanlığı',
  'İlahiyat',
  'Türk Dili ve Edebiyatı',
  'Tarih',
  'Coğrafya',
  'Matematik',
  'İstatistik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'İngiliz Dili ve Edebiyatı',
  'Mütercim-Tercümanlık',
  'Kütüphanecilik',
  'Bilgi ve Belge Yönetimi',
  'İletişim',
  'Halkla İlişkiler ve Tanıtım',
  'Gazetecilik',
  'Radyo, Televizyon ve Sinema',
  'Turizm İşletmeciliği',
  'Gastronomi ve Mutfak Sanatları',
].map((s) => s.trim());

function detectEducation(nt: string): EducationLevel | null {
  if (/\bdoktora\b|\bphd\b/.test(nt)) return 'doktora';
  if (/\byuksek\s*lisans\b|\btezli\b|\btezsiz\b|\bmaster\b/.test(nt)) return 'yuksek_lisans';
  if (/\blisans\s*mezun|\bfakulte\w*\b|\blisans\s*derece|\buniversite\w*.*?\bbolum|\bmuhendislig|\biibf\b|\blisans\b/.test(nt)) {
    if (!/\bon\s*lisans\b|\bonlisans\b/.test(nt) || /\blisans\s*\(/.test(nt) || /\bfakulte/.test(nt)) {
      return 'lisans';
    }
  }
  if (/\bon\s*lisans\b|\bonlisans\b|\bmeslek\s*yuksek\s*okul|\bmyo\b/.test(nt)) return 'onlisans';
  if (/\blise\b|\banadolu\s*lisesi|\bmeslek\s*lisesi|\bimam\s*hatip|\bortaogretim\b/.test(nt)) return 'lise';
  if (/\bortaokul\b|\bilkogretim\b/.test(nt)) return 'ortaokul';
  if (/\bilkokul\b/.test(nt)) return 'ilkokul';
  return null;
}

function detectDepartment(nt: string, eduLevel?: EducationLevel | null): string | null {
  for (const dep of UNDERGRAD_PLUS_DEPARTMENTS) {
    if (nt.includes(norm(dep))) return dep;
  }
  for (const dep of ASSOCIATE_DEPARTMENTS) {
    if (nt.includes(norm(dep))) return dep;
  }
  const m = nt.match(/([a-z0-9\s]{4,35}?(?:muhendisligi|ogretmenligi|programciligi|yonetimi|fakultesi|bolumu))/);
  if (m) {
    const rawMatch = m[1]
      .trim()
      .split(/\s+/)
      .slice(-3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const fromPool = resolveDepartmentFromPool(rawMatch, eduLevel);
    if (fromPool) return fromPool;
    if (eduLevel && (eduLevel === 'lisans' || eduLevel === 'yuksek_lisans' || eduLevel === 'doktora')) {
      return null;
    }
    return rawMatch;
  }
  return null;
}

function detectCity(raw: string, nt: string): string | null {
  for (const c of CITIES) {
    const nc = norm(c);
    if (new RegExp(`\\b${nc}\\b`).test(nt)) return c;
  }
  return null;
}

function detectFullName(raw: string): string | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const line of lines) {
    const cleaned = line.replace(/^(?:ad\s*soyad|adi\s*soyadi|isim)\s*[:\-]\s*/i, '').trim();
    const nl = norm(cleaned);
    if (/^(ozgecmis|cv|curriculum|iletisim|egitim|deneyim|kariyer|profil|hakkimda)\b/.test(nl)) continue;
    if (/@|\d{3,}|http/.test(cleaned)) continue;
    const words = cleaned.split(/\s+/).filter((w) => /^[A-Za-zÇĞİÖŞÜçğıöşü.'-]+$/.test(w));
    if (words.length >= 2 && words.length <= 4 && cleaned.length >= 5 && cleaned.length <= 42) {
      return words.join(' ');
    }
  }
  return null;
}

function detectKpss(nt: string): { score: number | null; type: string | null; mentioned: boolean } {
  const n = nt.replace(/\bkpssp(\d{1,3})\b/g, 'kpss p$1');
  if (!/\bkpss\b/.test(n)) return { score: null, type: null, mentioned: false };
  const tm = n.match(/\b(p\d{1,3})\b/);
  const kpssType = tm ? tm[1].toUpperCase() : null;
  let score: number | null = null;
  const sm =
    n.match(/\bkpss[^0-9\n]{0,30}?(\d{2,3}(?:[.,]\d{1,3})?)\b/) ||
    n.match(/\bp\d{1,3}\s*[:\-=]?\s*(\d{2,3}(?:[.,]\d{1,3})?)\b/);
  if (sm) {
    const val = Number(sm[1].replace(',', '.'));
    if (val >= 40 && val <= 100) score = Math.round(val * 10) / 10;
  }
  return { score, type: kpssType, mentioned: true };
}

function detectExperienceYears(nt: string): number | null {
  const ym = nt.match(/(\d{1,2})\s*(?:\+\s*)?yil\s*(?:deneyim|tecrube|calisma|is\s*deneyimi)/);
  if (ym) return Number(ym[1]);

  // Tarih aralıklarından (örn. 2021 - 2025, 2022 - Devam) yaklaşık süre çıkar
  const currentYear = new Date().getFullYear();
  let totalYears = 0;
  const rangeRe = /\b(20[0-2]\d)\s*[-–/]\s*(20[0-2]\d|devam|halen|gunumuz|aktif)\b/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(nt)) !== null) {
    const start = Number(m[1]);
    const end = /^(devam|halen|gunumuz|aktif)$/.test(m[2]) ? currentYear : Number(m[2]);
    if (end >= start && end - start <= 25) {
      totalYears += Math.max(0.5, end - start);
    }
  }
  if (totalYears > 0) return Math.min(30, Math.round(totalYears * 10) / 10);
  return null;
}

export function analyzeCv(rawInput: string, targetTrack: CvTrack = 'genel'): CvAnalysisResult {
  const raw = rawInput.replace(/\r\n/g, '\n').trim();
  const nt = norm(raw);
  const words = raw.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const catMap = new Map<string, CvCategoryScore>();
  const deductions: CvDeduction[] = [];
  const strengths: CvStrength[] = [];

  const recordCheck = (opts: {
    id: string;
    catKey: string;
    catLabel: string;
    title: string;
    earned: number;
    maxPoints: number;
    reasonIfLost: string;
    suggestionIfLost: string;
    strengthIfFull?: string;
  }) => {
    const earned = Math.max(0, Math.min(opts.maxPoints, Math.round(opts.earned)));
    const lost = opts.maxPoints - earned;
    const prev = catMap.get(opts.catKey) ?? {
      key: opts.catKey,
      label: opts.catLabel,
      earned: 0,
      maxPoints: 0,
      lost: 0,
    };
    prev.earned += earned;
    prev.maxPoints += opts.maxPoints;
    prev.lost += lost;
    catMap.set(opts.catKey, prev);

    if (lost > 0) {
      deductions.push({
        id: opts.id,
        category: opts.catLabel,
        title: opts.title,
        pointsLost: lost,
        reason: opts.reasonIfLost,
        suggestion: opts.suggestionIfLost,
      });
    } else if (opts.strengthIfFull) {
      strengths.push({
        category: opts.catLabel,
        title: opts.title,
        detail: opts.strengthIfFull,
      });
    }
  };

  // =========================================================================
  // 1) İLETİŞİM VE KİMLİK BİLGİLERİ (15 PUAN)
  // =========================================================================
  const CAT1_KEY = 'contact';
  const CAT1_LABEL = 'İletişim ve Kimlik Bilgileri';

  const fullName = detectFullName(raw);
  recordCheck({
    id: 'contact_name',
    catKey: CAT1_KEY,
    catLabel: CAT1_LABEL,
    title: 'Ad Soyad Başlığı',
    earned: fullName ? 3 : 0,
    maxPoints: 3,
    reasonIfLost: 'CV’nin üst kısmında net bir Ad Soyad satırı tespit edilemedi.',
    suggestionIfLost: 'CV’nin en üst satırına yalnızca adınızı ve soyadınızı açık biçimde yazın (örn. "Ahmet Yılmaz").',
    strengthIfFull: `Ad Soyad başlığı net biçimde yer alıyor (${fullName}).`,
  });

  const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const unprofessionalEmail = emailMatch
    ? /(?:kral|prens|prenses|crazy|cool|baba|reis|aslan|kartal|fanatik|gamer|sexy|666|007)/i.test(emailMatch[0])
    : false;
  recordCheck({
    id: 'contact_email',
    catKey: CAT1_KEY,
    catLabel: CAT1_LABEL,
    title: 'Kurumsal / Ciddi E-posta Adresi',
    earned: !emailMatch ? 0 : unprofessionalEmail ? 2 : 4,
    maxPoints: 4,
    reasonIfLost: !emailMatch
      ? 'CV metninde herhangi bir e-posta adresi bulunamadı; kurumlar mülakat ve evrak bildirimlerini e-posta ile gönderir.'
      : `E-posta adresiniz (${emailMatch[0]}) resmi başvurular için gayriresmi bir rumuz içeriyor.`,
    suggestionIfLost: 'Ad ve soyadınızdan oluşan sade bir e-posta adresi ekleyin (örn. ad.soyad@gmail.com).',
    strengthIfFull: 'Geçerli ve profesyonel formatta e-posta adresi mevcut.',
  });

  const phoneMatch = raw.match(/(?:\+?90\s*)?0?\s*5\d{2}[\s\-().]*\d{3}[\s\-().]*\d{2}[\s\-().]*\d{2}/);
  recordCheck({
    id: 'contact_phone',
    catKey: CAT1_KEY,
    catLabel: CAT1_LABEL,
    title: 'Telefon Numarası',
    earned: phoneMatch ? 4 : 0,
    maxPoints: 4,
    reasonIfLost: 'CV’de ulaşılabilir bir cep telefonu numarası (05XX XXX XX XX) yer almıyor.',
    suggestionIfLost: 'İletişim bölümüne güncel cep telefonu numaranızı "05XX XXX XX XX" biçiminde ekleyin.',
    strengthIfFull: 'Doğrudan ulaşılabilir cep telefonu numarası belirtilmiş.',
  });

  const city = detectCity(raw, nt);
  const hasExtraIdentity =
    /linkedin\.com|github\.com|\baskerlik\b|\bsurucu\s*belge|\behliyet\b|\bdogum\s*(?:tarihi|yili)\b/.test(nt);
  const locLinksEarned = (city ? 2 : 0) + (hasExtraIdentity ? 2 : 0);
  recordCheck({
    id: 'contact_location_links',
    catKey: CAT1_KEY,
    catLabel: CAT1_LABEL,
    title: 'İkamet Şehri ve Ek Kimlik / Profil Bilgileri',
    earned: locLinksEarned,
    maxPoints: 4,
    reasonIfLost:
      !city && !hasExtraIdentity
        ? 'Hem ikamet edilen il/ilçe hem de tamamlayıcı bilgiler (ehliyet, askerlik durumu veya LinkedIn profili) eksik.'
        : !city
          ? 'İkamet ettiğiniz şehir/ilçe belirtilmemiş (yerel/belediye ve taşra kadrolarında ikamet önemli bir kriterdir).'
          : 'İkamet ili yazılmış ancak ehliyet, askerlik durumu veya LinkedIn/portfolyo bağlantısı eklenmemiş.',
    suggestionIfLost: 'İletişim satırına yaşadığınız ili (örn. Ankara / Çankaya) ve varsa LinkedIn, sürücü belgesi veya askerlik bilgisini ekleyin.',
    strengthIfFull: 'İkamet ili ve tamamlayıcı kişisel/profil bilgileri eksiksiz.',
  });

  // =========================================================================
  // 2) ÖZET, YAPI VE YAZIM DÜZENİ (15 PUAN)
  // =========================================================================
  const CAT2_KEY = 'structure';
  const CAT2_LABEL = 'Özet, Yapı ve Yazım Düzeni';

  const hasSummaryHeading = /\b(ozet|kariyer\s*hedefi|hakkimda|profil|on\s*bilgi|profesyonel\s*ozet|amac)\b/.test(nt);
  const hasIntroSentence =
    /\b(mezunuyum|mezunu\s*olarak|calismaktayim|deneyime\s*sahibim|hedefliyorum|uzmanlas|gorev\s*almaktayim|adayiyim)\b/.test(
      nt,
    );
  const summaryEarned = hasSummaryHeading && wordCount >= 70 ? 6 : hasSummaryHeading || hasIntroSentence ? 3 : 0;
  recordCheck({
    id: 'summary_section',
    catKey: CAT2_KEY,
    catLabel: CAT2_LABEL,
    title: 'Profesyonel Özet / Kariyer Hedefi',
    earned: summaryEarned,
    maxPoints: 6,
    reasonIfLost:
      summaryEarned === 0
        ? 'CV’nin başında kendinizi, uzmanlık alanınızı ve hedeflediğiniz pozisyonu tanıtan bir "Özet / Kariyer Hedefi" bölümü yok.'
        : 'Kısa bir giriş ifadesi var ancak ayrı bir "Profesyonel Özet" başlığı altında 2-3 cümlelik güçlü bir tanıtım paragrafı yer almıyor.',
    suggestionIfLost:
      'İletişim bilgilerinden hemen sonra "Profesyonel Özet" başlığı açıp mezuniyetinizi, temel yetkinliklerinizi ve başvurduğunuz kadroda nasıl katkı sağlayacağınızı 2-3 cümleyle yazın.',
    strengthIfFull: 'CV başında net ve hedef odaklı bir özet/kariyer hedefi bölümü bulunuyor.',
  });

  const sectionPatterns = [
    /\b(egitim|ogrenim|mezuniyet)\b/,
    /\b(is\s*deneyim|deneyim|tecrube|calisma\s*gecmisi|staj)\b/,
    /\b(beceri|yetkinlik|teknik\s*bilgi|bilgisayar|yetenek)\b/,
    /\b(sertifika|belge|kurs|seminer|sinav)\b/,
    /\b(yabanci\s*dil|diller|referans|proje)\b/,
  ];
  const matchedSections = sectionPatterns.filter((re) => re.test(nt)).length;
  const structEarned = matchedSections >= 4 ? 5 : matchedSections >= 2 ? 3 : 0;
  recordCheck({
    id: 'section_structure',
    catKey: CAT2_KEY,
    catLabel: CAT2_LABEL,
    title: 'Bölüm Başlıkları ve Görsel Hiyerarşi',
    earned: structEarned,
    maxPoints: 5,
    reasonIfLost:
      structEarned === 0
        ? 'CV düz bir metin yığını şeklinde yazılmış; "Eğitim", "İş Deneyimi", "Sertifikalar", "Yetkinlikler" gibi standart bölüm başlıkları ayrılmamış.'
        : `Temel bölüm başlıklarından yalnızca ${matchedSections} tanesi kullanılmış; komisyonların hızlı taraması için bölümler daha net ayrılmalı.`,
    suggestionIfLost:
      'CV’nizi "Eğitim Bilgileri", "İş / Staj Deneyimi", "Sınav ve Sertifikalar", "Teknik Yetkinlikler" ve "Referanslar" alt başlıklarıyla yapılandırın.',
    strengthIfFull: 'Standart CV bölüm başlıkları düzenli ve kolay okunur biçimde ayrılmış.',
  });

  const letters = raw.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  const upperLetters = raw.replace(/[^A-ZÇĞİÖŞÜ]/g, '');
  const upperRatio = letters.length > 20 ? upperLetters.length / letters.length : 0;
  const isAllCaps = upperRatio > 0.65;
  let styleEarned = wordCount >= 130 ? 4 : wordCount >= 75 ? 2 : 0;
  if (isAllCaps && styleEarned >= 2) styleEarned -= 2;
  else if (isAllCaps) styleEarned = 0;

  recordCheck({
    id: 'length_and_style',
    catKey: CAT2_KEY,
    catLabel: CAT2_LABEL,
    title: 'İçerik Doygunluğu ve Yazım Biçimi',
    earned: styleEarned,
    maxPoints: 4,
    reasonIfLost: isAllCaps
      ? 'CV metninin büyük çoğunluğu BÜYÜK HARFLERLE yazılmış; bu durum okunabilirliği ciddi biçimde düşürür.'
      : wordCount < 75
        ? `CV metni çok kısa (${wordCount} kelime); görev tanımları, eğitim ve yetkinlik detayları yetersiz kalmış.`
        : `CV kelime hacmi (${wordCount} kelime) sınırda; deneyim ve yetkinlik maddeleri biraz daha detaylandırılmalı.`,
    suggestionIfLost: isAllCaps
      ? 'Yalnızca ana başlıkları büyük harfle bırakıp tüm açıklamaları standart tümce düzeninde (ilk harf büyük, diğerleri küçük) yazın.'
      : 'Deneyim, staj, ders projeleri ve kullandığınız araçları maddeler halinde açarak CV’nizi en az 150-300 kelime aralığına taşıyın.',
    strengthIfFull: `Metin uzunluğu (${wordCount} kelime) ve büyük/küçük harf yazım düzeni dengeli.`,
  });

  // =========================================================================
  // 3) EĞİTİM BİLGİLERİ (20 PUAN)
  // =========================================================================
  const CAT3_KEY = 'education';
  const CAT3_LABEL = 'Eğitim Bilgileri';

  const eduLevel = detectEducation(nt);
  const hasSchoolName = /\b(universite\w*|fakulte\w*|yuksekokul\w*|enstitu\w*|lisesi|koleji|okulu)\b/.test(nt);
  const eduSchoolEarned = eduLevel && hasSchoolName ? 8 : eduLevel || hasSchoolName ? 4 : 0;
  recordCheck({
    id: 'edu_level_school',
    catKey: CAT3_KEY,
    catLabel: CAT3_LABEL,
    title: 'Mezuniyet Derecesi ve Okul / Üniversite Adı',
    earned: eduSchoolEarned,
    maxPoints: 8,
    reasonIfLost:
      eduSchoolEarned === 0
        ? 'Mezun olduğunuz eğitim kademesi (Lise / Ön Lisans / Lisans vb.) ve okul/üniversite adı CV’de belirtilmemiş.'
        : !hasSchoolName
          ? 'Mezuniyet derecesinden bahsedilmiş ancak mezun olunan okul veya üniversitenin tam adı yazılmamış.'
          : 'Okul adı geçiyor ancak mezuniyet derecesi (Ön Lisans / Lisans / Yüksek Lisans vb.) net değil.',
    suggestionIfLost:
      'Eğitim bölümüne okulunuzun tam adını ve derecesini açıkça yazın (örn. "Ankara Üniversitesi – İktisadi ve İdari Bilimler Fakültesi (Lisans)").',
    strengthIfFull: `Mezuniyet derecesi (${eduLevel ? EDUCATION_LABELS[eduLevel] : ''}) ve kurum adı açıkça belirtilmiş.`,
  });

  const department = detectDepartment(nt, eduLevel);
  const noDeptNeeded =
    targetTrack === 'isci' || eduLevel === 'ilkokul' || eduLevel === 'ortaokul' || (eduLevel === 'lise' && /\b(alan|bolum|meslek|anadolu|imam\s*hatip|duz\s*lise)\b/.test(nt));
  const deptEarned = department || noDeptNeeded ? 7 : 0;
  recordCheck({
    id: 'edu_department',
    catKey: CAT3_KEY,
    catLabel: CAT3_LABEL,
    title: 'Bölüm / Mezuniyet Alanı',
    earned: deptEarned,
    maxPoints: 7,
    reasonIfLost:
      'Mezun olduğunuz bölüm veya program adı tespit edilemedi; kamu ilanlarında nitelik kodları doğrudan bölüm adına göre eşleştirilir.',
    suggestionIfLost:
      'Üniversite veya meslek lisesi bölümünüzün resmi diplomanızdaki tam adını yazın (örn. "Bilgisayar Mühendisliği", "Büro Yönetimi ve Yönetici Asistanlığı").',
    strengthIfFull: department
      ? `Mezuniyet bölümü (${department}) net olarak tespit edildi.`
      : 'Hedef kadro/eğitim düzeyine uygun okul alanı belirtilmiş.',
  });

  const hasEduYear = /\b(199\d|20[0-2]\d)\b/.test(nt);
  const hasGpa = /\b(gano|gpa|not\s*ortalamasi|diploma\s*notu|ort\s*[:.]|[23][.,]\d{2}\s*\/\s*4|(?:[6-9]\d|100)\s*\/\s*100|onur\s*ogrencisi|yuksek\s*onur)\b/.test(
    nt,
  );
  const eduExtraEarned = (hasEduYear ? 3 : 0) + (hasGpa ? 2 : 0);
  recordCheck({
    id: 'edu_dates_gpa',
    catKey: CAT3_KEY,
    catLabel: CAT3_LABEL,
    title: 'Mezuniyet Tarihi ve Diploma Notu (GANO)',
    earned: eduExtraEarned,
    maxPoints: 5,
    reasonIfLost:
      !hasEduYear && !hasGpa
        ? 'Eğitim bölümünde ne mezuniyet yılı ne de diploma notu / GANO bilgisi yer alıyor.'
        : !hasEduYear
          ? 'Mezuniyet yılı / eğitim tarih aralığı yazılmamış.'
          : 'Mezuniyet yılı mevcut ancak diploma notu (GANO / 4’lük veya 100’lük ortalama) belirtilmemiş.',
    suggestionIfLost:
      'Eğitim satırına başlangıç-mezuniyet yıllarını ve ortalamanızı ekleyin (örn. "2019 – 2023 | GANO: 3.18 / 4.00").',
    strengthIfFull: 'Mezuniyet yılı ve akademik ortalama (GANO) eksiksiz paylaşılmış.',
  });

  // =========================================================================
  // 4) DENEYİM VE SOMUT BAŞARILAR (20 PUAN)
  // =========================================================================
  const CAT4_KEY = 'experience';
  const CAT4_LABEL = 'İş / Staj Deneyimi ve Başarılar';

  const hasExpKeywords =
    /\b(is\s*deneyim\w*|deneyim\w*|tecrube\w*|staj\w*|calisti\w*|gorev\s*yapti\w*|uzman\s*yardimcisi|muhendis|memur|tekniker|teknisyen|personel|asistan|sorumlu\w*|operator|usta|sofor)\b/.test(
      nt,
    );
  const hasOrgInExp = /\b(bakanlig\w*|mudurlug\w*|belediye\w*|universite\w*|hastane\w*|kurumu|vakfi|a\s*s|ltd|sti|holding|banka\w*|ajans\w*|sirket\w*|firma\w*)\b/.test(
    nt,
  );
  const expEarned = hasExpKeywords && hasOrgInExp ? 8 : hasExpKeywords ? 4 : 0;
  recordCheck({
    id: 'exp_presence',
    catKey: CAT4_KEY,
    catLabel: CAT4_LABEL,
    title: 'İş, Staj veya Uygulama Deneyimi',
    earned: expEarned,
    maxPoints: 8,
    reasonIfLost:
      expEarned === 0
        ? 'CV’de herhangi bir iş, staj, yarı zamanlı çalışma veya saha/uygulama deneyimi yer almıyor.'
        : 'Deneyimden kısaca söz edilmiş ancak çalışılan kurum/işyeri adı ve üstlenilen pozisyon net olarak yazılmamış.',
    suggestionIfLost:
      'Yeni mezun olsanız bile zorunlu/gönüllü stajlarınızı, bitirme projenizi veya yarı zamanlı görevlerinizi "Kurum Adı – Pozisyon" başlığıyla ekleyin.',
    strengthIfFull: 'Kurum ve pozisyon bilgisi içeren iş/staj deneyimi mevcut.',
  });

  const expYears = detectExperienceYears(nt);
  const hasDateRange = /\b(20[0-2]\d)\s*[-–/]\s*(20[0-2]\d|devam|halen|gunumuz|aktif)\b/.test(nt) || /\b\d+\s*(?:yil|ay)\b/.test(nt);
  recordCheck({
    id: 'exp_dates',
    catKey: CAT4_KEY,
    catLabel: CAT4_LABEL,
    title: 'Çalışma Tarih Aralıkları ve Süre',
    earned: hasDateRange ? 4 : 0,
    maxPoints: 4,
    reasonIfLost:
      'Deneyim maddelerinde hangi tarihler arasında ve kaç ay/yıl çalışıldığı (örn. "06.2023 – 09.2025") belirtilmemiş; deneyim şartı olan ilanlarda süre hesabı yapılamaz.',
    suggestionIfLost:
      'Her iş ve staj deneyiminin yanına başlangıç-bitiş ay ve yılını yazın (örn. "Mart 2023 – Halen" veya "Temmuz 2022 – Eylül 2022 (Staj)").',
    strengthIfFull: 'Deneyim süreleri ve çalışma tarih aralıkları net biçimde gösterilmiş.',
  });

  const actionVerbs = [
    'yonet', 'gelistir', 'hazirla', 'koordine', 'denetle', 'analiz', 'tasarla', 'uygula',
    'gerceklestir', 'optimize', 'kurulum', 'bakim', 'raporla', 'takip', 'cozumle', 'planla',
    'egit', 'sunum', 'kontrol', 'arsivle', 'destek', 'yurut',
  ];
  const matchedVerbs = actionVerbs.filter((v) => nt.includes(v)).length;
  const verbsEarned = matchedVerbs >= 3 ? 4 : matchedVerbs >= 1 ? 2 : 0;
  recordCheck({
    id: 'exp_action_verbs',
    catKey: CAT4_KEY,
    catLabel: CAT4_LABEL,
    title: 'Görev Sorumlulukları ve Eylem İfadeleri',
    earned: verbsEarned,
    maxPoints: 4,
    reasonIfLost:
      verbsEarned === 0
        ? 'Deneyim bölümünde ne iş yaptığınızı anlatan aksiyon ifadeleri (hazırladım, yürüttüm, geliştirdim, takip ettim vb.) bulunmuyor.'
        : 'Görev açıklamaları çok kısa bırakılmış; üstlendiğiniz sorumluluklar somut eylem fiilleriyle yeterince açılmamış.',
    suggestionIfLost:
      'Her pozisyonun altına 2-3 madde açarak "Resmi yazışmaları EBYS üzerinden yürüttüm", "Bakım ve arıza süreçlerini takip ettim" gibi net görev cümleleri ekleyin.',
    strengthIfFull: 'Sorumluluklar güçlü eylem fiilleriyle açıklanmış.',
  });

  // Ölçülebilir başarı (yüzde, adet, kişi, bütçe, süre kazanımı — telefon/tarih/KPSS puanından bağımsız)
  const hasQuantified =
    /%\s*\d+|\d+\s*%|\b\d+\+?\s*(?:kisi\w*|personel\w*|musteri\w*|vatandas\w*|ogrenci\w*|proje\w*|dosya\w*|evrak\w*|rapor\w*|basvuru\w*|kullanici\w*|ekip\w*|adet|kurum|sube|arac|cihaz)\b/.test(
      nt,
    );
  recordCheck({
    id: 'exp_quantified',
    catKey: CAT4_KEY,
    catLabel: CAT4_LABEL,
    title: 'Ölçülebilir / Sayısal Başarı Verisi',
    earned: hasQuantified ? 4 : 0,
    maxPoints: 4,
    reasonIfLost:
      'Deneyim ve projelerde somut sayısal veriler (kaç kişilik ekip, kaç proje/dosya, % kaç iyileştirme vb.) paylaşılmamış; bu eksiklik CV’nin ikna gücünü düşürüyor.',
    suggestionIfLost:
      'Görev maddelerinize en az 1-2 sayısal ölçek ekleyin (örn. "Aylık 250+ resmi evrak sürecini hatasız tamamladım" veya "5 kişilik saha ekibini koordine ettim").',
    strengthIfFull: 'Deneyimler somut sayısal çıktılar ve ölçeklerle desteklenmiş.',
  });

  // =========================================================================
  // 5) SINAV, YABANCI DİL VE MESLEKİ BELGELER (15 PUAN)
  // =========================================================================
  const CAT5_KEY = 'credentials';
  const CAT5_LABEL = 'Sınav, Dil ve Mesleki Belgeler';

  const kpss = detectKpss(nt);
  const certs = extractCertificates('', raw).certificates;
  const hasAles = /\bales\b[^0-9\n]{0,20}(\d{2,3})?/.test(nt);
  const hasLangExam = /\b(yds|yokdil|toefl|ielts)\b/.test(nt);
  const hasLangMention = hasLangExam || /\b(ingilizce|almanca|fransizca|arapca|rusca)\b/.test(nt);
  const hasLangLevel = /\b(a1|a2|b1|b2|c1|c2|iyi\s*seviye|ileri\s*seviye|orta\s*seviye|upper|intermediate|advanced)\b/.test(
    nt,
  ) || /\b(?:yds|yokdil)\s*[:\-]?\s*\d{2,3}\b/.test(nt);

  if (targetTrack === 'isci') {
    const hasWorkerCert =
      certs.length > 0 ||
      /\b(ehliyet|surucu\s*belge|src\s*[1-5]?|psikoteknik|myk|mesleki\s*yeterlilik|ustalik|kalfalik|ozel\s*guvenlik|hijyen|ilk\s*yardim|is\s*guvenligi|forklift|operatorluk)\b/.test(
        nt,
      );
    recordCheck({
      id: 'exam_or_vocational',
      catKey: CAT5_KEY,
      catLabel: CAT5_LABEL,
      title: 'İşçi Kadroları Mesleki Yeterlilik / Ehliyet Belgeleri',
      earned: hasWorkerCert ? 8 : 0,
      maxPoints: 8,
      reasonIfLost:
        'Kamu işçisi (İŞKUR / Belediye) başvurularında belirleyici olan ehliyet sınıfı, MYK Mesleki Yeterlilik, Ustalık/Kalfalık, Özel Güvenlik veya Hijyen belgelerinden hiçbiri belirtilmemiş.',
      suggestionIfLost:
        'Sahip olduğunuz sürücü belgesi sınıfını (örn. B / E Sınıfı, SRC-2/4), MEB/MYK ustalık veya sertifika belgelerinizi açık adlarıyla ekleyin.',
      strengthIfFull: 'Kamu işçisi alımlarında aranan uygulama/yeterlilik belgeleri belirtilmiş.',
    });
  } else if (targetTrack === 'akademik') {
    const acadExamEarned = (hasAles ? 4 : 0) + (hasLangExam ? 4 : 0);
    recordCheck({
      id: 'exam_or_vocational',
      catKey: CAT5_KEY,
      catLabel: CAT5_LABEL,
      title: 'ALES ve YDS / YÖKDİL Akademik Sınav Puanları',
      earned: acadExamEarned,
      maxPoints: 8,
      reasonIfLost:
        !hasAles && !hasLangExam
          ? 'Akademik kadro başvurularında zorunlu olan ALES ve YDS/YÖKDİL yabancı dil puanları CV’de yer almıyor.'
          : !hasAles
            ? 'Yabancı dil sınav bilgisi var ancak ALES puanı ve puan türü (SAY/EA/SÖZ) yazılmamış.'
            : 'ALES bilgisi var ancak YDS / YÖKDİL veya eşdeğer yabancı dil sınav puanı belirtilmemiş.',
      suggestionIfLost:
        'Sınav Bilgileri başlığı altına ALES puanınızı (türü ve yılıyla) ve YDS/YÖKDİL yabancı dil puanınızı ekleyin.',
      strengthIfFull: 'Akademik başvurular için ALES ve yabancı dil sınav bilgileri eksiksiz.',
    });
  } else if (targetTrack === 'bilisim') {
    const hasTechStack = /\b(java|c#|python|javascript|typescript|react|angular|node|sql|postgresql|oracle|docker|kubernetes|linux|aws|ag\s*yonetimi|siber\s*guvenlik)\b/.test(
      nt,
    );
    const bilisimExamEarned = (kpss.score || hasLangExam ? 4 : kpss.mentioned || hasLangMention ? 2 : 0) + (hasTechStack ? 4 : 0);
    recordCheck({
      id: 'exam_or_vocational',
      catKey: CAT5_KEY,
      catLabel: CAT5_LABEL,
      title: 'KPSS P3 / YDS Puanı ve Bilişim Teknoloji Yığını',
      earned: bilisimExamEarned,
      maxPoints: 8,
      reasonIfLost:
        'Sözleşmeli Bilişim Personeli ilanlarında puan sıralamasını belirleyen KPSS P3 (%70) + YDS (%30) puanları veya güncel programlama/sistem teknolojileri eksik bırakılmış.',
      suggestionIfLost:
        'Varsa KPSS P3 ve YDS puanınızı (yoksa KPSS şartsız 70 baz puan kuralına başvurduğunuzu) ve bildiğiniz programlama dillerini/veritabanlarını net olarak yazın.',
      strengthIfFull: 'Bilişim kadroları için sınav/dil ve teknoloji yığını bilgileri güçlü.',
    });
  } else {
    const kpssEarned = kpss.score && kpss.type ? 8 : kpss.score || kpss.mentioned ? 5 : 0;
    recordCheck({
      id: 'exam_or_vocational',
      catKey: CAT5_KEY,
      catLabel: CAT5_LABEL,
      title: 'KPSS Puanı ve Puan Türü',
      earned: kpssEarned,
      maxPoints: 8,
      reasonIfLost:
        kpssEarned === 0
          ? 'Kamu personeli / memur / 4-B sözleşmeli değerlendirmesinde kritik olan KPSS puanı ve puan türü (P3 / P93 / P94) CV’de hiç belirtilmemiş.'
          : 'KPSS’den bahsedilmiş ancak net puanınız veya puan türünüz (örn. "2024 KPSS P3: 81,4") eksik bırakılmış.',
      suggestionIfLost:
        'Sınav Bilgileri satırına sınav yılını, puan türünü ve net puanınızı yazın (örn. "2024 KPSS Lisans P3: 79,65"). KPSS şartsız işçi kadrolarına başvuruyorsanız yukarıdan "Kamu İşçisi" hedefini seçebilirsiniz.',
      strengthIfFull: `KPSS puanı (${kpss.type} – ${kpss.score}) net biçimde belirtilmiş.`,
    });
  }

  const hasAnyCert =
    certs.length > 0 || /\b(sertifika\w*|belge\w*|meb\s*onayli|katilim\s*belgesi|kurs\w*|egitim\s*programi|btk\s*akademi)\b/.test(nt);
  const certLangEarned = (hasAnyCert ? 4 : 0) + (hasLangMention && hasLangLevel ? 3 : hasLangMention ? 1 : 0);
  recordCheck({
    id: 'certs_and_language',
    catKey: CAT5_KEY,
    catLabel: CAT5_LABEL,
    title: 'Mesleki Sertifikalar ve Yabancı Dil Seviyesi',
    earned: certLangEarned,
    maxPoints: 7,
    reasonIfLost:
      !hasAnyCert && !hasLangMention
        ? 'Ne mesleki sertifika/kurs belgesi ne de yabancı dil bilgisi eklenmiş.'
        : !hasAnyCert
          ? 'Yabancı dil bilgisi var ancak hiçbir mesleki sertifika veya kurs belgesi (örn. Bilgisayar İşletmenliği, İSG, İlk Yardım, BTK Akademi) yazılmamış.'
          : 'Sertifikalar mevcut ancak yabancı dil adı ve seviyesi (örn. İngilizce – B2 / Orta-İleri) net belirtilmemiş.',
    suggestionIfLost:
      'Aldığınız MEB/e-Devlet sorgulanabilir sertifikaları (Bilgisayar İşletmenliği, İSG vb.) ve yabancı dil seviyenizi (A2/B1/B2 veya YDS puanı) ekleyin.',
    strengthIfFull: 'Hem mesleki sertifikalar hem de yabancı dil seviyesi açıkça belirtilmiş.',
  });

  // =========================================================================
  // 6) YETKİNLİKLER, TEKNİK ARAÇLAR VE REFERANS (15 PUAN)
  // =========================================================================
  const CAT6_KEY = 'skills';
  const CAT6_LABEL = 'Yetkinlikler, Araçlar ve Referans';

  const hardSkillList = [
    'office', 'excel', 'word', 'powerpoint', 'ebys', 'dys', 'uyap', 'sbs', 'ekap', 'kbs',
    'muhasebe', 'sap', 'logo', 'autocad', 'solidworks', 'netcad', 'arcgis', 'photoshop',
    'python', 'java', 'javascript', 'typescript', 'sql', 'react', 'csharp', 'linux', 'git',
    'veri analizi', 'raporlama', 'on muhasebe', 'elektronik imza', 'kalite yonetim', 'cnc', 'kaynak',
  ];
  const matchedHard = hardSkillList.filter((k) => nt.includes(k)).length;
  const hardEarned = matchedHard >= 3 ? 8 : matchedHard >= 1 ? 4 : 0;
  recordCheck({
    id: 'hard_skills',
    catKey: CAT6_KEY,
    catLabel: CAT6_LABEL,
    title: 'Teknik Araç, Yazılım ve Mesleki Donanım Becerileri',
    earned: hardEarned,
    maxPoints: 8,
    reasonIfLost:
      hardEarned === 0
        ? 'Bildiğiniz bilgisayar programları, kurumsal sistemler (MS Office, Excel, EBYS, UYAP vb.) veya mesleki ekipmanlar hiç listelenmemiş.'
        : `Yalnızca ${matchedHard} teknik araç/program tespit edildi; yetkinlik listesi çok dar bırakılmış.`,
    suggestionIfLost:
      '"Teknik Yetkinlikler" başlığı açarak hakim olduğunuz en az 3-5 yazılım veya mesleki aracı seviyeleriyle birlikte sıralayın (örn. "MS Excel (İleri), Word, EBYS, Raporlama").',
    strengthIfFull: 'Teknik yazılım ve mesleki araç yetkinlikleri zengin biçimde listelenmiş.',
  });

  const softSkillList = [
    'iletisim', 'takim calismasi', 'ekip calismasi', 'problem cozme', 'analitik', 'zaman yonetimi',
    'sorumluluk', 'uyum', 'kriz yonetimi', 'planlama', 'titiz', 'cozum odakli', 'organizasyon',
  ];
  const hasSoftSkills = softSkillList.some((k) => nt.includes(k));
  recordCheck({
    id: 'soft_skills',
    catKey: CAT6_KEY,
    catLabel: CAT6_LABEL,
    title: 'İletişim ve Kişisel Yetkinlikler',
    earned: hasSoftSkills ? 3 : 0,
    maxPoints: 3,
    reasonIfLost:
      'Ekip çalışması, problem çözme, zaman yönetimi veya etkili iletişim gibi kurumsal/sosyal yetkinliklere değinilmemiş.',
    suggestionIfLost:
      'Yetkinlikler bölümüne çalışma disiplininizi yansıtan 3-4 anahtar yetkinlik ekleyin (örn. "Ekip Çalışması, Analitik Düşünme, Zaman Yönetimi").',
    strengthIfFull: 'Sosyal ve kurumsal çalışma yetkinlikleri belirtilmiş.',
  });

  const hasDetailedRefOrProj =
    /\b(proje\w*|yayin\w*|makale\w*|bildiri\w*|gonullu\w*|topluluk|odul\w*|basari\s*belgesi)\b/.test(nt) ||
    (/\breferans\w*\b/.test(nt) && /\b(prof|doc|dr|mudur|sef|uzman|muhendis|yonetici|05\d{2}|@)\b/.test(nt));
  const hasGenericRef = /\breferans\w*\b/.test(nt);
  const refEarned = hasDetailedRefOrProj ? 4 : hasGenericRef ? 2 : 0;
  recordCheck({
    id: 'references_or_projects',
    catKey: CAT6_KEY,
    catLabel: CAT6_LABEL,
    title: 'Projeler, Yayınlar veya Referans Bilgileri',
    earned: refEarned,
    maxPoints: 4,
    reasonIfLost:
      refEarned === 0
        ? 'CV sonunda ne yürütülen bir proje/çalışma ne de referans bilgisi yer alıyor.'
        : 'Referans başlığı açılmış ancak yalnızca "İstendiğinde paylaşılacaktır" ifadesi kullanılmış; somut proje veya referans kişisi/unvanı yok.',
    suggestionIfLost:
      'Yaptığınız bir bitirme/iş projesini 1-2 cümleyle ekleyin veya izin aldığınız en az 1 referans kişisinin Ad-Soyad, Unvan, Kurum ve iletişim bilgisini yazın.',
    strengthIfFull: 'Proje, yayın veya açık referans bilgileriyle CV desteklenmiş.',
  });

  // Toplam puan ve sıralamalar
  const categories = [...catMap.values()];
  const score = categories.reduce((sum, c) => sum + c.earned, 0);
  const totalDeducted = 100 - score;
  deductions.sort((a, b) => b.pointsLost - a.pointsLost);

  let level: CvAnalysisResult['level'];
  let levelLabel: string;
  if (score >= 85) {
    level = 'excellent';
    levelLabel = 'Çok Güçlü · Başvuruya Hazır';
  } else if (score >= 70) {
    level = 'good';
    levelLabel = 'İyi Seviye · Küçük Eksikler Var';
  } else if (score >= 50) {
    level = 'fair';
    levelLabel = 'Orta Seviye · Geliştirilmeli';
  } else {
    level = 'weak';
    levelLabel = 'Zayıf Taslak · Kritik Bilgiler Eksik';
  }

  const topReasons = deductions
    .slice(0, 3)
    .map((d) => `${d.title} (-${d.pointsLost}p)`)
    .join(', ');
  const bestCats = [...categories]
    .filter((c) => c.earned / c.maxPoints >= 0.75)
    .map((c) => c.label);

  let overallComment = `"${CV_TRACK_LABELS[targetTrack]}" kriterlerine göre incelenen ${wordCount} kelimelik CV’niz 100 üzerinden ${score} puan aldı (toplam ${totalDeducted} puan kesinti). `;
  if (bestCats.length > 0) {
    overallComment += `${bestCats.join(' ve ')} alanlarında güçlü bir temeliniz var. `;
  }
  if (deductions.length > 0) {
    overallComment += `Puanınızın düşmesine yol açan en önemli eksikler: ${topReasons}. Aşağıdaki kesinti maddelerini tamamladığınızda CV puanınız doğrudan yükselecektir.`;
  } else {
    overallComment += 'Tüm bölümler eksiksiz, ölçülebilir ve hedef kadroya tam uyumlu hazırlanmış!';
  }

  return {
    score,
    maxScore: 100,
    totalDeducted,
    level,
    levelLabel,
    targetTrack,
    targetTrackLabel: CV_TRACK_LABELS[targetTrack],
    wordCount,
    overallComment,
    categories,
    deductions,
    strengths,
    extractedProfile: {
      fullName,
      educationLevel: eduLevel,
      educationLabel: eduLevel ? EDUCATION_LABELS[eduLevel] : null,
      department,
      kpssScore: kpss.score,
      kpssType: kpss.type,
      experienceYears: expYears,
      city,
      certificates: certs,
    },
  };
}
