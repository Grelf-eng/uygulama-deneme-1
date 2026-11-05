import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config';
import { db } from '../db';
import { isScrapingRunning, runAllScrapers } from '../scrapers';
import { deleteCloudUser, syncCloudSession, syncCloudSubscription, syncCloudUser, syncLocalJobsToCloud } from '../services/cloudDb';
import { resetProfileLimit } from '../services/profileRepo';

export const adminRouter = Router();

function parseToken(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Yönetici Yetki Kontrolü
 * Hem x-admin-key başlığını hem de oturum açmış admin kullanıcısını destekler.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // 1. API Anahtarı ile erişim
  if (config.adminKey && req.headers['x-admin-key'] === config.adminKey) {
    return next();
  }

  // 2. JWT oturumu ile erişim
  const userId = parseToken(req);
  if (!userId) {
    res.status(401).json({ error: 'Yönetici girişi gereklidir.' });
    return;
  }
  req.userId = userId;

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as { is_admin: number } | undefined;
  if (!user || user.is_admin !== 1) {
    res.status(403).json({ error: 'Bu alana erişmek için yönetici yetkisi gereklidir.' });
    return;
  }

  next();
}

adminRouter.use(requireAdmin);

/**
 * GET /api/admin/stats
 * Sistem genel istatistikleri ve özet metrikler
 */
adminRouter.get('/stats', (_req: Request, res: Response) => {
  try {
    const totalUsers = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number })?.c || 0;
    const verifiedUsers = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_verified = 1').get() as { c: number })?.c || 0;
    const pendingUsers = totalUsers - verifiedUsers;

    const subscribedUsers = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_subscribed = 1').get() as { c: number })?.c || 0;
    const notificationSubscribers = (db.prepare('SELECT COUNT(*) AS c FROM profiles WHERE notifications_enabled = 1').get() as { c: number })?.c || 0;
    const pushTokenUsers = (db.prepare("SELECT COUNT(*) AS c FROM profiles WHERE push_token IS NOT NULL AND push_token != ''").get() as { c: number })?.c || 0;

    const totalJobs = (db.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number })?.c || 0;
    const bySource = db
      .prepare('SELECT source, COUNT(*) AS count FROM jobs GROUP BY source ORDER BY count DESC')
      .all();

    const totalFavorites = (db.prepare('SELECT COUNT(*) AS c FROM favorites').get() as { c: number })?.c || 0;
    const totalApplications = (db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number })?.c || 0;

    const recentRegistrations = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', '-7 days')").get() as { c: number })?.c || 0;

    res.json({
      totalUsers,
      verifiedUsers,
      pendingUsers,
      subscribedUsers,
      notificationSubscribers,
      pushTokenUsers,
      totalJobs,
      bySource,
      totalFavorites,
      totalApplications,
      recentRegistrations,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'İstatistikler alınamadı: ' + err.message });
  }
});

/**
 * GET /api/admin/users
 * Tüm kayıtlı kullanıcıları ve abone durumlarını detaylı profilleriyle listeler.
 */
adminRouter.get('/users', (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    let whereClause = '1=1';
    const params: any[] = [];

    if (filter === 'pending') {
      whereClause += ' AND u.is_verified = 0';
    } else if (filter === 'verified') {
      whereClause += ' AND u.is_verified = 1';
    } else if (filter === 'subscribers') {
      whereClause += ' AND (u.is_subscribed = 1 OR p.notifications_enabled = 1)';
    } else if (filter === 'vip') {
      whereClause += ' AND u.is_subscribed = 1';
    } else if (filter === 'notifications') {
      whereClause += ' AND p.notifications_enabled = 1';
    }

    if (q) {
      whereClause += ` AND (
        LOWER(u.email) LIKE ? OR
        LOWER(COALESCE(p.full_name, '')) LIKE ? OR
        LOWER(COALESCE(p.department, '')) LIKE ? OR
        LOWER(COALESCE(p.cities, '')) LIKE ?
      )`;
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const countSql = `
      SELECT COUNT(*) AS total
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE ${whereClause}
    `;
    const totalCount = (db.prepare(countSql).get(...params) as { total: number })?.total || 0;

    const listSql = `
      SELECT 
        u.id,
        u.email,
        u.is_admin,
        u.is_verified,
        COALESCE(u.is_subscribed, 0) AS is_subscribed,
        COALESCE(u.subscription_tier, 'standart') AS subscription_tier,
        COALESCE(u.chat_banned_until, 0) AS chat_banned_until,
        COALESCE(u.chat_warnings, 0) AS chat_warnings,
        u.created_at,
        p.full_name,
        p.birth_year,
        p.education_level,
        p.department,
        p.certificates,
        p.kpss_score,
        p.kpss_type,
        p.experience_years,
        p.cities,
        p.job_types,
        COALESCE(p.notifications_enabled, 1) AS notifications_enabled,
        COALESCE(p.profile_edit_count, 0) AS profile_edit_count,
        COALESCE(p.last_profile_update, 0) AS last_profile_update,
        CASE WHEN p.push_token IS NOT NULL AND p.push_token != '' THEN 1 ELSE 0 END AS has_push_token,
        p.updated_at AS profile_updated_at,
        (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorites_count,
        (SELECT COUNT(*) FROM applications a WHERE a.user_id = u.id) AS applications_count
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(listSql).all(...params, limit, offset) as any[];

    const users = rows.map((r) => {
      let cities: string[] = [];
      let certificates: string[] = [];
      let jobTypes: string[] = [];
      try { cities = JSON.parse(r.cities || '[]'); } catch {}
      try { certificates = JSON.parse(r.certificates || '[]'); } catch {}
      try { jobTypes = JSON.parse(r.job_types || '[]'); } catch {}

      return {
        id: r.id,
        email: r.email,
        fullName: r.full_name || '',
        isAdmin: r.is_admin === 1,
        isVerified: r.is_verified === 1,
        isSubscribed: r.is_subscribed === 1,
        subscriptionTier: r.subscription_tier || 'standart',
        chatBannedUntil: Number(r.chat_banned_until || 0),
        chatWarnings: Number(r.chat_warnings || 0),
        createdAt: r.created_at,
        birthYear: r.birth_year,
        educationLevel: r.education_level,
        department: r.department || '',
        kpssScore: r.kpss_score,
        kpssType: r.kpss_type,
        experienceYears: r.experience_years ?? 0,
        cities,
        certificates,
        jobTypes,
        notificationsEnabled: r.notifications_enabled === 1,
        profileEditCount: r.profile_edit_count || 0,
        lastProfileUpdate: r.last_profile_update || 0,
        hasPushToken: r.has_push_token === 1,
        profileUpdatedAt: r.profile_updated_at,
        favoritesCount: r.favorites_count || 0,
        applicationsCount: r.applications_count || 0,
      };
    });

    res.json({ total: totalCount, users });
  } catch (err: any) {
    res.status(500).json({ error: 'Kullanıcılar listelenirken hata: ' + err.message });
  }
});

/**
 * POST /api/admin/users/:id/verify
 * Kullanıcıyı anında onayla (Doğrulama kodu beklemeden)
 */
adminRouter.post('/users/:id/verify', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email, password_hash, is_admin, is_subscribed, subscription_tier FROM users WHERE id = ?').get(userId) as {
    email: string;
    password_hash: string;
    is_admin: number;
    is_subscribed: number;
    subscription_tier: string;
  } | undefined;

  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userId);
  syncCloudUser(u.email, u.password_hash, u.is_admin, 1, u.is_subscribed, u.subscription_tier);

  res.json({
    success: true,
    message: `${u.email} hesabı başarıyla onaylandı.`,
  });
});

/**
 * POST /api/admin/users/:id/toggle-subscription
 * Kullanıcıyı VIP/Premium Abone yap veya aboneliğini kaldır
 */
adminRouter.post('/users/:id/toggle-subscription', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email, is_subscribed, subscription_tier FROM users WHERE id = ?').get(userId) as {
    email: string;
    is_subscribed: number;
    subscription_tier: string;
  } | undefined;

  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  const requestedStatus = typeof req.body.isSubscribed === 'boolean'
    ? (req.body.isSubscribed ? 1 : 0)
    : (u.is_subscribed === 1 ? 0 : 1);
  const tier = typeof req.body.tier === 'string' && req.body.tier.trim()
    ? req.body.tier.trim()
    : (requestedStatus === 1 ? 'vip' : 'standart');

  db.prepare('UPDATE users SET is_subscribed = ?, subscription_tier = ? WHERE id = ?').run(requestedStatus, tier, userId);
  syncCloudSubscription(u.email, requestedStatus, tier);

  res.json({
    success: true,
    isSubscribed: requestedStatus === 1,
    subscriptionTier: tier,
    message: `${u.email} abonelik durumu güncellendi: ${requestedStatus === 1 ? 'VIP Abone (' + tier + ')' : 'Standart Kullanıcı'}`,
  });
});

/**
 * POST /api/admin/users/:id/toggle-admin
 * Kullanıcıya yönetici yetkisi ver veya kaldır (Kendini kaldıramaz)
 */
adminRouter.post('/users/:id/toggle-admin', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (req.userId === userId) {
    res.status(400).json({ error: 'Kendi yöneticilik yetkinizi kaldıramazsınız.' });
    return;
  }

  const u = db.prepare('SELECT email, password_hash, is_admin, is_verified, is_subscribed, subscription_tier FROM users WHERE id = ?').get(userId) as {
    email: string;
    password_hash: string;
    is_admin: number;
    is_verified: number;
    is_subscribed: number;
    subscription_tier: string;
  } | undefined;

  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  const nextAdmin = u.is_admin === 1 ? 0 : 1;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(nextAdmin, userId);
  syncCloudUser(u.email, u.password_hash, nextAdmin, u.is_verified, u.is_subscribed, u.subscription_tier);

  res.json({
    success: true,
    isAdmin: nextAdmin === 1,
    message: `${u.email} hesabı ${nextAdmin === 1 ? 'Yönetici yapıldı.' : 'Yöneticilik yetkisi kaldırıldı.'}`,
  });
});

/**
 * POST /api/admin/users/:id/unban-chat
 * Yöneticinin kullanıcının chat yasağını kaldırmasını ve uyarılarını sıfırlamasını sağlar.
 */
adminRouter.post('/users/:id/unban-chat', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }
  db.prepare('UPDATE users SET chat_banned_until = 0, chat_warnings = 0 WHERE id = ?').run(userId);
  res.json({
    success: true,
    message: `${u.email} kullanıcısının chat yasağı ve uyarıları başarıyla kaldırıldı.`,
  });
});

/**
 * POST /api/admin/users/:id/toggle-chat-ban
 * Yöneticinin tek tıkla chat banını açıp kapatmasını sağlar.
 */
adminRouter.post('/users/:id/toggle-chat-ban', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email, chat_banned_until FROM users WHERE id = ?').get(userId) as { email: string; chat_banned_until?: number } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }
  const isCurrentlyBanned = (u.chat_banned_until || 0) > Date.now();
  if (isCurrentlyBanned) {
    db.prepare('UPDATE users SET chat_banned_until = 0, chat_warnings = 0 WHERE id = ?').run(userId);
    res.json({
      success: true,
      isBanned: false,
      message: `${u.email} kullanıcısının chat yasağı kaldırıldı.`,
    });
  } else {
    const bannedUntil = Date.now() + 24 * 60 * 60 * 1000;
    db.prepare('UPDATE users SET chat_banned_until = ?, chat_warnings = chat_warnings + 1 WHERE id = ?').run(bannedUntil, userId);
    res.json({
      success: true,
      isBanned: true,
      message: `${u.email} kullanıcısına 24 saat chat yasağı uygulandı.`,
    });
  }
});

/**
 * POST /api/admin/users/:id/kick
 * Kullanıcının aktif oturumunu sonlandır (Tüm cihazlardan çıkış yaptır)
 */
adminRouter.post('/users/:id/kick', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }
  db.prepare("UPDATE users SET session_token = '' WHERE id = ?").run(userId);
  syncCloudSession(u.email, '');
  res.json({
    success: true,
    message: `${u.email} kullanıcısının tüm açık oturumları sonlandırıldı. Tekrar giriş yapana kadar erişemez.`,
  });
});

/**
 * POST /api/admin/users/:id/reset-profile-limit
 * Kullanıcının profil güncelleme hakkını ve 48 saatlik soğuma sayacını sıfırla
 */
adminRouter.post('/users/:id/reset-profile-limit', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }
  resetProfileLimit(userId);
  res.json({
    success: true,
    message: `${u.email} kullanıcısının profil güncelleme hakkı sıfırlandı (3 serbest güncelleme hakkı yeniden tanımlandı).`,
  });
});

/**
 * DELETE /api/admin/users/:id
 * Kullanıcı hesabını sil (Kendini veya ana admini silemez)
 */
adminRouter.delete('/users/:id', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (req.userId === userId) {
    res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
    return;
  }

  const u = db.prepare('SELECT email, is_admin FROM users WHERE id = ?').get(userId) as { email: string; is_admin: number } | undefined;
  if (!u) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  const emailLow = u.email.toLowerCase();
  if (emailLow === 'kamuilanasistani@gmail.com' || emailLow === 'destek@kamuilanasistani.com' || emailLow === 'otaner963@gmail.com' || emailLow === 'igaren24') {
    res.status(400).json({ error: 'Ana yönetici hesabı silinemez.' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  deleteCloudUser(u.email);
  res.json({ success: true, message: `${u.email} hesabı başarıyla silindi.` });
});

/**
 * POST /api/admin/scrape
 * İlan tarayıcılarını tetikler (Render 30 saniye zaman aşımına uğramaması için arka planda çalıştırır)
 */
adminRouter.post('/scrape', async (req: Request, res: Response) => {
  try {
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : undefined;

    if (isScrapingRunning()) {
      res.json({
        success: true,
        alreadyRunning: true,
        message: 'Resmi kaynaklar şu anda zaten taranıyor. Birkaç saniye içinde tamamlanacaktır.',
      });
      return;
    }

    // Arka planda güvenli başlat (Render HTTP timeout 502 hatası vermez)
    runAllScrapers(sources)
      .then(async () => {
        try {
          await syncLocalJobsToCloud();
        } catch {}
      })
      .catch((err: any) => console.error('[admin:scrape] Arka plan tarama hatası:', err.message));

    res.json({
      success: true,
      message: 'Kamu ilanları taraması başarıyla başlatıldı. Yeni ilanlar geldikçe panele ve listeye yansıyacaktır.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Scraping başlatılamadı.' });
  }
});

/**
 * GET /api/admin/scrape/status
 * İlan tarayıcısının o an çalışıp çalışmadığını kontrol eder
 */
adminRouter.get('/scrape/status', (_req: Request, res: Response) => {
  res.json({ running: isScrapingRunning() });
});

/**
 * POST /api/admin/broadcast
 * Tüm kullanıcılara veya yalnızca abonelere sistem bildirimi / duyuru gönderme
 */
adminRouter.post('/broadcast', (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(2).max(150),
    body: z.string().min(2).max(1000),
    target: z.enum(['all', 'subscribers', 'verified']).default('all'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz bildirim verisi.' });
    return;
  }

  const { title, body, target } = parsed.data;

  let targetSql = 'SELECT id FROM users WHERE 1=1';
  if (target === 'subscribers') {
    targetSql = `
      SELECT u.id FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.is_subscribed = 1 OR p.notifications_enabled = 1
    `;
  } else if (target === 'verified') {
    targetSql = 'SELECT id FROM users WHERE is_verified = 1';
  }

  const targetUsers = db.prepare(targetSql).all() as { id: number }[];
  if (targetUsers.length === 0) {
    res.json({ count: 0, message: 'Bildirim gönderilecek uygun kullanıcı bulunamadı.' });
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO notifications (user_id, title, body, read)
    VALUES (?, ?, ?, 0)
  `);

  const tx = db.transaction((usersList: { id: number }[]) => {
    let sent = 0;
    for (const tu of usersList) {
      insertStmt.run(tu.id, title, body);
      sent++;
    }
    return sent;
  });

  const count = tx(targetUsers);
  res.json({
    success: true,
    count,
    message: `${count} kullanıcıya sistem bildirimi gönderildi.`,
  });
});
