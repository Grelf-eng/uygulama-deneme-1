// Kaynak sitelerin liste sayfalarını indirip yapılarını raporlar (scraper ayarı için).
// Çalıştırma: npx tsx scripts/probe.ts [--all] [--detail] url [url ...]
//   --all     : sadece ilan benzeri bağlantıları değil tüm uzun bağlantıları göster
//   --detail  : ilk ilan benzeri bağlantının detay sayfasının metnini de göster
import * as cheerio from 'cheerio';
import { fetchHtml } from '../src/scrapers/http';

const args = process.argv.slice(2);
const all = args.includes('--all');
const detail = args.includes('--detail');
const urls = args.filter((a) => !a.startsWith('--'));
const RELEVANT = /al[ıi]m|alacak|ilan[ıi]|personel|s[öo]zle[şs]meli|memur|i[şs][çc]i|kadro|ba[şs]vuru/i;

(async () => {
  for (const url of urls) {
    console.log(`\n===== ${url}`);
    try {
      const $ = cheerio.load(await fetchHtml(url));
      const anchors = $('a[href]')
        .map((_, el) => ({ href: $(el).attr('href')!, text: $(el).text().replace(/\s+/g, ' ').trim() }))
        .get()
        .filter((a) => a.text.length >= 15 && (all || RELEVANT.test(a.text)));
      console.log(`title="${$('title').text().trim().slice(0, 80)}" eşleşenBağlantı=${anchors.length}`);
      for (const a of anchors.slice(0, 15)) console.log(`  - ${a.text.slice(0, 85)}  ->  ${a.href.slice(0, 100)}`);
      if (detail && anchors[0]) {
        const durl = new URL(anchors[0].href, url).toString();
        const $$ = cheerio.load(await fetchHtml(durl));
        $$('script,style,nav,footer,header').remove();
        console.log(`\n  --- DETAY ${durl}\n  h1="${$$('h1').first().text().trim()}"`);
        console.log('  ' + $$('body').text().replace(/\s+/g, ' ').trim().slice(0, 900));
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      console.log('HATA:', err.code ?? '', err.message);
    }
  }
})();
