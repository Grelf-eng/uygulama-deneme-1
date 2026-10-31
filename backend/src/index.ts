import cron from 'node-cron';
import { app } from './app';
import { config } from './config';
import { runAllScrapers } from './scrapers';
import { seedSampleJobs } from './seed';

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
