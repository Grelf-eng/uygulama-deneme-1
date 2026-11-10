import { norm } from '../utils/text';

export interface CertificateDef {
  /** Kullanıcıya gösterilen standart ad */
  name: string;
  /** Normalize edilmiş (küçük harf, aksansız) metinde aranan desenler */
  patterns: RegExp[];
}

const def = (name: string, ...patterns: RegExp[]): CertificateDef => ({ name, patterns });

/** Sürücü belgesi sınıfları (ilanlarda "E sınıfı ehliyet" gibi geçer) */
const DRIVER_CLASSES = ['B', 'C', 'D', 'E'] as const;
export const DRIVER_ANY = 'Sürücü Belgesi (Herhangi Sınıf)';
const driverClassName = (c: string) => `${c} Sınıfı Sürücü Belgesi`;

/**
 * Kamu ilanlarında sık geçen sertifika / belgeler. Profilde seçenek olarak sunulur,
 * ilan metninden de aynı desenlerle çıkarılır. Listede olmayanlar serbest metin olarak eklenebilir.
 */
export const CERTIFICATE_CATALOG: CertificateDef[] = [
  // Bilgisayar / büro
  def('Bilgisayar İşletmenliği Sertifikası', /bilgisayar isletmen/),
  def('Bilgisayar Programcılığı / Analist Programcı Belgesi', /bilgisayar programci|analist programci/),
  def('Bilgisayarlı Muhasebe Sertifikası', /bilgisayarli muhasebe/),
  def('Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi', /ust duzey sekreter|bilgisayar destekli sekreter/),
  def('Bilgisayar Operatörlüğü Sertifikası', /bilgisayar operator/),
  def('ECDL / ICDL Bilgisayar Kullanım Sertifikası', /\becdl\b|\bicdl\b/),
  def('Klavye (F/Q) Kullanma Belgesi', /\b[fq] ?klavye|klavye kullan/),

  // Güvenlik
  def('Özel Güvenlik Görevlisi Kimlik Kartı', /ozel guvenlik (gorevlisi )?(kimlik|sertifika|belge|egitim)|ozel guvenlik gorevlisi/),
  def('Silah Taşıma Belgesi (Silahlı Özel Güvenlik)', /silahli (ozel )?guvenlik|silah tasima/),

  // Sürücü / operatör
  ...DRIVER_CLASSES.map((c) =>
    def(driverClassName(c), new RegExp(`(^|[^a-z])${c.toLowerCase()} ?sinifi? (surucu|ehliyet)`)),
  ),
  def(DRIVER_ANY, /surucu belge|ehliyet/),
  def('SRC Belgesi', /\bsrc ?[1-5]?\b/),
  def('Psikoteknik Belgesi', /psikoteknik/),
  def('Forklift Operatörü Belgesi', /forklift/),
  def('Vinç Operatörü Belgesi', /\bvinc\b/),
  def('İş Makinesi Operatörü Belgesi', /is makine(si)? operator|ekskavator|greyder|dozer|kepce operator/),

  // Teknik / meslek
  def('Havuz Suyu Operatörü Belgesi', /havuz (suyu )?operator|havuz gorevlisi/),
  def('Kalorifer Ateşçisi / Kazan Operatörü Belgesi', /kalorifer|atesci|kazan operator/),
  def('Kaynakçı Belgesi', /kaynakci|kaynak(cilik)? belge/),
  def('Elektrik Tesisatçılığı / Ustalık Belgesi', /elektrik (tesisat|ustalik|ehliyet)|elektrikci belge/),
  def('Sıhhi Tesisatçı Belgesi', /sihhi tesisat|tesisatci belge|su tesisat/),
  def('Doğalgaz Tesisat Sertifikası', /dogalgaz (ic )?tesisat/),
  def('Mesleki Yeterlilik Belgesi (MYK)', /\bmyk\b|mesleki yeterlilik/),
  def('Ustalık Belgesi', /ustalik belge/),
  def('Kalfalık Belgesi', /kalfalik/),
  def('Aşçılık Belgesi', /ascilik|asci (belge|sertifika)/),
  def('Gassallık Belgesi', /gassal/),
  def('Dalgıç Belgesi', /dalgic/),
  def('Meslek Odası Kayıt / Sicil Belgesi', /oda (kayit|sicil)|tmmob/),

  // Sağlık / güvenlik / spor
  def('İlkyardım Sertifikası', /ilk ?yardim (sertifika|belge|egitim)|temel yasam destegi/),
  def('Hasta / Yaşlı Bakım Sertifikası', /hasta bakim|yasli bakim/),
  def('Gıda Hijyen Sertifikası', /hijyen (egitim|sertifika|belge)|gida hijyen/),
  def('Yangın Eğitimi Sertifikası', /yangin (egitim|sondurme|guvenligi)/),
  def('İş Güvenliği Uzmanlık Belgesi', /is guvenligi uzman|isg (uzman|sertifika)/),
  def('Cankurtaran Belgesi', /can ?kurtaran/),
  def('Antrenörlük / Yüzme Eğitmenliği Belgesi', /antrenor|yuzme egitmen/),

  // Dil
  def('Yabancı Dil Belgesi (YDS / YÖKDİL)', /\byds\b|\bkpds\b|yokdil|yabanci dil (belge|sinav)/),
];

export const CERTIFICATE_NAMES = CERTIFICATE_CATALOG.map((c) => c.name);

const catalogByName = new Map(CERTIFICATE_CATALOG.map((c) => [c.name, c]));

/** Metni katalogdaki standart ada çevirir; katalogda yoksa temizlenmiş halini döndürür. */
export function canonicalCertificate(text: string): string {
  const exact = CERTIFICATE_NAMES.find((n) => norm(n) === norm(text));
  if (exact) return exact;
  const n = norm(text);
  // Sınıflı sürücü belgeleri genel "ehliyet" desenine takılmasın diye sırayla (özelden genele) denenir
  for (const def of CERTIFICATE_CATALOG) if (def.patterns.some((p) => p.test(n))) return def.name;
  return text.replace(/\s+/g, ' ').trim();
}

const NOISE_WORDS = /\b(sertifikasi|sertifika|belgesi|belge|kursu|kurs|kimlik karti|karti)\b/g;
const certKey = (s: string) => norm(s).replace(NOISE_WORDS, ' ').replace(/\s+/g, ' ').trim();

const isDriverClass = (name: string) => DRIVER_CLASSES.some((c) => name === driverClassName(c));

/** Kullanıcının sertifikası, ilanın istediği sertifikayı karşılıyor mu? */
export function certificatesMatch(have: string, required: string): boolean {
  const a = canonicalCertificate(have);
  const b = canonicalCertificate(required);
  if (norm(a) === norm(b)) return true;
  // "Ehliyet (sınıf belirtilmemiş)" istenirse herhangi bir sınıf yeterli
  if (b === DRIVER_ANY && isDriverClass(a)) return true;
  const ka = certKey(a);
  const kb = certKey(b);
  return ka.length >= 5 && kb.length >= 5 && (ka.includes(kb) || kb.includes(ka));
}

/** İlanda geçen genel ifadeler (sertifika sayılmaz) */
const BOILERPLATE =
  /mezuniyet|diploma|docentlik|doktora|lisans|yuksek|mezun|unvan|askerlik|adli|sicil|saglik|kimlik|ikamet|yerlesim|nufus|basvuru|sonuc|kpss|ales|denklik|deneyim|hizmet|sgk|sigorta|gelir|ogrenci|durum|fotograf|dilekce|ilgili|gecerli|\bait\b|iliskin|\bbu\b|ilan|asil|ornek|fotokopi|onayli|devlet|\bve\b|\bile\b|\bolan\b|olarak|\bicin\b|tarihli|sayili|\bvb\b|gibi|\bher\b|\bbir\b|kurum|belgeler|belgenin|yukarida|asagida|ekli|istenen|aranan|sinav|puan|kayit|bilgi|\bevrak|teslim|cezai|tebligat|vekalet|taahhut|beyan|\beksik\b|yapilmayan|fazla|sahte|yanlis|hatali|onaysiz|gecersiz|sureli|sureti|yeterli|yetersiz|gerekli|zorunlu|talep|soz\s*konusu|mezkur|muaf|orijinal|kanitlayan|gosterir|dair|dosyasi|coklu|uygulamasi|uzerinden|alincak|not\s*dokum|orcid/;

const CERT_NOUN = /([\p{L}0-9/\-]+(?: [\p{L}0-9/\-]+){0,3}) (sertifika(?:sı|sına|sını|lı)?|belge(?:si|sine|sini|li)?)(?![\p{L}])/gu;

export interface ExtractedCertificates {
  certificates: string[];
  /** "A veya B" biçimindeyse 'any', aksi halde 'all' */
  mode: 'all' | 'any';
}

const titleCaseTr = (s: string) =>
  s.split(' ').map((w) => (w ? w[0].toLocaleUpperCase('tr') + w.slice(1) : w)).join(' ');

/** İlan metninden aranan sertifika/belgeleri çıkarır. */
export function extractCertificates(title: string, text: string): ExtractedCertificates {
  const full = `${title}. ${text}`;
  const found: string[] = [];
  const add = (name: string) => {
    if (!found.some((f) => certificatesMatch(f, name) && certificatesMatch(name, f))) found.push(name);
  };

  // 1) Katalog eşleşmeleri
  const n = norm(full);
  for (const def of CERTIFICATE_CATALOG) if (def.patterns.some((p) => p.test(n))) add(def.name);
  // Sınıfı belli sürücü belgesi varsa genel ehliyet satırını at
  if (found.some(isDriverClass)) {
    const i = found.indexOf(DRIVER_ANY);
    if (i >= 0) found.splice(i, 1);
  }

  // 2) Katalog dışı "... Sertifikası / ... Belgesi" ifadeleri (kapsamı dar tutulur)
  const lower = full.toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  let custom = 0;
  for (const m of lower.matchAll(CERT_NOUN)) {
    if (custom >= 4) break;
    const phrase = m[1].trim();
    const np = norm(phrase);
    if (np.length < 5 || BOILERPLATE.test(np) || /\b(eksik|yapilmayan|onaysiz|gecersiz|sahte|yanlis|hatali|dair|gosterir|kanitlayan)\b/.test(np)) continue;
    if (CERTIFICATE_CATALOG.some((d) => d.patterns.some((p) => p.test(norm(`${phrase} ${m[2]}`))))) continue;
    const noun = m[2].startsWith('sertifika') ? 'Sertifikası' : 'Belgesi';
    const name = `${titleCaseTr(phrase)} ${noun}`;
    if (!found.some((f) => certKey(f) === certKey(name))) {
      found.push(name);
      custom++;
    }
  }

  // 3) Cümlede birden fazla sertifika "veya" ile bağlanmışsa herhangi biri yeterli
  let mode: 'all' | 'any' = 'all';
  if (found.length > 1) {
    const mentions = (ns: string, name: string) => {
      const d = catalogByName.get(name);
      return d ? d.patterns.some((p) => p.test(ns)) : ns.includes(certKey(name));
    };
    for (const sentence of full.split(/[.;\n]/)) {
      const ns = norm(sentence);
      const hits = found.filter((f) => mentions(ns, f)).length;
      if (hits >= 2 && /\bveya\b|\bya da\b|\byahut\b|\bveyahut\b/.test(ns)) {
        mode = 'any';
        break;
      }
    }
  }
  return { certificates: found.slice(0, 8), mode };
}

export function describeCatalog(): string[] {
  return CERTIFICATE_NAMES.filter((n) => n !== DRIVER_ANY);
}
