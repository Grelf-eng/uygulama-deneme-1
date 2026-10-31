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
});
