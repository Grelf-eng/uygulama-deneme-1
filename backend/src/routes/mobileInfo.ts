import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../config';
import { generateQrSvg } from '../utils/qrSvg';

export const mobileInfoRouter = Router();

interface StoredMobileLinks {
  tunnelUrl?: string | null;
  expoUrl?: string | null;
  updatedAt?: string;
}

function getLanIps(): string[] {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(nets)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function readStoredLinks(): StoredMobileLinks {
  try {
    const file = path.join(path.dirname(config.dbPath), 'mobile-links.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredMobileLinks;
  } catch {
    return {};
  }
}

mobileInfoRouter.get('/mobile-info', (req, res) => {
  const host = req.get('host') || 'uygulama-deneme-1.onrender.com';
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const currentDomainUrl = `${proto}://${host}`;

  const ips = getLanIps();
  const lanIp = ips[0] ?? '192.168.1.31';
  const lanUrl = `http://${lanIp}:${config.port}`;
  const stored = readStoredLinks();
  
  // Bulutta çalışırken (Render) doğrudan canlı alan adını, yerelde ise tünel veya LAN URL'ini kullan
  const isCloud = host.includes('onrender.com') || host.includes('railway.app') || process.env.NODE_ENV === 'production';
  const primaryInstallUrl = isCloud ? currentDomainUrl : (stored.tunnelUrl || lanUrl);

  const publicDir = fs.existsSync(path.join(process.cwd(), 'public'))
    ? path.join(process.cwd(), 'public')
    : path.join(__dirname, '..', '..', 'public');
  const apkFile = path.join(publicDir, 'kamu-ilan-asistani.apk');
  const apkAvailable = fs.existsSync(apkFile);
  const apkSizeKb = apkAvailable ? Math.round(fs.statSync(apkFile).size / 1024) : null;

  res.json({
    appName: 'Kamu İlan Asistanı',
    lanIp,
    lanUrl,
    lanApkUrl: `${lanUrl}/kamu-ilan-asistani.apk`,
    tunnelUrl: isCloud ? currentDomainUrl : (stored.tunnelUrl ?? null),
    tunnelApkUrl: `${primaryInstallUrl}/kamu-ilan-asistani.apk`,
    primaryInstallUrl,
    apkAvailable,
    apkSizeKb,
    apkDownloadUrl: `${primaryInstallUrl}/kamu-ilan-asistani.apk`,
    expoUrl: stored.expoUrl ?? `exp://${lanIp}:8081`,
    updatedAt: stored.updatedAt ?? null,
  });
});

mobileInfoRouter.get('/qr.svg', (req, res) => {
  const text = String(req.query.text ?? '').trim();
  if (!text || text.length > 500) {
    res.status(400).send('Geçersiz metin');
    return;
  }
  const svg = generateQrSvg(text);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(svg);
});
