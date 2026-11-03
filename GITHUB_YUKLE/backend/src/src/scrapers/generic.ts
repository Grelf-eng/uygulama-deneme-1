import crypto from 'crypto';
import * as cheerio from 'cheerio';
import { NewJob } from '../types';
import { norm, todayISO } from '../utils/text';
import {
  beautifyTurkishText,
  buildStructuredFallbackDescription,
  extractStructuredText,
} from './format';
import { fetchHtml, sleep } from './http';
import { cleanListingTitle, extractInstitution, parseRequirements } from './parse';

export interface Scraper {
  name: string;
  /** false ise toplu çalıştırmada atlanır (yine de `npm run scrape -- <ad>` ile denenebilir) */
  enabled: boolean;
  run(): Promise<NewJob[]>;
}

export interface SourceConfig {
  /** Veritabanında `source` olarak saklanır */
  name: string;
  /** Kaynak erişilemiyorsa/ayarlanmadıysa false yapın */
  enabled?: boolean;
  /** İlan listesinin bulunduğu sayfalar */
  listUrls: string[];
  /** Kategori indeks sayfaları (içindeki kategori linkleri otomatik keşfedilip listUrls'e eklenir) */
  categoryIndexUrls?: string[];
  /** Keşfedilecek kategori URL deseni */
  categoryHrefFilter?: RegExp;
  /** Kategori bağlantılarını URL + link metnine göre seçen esnek eşleştirici */
  categoryLinkMatcher?: (absUrl: string, anchorText: string) => boolean;
  /** Kategori sayfalarındaki sayfalama (2, 3, 4...) bağlantılarını seçen eşleştirici */
  paginationLinkMatcher?: (absUrl: string, anchorText: string) => boolean;
  /** En fazla taranacak kategori + sayfalama liste sayfası adedi */
  maxListPages?: number;
  /** Liste sayfasındaki link (mutlak URL) bu desene uymalı */
  hrefFilter: RegExp;
  /** Bu desene uyan başlıklar atlanır (sonuç duyurusu, iptal vb.) */
  excludeTitle?: RegExp;
  /** Detay sayfasında ilan gövdesinin bulunduğu CSS seçiciler (ilk eşleşen kullanılır) */
  contentSelectors?: string[];
  /** Kurum adı bulunamazsa kullanılacak varsayılan */
  defaultInstitution?: string;
  maxItems?: number;
  /** URL her istekte değişiyorsa (oturum/şifreli token) kimliği başlıktan üret */
  idFromTitle?: boolean;
  /** Detay sayfasına gitmeden sadece liste başlığından ilan oluştur */
  listOnly?: boolean;
  /** Detay bağlantısı dışarıdan açıldığında çalışmıyorsa (ör. oturum/token) kullanıcıyı bu adrese yönlendir */
  overrideJobUrl?: string;
}

const TITLE_KEYWORDS =
  /alim|alacak|personel|isci|sozlesmeli|memur|kadro|ogretim|uzman|mufettis|denetci|denetmen|kontrolor|bekci|koruma|guvenlik|yardimcisi|muhafaza|zabita|itfaiye|kutuphaneci|subay|astsubay|erbas|temin|istihdam|muhendis|mimar|tekniker|teknisyen|hemsire|ebe|avukat|hakim|savci|kaymakam|sofor|operator|hizmetli|gorevlisi|katibi|mubasir|ogretmen|okutman|arastirmaci|bursiyer|psikolog|diyetisyen|fizyoterapist|antrenor|sekreter|bilisim|programci|cozumleyici|uzmani|sef|giris sinavi|sinav ilani/;

export const ALWAYS_EXCLUDE =
  /iptal|sonuc|yerlesen|yedek|mulakat sonuc|mulakat tarih|mulakat yer|etik ilkeleri|kimlik karti|teskilat semasi|dagilim cetveli|arastirmasi formu|yer degisikligi|unvan degisikligi|gorevde yukselme|nakil|feragat|internet sitesi|sayfasi yayina|odullendir|tebligler dergisi|atama kuralari|kura islemleri|kura cekimi|istenilen belgeler|kazanan aday|ogrenci alim|yatay gecis|lisansustu basvuru|yurt disi burs|yaz okulu|mudurlerimiz|misafir ettik|^yonetim hizmetleri genel mudurlugu$/;

const MONTHS = [
  'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
  'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
];

/** Liste satırındaki "28 Ekim - 11 Kasım" veya "Son Başvuru: 11 Kasım" ifadesinden bitiş tarihini çıkarır. */
export function parseListDeadline(text: string, now = new Date()): string | null {
  const nt = norm(text);
  const m = nt.match(
    new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})\\s*-\\s*(\\d{1,2})\\s+(${MONTHS.join('|')})`),
  );
  if (m) {
    const month = MONTHS.indexOf(m[4]);
    let year = now.getFullYear();
    const mk = (y: number) => new Date(Date.UTC(y, month, Number(m[3]))).toISOString().slice(0, 10);
    if (Date.parse(mk(year)) < now.getTime() - 60 * 86400000) year += 1;
    return mk(year);
  }
  const mSingle = nt.match(
    new RegExp(`(?:son\\s*basvuru|bitis)[^0-9]{0,20}(\\d{1,2})\\s+(${MONTHS.join('|')})(?:\\s+(20\\d{2}))?`),
  );
  if (mSingle) {
    const month = MONTHS.indexOf(mSingle[2]);
    let year = mSingle[3] ? Number(mSingle[3]) : now.getFullYear();
    const mk = (y: number) => new Date(Date.UTC(y, month, Number(mSingle[1]))).toISOString().slice(0, 10);
    if (!mSingle[3] && Date.parse(mk(year)) < now.getTime() - 90 * 86400000) year += 1;
    return mk(year);
  }
  return null;
}

/** Başlıkta veya yayın satırında eski yıllara (2014-2025) ait arşiv duyurusu olup olmadığını denetler (2024/2025 KPSS hariç). */
export function isArchivedOldAnnouncement(rawTitle: string, text: string): boolean {
  const nt = norm(rawTitle);
  if (!/\b202[6-9]\b/.test(nt)) {
    const titleNoKpss = nt.replace(/\b202[45]\s*(?:yili\s*)?kpss\b|\bkpss\s*(?:[a-z]+\s*)?202[45]\b/g, '');
    if (/\b(201\d|202[0-5])\b/.test(titleNoKpss)) return true;
  }

  const head = text.slice(0, 450);
  if (/yay[ıi]nlanma\s*tarihi\s*:\s*\d{1,2}\s+\S+\s+20(?:1\d|2[0-5])/i.test(head)) return true;
  if (/^\s*\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20(?:1\d|2[0-5])\b/u.test(head)) return true;
  return false;
}

const cleanOneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Liste sayfasından ilan linklerini toplayıp detay sayfalarını okuyan genel scraper.
 */
export function createScraper(cfg: SourceConfig): Scraper {
  return {
    name: cfg.name,
    enabled: cfg.enabled !== false,
    async run() {
      const { db } = await import('../db');
      const hasCachedJobStmt = db.prepare(
        'SELECT 1 FROM jobs WHERE url = ? AND length(description) >= 120 LIMIT 1',
      );

      const listQueue: string[] = [...cfg.listUrls];
      const visitedListUrls = new Set<string>(cfg.listUrls);
      const maxListPages = cfg.maxListPages ?? 35;

      if (cfg.categoryIndexUrls && (cfg.categoryHrefFilter || cfg.categoryLinkMatcher)) {
        for (const idxUrl of cfg.categoryIndexUrls) {
          try {
            const $ = cheerio.load(await fetchHtml(idxUrl));
            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              if (!href) return;
              const anchorText = cleanOneLine($(el).text());
              try {
                const abs = new URL(href.replace(/&amp;/g, '&'), idxUrl).toString().split('#')[0];
                const matched =
                  (cfg.categoryHrefFilter ? cfg.categoryHrefFilter.test(abs) : false) ||
                  (cfg.categoryLinkMatcher ? cfg.categoryLinkMatcher(abs, anchorText) : false);
                if (matched && !visitedListUrls.has(abs) && listQueue.length < maxListPages) {
                  visitedListUrls.add(abs);
                  listQueue.push(abs);
                }
              } catch {}
            });
          } catch (err) {
            console.warn(`[${cfg.name}] kategori indeksi alınamadı: ${idxUrl} – ${(err as Error).message}`);
          }
          await sleep(180);
        }
      }

      const links = new Map<string, { title: string; rowText: string }>();
      for (let i = 0; i < listQueue.length && i < maxListPages; i++) {
        const listUrl = listQueue[i];
        try {
          const $ = cheerio.load(await fetchHtml(listUrl));
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            const elClone = $(el).clone();
            elClone.find('*').append(' ');
            const anchorText = cleanOneLine(elClone.text());

            let abs: string;
            try {
              const rawHref = href.replace(/&amp;/g, '&');
              abs = new URL(rawHref, listUrl).toString().split('#')[0];
            } catch {
              return;
            }

            if (
              cfg.paginationLinkMatcher &&
              !visitedListUrls.has(abs) &&
              listQueue.length < maxListPages &&
              cfg.paginationLinkMatcher(abs, anchorText)
            ) {
              visitedListUrls.add(abs);
              listQueue.push(abs);
              return;
            }

            const nt = norm(anchorText);
            if (anchorText.length < 15 || !TITLE_KEYWORDS.test(nt) || ALWAYS_EXCLUDE.test(nt)) return;
            if (cfg.excludeTitle?.test(anchorText) || cfg.excludeTitle?.test(nt)) return;
            if (isArchivedOldAnnouncement(anchorText, '')) return;

            if (cfg.hrefFilter.test(abs) && !links.has(abs)) {
              const rowEl = $(el).closest('tr, li, article');
              const rowText = rowEl.length ? cleanOneLine(rowEl.text()).slice(0, 320) : anchorText;
              links.set(abs, { title: anchorText, rowText });
            }
          });
        } catch (err) {
          console.warn(`[${cfg.name}] liste alınamadı: ${listUrl} – ${(err as Error).message}`);
        }
        await sleep(150);
      }

      const uncachedEntries = [...links.entries()].filter(([url]) => {
        if (cfg.listOnly || cfg.overrideJobUrl) return true;
        return !hasCachedJobStmt.get(url);
      });
      const targetEntries = uncachedEntries.slice(0, cfg.maxItems ?? 30);
      if (listQueue.length > 1) {
        console.log(
          `[${cfg.name}] liste sayfası=${Math.min(listQueue.length, maxListPages)} toplam_link=${links.size} yeni_detay=${targetEntries.length}`,
        );
      }

      const jobs: NewJob[] = [];
      const concurrency = cfg.listOnly ? 1 : 4;
      let cursor = 0;

      const worker = async () => {
        while (cursor < targetEntries.length) {
          const idx = cursor++;
          const [url, { title: listTitle, rowText }] = targetEntries[idx];
          try {
            let title = listTitle;
            let structuredBody = '';
            if (!cfg.listOnly) {
              const $ = cheerio.load(await fetchHtml(url));
              const h1 = cleanOneLine($('h1').first().text());
              if (h1.length > 10 && TITLE_KEYWORDS.test(norm(h1))) title = h1;

              let root: cheerio.Cheerio<any> = $('body');
              for (const sel of cfg.contentSelectors ?? ['article', '.content', 'main']) {
                if ($(sel).length) {
                  root = $(sel).first();
                  break;
                }
              }
              const rawExtracted = extractStructuredText($, root).slice(0, 28000);
              if (
                /aradiginiz sayfa bulunamadi|\b404\b/.test(norm(title)) ||
                /aradiginiz sayfa bulunamadi/.test(norm(rawExtracted.slice(0, 300)))
              ) {
                await sleep(150);
                continue;
              }
              if (ALWAYS_EXCLUDE.test(norm(title)) || isArchivedOldAnnouncement(title, rawExtracted)) {
                await sleep(150);
                continue;
              }
              structuredBody = beautifyTurkishText(rawExtracted, cleanListingTitle(title));
              await sleep(160);
            }

            const cleanTitle = cleanListingTitle(title);
            const req = parseRequirements(cleanTitle, structuredBody);
            const deadline =
              req.deadline ??
              parseListDeadline(listTitle) ??
              parseListDeadline(rowText) ??
              parseRequirements('', rowText).deadline;

            // Son başvuru tarihi geçmiş ilanları kaydetme
            if (deadline && deadline < todayISO()) {
              continue;
            }

            const institution = extractInstitution(cleanTitle, structuredBody) ?? cfg.defaultInstitution ?? null;
            const finalUrl = cfg.overrideJobUrl ?? url;

            // Ana sayfaya yönlendiren (doğrudan ilan sayfası olmayan) bağlantıları kesinlikle kaydetme
            try {
              const parsedUrl = new URL(finalUrl);
              if (!parsedUrl.pathname || parsedUrl.pathname.replace(/\/+$/, '') === '') {
                continue;
              }
            } catch {
              continue;
            }

            const description =
              structuredBody.length >= 100
                ? structuredBody
                : buildStructuredFallbackDescription({
                    title: cleanTitle,
                    institution,
                    city: req.city,
                    jobType: req.jobType,
                    positions: req.positions,
                    kpssRequired: req.kpssRequired,
                    minKpssScore: req.minKpssScore,
                    kpssType: req.kpssType,
                    minEducation: req.minEducation,
                    deadline,
                    source: cfg.name,
                  });

            jobs.push({
              source: cfg.name,
              externalId: crypto
                .createHash('sha1')
                .update(cfg.idFromTitle ? norm(cleanTitle) : url)
                .digest('hex')
                .slice(0, 16),
              title: cleanTitle.slice(0, 250),
              institution,
              city: req.city,
              description,
              url: finalUrl,
              publishedAt: new Date().toISOString(),
              deadline,
              kpssRequired: req.kpssRequired,
              minKpssScore: req.minKpssScore,
              kpssType: req.kpssType,
              minEducation: req.minEducation,
              requiredDepartments: [],
              requiredCertificates: req.requiredCertificates,
              certificateMode: req.certificateMode,
              minExperienceYears: req.minExperienceYears,
              maxAge: req.maxAge,
              positions: req.positions,
              jobType: req.jobType,
            });
          } catch (err) {
            console.warn(`[${cfg.name}] detay alınamadı: ${url} – ${(err as Error).message}`);
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      return jobs;
    },
  };
}
