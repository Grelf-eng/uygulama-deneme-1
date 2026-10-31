import cron from 'node-cron';
import { app } from './app';
import { config } from './config';
import { db } from './db';
import { runAllScrapers } from './scrapers';
import { seedSampleJobs } from './seed';
import { initCloudSync, syncLocalJobsToCloud } from './services/cloudDb';

// Neon PostgreSQL kalıcı veritabanı eşitlemesi
initCloudSync()
  .then(async () => {
    // Gerçek kamu ilanı sayısı 30'dan azsa, arka planda canlı taramayı hemen başlat!
    const realCount = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE source != 'ornek'").get() as { c: number })?.c || 0;
    if (realCount < 30 || config.scrapeOnStart) {
      console.log(`[startup] Gerçek ilan sayısı (${realCount}) az, canlı kamu ilanları taranıyor...`);
      runAllScrapers()
        .then(() => syncLocalJobsToCloud())
        .catch((e) => console.error('[startup] Tarama hatası:', e.message));
    }
  })
  .catch((e) => console.error('[cloud-db] Başlatma hatası:', e.message));

if (config.seedSample) {
  const n = seedSampleJobs();
  if (n) console.log(`[seed] ${n} örnek ilan eklendi`);
}

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
