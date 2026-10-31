import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Saf Node.js (zlib) ile bağımlılıksız PNG üretici
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function insideRoundedRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return Math.hypot(x - cx, y - cy) <= r;
}

/**
 * Kamu İlan Asistanı uygulama ikonu çizer:
 * Lacivert-mavi (#1d4ed8 -> #1e3a8a) zemin, beyaz resmi ilan belgesi ve yeşil onay rozeti.
 */
function renderAppIcon(size: number, opts: { maskable?: boolean; transparentBg?: boolean } = {}): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const pad = opts.maskable ? size * 0.12 : 0;
  const corner = opts.maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - pad) / (size - pad * 2);
      const ny = (y - pad) / (size - pad * 2);

      // Arka plan
      if (!opts.transparentBg) {
        if (!opts.maskable && !insideRoundedRect(x, y, 0, 0, size - 1, size - 1, corner)) {
          rgba[idx + 3] = 0;
          continue;
        }
        const t = (x + y) / (2 * size);
        rgba[idx] = Math.round(37 * (1 - t) + 23 * t);     // R
        rgba[idx + 1] = Math.round(99 * (1 - t) + 58 * t); // G
        rgba[idx + 2] = Math.round(235 * (1 - t) + 172 * t); // B
        rgba[idx + 3] = 255;
      }

      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;

      // Beyaz belge gövdesi
      if (insideRoundedRect(nx, ny, 0.24, 0.17, 0.72, 0.81, 0.06)) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;

        // Üst kırmızı-mavi resmi başlık şeridi
        if (insideRoundedRect(nx, ny, 0.31, 0.25, 0.65, 0.31, 0.02)) {
          rgba[idx] = 220;
          rgba[idx + 1] = 38;
          rgba[idx + 2] = 38;
        }
        // Belge satırları
        const lines = [
          [0.31, 0.38, 0.65, 0.42],
          [0.31, 0.47, 0.61, 0.51],
          [0.31, 0.56, 0.55, 0.60],
          [0.31, 0.65, 0.49, 0.69],
        ];
        for (const [lx0, ly0, lx1, ly1] of lines) {
          if (insideRoundedRect(nx, ny, lx0, ly0, lx1, ly1, 0.015)) {
            rgba[idx] = 147;
            rgba[idx + 1] = 197;
            rgba[idx + 2] = 253;
          }
        }
      }

      // Sağ alt yeşil uygunluk (✅) rozeti
      const badgeCx = 0.68;
      const badgeCy = 0.69;
      const dBadge = Math.hypot(nx - badgeCx, ny - badgeCy);
      if (dBadge <= 0.195) {
        if (dBadge > 0.17) {
          // Beyaz dış halka
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        } else {
          // Yeşil daire (#16a34a)
          rgba[idx] = 22;
          rgba[idx + 1] = 163;
          rgba[idx + 2] = 74;
          rgba[idx + 3] = 255;

          // Beyaz tik işareti
          const d1 = distToSegment(nx, ny, 0.605, 0.695, 0.66, 0.748);
          const d2 = distToSegment(nx, ny, 0.66, 0.748, 0.76, 0.635);
          if (Math.min(d1, d2) <= 0.026) {
            rgba[idx] = 255;
            rgba[idx + 1] = 255;
            rgba[idx + 2] = 255;
          }
        }
      }
    }
  }

  return encodePng(size, size, rgba);
}

const root = path.resolve(__dirname, '..', '..');
const webIconsDir = path.join(root, 'backend', 'public', 'icons');
const mobileAssetsDir = path.join(root, 'mobile', 'assets');

fs.mkdirSync(webIconsDir, { recursive: true });
fs.mkdirSync(mobileAssetsDir, { recursive: true });

fs.writeFileSync(path.join(webIconsDir, 'icon-192.png'), renderAppIcon(192));
fs.writeFileSync(path.join(webIconsDir, 'icon-512.png'), renderAppIcon(512));
fs.writeFileSync(path.join(webIconsDir, 'icon-maskable-512.png'), renderAppIcon(512, { maskable: true }));
fs.writeFileSync(path.join(webIconsDir, 'apple-touch-icon.png'), renderAppIcon(180, { maskable: true }));

fs.writeFileSync(path.join(mobileAssetsDir, 'icon.png'), renderAppIcon(1024, { maskable: true }));
fs.writeFileSync(path.join(mobileAssetsDir, 'adaptive-icon.png'), renderAppIcon(1024, { maskable: true, transparentBg: true }));
fs.writeFileSync(path.join(mobileAssetsDir, 'splash-icon.png'), renderAppIcon(512));

// Android APK mipmap ikonları
const apkRes = path.join(root, 'android-apk', 'res');
const mipmaps: [string, number][] = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];
for (const [folder, px] of mipmaps) {
  const dir = path.join(apkRes, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), renderAppIcon(px));
}
const apkWebIcons = path.join(root, 'android-apk', 'assets', 'www', 'icons');
fs.mkdirSync(apkWebIcons, { recursive: true });
fs.writeFileSync(path.join(apkWebIcons, 'icon-192.png'), renderAppIcon(192));

console.log('Tüm mobil uygulama ve APK ikonları başarıyla oluşturuldu.');
