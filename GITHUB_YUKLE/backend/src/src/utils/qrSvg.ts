import path from 'path';

interface QrInstance {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  modules: boolean[][];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require(path.resolve(__dirname, '../../vendor/QRCode')) as new (
  typeNumber: number,
  errorCorrectLevel: number,
) => QrInstance;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRErrorCorrectLevel = require(path.resolve(__dirname, '../../vendor/QRCode/QRErrorCorrectLevel')) as {
  L: number;
  M: number;
};

/** Verilen metin/URL için net vektörel SVG QR kodu üretir (dış servis gerektirmez) */
export function generateQrSvg(text: string, margin = 2): string {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + margin * 2;
  const rects: string[] = [];

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.modules[r][c]) {
        rects.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
    `<path d="${rects.join('')}" fill="#111827"/>`,
    `</svg>`,
  ].join('');
}
