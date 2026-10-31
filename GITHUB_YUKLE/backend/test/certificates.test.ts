import assert from 'node:assert/strict';
import {
  canonicalCertificate,
  certificatesMatch,
  extractCertificates,
} from '../src/constants/certificates';

// Katalog: kullanıcının verdiği örnekler
const a = extractCertificates(
  'Bilgisayar İşletmeni Alımı',
  'Bilgisayar İşletmenliği Sertifikası, Bilgisayar Programcılığı / Analist Programcı Belgesi, ' +
    'Bilgisayarlı Muhasebe Sertifikası ve Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi sahibi olmak.',
);
for (const n of [
  'Bilgisayar İşletmenliği Sertifikası',
  'Bilgisayar Programcılığı / Analist Programcı Belgesi',
  'Bilgisayarlı Muhasebe Sertifikası',
  'Bilgisayar Destekli Üst Düzey Sekreterlik Belgesi',
]) assert.ok(a.certificates.includes(n), `bulunamadı: ${n} → ${a.certificates.join(' | ')}`);
assert.equal(a.mode, 'all');

// "veya" ile bağlı → biri yeterli
const b = extractCertificates('Büro Personeli', 'Bilgisayar İşletmenliği Sertifikası veya Bilgisayarlı Muhasebe Sertifikası sahibi olmak.');
assert.equal(b.mode, 'any');
assert.equal(b.certificates.length, 2);

// Havuz suyu operatörü
const c = extractCertificates('Havuz Görevlisi Alımı', 'Havuz Suyu Operatörü Belgesine sahip olmak.');
assert.deepEqual(c.certificates, ['Havuz Suyu Operatörü Belgesi']);

// Sürücü belgesi: sınıf belli ise genel ehliyet satırı yok
const d = extractCertificates('Şoför Alımı', 'E sınıfı ehliyete sahip, SRC belgeli olmak.');
assert.deepEqual(d.certificates.sort(), ['E Sınıfı Sürücü Belgesi', 'SRC Belgesi']);
const e = extractCertificates('Şoför Alımı', 'Geçerli sürücü belgesine sahip olmak.');
assert.deepEqual(e.certificates, ['Sürücü Belgesi (Herhangi Sınıf)']);

// Katalog dışı belge (genel ifade)
const f = extractCertificates('Teknisyen', 'Asansör Bakım Teknisyeni Belgesi sahibi olmak.');
assert.ok(f.certificates.some((x) => x.includes('Asansör Bakım Teknisyeni')), f.certificates.join('|'));

// Genel evrak ifadeleri sertifika sayılmaz
const g = extractCertificates('Memur Alımı', 'Mezuniyet belgesi, askerlik durum belgesi, adli sicil belgesi, sağlık durumu belgesi ve KPSS sonuç belgesi istenir.');
assert.deepEqual(g.certificates, []);

// Eşleştirme
assert.ok(certificatesMatch('Bilgisayar İşletmenliği', 'Bilgisayar İşletmenliği Sertifikası'));
assert.ok(certificatesMatch('havuz operatörü belgesi', 'Havuz Suyu Operatörü Belgesi'));
assert.ok(certificatesMatch('B Sınıfı Sürücü Belgesi', 'Sürücü Belgesi (Herhangi Sınıf)'));
assert.ok(!certificatesMatch('B Sınıfı Sürücü Belgesi', 'E Sınıfı Sürücü Belgesi'));
assert.ok(!certificatesMatch('Aşçılık Belgesi', 'Kaynakçı Belgesi'));
assert.equal(canonicalCertificate('bilgisayar programcılığı'), 'Bilgisayar Programcılığı / Analist Programcı Belgesi');

console.log('✅ sertifika testleri geçti');
