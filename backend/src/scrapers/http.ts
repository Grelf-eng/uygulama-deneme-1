import axios from 'axios';

const client = axios.create({
  timeout: 8000, // 8 saniye (eskiden 20 saniyeydi, donmalara yol açıyordu)
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },
  maxRedirects: 5,
  responseType: 'arraybuffer',
});

/** Yanıtı doğru karakter kümesiyle çözer (memurlar.net gibi siteler windows-1254 kullanır). */
export function decodeBody(buf: Buffer, contentType = ''): string {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = buf.subarray(0, 4096).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  charset = (charset ?? 'utf-8').toLowerCase();
  if (charset === 'iso-8859-9' || charset === 'latin5') charset = 'windows-1254';
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await client.get<ArrayBuffer>(url);
  return decodeBody(Buffer.from(res.data), String(res.headers['content-type'] ?? ''));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
