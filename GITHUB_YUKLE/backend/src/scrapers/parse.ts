import { CITIES } from '../constants/cities';
import { extractCertificates } from '../constants/certificates';
import { EDUCATION_LEVELS, EducationLevel, JobType } from '../types';
import { norm } from '../utils/text';
import { normalizeTurkishTitle } from './format';

export interface ParsedRequirements {
  kpssRequired: boolean | null;
  minKpssScore: number | null;
  kpssType: string | null;
  minEducation: EducationLevel | null;
  requiredCertificates: string[];
  certificateMode: 'all' | 'any';
  minExperienceYears: number | null;
  maxAge: number | null;
  positions: number | null;
  deadline: string | null;
  city: string | null;
  jobType: JobType;
}

const MONTHS = [
  'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
  'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
];

const toNum = (s: string) => Number(s.replace(',', '.'));

function parseKpss(titleNorm: string, fullNorm: string, rawText: string, jobType: JobType) {
  // "KPSSP3" gibi bitişik yazımları ayır
  const n = fullNorm.replace(/\bkpssp(\d{1,3})\b/g, 'kpss p$1');

  // 1) Açıkça KPSS aranmadığını belirten ifadeler (yalnızca KPSS şartının kendisi aranmıyorsa;
  // "KPSS P3 70 puan, deneyim şartı aranmaz" gibi cümlelerle karışmaması için araya başka şart giremez)
  if (
    /\bkpss(?:'?ye)?\s*(?:girme\s*)?(?:puan\w*\s*)?(?:sarti\s*|belgesi\s*)?(?:aranmamakta|aranmaz|aranmayacak|aranmaksizin|sartsiz|sarti\s*yok|yoktur|gerekmemekte|gerekmeyecek|gerekmez|istenmemekte|istenmeyecek|istenmez|olmaksizin)/.test(
      n,
    ) ||
    /\bkpss'?siz\b|\bkpss\s+olmadan\b/.test(n)
  ) {
    // İstisna: Kalkınma Ajansı gibi hem KPSS'li hem 5 yıl tecrübeli (KPSS'siz) ikili başvuru kabul eden tam metinlerde
    // KPSS taban puanı da aynı metinde açıkça yer alıyorsa ve "KPSS puanı olmayan ... 70 kabul edilir" (Bilişim) değilse:
    const hasExplicitNoKpssForAll =
      !/kalkinma\s+ajansi/.test(n) || !/\bkpss[^.]{0,80}\b(?:70|75|80|85)\s*puan/.test(n);
    if (hasExplicitNoKpssForAll) {
      return { required: false, score: null, type: null };
    }
  }

  // 2) Sözleşmeli Bilişim Personeli istisnası: "KPSS puanı olmayan da başvurabilir / puanı 70 kabul edilir"
  if (
    /kpss\s+puani\s+olmayan(?:lar)?\s+(?:da\s+)?basvurabil/.test(n) ||
    /kpss\s+puani\s+olmayan\s+(?:ya\s+da|veya)\s+belge\s+ibraz\s+etmeyen/.test(n) ||
    /belge\s+ibraz\s+etmeyen\w*\s+kpss\s+puani\s+70/.test(n)
  ) {
    return { required: false, score: null, type: null };
  }

  // 3) Metinde KPSS açıkça geçiyorsa (ve yalnızca YDS/ALES değilse)
  if (/\bkpss\b/.test(n)) {
    const required = true;

    // Puan türlerini topla (tek bir ana tür varsa onu ata, çoklu eğitim kademesi varsa null bırak)
    const mainTypes = new Set<string>();
    for (const m of n.matchAll(/\bkpss\s*\(?\s*(p\s?\d{1,3})\b|\b(p(?:1|2|3|93|94|121|123))\b/g)) {
      const rawT = (m[1] ?? m[2] ?? '').replace(/\s+/g, '').toUpperCase();
      if (['P1', 'P2', 'P3', 'P93', 'P94', 'P121', 'P123'].includes(rawT)) {
        mainTypes.add(rawT);
      }
    }
    const type = mainTypes.size === 1 ? [...mainTypes][0] : null;

    // Taban puanları hem düz metinden hem de tablo satırlarından çıkar
    const candidates: number[] = [];
    const stripped = n
      .replace(/kpss\s*\(?\s*p\s?\d{1,3}\)?/g, 'kpss')
      .replace(/\bp\s?\d{1,3}\b/g, ' ')
      // YDS / YÖKDİL / ALES puanlarını KPSS puanıyla karıştırma
      .replace(/\b(?:yds|yokdil|ales)[^.]{0,35}?\b\d{2,3}\b/g, ' ');

    const prosePatterns = [
      /kpss[^.]{0,150}?(\d{2,3}(?:[.,]\d+)?)\s*(?:\([a-z\s]+\)\s*)?(?:ve uzeri|puan)/g,
      /kpss[^.]{0,90}?puan\w*\s*(?:turu\w*\s*)?(?:en az\s*|asgari\s*)?(\d{2,3}(?:[.,]\d+)?)/g,
      /(?:en az|asgari)\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:\([a-z\s]+\)\s*)?puan[^.]{0,90}kpss/g,
      /taban\s*puan\w*[^0-9]{0,30}(\d{2,3}(?:[.,]\d+)?)/g,
    ];
    for (const re of prosePatterns) {
      for (const m of stripped.matchAll(re)) {
        const v = toNum(m[1]);
        if (v >= 50 && v <= 95) candidates.push(v);
      }
    }

    // Tablo satırı deseni: "P3 • 70", "P93 • En Az 65", "KPSS P94 60"
    const rawLower = rawText.toLocaleLowerCase('tr').replace(/\bkpssp(\d{1,3})\b/g, 'kpss p$1');
    for (const m of rawLower.matchAll(
      /\bp(?:1|2|3|4|17|18|22|23|24|25|26|27|28|44|45|46|47|48|93|94|121|123)\b(?:\s*[•|\-,/:]\s*|\s+)(?:en\s*az\s*)?(50|55|60|65|70|75|80|85|90)(?![0-9])/g,
    )) {
      const v = Number(m[1]);
      if (v >= 50 && v <= 95) candidates.push(v);
    }

    const score = candidates.length > 0 ? Math.min(...candidates) : null;
    return { required, score, type };
  }

  // 4) Metinde "KPSS" kelimesi geçmiyorsa mevzuata dayalı kesin kadro kuralları
  if (jobType === 'akademik') {
    // 2547 sayılı Kanun: Öğretim üyesi / öğretim elemanı / araştırma görevlisi alımlarında KPSS aranmaz (ALES/YDS)
    return { required: false, score: null, type: null };
  }
  if (jobType === 'isci') {
    // Kamu işçi alımlarında (metinde açıkça KPSS belirtilmemişse) noter kurası / İŞKUR uygulanır, KPSS aranmaz
    return { required: false, score: null, type: null };
  }
  if (/muvazzaf\s+(?:subay|astsubay)|sozlesmeli\s+er\b|uzman\s+erbas|askeri\s+ogrenci/.test(n)) {
    return { required: false, score: null, type: null };
  }
  if (/sozlesmeli\s+bilisim\s+personeli|bilisim\s+personeli/.test(titleNorm)) {
    // 375 sayılı KHK Ek 6: KPSS P3 puanı olmayan adaylar da başvurabilir (puanı 70 sayılır)
    return { required: false, score: null, type: null };
  }
  if (/\bic\s+denetci\b/.test(titleNorm)) {
    // Kamu İç Denetçi Sertifikası ile atama
    return { required: false, score: null, type: null };
  }
  if (jobType === 'memur' || jobType === 'sozlesmeli') {
    // 657 DMK memur, zabıta, uzman/müfettiş yardımcılığı ve 4/B sözleşmeli personel alımlarında KPSS zorunludur
    return { required: true, score: null, type: null };
  }
  // Kamu kurumlarının genel "Personel Alacak / Uzman Alacak" özet ilanlarında (işçi/akademik/bilişim değilse)
  // Kamu Görevlerine İlk Defa Atanacaklar Hakkında Genel Yönetmelik gereği KPSS esastır
  if (/\b(?:personel|uzman|destek\s+personeli|koruma\s+ve\s+guvenlik|avukat|buro\s+personeli)\s+al(?:acak|im)/.test(titleNorm)) {
    return { required: true, score: null, type: null };
  }

  return { required: null, score: null, type: null };
}

function parseEducation(n: string, jobType: JobType): EducationLevel | null {
  const t = n
    .replace(/on\s?lisans/g, 'onlisans')
    .replace(/yuksek\s?lisans/g, 'yukseklisans')
    .replace(/ortaogretim/g, 'lise')
    .replace(/ilkogretim/g, 'ortaokul');
  const found: EducationLevel[] = [];
  if (/\bdoktora\b/.test(t) && !/doktora\s*,?\s*yuksek\s*lisans.*erteleme/.test(n)) found.push('doktora');
  if (/\byukseklisans\b/.test(t) && !/doktora\s*,?\s*yuksek\s*lisans.*erteleme/.test(n)) found.push('yuksek_lisans');
  if (/\blisans\b|\bfakulte\w*\s+mezun/.test(t)) found.push('lisans');
  if (/\bonlisans\b|\bmeslek\s+yuksekokul/.test(t)) found.push('onlisans');
  if (/\blise\b/.test(t)) found.push('lise');
  if (/\bortaokul\b/.test(t)) found.push('ortaokul');
  if (/\bilkokul\b/.test(t)) found.push('ilkokul');
  if (!found.length) {
    if (jobType === 'akademik') return 'lisans';
    return null;
  }
  // Çoklu kadrolu ilanlarda en alt eğitim kademesini al (üst kademe mezunları da eşleşebilsin)
  return found.sort((a, b) => EDUCATION_LEVELS.indexOf(a) - EDUCATION_LEVELS.indexOf(b))[0];
}

export function parseDeadline(rawText: string): string | null {
  const lower = rawText.toLocaleLowerCase('tr').replace(/[ \t]+/g, ' ');
  const nLines = rawText
    .split(/\r?\n/)
    .map((line) => norm(line))
    .join('\n');

  const toIso = (d: string | number, m: string | number, y: string | number): string | null => {
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  };

  // 1) "Son Başvuru Tarihi: 15.11.2026" veya "15/11/2026"
  const m1 = lower.match(/son\s*başvuru[^0-9\n]{0,60}(\d{1,2})[./](\d{1,2})[./](20\d{2})/);
  if (m1) return toIso(m1[1], m1[2], m1[3]);

  // 2) "Son Başvuru Tarihi: 30 Ekim 2026" (ay adıyla)
  const monthRegex = MONTHS.join('|');
  const m2 = nLines.match(new RegExp(`son\\s*basvuru[^0-9\\n]{0,50}(\\d{1,2})\\s+(${monthRegex})\\s+(20\\d{2})`));
  if (m2) return toIso(m2[1], MONTHS.indexOf(m2[2]) + 1, m2[3]);

  // 3) "04/02/2026 - 12/02/2026 tarihleri arasında" veya "Başvuru Tarihleri: 23.10.2026 - 06.11.2026"
  const m3 = lower.match(
    /(?:başvuru[^\n]{0,35})?\d{1,2}[./]\d{1,2}[./]20\d{2}\s*(?:-|–|ile)\s*(\d{1,2})[./](\d{1,2})[./](20\d{2})/,
  );
  if (m3) return toIso(m3[1], m3[2], m3[3]);

  // 4) "... başlayacak/başlayıp DD.MM.YYYY ... sona erecektir" (açgözlü önek ile bitiş tarihini yakalar)
  const m3b = lower.match(
    /başvur\w*[^\n]{0,160}(\d{1,2})[./](\d{1,2})[./](20\d{2})[^\n]{0,55}?sona\s*erecek/,
  );
  if (m3b) return toIso(m3b[1], m3b[2], m3b[3]);

  // 5) Ay adıyla başvuru bitiş tarihi: "26 Ekim 2026 ... ile 8 Kasım 2026 ... arasında / sona erecek / kadar"
  const m4 = nLines.match(
    new RegExp(
      `(?:basvur\\w*[^\\n]{0,120}(?:ile|-|ve)\\s*)?(\\d{1,2})\\s+(${monthRegex})\\s+(20\\d{2})(?:\\s+saat\\s*[0-9:.]+)?\\s*(?:arasinda|tarihine|gunu|saat|mesai|itibariyle)[^\\n]{0,40}?(?:kadar|sona\\s*erecek)?`,
    ),
  );
  if (m4 && /kadar|sona\s*erecek|arasinda/.test(m4[0])) {
    return toIso(m4[1], MONTHS.indexOf(m4[2]) + 1, m4[3]);
  }

  const m5 = lower.match(/(\d{1,2})[./](\d{1,2})[./](20\d{2})\s*(?:tarihine|günü|saat|mesai)[^\n]{0,30}kadar/);
  if (m5) return toIso(m5[1], m5[2], m5[3]);

  return null;
}

export function detectCity(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const n = ` ${norm(text)} `;
    for (const c of CITIES) {
      if (n.includes(` ${norm(c)} `) || n.includes(` ${norm(c)}'`) || n.includes(` ${norm(c)}da `)) return c;
    }
  }
  return null;
}

/** Liste başlığını temizler ve düzgün Türkçe başlık biçimine getirir. */
export function cleanListingTitle(raw: string): string {
  return normalizeTurkishTitle(raw);
}

/** İlan başlığından veya metninden kurum adını çıkarır. */
export function extractInstitution(title: string, text = ''): string | null {
  const cleaned = cleanListingTitle(title);
  const withCount = cleaned.match(
    /^(.+?)\s+(?:(?:Geçici|Daimi|Sürekli|Sözleşmeli|Kadrolu)\s+)?\d+\s+(?:adet\s+)?(?:(?:geçici|daimi|sürekli|kadrolu)\s+)?(?:sözleşmeli|personel|işçi|memur|zabıta|itfaiye|uzman|müfettiş|denetçi|fon|muvazzaf|subay|astsubay|öğretim|araştırma|iç\s+denetçi|akreditasyon|kütüphaneci|avukat|alacak)/i,
  );
  if (withCount && withCount[1].trim().length >= 3) {
    return withCount[1].trim().replace(/[,:\-–]+$/, '').trim();
  }
  const withoutCount = cleaned.match(
    /^(.+?)\s+(?:Öğretim\s+|Araştırma\s+|Sözleşmeli\s+|Geçici\s+İşçi|Sürekli\s+İşçi|Daimi\s+İşçi|Personel\s+Alım|Memur\s+Alım|İşçi\s+Alım|Uzman\s+Yardımcısı)/i,
  );
  if (withoutCount && withoutCount[1].trim().length >= 3) {
    return withoutCount[1].trim().replace(/[,:\-–]+$/, '').trim();
  }
  const fromText = text.match(
    /^([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s,.'()-]{5,90}?)(?:ndan|nden|lığından|lüğünden|ğinden|sından|sinden)\s*:/m,
  );
  if (fromText) return normalizeTurkishTitle(fromText[1].trim());
  return null;
}

export function detectJobType(n: string): JobType {
  // Üniversite akademik kadroları (2547 sayılı kanun, öğretim üyesi, doçent, profesör, dr. öğretim üyesi, öğretim görevlisi, araştırma görevlisi vb.)
  if (
    /ogretim (uyesi|elemani|gorevlisi)|arastirma gorevlisi|akademik|doktor ogretim|dr\.\s*ogretim|dr\.\s*ogr|ogr\.\s*gor|ar[as]\.\s*gor|\bprofesor\b|\bprof\b|\bdocent\b|\bdoc\b|2547\s*sayili|ogretim\s+kadro|akademisyen/i.test(
      n,
    )
  ) {
    return 'akademik';
  }
  if (/sozlesmeli|4\s?\/\s?b|4b\b|kalkinma ajansi/.test(n)) return 'sozlesmeli';
  if (
    /\bmemur\b|zabit|zabita|itfaiye|uzman\w*\s+yardimcisi|mufettis\w*\s+yardimcisi|denetci\w*\s+yardimcisi|kontrolor\w*\s+yardimcisi|ic denetci|muvazzaf|subay|astsubay|kaymakam/.test(
      n,
    )
  ) {
    return 'memur';
  }
  if (/\bisci\b|daimi isci|surekli isci|gecici isci|mevsimlik/.test(n)) return 'isci';
  if (/\bkadro\b|kpss\s?-?\s?[ab]\b/.test(n)) return 'memur';
  return 'diger';
}

/** Serbest ilan metninden başvuru şartlarını sezgisel olarak çıkarır. */
export function parseRequirements(title: string, text: string): ParsedRequirements {
  const titleNorm = norm(title);
  const fullNorm = norm(`${title}. ${text}`);
  const titleJobType = detectJobType(titleNorm);
  const jobType = titleJobType !== 'diger' ? titleJobType : detectJobType(fullNorm);
  const kpss = parseKpss(titleNorm, fullNorm, `${title}\n${text}`, jobType);

  const exp = fullNorm.match(/(\d{1,2})\s*(?:\(\w+\)\s*)?yil[^.]{0,50}(?:deneyim|tecrube|kidem)/);
  const age =
    fullNorm.match(/(\d{2})\s*(?:\(\w+\)\s*)?yasini\s*(?:doldurmamis|gecmemis|asmamis)/) ??
    fullNorm.match(/yas siniri[^0-9]{0,15}(\d{2})/);
  const titleCounts = [
    ...titleNorm.matchAll(
      /\b(\d{1,4})\s*(?:adet\s*)?(?:sozlesmeli|personel|kadro|isci|memur|zabita|itfaiye|uzman|mufettis|denetci|fon|subay|astsubay|ogretim|arastirma|kutuphaneci|ic denetci|avukat|destek)/g,
    ),
  ].map((m) => Number(m[1]));
  const totalFromTitle = titleCounts.length > 0 ? titleCounts.reduce((acc, v) => acc + v, 0) : null;
  const posBody = fullNorm.match(
    /(\d{1,4})\s*(?:\([a-z\s]+\)\s*)?(?:adet\s*)?(?:personel|kadro|isci|sozlesmeli|memur|engelli|surekli)/,
  );
  const positions = totalFromTitle ?? (posBody ? Number(posBody[1]) : null);

  const certs = extractCertificates(title, text);

  return {
    kpssRequired: kpss.required,
    minKpssScore: kpss.score,
    kpssType: kpss.type,
    minEducation: parseEducation(fullNorm, jobType),
    requiredCertificates: certs.certificates,
    certificateMode: certs.mode,
    minExperienceYears: exp ? Number(exp[1]) : null,
    maxAge: age ? Number(age[1]) : null,
    positions,
    deadline: parseDeadline(`${title}\n${text}`),
    city: detectCity(title, text.slice(0, 2000)),
    jobType,
  };
}
