import axios from 'axios';

const client = axios.create({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; KamuIlanBot/1.0; +kisisel-kullanim)',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
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
