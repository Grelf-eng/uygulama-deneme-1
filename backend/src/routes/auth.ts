import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { signToken } from '../middleware/auth';
import { generateRandomCode, sendVerificationEmail } from '../services/mailer';
import { ensureProfile } from '../services/profileRepo';
import { removeCloudVerification, syncCloudUser, syncCloudVerification } from '../services/cloudDb';

export const authRouter = Router();

const identifierSchema = z
  .string()
  .trim()
  .min(3, 'Geçerli bir kullanıcı adı veya e-posta girin')
  .max(100, 'Kullanıcı adı veya e-posta çok uzun')
  .refine((v) => !v.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Geçerli bir e-posta girin')
  .transform((v) => (v.includes('@') ? v.toLowerCase() : v));

const credentials = z
  .object({
    email: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(6, 'Şifre en az 6 karakter olmalı').max(100),
    fullName: z.string().trim().max(100).optional(),
  })
  .superRefine((val, ctx) => {
    const raw = (val.username ?? val.email ?? '').trim();
    const res = identifierSchema.safeParse(raw);
    if (!res.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error.issues[0].message, path: ['email'] });
    }
  });

const verifySchema = z.object({
  email: z.string().trim().min(1, 'E-posta veya kullanıcı adı gerekli'),
  code: z.string().trim().length(6, 'Doğrulama kodu 6 haneli olmalıdır'),
});

const resendSchema = z.object({
  email: z.string().trim().min(1, 'E-posta veya kullanıcı adı gerekli'),
});

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
      res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta ile zaten doğrulanmış bir hesap var.' });
      return;
    }
    // Kullanıcı daha önce kayıt olmuş ama kodunu girmemiş: Yeni rastgele kod üretip gönder
    const newCode = generateRandomCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    db.prepare(
      `INSERT INTO email_verifications (email, code, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at`
    ).run(identifier, newCode, expiresAt);
    syncCloudVerification(identifier, newCode, expiresAt);

    await sendVerificationEmail(identifier, newCode);

    res.status(200).json({
      requiresVerification: true,
      email: identifier,
      message: 'Hesabınız henüz doğrulanmamış. Yeni bir doğrulama kodu e-postanıza gönderildi.',
    });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, is_admin, is_verified) VALUES (?, ?, 0, 0)')
    .run(identifier, hash);
  const userId = Number(info.lastInsertRowid);
  ensureProfile(userId, fullName ?? '');

  // 6 haneli rastgele doğrulama kodu üretimi
  const code = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 dakika geçerlilik

  db.prepare(
    `INSERT INTO email_verifications (email, code, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).run(identifier, code, expiresAt);

  // Neon PostgreSQL kalıcı buluta eşitle (Render yeniden başlasa da hesap kaybolmaz)
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
  const rawId = (parsed.data.username ?? parsed.data.email ?? '').trim();
  const { password } = parsed.data;
  const user = db
    .prepare('SELECT id, email, password_hash, is_admin, is_verified FROM users WHERE LOWER(email) = LOWER(?)')
    .get(rawId) as { id: number; email: string; password_hash: string; is_admin: number; is_verified: number } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Kullanıcı adı/e-posta veya şifre hatalı' });
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

  if (user.is_verified === 1) {
    res.json({
      message: 'Hesabınız zaten doğrulanmış. Giriş yapabilirsiniz.',
      token: signToken(user.id),
      user: { id: user.id, email: user.email, username: user.email, isAdmin: user.is_admin === 1 },
    });
    return;
  }

  const record = db
    .prepare('SELECT code, expires_at FROM email_verifications WHERE LOWER(email) = LOWER(?)')
    .get(email) as { code: string; expires_at: number } | undefined;

  if (!record) {
    res.status(400).json({ error: 'Bu hesap için aktif doğrulama kodu bulunamadı. Lütfen "Tekrar Kod Gönder" butonuna basın.' });
    return;
  }

  if (Date.now() > record.expires_at) {
    db.prepare('DELETE FROM email_verifications WHERE LOWER(email) = LOWER(?)').run(email);
    res.status(400).json({ error: 'Doğrulama kodunun 15 dakikalık süresi dolmuş. Lütfen yeni bir kod isteyin.' });
    return;
  }

  if (record.code.trim() !== code.trim()) {
    res.status(400).json({ error: 'Girdiğiniz 6 haneli doğrulama kodu hatalı. Lütfen e-postanızı kontrol edin.' });
    return;
  }

  // Kod doğru: Hesabı onayla
  db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM email_verifications WHERE LOWER(email) = LOWER(?)').run(email);

  const updatedUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as any;
  syncCloudUser(user.email, updatedUser?.password_hash || '', user.is_admin, 1);
  removeCloudVerification(email);

  res.json({
    message: 'E-posta adresiniz başarıyla doğrulandı! Sisteme giriş yapıldı.',
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

  if (user.is_verified === 1) {
    res.status(400).json({ error: 'Bu hesap zaten doğrulanmıştır. Doğrudan giriş yapabilirsiniz.' });
    return;
  }

  // Yeni rastgele kod üret
  const newCode = generateRandomCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;

  db.prepare(
    `INSERT INTO email_verifications (email, code, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).run(user.email, newCode, expiresAt);
  syncCloudVerification(user.email, newCode, expiresAt);

  await sendVerificationEmail(user.email, newCode);

  res.json({
    message: 'Yeni 6 haneli doğrulama kodu e-postanıza gönderildi.',
    email: user.email,
  });
});
