import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';

const downloadsDir =
  'C:\\Users\\PC\\.gemini\\antigravity\\brain\\edbddfde-097f-49dc-981b-b504c58a45db\\scratch\\android-sdk\\downloads';

fs.mkdirSync(downloadsDir, { recursive: true });

function downloadFile(url: string, dest: string, maxRedirects = 6): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: { 'User-Agent': 'Mozilla/5.0KamuIlanBuilder/1.0' },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (maxRedirects <= 0) return reject(new Error('Çok fazla yönlendirme'));
          const nextUrl = new URL(res.headers.location, url).toString();
          return resolve(downloadFile(nextUrl, dest, maxRedirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} -> ${url}`));
        }
        const tmp = `${dest}.part`;
        const file = fs.createWriteStream(tmp);
        let downloaded = 0;
        const total = Number(res.headers['content-length'] || 0);
        let lastPct = -1;

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct >= lastPct + 25) {
              lastPct = pct;
              console.log(`  %${pct} (${Math.round(downloaded / 1048576)}/${Math.round(total / 1048576)} MB)`);
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmp, dest);
            resolve();
          });
        });
        file.on('error', (err) => {
          fs.rmSync(tmp, { force: true });
          reject(err);
        });
      },
    );
    req.on('error', reject);
  });
}

async function tryUrls(label: string, urls: string[], dest: string): Promise<void> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log(`[indir] Zaten mevcut: ${path.basename(dest)}`);
    return;
  }
  for (const u of urls) {
    try {
      console.log(`[indir] ${label}: ${u}`);
      await downloadFile(u, dest);
      console.log(`[indir] Tamamlandı: ${path.basename(dest)} (${Math.round(fs.statSync(dest).size / 1048576)} MB)`);
      return;
    } catch (e) {
      console.warn(`[indir] Deneme başarısız (${(e as Error).message}), alternatif deneniyor...`);
    }
  }
  throw new Error(`${label} indirilemedi`);
}

async function main() {
  await tryUrls(
    'OpenJDK 17 (Temurin x64)',
    ['https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'],
    path.join(downloadsDir, 'jdk17.zip'),
  );

  await tryUrls(
    'Android Build-Tools 34 (Windows)',
    [
      'https://dl.google.com/android/repository/build-tools_r34-windows.zip',
      'https://dl.google.com/android/repository/5219cc671e844de73762e969ace287c29d2e14cd.build-tools_r34-windows.zip',
      'https://dl.google.com/android/repository/build-tools_r33.0.2-windows.zip',
    ],
    path.join(downloadsDir, 'build-tools.zip'),
  );

  await tryUrls(
    'Android SDK Platform 34',
    [
      'https://dl.google.com/android/repository/platform-34-ext7_r02.zip',
      'https://dl.google.com/android/repository/platform-34_r03.zip',
      'https://dl.google.com/android/repository/platform-33_r03.zip',
    ],
    path.join(downloadsDir, 'platform.zip'),
  );

  console.log('✅ Tüm Android derleme araçları indirildi.');
}

main().catch((e) => {
  console.error('❌ Hata:', e.message);
  process.exit(1);
});
