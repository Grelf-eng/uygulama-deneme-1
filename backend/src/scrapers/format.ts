import type * as cheerio from 'cheerio';
import { EDUCATION_LABELS, EducationLevel, JOB_TYPE_LABELS, JobType } from '../types';
import { norm } from '../utils/text';
import { formatKpssType } from '../constants/kpss';

const UPPER_ACRONYMS = new Set([
  'KPSS', 'ALES', 'YDS', 'YÖKDİL', 'ÖSYM', 'İŞKUR', 'TÜBİTAK', 'TÜRKAK', 'MSB', 'MEB',
  'SYDV', 'PTT', 'DSİ', 'OGM', 'KHK', 'SGK', 'TCDD', 'THY', 'TRT', 'BDDK', 'SPK', 'EPDK',
  'RTÜK', 'YÖK', 'KYK', 'AFAD', 'TOKİ', 'TİKA', 'YTB', 'TÜİK', 'MKE', 'ASELSAN', 'HAVELSAN',
  'ROKETSAN', 'TUSAŞ', 'BOTAŞ', 'TPAO', 'EÜAŞ', 'TEİAŞ', 'TEDAŞ', 'ÇAYKUR', 'TMO', 'TİGEM',
  'DHMİ', 'KGM', 'İETT', 'İSKİ', 'ASKİ', 'EGO', 'ESHOT', 'İZSU', 'OSKİ', 'MESKİ', 'SASKİ',
  'KASKİ', 'MASKİ', 'BUSKİ', 'KOSKİ', 'TİSKİ', 'TMSF', 'TSE', 'KTO', 'İTO', 'ATO', 'TCMB',
  'İller', 'A.Ş.', 'AŞ', 'LTD', 'ŞTİ', 'T.C.', 'TC', 'AB', 'BT', 'CBS',
]);

const LOWER_CONJUNCTIONS = new Set(['ve', 'ile', 'veya', 'ya', 'da', 'de', 'için', 'üzere']);

/**
 * Tamamı BÜYÜK HARF olan veya bozuk bitişik yazılmış ilan başlıklarını düzgün Türkçeye çevirir.
 * Örn: "ORTA ANADOLU KALKINMA AJANSI6 UZMAN, 1 DESTEK PERSONELİ ALACAK"
 *   -> "Orta Anadolu Kalkınma Ajansı 6 Uzman, 1 Destek Personeli Alacak"
 */
export function normalizeTurkishTitle(raw: string): string {
  let s = raw
    .replace(/\s+/g, ' ')
    // Tarih aralıklarını temizle: "(26.10.2026 ...)" veya "28 Ekim - 11 Kasım"
    .replace(/\s*\(\s*\d{1,2}[./\s].*$/, '')
    .replace(/\s*\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s*-\s*\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+.*$/, '')
    .replace(/\s*\(\s*$/, '')
    // Başta kalmış "04 Nisan 2019 " gibi tarih öneklerini temizle
    .replace(/^\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2}\s+/u, '')
    // Harf ve rakam bitişikliğini ayır: "AJANSI6" -> "AJANSI 6" (P3, P93, 4B hariç)
    .replace(/([A-ZÇĞİÖŞÜa-zçğıöşü]{3,})(\d+)/g, (m, w, d) => {
      if (/^(kpss|p|src|ek|a|b|c)$/i.test(w)) return m;
      return `${w} ${d}`;
    })
    // Virgül sonrası eksik boşluk: "Üyes,Alım" veya "Uzman,1"
    .replace(/,([^\s])/g, ', $1')
    // Kurum eki ile sonraki kelimenin bitişik kalması: "BAKANLIĞIDENİZ" -> "BAKANLIĞI DENİZ" (çekim ekleri hariç)
    .replace(
      /(BAKANLIĞI|Bakanlığı|MÜDÜRLÜĞÜ|Müdürlüğü|BAŞKANLIĞI|Başkanlığı|REKTÖRLÜĞÜ|Rektörlüğü|ÜNİVERSİTESİ|Üniversitesi|KURUMU|Kurumu|AJANSI|Ajansı|BELEDİYESİ|Belediyesi|KOMUTANLIĞI|Komutanlığı)(?!(?:NA|NDAN|NE|NDEN|NCA|NCE|NDA|NDE|NİN|NIN|NUN|NÜN|na|ndan|ne|nden|nca|nce|nda|nde|nin|nın|nun|nün)(?:\s|$|[,.:;)]))([A-ZÇĞİÖŞÜa-zçğıöşü]{2,})/gu,
      '$1 $2',
    )
    // Eksik nesne kalmış kamuilan başlıkları: "... 11 ALACAK" -> "... 11 PERSONEL ALACAK"
    .replace(/(\b\d+)\s+(ALACAK|alacak)\b/g, '$1 Personel $2')
    // Yazım bozukluğu düzeltmeleri ("Başkanlığ 15", "Öğretim Üyes, Alım", "Aş.")
    .replace(/(^|\s)Başkanlığ\s+/gu, '$1Başkanlığı ')
    .replace(/Öğretim\s+Üyes,\s*/giu, 'Öğretim Üyesi ')
    .replace(/\bA\.?[şs]\./giu, 'A.Ş.')
    .trim();

  // Tüm kelimelerin baş harflerini Türkçe uyumlu Başlık Düzenine (Title Case) getir
  s = s
    .split(' ')
    .map((word, idx) => {
      const cleanWord = word.replace(/^[,.;:()]+|[,.;:()]+$/g, '');
      if (!cleanWord) return word;
      const upper = cleanWord.toLocaleUpperCase('tr');
      if (UPPER_ACRONYMS.has(upper)) {
        return word.replace(cleanWord, upper === 'AŞ' ? 'A.Ş.' : upper);
      }
      const lower = word.toLocaleLowerCase('tr');
      if (idx > 0 && LOWER_CONJUNCTIONS.has(lower)) return lower;
      return lower.replace(/(^|[-(/])([a-zçğıöşü])/g, (_, p1, ch: string) => p1 + ch.toLocaleUpperCase('tr'));
    })
    .join(' ');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Cheerio kök elemanındaki HTML yapısını (paragraflar, listeler, tablolar, alt başlıklar)
 * kelimeleri birbirine yapıştırmadan okunaklı metne dönüştürür.
 */
export function extractStructuredText($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): string {
  const clone = root.clone();
  clone
    .find(
      'script, style, nav, footer, header, noscript, form, iframe, svg, button, .share, .social, .breadcrumb, .print, [class*="reklam"], [id*="reklam"], [class*="share"]',
    )
    .remove();

  // Tabloları satır satır "Hücre 1 • Hücre 2 • Hücre 3" biçimine çevir (bitişmeyi önler)
  clone.find('table').each((_, table) => {
    const rows: string[] = [];
    $(table)
      .find('tr')
      .each((__, tr) => {
        const cells: string[] = [];
        $(tr)
          .find('th, td')
          .each((___, cell) => {
            const cellText = $(cell).text().replace(/\s+/g, ' ').trim();
            if (cellText) cells.push(cellText);
          });
        if (cells.length > 0) {
          rows.push(cells.join(' • '));
        }
      });
    $(table).replaceWith(`\n\n${rows.join('\n')}\n\n`);
  });

  clone.find('br').replaceWith('\n');
  clone.find('hr').replaceWith('\n\n');
  clone.find('li').each((_, li) => {
    const t = $(li).text().replace(/\s+/g, ' ').trim();
    $(li).replaceWith(t ? `\n• ${t}\n` : '\n');
  });
  clone.find('h1, h2, h3, h4, h5, h6').each((_, h) => {
    const t = $(h).text().replace(/\s+/g, ' ').trim();
    $(h).replaceWith(t ? `\n\n${t}\n` : '\n');
  });
  clone.find('p, div, section, article, tr, blockquote').each((_, el) => {
    $(el).prepend('\n').append('\n');
  });
  clone.find('td, th, span, label, strong, b, a').each((_, el) => {
    $(el).append(' ');
  });

  return clone.text();
}

/**
 * Resmi Gazete / kurum kopyala-yapıştır kaynaklı bitişik yazıları, eksik boşlukları
 * ve sayfa içi gereksiz buton metinlerini temizleyip paragraflara ayırır.
 */
export function beautifyTurkishText(raw: string, title = ''): string {
  let s = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    // Başta yer alan tarih + Yazdır/Paylaş kalıntılarını temizle
    .replace(/^\s*\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2}\s*,\s*[A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+Ankara,\s*Türkiye)?\s*/iu, '')
    .replace(/\b(Yazdır|Paylaş|İlanı Paylaş|Facebook'ta Paylaş|Twitter'da Paylaş)\b/gi, '\n')
    // Noktadan hemen sonra boşluksuz başlayan büyük harf veya madde numarası: "yapılacaktır.1.1." / "edilecektir.II"
    .replace(/([a-zçğıöşü]{2,})\.(?=[A-ZÇĞİÖŞÜ])/g, '$1.\n\n')
    .replace(/([a-zçğıöşü]{2,})\.(?=\d{1,2}[.)\-])/g, '$1.\n')
    // Bitişik madde numaraları: "Şartları1) 657" veya "Şartları:1- 657"
    .replace(/([A-ZÇĞİÖŞÜa-zçğıöşü:]{3,})(\d{1,2}[)\-])\s+/g, '$1\n$2 ')
    // Kapanan parantezden hemen sonra bitişik başlayan kelime: "kadar)Kıdemli", ")konularında"
    .replace(/\)([A-ZÇĞİÖŞÜ][a-zçğıöşü])/g, ')\n• $1')
    .replace(/\)([A-ZÇĞİÖŞÜ]{2,})/g, ') $1')
    .replace(/\)([a-zçğıöşü]{4,})/g, ') $1')
    // Satır başında tek nokta ile yazılmış Resmi Gazete maddelerini "• " imine çevir
    .replace(/(^|\n)\.\s+(?=[A-ZÇĞİÖŞÜ0-9])/g, '$1• ')
    // Tek başına satırda kalmış bölüm numaralarını sonraki başlıkla birleştir ("1.\n\nBAŞVURU..." -> "1. BAŞVURU...")
    .replace(/(^|\n)(\d{1,2})\.\s*\n+\s*([A-ZÇĞİÖŞÜ]{3,})/g, '$1$2. $3')
    // İki nokta üst üste sonrası eksik boşluk (URL http:/https: ve saat 17:30 hariç)
    .replace(/(?<!https?|ftp):(?=[A-ZÇĞİÖŞÜa-zçğıöşü])/gi, ': ')
    .replace(/(?<!https?|ftp)(?<=[A-ZÇĞİÖŞÜa-zçğıöşü]):(?=[0-9])/gi, ': ')
    // Noktalı virgül ve virgül sonrası eksik boşluk (ondalık sayı 82,5 hariç)
    .replace(/;(?=[A-ZÇĞİÖŞÜa-zçğıöşü0-9])/g, '; ')
    .replace(/,(?=[A-ZÇĞİÖŞÜa-zçğıöşü])/g, ', ')
    // Harf ve sayı bitişikliği (P3, P93, P94, 4B, SRC1-5, A1-C2 hariç)
    .replace(/([A-ZÇĞİÖŞÜ]{4,})(\d+)/g, (m, w, d) => {
      if (/^(KPSS|KPSSP|ek)$/i.test(w)) return `${w} ${d}`;
      return `${w} ${d}`;
    })
    // KPSSP3 -> KPSS P3
    .replace(/\bKPSSP(\d{1,3})\b/gi, 'KPSS P$1')
    // Romen rakamlı veya numaralı ana bölüm başlıklarından önce satır başı
    .replace(/\s+((?:I|II|III|IV|V|VI|VII|VIII)\s*[-–.)]\s*[A-ZÇĞİÖŞÜ]{3,})/g, '\n\n$1')
    .replace(/\s+(BAŞVURU\s+(?:GENEL|ÖZEL|ŞARTLARI|ŞEKLİ|YERİ|TARİHLERİ))/g, '\n\n$1');

  // Satır içi fazla boşlukları sadeleştir ve mükerrer ardışık satırları kaldır
  const normTitle = norm(title);
  const outLines: string[] = [];
  for (const rawLine of s.split('\n')) {
    const line = rawLine.replace(/[ \t]+/g, ' ').trim();
    if (!line) {
      if (outLines.length > 0 && outLines[outLines.length - 1] !== '') {
        outLines.push('');
      }
      continue;
    }
    // İlk satır başlığın birebir tekrarıysa atla
    if (outLines.length === 0 && normTitle && norm(line) === normTitle) continue;
    const prevNonEmpty = [...outLines].reverse().find((l) => l !== '');
    if (prevNonEmpty && prevNonEmpty === line) continue;
    outLines.push(line);
  }

  while (outLines[0] === '') outLines.shift();
  while (outLines[outLines.length - 1] === '') outLines.pop();

  const joined = outLines.join('\n').replace(/\n{3,}/g, '\n\n');
  if (joined.length <= 12000) return joined;

  // 12.000 karakter sınırı aşılırsa cümle/satır sonundan kes (kelime ortasından asla kesme)
  const cut = joined.slice(0, 12000);
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return (lastBreak > 9000 ? cut.slice(0, lastBreak + 1) : cut).trim();
}

/**
 * Detay metni görsel/PDF tablo olarak sunulmuş veya sadece özet listesi olan ilanlar için
 * düzenli, okunaklı Türkçe açıklama metni üretir.
 */
export function buildStructuredFallbackDescription(opts: {
  title: string;
  institution: string | null;
  city: string | null;
  jobType: JobType;
  positions: number | null;
  kpssRequired: boolean | null;
  minKpssScore: number | null;
  kpssType: string | null;
  minEducation: EducationLevel | null;
  deadline: string | null;
  source: string;
}): string {
  const lines: string[] = [];
  lines.push(`📌 İlan Özeti: ${opts.title}`);
  lines.push('');
  if (opts.institution) lines.push(`• Kurum: ${opts.institution}`);
  if (opts.city) lines.push(`• Görev Yeri / İl: ${opts.city}`);
  lines.push(`• Kadro / İstihdam Türü: ${JOB_TYPE_LABELS[opts.jobType]}`);
  if (opts.positions) lines.push(`• Alınacak Personel Sayısı: ${opts.positions} kişi`);
  if (opts.minEducation) lines.push(`• Öğrenim Şartı: En az ${EDUCATION_LABELS[opts.minEducation]}`);

  if (opts.kpssRequired === false) {
    if (opts.jobType === 'akademik') {
      lines.push('• KPSS Durumu: KPSS şartı aranmaz (2547 sayılı Kanun kapsamında ALES / yabancı dil puanı esas alınır).');
    } else if (/bilisim personeli/i.test(norm(opts.title))) {
      lines.push('• KPSS Durumu: KPSS şartı zorunlu değildir (KPSS P3 puanı olmayan adayların puanı 70 kabul edilerek değerlendirilir).');
    } else {
      lines.push('• KPSS Durumu: KPSS puan şartı aranmamaktadır.');
    }
  } else if (opts.kpssRequired === true) {
    const scorePart = opts.minKpssScore ? ` (En az ${opts.minKpssScore} puan)` : ' (Taban puan ve puan türü kadro tablosunda belirtilmiştir)';
    const typeLabel = formatKpssType(opts.kpssType) || opts.kpssType;
    const typePart = typeLabel ? ` ${typeLabel}` : '';
    lines.push(`• KPSS Durumu: KPSS${typePart} puanı aranmaktadır${scorePart}.`);
  }

  if (opts.deadline) {
    lines.push(`• Son Başvuru Tarihi: ${opts.deadline}`);
  }

  lines.push('');
  if (opts.source === 'kamuilan') {
    lines.push(
      'ℹ️ Detaylı kadro dağılımı, özel nitelikler ve başvuru belgeleri Cumhurbaşkanlığı Strateji ve Bütçe Başkanlığı Kamu İlan Platformu (kamuilan.sbb.gov.tr) üzerinde yayımlanmaktadır. "Kamu İlan Listesine Git ↗" butonuyla resmi duyuruya ulaşabilirsiniz.',
    );
  } else {
    lines.push(
      'ℹ️ Bu ilanın kadro tablosu ve başvuru kılavuzu kurum tarafından görsel / PDF eki olarak yayımlanmıştır. Tüm özel şartları incelemek için "Resmi İlana Git ↗" butonuna dokunabilirsiniz.',
    );
  }

  return lines.join('\n');
}
