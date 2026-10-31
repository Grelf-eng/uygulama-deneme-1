import { Scraper, createScraper } from './generic';

/**
 * Resmi ve güvenilir kamu personel ilan kaynakları.
 */
export const scrapers: Scraper[] = [
  // Kamu İlan Platformu (kamuilan.sbb.gov.tr): Detay bağlantıları tek kullanımlık ASP.NET oturum
  // anahtarı içerdiğinden dışarıdan doğrudan ilan sayfası açılamamaktadır (404). Kullanıcıları
  // ana sayfaya yönlendirmemek için devre dışı bırakılmıştır; aynı ilanların tam metni ve doğrudan
  // ilan sayfaları memurlar kategorilerinden eksiksiz çekilmektedir.
  createScraper({
    name: 'kamuilan',
    enabled: false,
    listUrls: ['https://kamuilan.sbb.gov.tr/'],
    hrefFilter: /^https?:\/\/kamuilan\.sbb\.gov\.tr\/ilanDetay\.aspx\?kod=/,
    defaultInstitution: 'Kamu İlan Platformu',
    maxItems: 45,
    listOnly: true,
    idFromTitle: true,
  }),

  // Aile ve Sosyal Hizmetler Bakanlığı Personel Genel Müdürlüğü duyuruları (yalnızca güncel alımlar)
  createScraper({
    name: 'aile',
    listUrls: ['https://www.aile.gov.tr/pgm/duyurular'],
    hrefFilter: /^https?:\/\/www\.aile\.gov\.tr\/pgm\/duyurular\/.+/,
    excludeTitle:
      /taban|tavan|yer de[gğ]i[sş]tirme|g[oö]revde y[uü]kselme|[uü]nvan de[gğ]i[sş]ikli[gğ]i|sinav tarihi|s[oö]zl[uü] s[ıi]nav|yaz[ıi]l[ıi] s[ıi]nav|uygulama s[ıi]nav|uzman [oö][gğ]retmen|ba[sş][oö][gğ]retmen|s[uü]re uzat[ıi]m|kura|belgeler|201\d|202[0-5]|yerle[sş]en|yedek/i,
    defaultInstitution: 'Aile ve Sosyal Hizmetler Bakanlığı',
  }),

  // Adalet Bakanlığı Personel Genel Müdürlüğü (yalnızca güncel personel alım ilanları)
  createScraper({
    name: 'adalet',
    listUrls: ['https://pgm.adalet.gov.tr/'],
    hrefFilter: /^https?:\/\/pgm\.adalet\.gov\.tr\/Home\/SayfaDetay\/.+/,
    excludeTitle:
      /bürosu|müdürlüğümüz|şeması|projeler|emekli|kimlik|mülakat|internet sitesi|sayfası yayına|etik ilkeleri|hukuk mesleklerine|[oö]n s[ıi]nav|201\d|202[0-5]/i,
    defaultInstitution: 'Adalet Bakanlığı',
  }),

  // Sağlık Bakanlığı Yönetim Hizmetleri Genel Müdürlüğü (yalnızca güncel personel alım duyuruları)
  createScraper({
    name: 'saglik',
    listUrls: ['https://yhgm.saglik.gov.tr/'],
    hrefFilter: /^https?:\/\/yhgm\.saglik\.gov\.tr\/TR-\d+\/.+/,
    excludeTitle:
      /daire ba[sş]kanl[ıi][gğ][ıi]|te[sş]kilat|müdür yardımcıları|201\d|202[0-5]|yer de[gğ]i[sş]ikli[gğ]i|unvan de[gğ]i[sş]ikli[gğ]i|formu|cetveli|pdc|kuralar[ıi]|kuras[ıi]|devlet hizmeti|yandal|ydus/i,
    defaultInstitution: 'Sağlık Bakanlığı',
  }),

  // memurlar.net ilan portalı (sayfalar windows-1254 kodlamalı; http.ts çözümler).
  // Tüm aktif kategorileri (4/B, KPSS-A, KPSS-B, Mahalli, Akademik, Kalkınma Ajansı, Askeri, İşçi)
  // otomatik keşfeder; her kayıt doğrudan o ilanın kendi sayfasına (/ilan/<id>/<slug>.html) gider.
  createScraper({
    name: 'memurlar',
    listUrls: ['https://ilan.memurlar.net/'],
    categoryIndexUrls: ['https://ilan.memurlar.net/'],
    maxListPages: 55,
    categoryLinkMatcher: (absUrl, anchorText) => {
      try {
        const u = new URL(absUrl);
        if (u.hostname !== 'ilan.memurlar.net') return false;
        const p = u.pathname;
        if (!p || p === '/' || /^\/ilan\//i.test(p) || /^\/common\//i.test(p)) return false;
        if (/\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|gif|zip|rar|css|js)$/i.test(p)) return false;
        if (/^\/kategori\/(kamu-personeli|kpss|haberler|mevzuat|ogretmen|ozel-konular)\/?$/i.test(p)) {
          return false;
        }
        const combined = `${anchorText} ${p} ${u.search}`
          .toLowerCase()
          .replace(/ı/g, 'i')
          .replace(/ğ/g, 'g')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ö/g, 'o')
          .replace(/ç/g, 'c');
        if (
          /ogrenci|yatay[\s-]*gecis|yurt[\s-]*disi[\s-]*burs|yuksek[\s-]*lisans|doktora|ozel[\s-]*okul|reklam|iletisim|kunye|gizlilik|uyelik|giris|sss|yardim/.test(
            combined,
          )
        ) {
          return false;
        }
        return /\b(4\/b|4b|sozlesmeli|kpss|mahalli|belediye|akademik|askeri|isci|daimi|gecici|engelli|hukumlu|genel|kalkinma|sydv|memur|personel|kamu|ilan|ilanlar|ilanlari|tumu|tumunu)\b/.test(
          combined,
        );
      } catch {
        return false;
      }
    },
    paginationLinkMatcher: (absUrl, anchorText) => {
      try {
        const u = new URL(absUrl);
        if (u.hostname !== 'ilan.memurlar.net') return false;
        if (/^\/ilan\//i.test(u.pathname) || /^\/common\//i.test(u.pathname)) return false;
        const t = anchorText.trim().toLowerCase();
        return /^(?:[2-5]|sonraki|sonraki\s*sayfa|›|»|>>)$/.test(t);
      } catch {
        return false;
      }
    },
    hrefFilter: /^https?:\/\/ilan\.memurlar\.net\/ilan\/8(?:5[5-9]|[6-9]\d)\d{2}\/.+\.html$/,
    contentSelectors: ['.ilan-detay', '.Detail', '.detail', 'article', '#content', 'main'],
    maxItems: 300,
  }),

  createScraper({
    name: 'meb',
    enabled: false,
    listUrls: ['https://personel.meb.gov.tr/'],
    hrefFilter: /^https?:\/\/personel\.meb\.gov\.tr\/.+/,
    defaultInstitution: 'Milli Eğitim Bakanlığı',
  }),

  createScraper({
    name: 'iskur',
    enabled: false,
    listUrls: ['https://www.iskur.gov.tr/'],
    hrefFilter: /^https?:\/\/www\.iskur\.gov\.tr\/.+/,
    defaultInstitution: 'İŞKUR',
  }),

  createScraper({
    name: 'resmigazete',
    enabled: false,
    listUrls: ['https://www.resmigazete.gov.tr/'],
    hrefFilter: /^https?:\/\/(www\.)?resmigazete\.gov\.tr\/.+/,
    defaultInstitution: 'Resmi Gazete İlanı',
  }),
];
