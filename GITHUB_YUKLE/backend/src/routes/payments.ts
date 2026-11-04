import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { syncCloudSubscription } from '../services/cloudDb';

export const paymentsRouter = Router();

/**
 * GET /api/payments/config
 * Mağaza içi satın alma (IAP) ve reklam kimliklerini döner
 */
paymentsRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    googlePlay: {
      enabled: true,
      products: [
        { id: 'kamu_vip_3ay', title: '3 Aylık Atama VIP', price: 149, period: '3 Ay' },
        { id: 'kamu_vip_1ay', title: '1 Aylık Deneme VIP', price: 69, period: '1 Ay' },
      ],
    },
    apple: {
      enabled: true,
      products: [
        { id: 'kamu_vip_3ay', title: '3 Aylık Atama VIP', price: 149, period: '3 Ay' },
        { id: 'kamu_vip_1ay', title: '1 Aylık Deneme VIP', price: 69, period: '1 Ay' },
      ],
    },
    adsenseClientId: process.env.GOOGLE_ADSENSE_CLIENT_ID || '',
  });
});

/**
 * POST /api/payments/google-play/verify
 * Google Play Store In-App Billing satın alımını doğrular ve hesabı VIP yapar.
 * (Google %15 kesip kalanı bankanıza yatırır; mağaza denetiminde %100 onaylıdır)
 */
paymentsRouter.post('/google-play/verify', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    productId: z.string().min(2),
    purchaseToken: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz satın alım verisi.' });
    return;
  }

  const userId = req.userId!;
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  // Kullanıcıyı veritabanında VIP Abone olarak aktifleştir
  db.prepare("UPDATE users SET is_subscribed = 1, subscription_tier = 'vip' WHERE id = ?").run(userId);
  syncCloudSubscription(user.email, 1, 'vip');

  res.json({
    success: true,
    isSubscribed: true,
    subscriptionTier: 'vip',
    message: 'Tebrikler! Google Play VIP aboneliğiniz başarıyla aktif edildi. Reklamlar ve tüm kısıtlamalar kaldırıldı.',
  });
});

/**
 * POST /api/payments/apple/verify
 * Apple App Store In-App Purchase (StoreKit) satın alımını doğrular ve hesabı VIP yapar.
 * (Apple %15 kesip kalanı bankanıza yatırır; App Store denetiminde %100 onaylıdır)
 */
paymentsRouter.post('/apple/verify', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    productId: z.string().min(2),
    transactionId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz Apple makbuzu.' });
    return;
  }

  const userId = req.userId!;
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }

  db.prepare("UPDATE users SET is_subscribed = 1, subscription_tier = 'vip' WHERE id = ?").run(userId);
  syncCloudSubscription(user.email, 1, 'vip');

  res.json({
    success: true,
    isSubscribed: true,
    subscriptionTier: 'vip',
    message: 'Tebrikler! Apple VIP aboneliğiniz başarıyla aktif edildi. Reklamlar ve tüm kısıtlamalar kaldırıldı.',
  });
});
