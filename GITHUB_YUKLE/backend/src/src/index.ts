import axios from 'axios';
import cron from 'node-cron';
import { app } from './app';
import { config } from './config';
import { db } from './db';
import { runAllScrapers } from './scrapers';
import { seedSampleJobs } from './seed';
import { initCloudSync, syncLocalJobsToCloud } from './services/cloudDb';

// 1. Önce 115 gerçek kamu ilanını ve Admin kullanıcısını yerel SQLite'a mühürle
try {
  const n = seedSampleJobs();
  if (n) console.log(`[seed] ${n} gerçek kamu ilanı sisteme yüklendi.`);
} catch (e: any) {
  console.error('[seed] Başlatma hatası:', e.message);
}

// 2. Ardından Neon PostgreSQL kalıcı bulut veritabanını eşitle
initCloudSync()
  .then(async () => {
    // Gerçek kamu ilanlarını hemen Neon bulutuna da yedekle
    await syncLocalJobsToCloud();

    // Canlı kamu ilanları taramasını arka planda başlat
    const realCount = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE source != 'ornek'").get() as { c: number })?.c || 0;
    if (realCount < 30 || config.scrapeOnStart) {
      console.log(`[startup] Gerçek ilan sayısı (${realCount}) az, canlı kamu ilanları taranıyor...`);
      runAllScrapers()
        .then(() => syncLocalJobsToCloud())
        .catch((e) => console.error('[startup] Tarama hatası:', e.message));
    }
  })
  .catch((e) => console.error('[cloud-db] Başlatma hatası:', e.message));

if (cron.validate(config.scrapeCron)) {
  cron.schedule(config.scrapeCron, () => {
    runAllScrapers().catch((e) => console.error('[cron] scraping hatası:', e.message));
  });
  console.log(`[cron] scraping zamanlandı: ${config.scrapeCron}`);
} else {
  console.warn(`[cron] geçersiz SCRAPE_CRON: ${config.scrapeCron}`);
}
if (config.scrapeOnStart) runAllScrapers().catch((e) => console.error(e.message));

app.listen(config.port, '0.0.0.0', () => {
  console.log(`API http://localhost:${config.port} adresinde çalışıyor`);

  // 7/24 Uyanık Tutma (Keep-Alive Self-Ping):
  // Render Free Tier 15 dakika hareketsizlikte uykuya (spin-down) geçer.
  // Her 8 dakikada bir kendi /api/health adresine ping atarak sunucuyu daima uyanık ve sıcak tutar.
  const targetUrls = [
    process.env.RENDER_EXTERNAL_URL,
    process.env.PUBLIC_APP_URL,
    'https://uygulama-deneme-1.onrender.com',
    'https://kamu-ilan-asistani.onrender.com',
  ].filter(Boolean) as string[];
  const uniqueUrls = [...new Set(targetUrls)];
  const PING_INTERVAL = 8 * 60 * 1000;
  setInterval(async () => {
    for (const url of uniqueUrls) {
      try {
        const res = await axios.get(`${url}/api/health`, { timeout: 10000 });
        console.log(`[keep-alive] 🏓 Self-ping başarılı (${res.data?.uptime}s uptime): ${url}/api/health`);
        break;
      } catch (err: any) {
        // Sıradaki URL denenecek
      }
    }
  }, PING_INTERVAL);
});
