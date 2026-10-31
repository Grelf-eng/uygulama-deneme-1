import zlib from 'zlib';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/**
 * Standart ZIP dosyasından (DOCX) belirtilen XML girdisini Central Directory üzerinden okur.
 */
function extractZipEntryText(buf: Buffer, entryName: string): string | null {
  // End of Central Directory (0x06054b50) imzasını sondan geriye doğru bul
  let eocdOffset = -1;
  const minPos = Math.max(0, buf.length - 65558);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  let pos = cdOffset;

  for (let idx = 0; idx < cdEntries && pos + 46 <= buf.length; idx++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    if (name !== entryName) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) return rawSlice.toString('utf8');
    if (method === 8) return zlib.inflateRawSync(rawSlice).toString('utf8');
    return null;
  }
  return null;
}

function extractDocxText(buf: Buffer): string {
  const parts: string[] = [];
  for (const xmlPath of ['word/header1.xml', 'word/document.xml', 'word/footer1.xml']) {
    const xml = extractZipEntryText(buf, xmlPath);
    if (!xml) continue;
    const text = decodeXmlEntities(
      xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<w:(?:br|cr)\b[^>]*\/?>/g, '\n')
        .replace(/<w:tab\b[^>]*\/?>/g, '  ')
        .replace(/<\/w:tc>/g, '  ')
        .replace(/<[^>]+>/g, ''),
    );
    parts.push(text);
  }
  return parts.join('\n').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function hexToUtf16String(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.length % 4 === 0) {
    let out = '';
    for (let i = 0; i < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    }
    return out;
  }
  return Buffer.from(clean, 'hex').toString('latin1');
}

function decodePdfLiteralString(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = s[++i];
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next >= '0' && next <= '7') {
      let oct = next;
      if (s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
      if (s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      out += next;
    }
  }
  // UTF-16BE BOM kontrolü
  if (out.length >= 2 && out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let u = '';
    for (let i = 2; i + 1 < out.length; i += 2) {
      u += String.fromCharCode((out.charCodeAt(i) << 8) | out.charCodeAt(i + 1));
    }
    return u;
  }
  return out;
}

function extractPdfText(buf: Buffer): string {
  const rawLatin = buf.toString('latin1');
  const decompressedStreams: string[] = [];

  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(rawLatin)) !== null) {
    const dict = m[1];
    const bodyLatin = m[2];
    if (/\/Subtype\s*\/Image/.test(dict)) continue;
    const bodyBuf = Buffer.from(bodyLatin, 'latin1');
    if (/\/FlateDecode/.test(dict)) {
      try {
        decompressedStreams.push(zlib.inflateSync(bodyBuf).toString('latin1'));
      } catch {
        try {
          decompressedStreams.push(zlib.inflateRawSync(bodyBuf).toString('latin1'));
        } catch {}
      }
    } else if (!/\/DCTDecode|\/JPXDecode/.test(dict)) {
      decompressedStreams.push(bodyLatin);
    }
  }

  // 1) ToUnicode CMap tablolarını topla (Türkçe karakter kodlamaları için)
  const cmap = new Map<number, string>();
  let keyHexLen = 4;
  for (const s of decompressedStreams) {
    if (!s.includes('beginbfchar') && !s.includes('beginbfrange')) continue;
    const bfCharRe = /beginbfchar([\s\S]*?)endbfchar/g;
    let cm: RegExpExecArray | null;
    while ((cm = bfCharRe.exec(s)) !== null) {
      const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let pm: RegExpExecArray | null;
      while ((pm = pairRe.exec(cm[1])) !== null) {
        keyHexLen = pm[1].length;
        cmap.set(parseInt(pm[1], 16), hexToUtf16String(pm[2]));
      }
    }
    const bfRangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((cm = bfRangeRe.exec(s)) !== null) {
      const rangeRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let rm: RegExpExecArray | null;
      while ((rm = rangeRe.exec(cm[1])) !== null) {
        keyHexLen = rm[1].length;
        const start = parseInt(rm[1], 16);
        const end = parseInt(rm[2], 16);
        let targetCode = parseInt(rm[3], 16);
        for (let code = start; code <= end && code - start < 512; code++) {
          cmap.set(code, String.fromCodePoint(targetCode++));
        }
      }
    }
  }

  const decodeHexToken = (hex: string): string => {
    const clean = hex.replace(/\s+/g, '');
    if (cmap.size > 0 && clean.length >= keyHexLen) {
      let out = '';
      const step = keyHexLen;
      for (let i = 0; i + step <= clean.length; i += step) {
        const code = parseInt(clean.slice(i, i + step), 16);
        out += cmap.get(code) ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : '');
      }
      if (out) return out;
    }
    return hexToUtf16String(clean);
  };

  // 2) BT ... ET metin bloklarını çöz
  const lines: string[] = [];
  for (const s of decompressedStreams) {
    if (s.includes('beginbfchar') || s.includes('beginbfrange')) continue;
    const btRe = /\bBT\b([\s\S]*?)\bET\b/g;
    let bm: RegExpExecArray | null;
    while ((bm = btRe.exec(s)) !== null) {
      const block = bm[1];
      let currentLine = '';
      const tokenRe =
        /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td|\bT\*/g;
      let tm: RegExpExecArray | null;
      while ((tm = tokenRe.exec(block)) !== null) {
        if (tm[1] !== undefined) {
          const arr = tm[1];
          const subRe = /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
          let sm: RegExpExecArray | null;
          while ((sm = subRe.exec(arr)) !== null) {
            if (sm[1] !== undefined) currentLine += decodePdfLiteralString(sm[1]);
            else if (sm[2] !== undefined) currentLine += decodeHexToken(sm[2]);
            else if (sm[3] !== undefined && Number(sm[3]) < -180) currentLine += ' ';
          }
        } else if (tm[2] !== undefined) {
          currentLine += decodePdfLiteralString(tm[2]);
        } else if (tm[3] !== undefined) {
          currentLine += decodeHexToken(tm[3]);
        } else {
          // Td (dikey hareket varsa yeni satır) veya T*
          const dy = tm[5] !== undefined ? Math.abs(Number(tm[5])) : 99;
          if (dy > 2) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = '';
          } else {
            currentLine += ' ';
          }
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
    }
  }

  return lines.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractTextFromUploadedFile(fileName: string, base64Data: string): string {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.docx') || (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50)) {
    const text = extractDocxText(buf);
    if (!text || text.length < 15) {
      throw new Error('DOCX dosyasından metin okunamadı. Dosyanın bozuk olmadığından emin olun.');
    }
    return text;
  }

  if (lower.endsWith('.pdf') || buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    const text = extractPdfText(buf);
    if (!text || text.replace(/\s+/g, '').length < 25) {
      throw new Error(
        'Bu PDF dosyası taranmış resim (görsel) formatında olduğu için metin seçilemedi. Lütfen CV metninizi kopyalayıp metin kutusuna yapıştırın veya .docx / .txt olarak yükleyin.',
      );
    }
    return text;
  }

  // TXT / MD / HTML
  let utf8 = buf.toString('utf8');
  if (utf8.includes('\uFFFD')) {
    try {
      utf8 = new TextDecoder('windows-1254').decode(buf);
    } catch {}
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    utf8 = utf8.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  }
  return utf8.replace(/\r\n/g, '\n').trim();
}
