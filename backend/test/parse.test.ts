import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { beautifyTurkishText, extractStructuredText, normalizeTurkishTitle } from '../src/scrapers/format';
import { parseListDeadline } from '../src/scrapers/generic';
import { decodeBody } from '../src/scrapers/http';
import { parseRequirements } from '../src/scrapers/parse';

// Liste satırındaki tarih aralığı
const now = new Date('2026-10-28T00:00:00Z');
assert.equal(parseListDeadline('MARMARA ÜNİVERSİTESİ 63 SÖZLEŞMELİ PERSONEL ALACAK26 Ekim - 9 Kasım', now), '2026-11-09');
assert.equal(parseListDeadline('X 3 ALACAK28 Aralık - 5 Ocak', new Date('2026-12-30T00:00:00Z')), '2027-01-05');
assert.equal(parseListDeadline('tarih yok', now), null);

// Başlık normalleştirme ve bitişik yazı düzeltme
assert.equal(
  normalizeTurkishTitle('ORTA ANADOLU KALKINMA AJANSI6 UZMAN, 1 DESTEK PERSONELİ ALACAK'),
  'Orta Anadolu Kalkınma Ajansı 6 Uzman, 1 Destek Personeli Alacak',
);
assert.equal(
  normalizeTurkishTitle('TÜRKİYE İŞ KURUMU GENEL MÜDÜRLÜĞÜ 11 ALACAK'),
  'Türkiye İş Kurumu Genel Müdürlüğü 11 Personel Alacak',
);

// HTML tablo ve bitişik metin ayrıştırma
const $ = cheerio.load(
  '<div class="detail"><p>Açıktan alım yapılacaktır.1.1. Başvuru Özel Şartları</p>' +
    '<table><tr><th>Unvan</th><th>KPSS Türü</th><th>Taban Puan</th></tr><tr><td>Zabıta Memuru</td><td>P93</td><td>65</td></tr></table>' +
    '<p>(A Grubu, 4 katına kadar)Kıdemli Siber Güvenlik Uzmanı:1 kişi</p></div>',
);
const extracted = beautifyTurkishText(extractStructuredText($, $('.detail')));
assert.ok(!extracted.includes('yapılacaktır.1.1.'), 'nokta sonrası bitişik numara ayrılmalı');
assert.ok(!extracted.includes(')Kıdemli'), 'parantez sonrası bitişik kelime ayrılmalı');
assert.ok(extracted.includes('Zabıta Memuru • P93 • 65'), 'tablo hücreleri ayırıcıyla birleşmeli');
assert.ok(extracted.includes('Uzmanı: 1 kişi'), 'iki nokta sonrası boşluk eklenmeli');

// windows-1254 çözümleme (memurlar.net)
const latin5 = Buffer.from([0x53, 0xf6, 0x7a, 0x6c, 0x65, 0xfe, 0x6d, 0x65, 0x6c, 0xfd]);
assert.equal(decodeBody(latin5, 'text/html; charset=windows-1254'), 'Sözleşmeli'.replace('i', 'ı'));

const a = parseRequirements(
  'Ankara Üniversitesi 5 Sözleşmeli Bilişim Personeli Alım İlanı',
  'KPSS(B) grubundan KPSSP3 puan türünden en az 70 puan almış olmak. Lisans mezunu olmak. ' +
    'En az 2 yıl deneyim sahibi olmak. 35 yaşını doldurmamış olmak. Son başvuru tarihi: 15.11.2026',
);
assert.equal(a.kpssRequired, true);
assert.equal(a.minKpssScore, 70);
assert.equal(a.kpssType, 'P3');
assert.equal(a.minEducation, 'lisans');
assert.equal(a.minExperienceYears, 2);
assert.equal(a.maxAge, 35);
assert.equal(a.deadline, '2026-11-15');
assert.equal(a.city, 'Ankara');
assert.equal(a.jobType, 'sozlesmeli');

const b = parseRequirements(
  'İzmir Büyükşehir Belediyesi 40 Daimi İşçi Alımı',
  'İŞKUR aracılığıyla alınacak, KPSS şartı aranmamaktadır. İlkokul mezunu olmak.',
);
assert.equal(b.kpssRequired, false);
assert.equal(b.jobType, 'isci');
assert.equal(b.city, 'İzmir');
assert.equal(b.minEducation, 'ilkokul');

const c = parseRequirements('Adalet Bakanlığı Zabıt Katibi Alımı', 'Ön lisans veya lisans mezunu, KPSS P93 puanı 75 ve üzeri.');
assert.equal(c.minEducation, 'onlisans');
assert.equal(c.kpssType, 'P93');
assert.equal(c.minKpssScore, 75);

// Tablodan KPSS puanı ve Türkçe ay adıyla son başvuru tarihi çıkarma
const d = parseRequirements('İzmir Karşıyaka Belediyesi 6 Memur Alacak', extracted + '\nSon Başvuru Tarihi : 20 Kasım 2026');
assert.equal(d.kpssRequired, true);
assert.equal(d.minKpssScore, 65);
assert.equal(d.kpssType, 'P93');
assert.equal(d.deadline, '2026-11-20');

// Sözleşmeli bilişim: KPSS puanı olmayan da başvurabilir -> kpssRequired = false
const e = parseRequirements(
  'İŞKUR 11 sözleşmeli bilişim personeli alacak',
  'KPSS puanı olmayan da başvurabilecek. KPSS puanı olmayan ya da belge ibraz etmeyen adayın puanı 70 kabul edilecek.',
);
assert.equal(e.kpssRequired, false);

// Akademik kadrolarda KPSS aranmaz; memur/sözleşmeli özet ilanlarda KPSS aranır
const f = parseRequirements('Dokuz Eylül Üniversitesi 9 Öğretim Üyesi Alacak', '');
assert.equal(f.jobType, 'akademik');
assert.equal(f.kpssRequired, false);

const g = parseRequirements('Kültür ve Turizm Bakanlığı 162 Sözleşmeli Kütüphaneci Alacak', '');
assert.equal(g.jobType, 'sozlesmeli');
assert.equal(g.kpssRequired, true);

// MSB Muvazzaf Subay: "KPSS puanı istenmeyecek ... genel kültür sınavından en az 50 puan" -> kpssRequired = false
const h = parseRequirements(
  'MSB Deniz Kuvvetleri Komutanlığı 50 Muvazzaf Subay Alacak',
  'Deniz Sınıfı Muvazzaf Subay aday adaylarından KPSS puanı istenmeyecek ve genel kültür sınavından en az 50 puan alanlar değerlendirmeye alınacaktır.',
);
assert.equal(h.kpssRequired, false);

// "sona erecektir" ve "Başvuru Tarihleri: X - Y" biçimindeki son başvuru tarihleri
const i = parseRequirements(
  'Milli Saraylar İdaresi Başkanlığı 3 Sözleşmeli Personel Alacak',
  'KPSS P3 puanı aranmaktadır. Başvurular 28.10.2026 tarihinde başlayıp, 08.11.2026 tarihinde sona erecektir.',
);
assert.equal(i.deadline, '2026-11-08');
assert.equal(i.kpssRequired, true);

// Bitişik kurum adı ve kısaltma düzeltmeleri
assert.equal(
  normalizeTurkishTitle('MİLLİ SAVUNMA BAKANLIĞIDENİZ KUVVETLERİ KOMUTANLIĞINA SUBAY TEMİNİ'),
  'Milli Savunma Bakanlığı Deniz Kuvvetleri Komutanlığına Subay Temini',
);
assert.equal(
  normalizeTurkishTitle('İSTANBUL ELEKTRİK TRAMVAY VE TÜNEL İŞLETMELERİ (İETT) 44 MEMUR ALACAK'),
  'İstanbul Elektrik Tramvay ve Tünel İşletmeleri (İETT) 44 Memur Alacak',
);

console.log('✅ parse testleri geçti');
