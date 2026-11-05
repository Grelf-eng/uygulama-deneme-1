import { db } from '../db';

/**
 * Türkçe küfür, hakaret ve argo kalıplarını tespit eden kapsamlı koruma motoru.
 * Karakter aralarına nokta, yıldız, boşluk veya benzeri karakterler koyarak filtreyi
 * atlatmaya çalışan (leetspeak, regex evasion) girişimleri de yakalar.
 */

// Kök küfür ve hakaret sözlüğü
const PROFANITY_ROOTS = [
  'amk',
  'amq',
  'aq',
  'oç',
  'orospu',
  'piç',
  'pic',
  'sik',
  'siktir',
  'sikeyim',
  'sikerim',
  'sikik',
  'yarrak',
  'yarak',
  'amcık',
  'amcik',
  'göt',
  'got',
  'götveren',
  'ibne',
  'puşt',
  'pust',
  'kahpe',
  'pezevenk',
  'şerefsiz',
  'serefsiz',
  'şerefsizin',
  'şerefsizler',
  'ananı',
  'anani',
  'anasını',
  'anasini',
  'bacını',
  'bacini',
  'bacısını',
  'bacisini',
  'yavşak',
  'yavsak',
  'dalyarak',
  'taşak',
  'tasak',
  'daşak',
  'dasak',
  'fahişe',
  'fahise',
  'kaltak',
  'ibnelik',
  'götlek',
  'gotlek',
  'amına',
  'amina',
  'amını',
  'amini',
  'kancık',
  'kancik',
  'dönek',
  'haysiyetsiz',
];

// Evasion ve araya konan noktalama işaretlerini normalize etmek için harf dönüşüm haritası
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

// Boşluksuz ve noktalamasız normalize hali
function stripPunctuation(input: string): string {
  return normalizeText(input).replace(/[^a-z0-9]/g, '');
}

/**
 * Metinde küfür/hakaret olup olmadığını denetler.
 */
export function containsProfanity(text: string): { hasProfanity: boolean; matchedWord?: string } {
  if (!text || typeof text !== 'string') return { hasProfanity: false };

  const norm = normalizeText(text);
  const words = norm.split(/[\s,.;:!?*_\-+~#|/\\]+/).filter(Boolean);
  const stripped = stripPunctuation(text);

  // 1. Kelime bazlı tam eşleşme kontrolü
  for (const w of words) {
    if (PROFANITY_ROOTS.includes(w)) {
      return { hasProfanity: true, matchedWord: w };
    }
  }

  // 2. Kök bazlı içerik kontrolü (Örn: "siktirgit", "orospucocugu", "ananisikeyim", vb.)
  const highRiskRoots = [
    'orospu',
    'siktir',
    'sikeyim',
    'sikerim',
    'sikik',
    'yarrak',
    'amcik',
    'pezevenk',
    'yavsak',
    'dalyarak',
    'kahpe',
    'gotveren',
    'pic',
  ];

  for (const root of highRiskRoots) {
    if (stripped.includes(root)) {
      return { hasProfanity: true, matchedWord: root };
    }
  }

  // 3. Kısa küfür kısaltmaları için regex kontrolü (Örn: "amk", "a.m.k", "o.ç", "o ç")
  const shortAbbrPatterns = [
    /\b[a@4][\s._*\-]*[m][\s._*\-]*[kqc]\b/i, // a.m.k, a m k, amq
    /\b[o0][\s._*\-]*[cç]\b/i, // o.ç, o ç, oc
    /\b[p][\s._*\-]*[iı1][\s._*\-]*[cç]\b/i, // p.i.c, piç, p*ç
    /\b[s$][\s._*\-]*[iı1][\s._*\-]*[k]\b/i, // s.i.k, s*k
    /\b[a@4][\s._*\-]*[q]\b/i, // aq, a q
  ];

  for (const p of shortAbbrPatterns) {
    if (p.test(text) || p.test(norm)) {
      return { hasProfanity: true, matchedWord: 'argo/küfür' };
    }
  }

  return { hasProfanity: false };
}

export interface ChatBanStatus {
  isBanned: boolean;
  remainingMinutes: number;
  remainingHours: number;
  warnings: number;
  bannedUntil: number;
}

/**
 * Kullanıcının mevcut chat ban durumunu sorgular.
 */
export function getUserChatBanStatus(userId: number): ChatBanStatus {
  const row = db
    .prepare('SELECT chat_banned_until, chat_warnings FROM users WHERE id = ?')
    .get(userId) as { chat_banned_until?: number; chat_warnings?: number } | undefined;

  const bannedUntil = row?.chat_banned_until || 0;
  const warnings = row?.chat_warnings || 0;
  const now = Date.now();

  if (bannedUntil > now) {
    const diffMs = bannedUntil - now;
    const remainingMinutes = Math.ceil(diffMs / (1000 * 60));
    const remainingHours = Math.ceil(diffMs / (1000 * 60 * 60));
    return {
      isBanned: true,
      remainingMinutes,
      remainingHours,
      warnings,
      bannedUntil,
    };
  }

  return {
    isBanned: false,
    remainingMinutes: 0,
    remainingHours: 0,
    warnings,
    bannedUntil: 0,
  };
}

/**
 * Kullanıcıya küfür/hakaret ihlali cezası uygular (Kademeli Strike Sistemi).
 * 1. İhlal: Uyarı (banlanmaz, yorum engellenir)
 * 2. İhlal: 24 saat chat banı
 * 3. İhlal: 7 gün chat banı
 * 4. ve üzeri İhlal: 30 gün süreli chat banı
 */
export function applyProfanityStrike(userId: number): {
  newWarnings: number;
  isBanned: boolean;
  banDurationHours: number;
  message: string;
} {
  const current = getUserChatBanStatus(userId);
  const newWarnings = current.warnings + 1;
  let banMs = 0;
  let banDurationHours = 0;
  let message = '';

  if (newWarnings === 1) {
    // 1. Uyarı
    db.prepare('UPDATE users SET chat_warnings = ? WHERE id = ?').run(newWarnings, userId);
    message = '⚠️ Yorumunuz topluluk kurallarına aykırı küfür veya hakaret içerdiği için engellendi. Lütfen seviyeli bir dil kullanın (İhlal Uyarısı: 1/3).';
    return { newWarnings, isBanned: false, banDurationHours: 0, message };
  } else if (newWarnings === 2) {
    // 2. İhlal: 24 Saat Chat Banı
    banDurationHours = 24;
    banMs = banDurationHours * 60 * 60 * 1000;
    const bannedUntil = Date.now() + banMs;
    db.prepare('UPDATE users SET chat_warnings = ?, chat_banned_until = ? WHERE id = ?').run(
      newWarnings,
      bannedUntil,
      userId,
    );
    message = '🚫 Tekrarlanan küfür/hakaret nedeniyle hesabınız 24 SAAT boyunca yorum yapmaya kapatılmıştır.';
    return { newWarnings, isBanned: true, banDurationHours, message };
  } else if (newWarnings === 3) {
    // 3. İhlal: 7 Gün Chat Banı
    banDurationHours = 7 * 24;
    banMs = banDurationHours * 60 * 60 * 1000;
    const bannedUntil = Date.now() + banMs;
    db.prepare('UPDATE users SET chat_warnings = ?, chat_banned_until = ? WHERE id = ?').run(
      newWarnings,
      bannedUntil,
      userId,
    );
    message = '⛔ Ağır topluluk ihlali nedeniyle hesabınız 7 GÜN boyunca yorum yapmaya kapatılmıştır.';
    return { newWarnings, isBanned: true, banDurationHours, message };
  } else {
    // 4+ İhlal: 30 Gün Süreli Chat Banı
    banDurationHours = 30 * 24;
    banMs = banDurationHours * 60 * 60 * 1000;
    const bannedUntil = Date.now() + banMs;
    db.prepare('UPDATE users SET chat_warnings = ?, chat_banned_until = ? WHERE id = ?').run(
      newWarnings,
      bannedUntil,
      userId,
    );
    message = '🛑 Israrlı topluluk ihlali nedeniyle hesabınız 30 GÜN boyunca yorum yapmaya kapatılmıştır.';
    return { newWarnings, isBanned: true, banDurationHours, message };
  }
}
