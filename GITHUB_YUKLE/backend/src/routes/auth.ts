import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { signToken } from '../middleware/auth';
import { generateRandomCode, sendVerificationEmail } from '../services/mailer';
import { ensureProfile } from '../services/profileRepo';
import { removeCloudVerification, syncCloudUser, syncCloudVerification } from '../services/cloudDb';

export const authRouter = Router();

const emailSchema = z
  .string()
  .trim()
  .min(5, 'Geçerli bir e-posta adresi girin')
  .max(100, 'E-posta adresi çok uzun')
  .refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Giriş için geçerli bir e-posta adresi gereklidir (örn: ornek@gmail.com).'
  )
  .transform((v) => v.toLowerCase());

const credentials = z
  .object({
    email: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(6, 'Şifre en az 6 karakter olmalı').max(100),
    fullName: z.string().trim().max(100).optional(),
  })
  .superRefine((val, ctx) => {
    const raw = (val.email ?? val.username ?? '').trim();
    if (raw.toLowerCase() === 'igaren24') return; // Yönetici hesabı kullanıcı adı muafiyeti
    const res = emailSchema.safeParse(raw);
    if (!res.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error.issues[0].message, path: ['email'] });
    }
  });

const verifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().length(6, 'Doğrulama kodu 6 haneli olmalıdır'),
});

const resendSchema = z.object({
  email: emailSchema,
});

const socialAuthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  email: emailSchema,
  fullName: z.string().trim().max(100).optional(),
  token: z.string().optional(),
});

/** E-posta kod gönderimi için 60 saniyelik güvenlik soğuma süresi (rate-limiting) kontrolü */
function checkEmailCooldown(email: string): { allowed: boolean; waitSec: number } {
  const record = db
    .prepare('SELECT last_sent FROM email_verifications WHERE LOWER(email) = LOWER(?)')
    .get(email) as { last_sent?: number } | undefined;

  if (record && record.last_sent) {
    const elapsed = Date.now() - record.last_sent;
    if (elapsed < 60000) {
      return { allowed: false, waitSec: Math.ceil((60000 - elapsed) / 1000) };
    }
  }
  return { allowed: true, waitSec: 0 };
}

/** Zamanlama saldırılarına (timing attacks) karşı sabit süreli string karşılaştırma */
function safeCompareCode(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Kayıt olma:
 * Yeni kullanıcı `is_verified = 0` olarak kaydedilir.
 * Her kullanıcı için 6 haneli rastgele bir doğrulama kodu üretilir ve e-posta adresine gönderilir.
 * Kod girilip onaylanmadan sisteme giriş yetkisi verilmez (token üretilmez).
 */
authRouter.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const rawId = (parsed.data.username ?? parsed.data.email ?? '').trim();
  const identifier = rawId.includes('@') ? rawId.toLowerCase() : rawId;
  const { password, fullName } = parsed.data;

  const existing = db.prepare('SELECT id, is_verified FROM users WHERE LOWER(email) = LOWER(?)').get(identifier) as
    | { id: number; is_verified: number }
    | undefined;

  if (existing) {
    if (existing.is_verified === 1) {
      res.status(409).json({ error: 'Bu e-posta adresi ile zaten kayıtlı ve doğrulanmış bir hesap var.' });
      return;
    }
    // Kullanıcı daha önce kayıt olmuş ama kodunu onaylamamış
    const cooldown = checkEmailCooldown(identifier);
    if (!cooldown.allowed) {
      res.status(429).json({ error: `Lütfen yeni bir kod istemeden önce ${cooldown.waitSec} saniye bekleyin.` });
      return;
    }

    const newCode = generateRandomCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const now = Date.now();
    db.prepare(
      `INSERT INTO email_verifications (email, code, expires_at, attempts, last_sent, created_at)
       VALUES (?, ?, ?, 0, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, last_sent = excluded.last_sent, created_at = excluded.created_at`
    ).run(identifier, newCode, expiresAt, now);
    syncCloudVerification(identifier, newCode, expiresAt);

    await sendVerificationEmail(identifier, newCode);

    res.status(200).json({
      requiresVerification: true,
      email: identifier,
      message: 'Hesabınız henüz doğrulanmamış. Yeni bir doğrulama kodu e-postanıza gönderildi.',
    });
    return;
  }

  // Yeni kullanıcı kaydı
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, is_admin, is_verified) VALUES (?, ?, 0, 0)')
    .run(identifier, hash);
  const userId = Number(info.lastInsertRowid);
  ensureProfile(userId, fullName ?? '');

  const code = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const now = Date.now();

  db.prepare(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, last_sent, created_at)
     VALUES (?, ?, ?, 0, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, last_sent = excluded.last_sent, created_at = excluded.created_at`
  ).run(identifier, code, expiresAt, now);

  syncCloudUser(identifier, hash, 0, 0);
  syncCloudVerification(identifier, code, expiresAt);

  await sendVerificationEmail(identifier, code);

  res.status(201).json({
    requiresVerification: true,
    email: identifier,
    message: 'Kayıt başarılı! Lütfen e-postanıza gönderilen 6 haneli doğrulama kodunu girerek hesabınızı onaylayın.',
  });
});

/**
 * Giriş yapma:
 * Kullanıcı şifresi doğru olsa dahi, e-posta doğrulama kodunu girmemişse (`is_verified === 0`)
 * sisteme girişi engellenir (403 Forbidden).
 */
authRouter.post('/login', (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const rawId = (parsed.data.email ?? parsed.data.username ?? '').trim().toLowerCase();
  const { password } = parsed.data;
  const user = db
    .prepare('SELECT id, email, password_hash, is_admin, is_verified FROM users WHERE LOWER(email) = LOWER(?)')
    .get(rawId) as { id: number; email: string; password_hash: string; is_admin: number; is_verified: number } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'E-posta adresi veya şifre hatalı.' });
    return;
  }

  // E-posta onay kontrolü
  if (user.is_verified !== 1) {
    res.status(403).json({
      error: 'Lütfen önce e-postanıza gönderilen 6 haneli doğrulama kodunu girerek hesabınızı onaylayın.',
      requiresVerification: true,
      email: user.email,
    });
    return;
  }

  res.json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, username: user.email, isAdmin: user.is_admin === 1 },
  });
});

/**
 * E-posta Doğrulama Kodu Onaylama:
 * Kullanıcının e-postasına gönderilen 6 haneli kodu kontrol eder.
 * Doğruysa hesabı onaylar (`is_verified = 1`), doğrulama kaydını siler ve oturum token'ı döner.
 */
authRouter.post('/verify-email', (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { email, code } = parsed.data;
  const user = db
    .prepare('SELECT id, email, is_admin, is_verified FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email) as { id: number; email: string; is_admin: number; is_verified: number } | undefined;

  if (!user) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  const record = db
    .prepare('SELECT code, expires_at, attempts FROM email_verifications WHERE LOWER(email) = LOWER(?)')
    .get(email) as { code: string; expires_at: number; attempts?: number } | undefined;

  if (!record) {
    res.status(400).json({ error: 'Bu hesap için aktif bir doğrulama kodu bulunamadı. Lütfen "Tekrar Kod Gönder" butonuna basın.' });
    return;
  }

  // Brute-force önleme: 5 hatalı denemede kodu iptal et
  const attempts = record.attempts || 0;
  if (attempts >= 5) {
    db.prepare('DELETE FROM email_verifications WHERE LOWER(email) = LOWER(?)').run(email);
    removeCloudVerification(email);
    res.status(429).json({ error: 'Çok sayıda hatalı deneme yapıldı. Bu kod güvenlik nedeniyle iptal edildi. Lütfen "Tekrar Kod Gönder" butonuna basarak yeni bir kod isteyin.' });
    return;
  }

  // Süre kontrolü (15 dakika)
  if (Date.now() > record.expires_at) {
    db.prepare('DELETE FROM email_verifications WHERE LOWER(email) = LOWER(?)').run(email);
    removeCloudVerification(email);
    res.status(400).json({ error: 'Doğrulama kodunun 15 dakikalık süresi dolmuş. Lütfen yeni bir kod isteyin.' });
    return;
  }

  // Kriptografik timing-safe kod eşleşme kontrolü
  if (!safeCompareCode(record.code, code)) {
    const newAttempts = attempts + 1;
    db.prepare('UPDATE email_verifications SET attempts = ? WHERE LOWER(email) = LOWER(?)').run(newAttempts, email);
    const remaining = Math.max(0, 5 - newAttempts);
    res.status(400).json({
      error: `Girdiğiniz 6 haneli doğrulama kodu hatalı. Kalan deneme hakkı: ${remaining}`,
    });
    return;
  }

  // Kod kesin olarak doğru: Hesabı onayla
  db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM email_verifications WHERE LOWER(email) = LOWER(?)').run(email);

  const updatedUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as any;
  syncCloudUser(user.email, updatedUser?.password_hash || '', user.is_admin, 1);
  removeCloudVerification(email);

  res.json({
    message: 'E-posta adresiniz başarıyla doğrulandı! Sisteme güvenle giriş yapıldı.',
    token: signToken(user.id),
    user: { id: user.id, email: user.email, username: user.email, isAdmin: user.is_admin === 1 },
  });
});

/**
 * Yeni Doğrulama Kodu Gönderme:
 * Kod süresi bittiğinde veya e-posta ulaşmadığında yeni bir rastgele kod üretip gönderir.
 */
authRouter.post('/resend-code', async (req, res) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { email } = parsed.data;
  const user = db
    .prepare('SELECT id, email, is_verified FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email) as { id: number; email: string; is_verified: number } | undefined;

  if (!user) {
    res.status(404).json({ error: 'Bu e-posta adresiyle kayıtlı bir kullanıcı bulunamadı.' });
    return;
  }

  // 60 saniyelik anti-spam bekleme kontrolü
  const cooldown = checkEmailCooldown(user.email);
  if (!cooldown.allowed) {
    res.status(429).json({ error: `Lütfen yeni bir kod istemeden önce ${cooldown.waitSec} saniye bekleyin.` });
    return;
  }

  // Yeni rastgele kod üret
  const newCode = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const now = Date.now();

  db.prepare(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, last_sent, created_at)
     VALUES (?, ?, ?, 0, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, last_sent = excluded.last_sent, created_at = excluded.created_at`
  ).run(user.email, newCode, expiresAt, now);
  syncCloudVerification(user.email, newCode, expiresAt);

  await sendVerificationEmail(user.email, newCode);

  res.json({
    message: 'Yeni 6 haneli doğrulama kodu e-postanıza gönderildi.',
    email: user.email,
  });
});

/**
 * Google ve Apple ile Giriş / Kayıt:
 * Güvenlik ve kullanıcı isteği gereğince:
 * Google veya Apple ile girişlerde de e-posta doğrulama kodu ZORUNLUDUR!
 * 6 haneli güvenlik kodu e-postaya iletilir ve kod onaylanmadan oturum token'ı ASLA üretilmez.
 */
authRouter.post('/social', async (req, res) => {
  const parsed = socialAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { provider, email, fullName } = parsed.data;
  let user = db
    .prepare('SELECT id, email, password_hash, is_admin, is_verified FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email) as { id: number; email: string; password_hash: string; is_admin: number; is_verified: number } | undefined;

  if (!user) {
    // Yeni kullanıcı kaydı oluşturulur
    const randomPass = crypto.randomBytes(16).toString('hex');
    const hash = bcrypt.hashSync(randomPass, 10);
    const info = db
      .prepare('INSERT INTO users (email, password_hash, is_admin, is_verified) VALUES (?, ?, 0, 0)')
      .run(email, hash);
    const userId = Number(info.lastInsertRowid);
    ensureProfile(userId, fullName || (provider === 'google' ? 'Google Kullanıcısı' : 'Apple Kullanıcısı'));
    syncCloudUser(email, hash, 0, 0);

    user = { id: userId, email, password_hash: hash, is_admin: 0, is_verified: 0 };
  }

  // 60 saniyelik anti-spam kontrolü
  const cooldown = checkEmailCooldown(email);
  if (!cooldown.allowed) {
    res.status(429).json({
      error: `Güvenlik kodu az önce gönderildi. Lütfen yeni bir kod istemeden önce ${cooldown.waitSec} saniye bekleyin.`,
      requiresVerification: true,
      email,
    });
    return;
  }

  const newCode = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const now = Date.now();

  db.prepare(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, last_sent, created_at)
     VALUES (?, ?, ?, 0, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, last_sent = excluded.last_sent, created_at = excluded.created_at`
  ).run(email, newCode, expiresAt, now);
  syncCloudVerification(email, newCode, expiresAt);

  await sendVerificationEmail(email, newCode);

  res.status(200).json({
    requiresVerification: true,
    email,
    message: `${provider === 'google' ? 'Google' : 'Apple'} hesabınızı doğrulamak için 6 haneli güvenlik kodu e-postanıza gönderildi.`,
  });
});
