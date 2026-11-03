import 'dotenv/config';
import fs from 'fs';
import path from 'path';

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const cwdData = path.join(process.cwd(), 'data');
  if (fs.existsSync(cwdData)) return path.join(cwdData, 'app.db');
  const parentData = path.join(__dirname, '..', 'data');
  return path.join(parentData, 'app.db');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'kamu-ilan-guvenli-anahtar-2026-prod',
  dbPath: resolveDbPath(),
  seedSample: process.env.SEED_SAMPLE !== 'false',
  scrapeCron: process.env.SCRAPE_CRON ?? '0 */3 * * *',
  scrapeOnStart: process.env.SCRAPE_ON_START === 'true',
  adminKey: process.env.ADMIN_KEY ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  notifyMinScore: Number(process.env.NOTIFY_MIN_SCORE ?? 50),
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  console.warn('[uyarı] JWT_SECRET ayarlanmamış! Üretimde mutlaka değiştirin.');
}
