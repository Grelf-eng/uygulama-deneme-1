import { EducationLevel } from '../types';
import { norm } from '../utils/text';

/**
 * Lisans ve üstü (Lisans, Yüksek Lisans, Doktora) eğitim seviyelerinde
 * serbest metin girişi kapalıdır; kullanıcı yalnızca bu resmi YÖK / ÖSYM KPSS
 * bölüm havuzundan seçim yapabilir.
 */
export const POOL_ONLY_EDUCATION_LEVELS: readonly EducationLevel[] = [
  'lisans',
  'yuksek_lisans',
  'doktora',
];

export function isPoolOnlyDepartmentLevel(level: EducationLevel | null | undefined): boolean {
  return Boolean(level && POOL_ONLY_EDUCATION_LEVELS.includes(level));
}

export const UNDERGRAD_PLUS_DEPARTMENTS: readonly string[] = [
  // Mühendislik ve Mimarlık
  'Adli Bilişim Mühendisliği',
  'Bilgisayar Mühendisliği',
  'Bilgisayar Bilimleri',
  'Bilişim Sistemleri Mühendisliği',
  'Biyomedikal Mühendisliği',
  'Biyomühendislik',
  'Çevre Mühendisliği',
  'Elektrik Mühendisliği',
  'Elektrik-Elektronik Mühendisliği',
  'Elektronik ve Haberleşme Mühendisliği',
  'Endüstri Mühendisliği',
  'Enerji Sistemleri Mühendisliği',
  'Fizik Mühendisliği',
  'Gemi İnşaatı ve Gemi Makineleri Mühendisliği',
  'Geomatik / Harita Mühendisliği',
  'Gıda Mühendisliği',
  'Havacılık ve Uzay Mühendisliği',
  'İç Mimarlık',
  'İç Mimarlık ve Çevre Tasarımı',
  'İmalat Mühendisliği',
  'İnşaat Mühendisliği',
  'İşletme Mühendisliği',
  'Jeofizik Mühendisliği',
  'Jeoloji Mühendisliği',
  'Kimya Mühendisliği',
  'Kontrol ve Otomasyon Mühendisliği',
  'Maden Mühendisliği',
  'Makine Mühendisliği',
  'Malzeme Bilimi ve Mühendisliği',
  'Matematik Mühendisliği',
  'Mekatronik Mühendisliği',
  'Metalurji ve Malzeme Mühendisliği',
  'Mimarlık',
  'Nükleer Enerji Mühendisliği',
  'Orman Endüstri Mühendisliği',
  'Orman Mühendisliği',
  'Otomotiv Mühendisliği',
  'Petrol ve Doğalgaz Mühendisliği',
  'Peyzaj Mimarlığı',
  'Polimer Malzeme Mühendisliği',
  'Raylı Sistemler Mühendisliği',
  'Su Ürünleri Mühendisliği',
  'Şehir ve Bölge Planlama',
  'Tekstil Mühendisliği',
  'Uçak Mühendisliği',
  'Yapay Zeka ve Veri Mühendisliği',
  'Yazılım Mühendisliği',
  'Ziraat Mühendisliği (Bahçe Bitkileri)',
  'Ziraat Mühendisliği (Bitki Koruma)',
  'Ziraat Mühendisliği (Tarım Ekonomisi)',
  'Ziraat Mühendisliği (Tarım Makineleri ve Teknolojileri)',
  'Ziraat Mühendisliği (Tarımsal Yapılar ve Sulama)',
  'Ziraat Mühendisliği (Tarla Bitkileri)',
  'Ziraat Mühendisliği (Toprak Bilimi ve Bitki Besleme)',
  'Ziraat Mühendisliği (Zootekni)',

  // Hukuk, İİBF ve Siyasal Bilgiler
  'Bankacılık ve Finans',
  'Bankacılık ve Sigortacılık (Lisans)',
  'Çalışma Ekonomisi ve Endüstri İlişkileri',
  'Ekonometri',
  'Ekonomi ve Finans',
  'Hukuk',
  'İktisat',
  'İnsan Kaynakları Yönetimi',
  'İşletme',
  'Kamu Yönetimi',
  'Lojistik Yönetimi',
  'Maliye',
  'Muhasebe ve Finans Yönetimi',
  'Sağlık Yönetimi',
  'Siyaset Bilimi ve Kamu Yönetimi',
  'Siyaset Bilimi ve Uluslararası İlişkiler',
  ' Sosyal Hizmet',
  'Turizm İşletmeciliği',
  'Uluslararası İlişkiler',
  'Uluslararası Ticaret ve Finansman',
  'Uluslararası Ticaret ve Lojistik',
  'Yönetim Bilişim Sistemleri (YBS)',

  // Sağlık Bilimleri, Tıp, Diş, Eczacılık, Veteriner
  'Acil Yardım ve Afet Yönetimi',
  'Beslenme ve Diyetetik',
  'Dil ve Konuşma Terapisi',
  'Diş Hekimliği',
  'Ebelik',
  'Eczacılık',
  'Ergoterapi',
  'Fizyoterapi ve Rehabilitasyon',
  'Gerontoloji',
  'Hemşirelik',
  'Odyoloji',
  'Ortez ve Protez',
  'Perfüzyon',
  'Tıp',
  'Veterinerlik',

  // Fen - Edebiyat ve Sosyal Bilimler
  'Aktüerya Bilimleri',
  'Amerikan Kültürü ve Edebiyatı',
  'Antropoloji',
  'Arap Dili ve Edebiyatı',
  'Arkeoloji',
  'Arşivcilik',
  'Astronomi ve Uzay Bilimleri',
  'Bilgi ve Belge Yönetimi',
  'Biyokimya',
  'Biyoloji',
  'Coğrafya',
  'Çağdaş Türk Lehçeleri ve Edebiyatları',
  'Çocuk Gelişimi (Lisans)',
  'Felsefe',
  'Fizik',
  'Fransız Dili ve Edebiyatı',
  'İngiliz Dili ve Edebiyatı',
  'İstatistik',
  'Kimya',
  'Kütüphanecilik',
  'Matematik',
  'Moleküler Biyoloji ve Genetik',
  'Mütercim ve Tercümanlık',
  'Psikoloji',
  'Sanat Tarihi',
  'Sosyoloji',
  'Tarih',
  'Türk Dili ve Edebiyatı',

  // Eğitim Fakültesi / Öğretmenlikler
  'Almanca Öğretmenliği',
  'Arapça Öğretmenliği',
  'Beden Eğitimi ve Spor Öğretmenliği',
  'Bilgisayar ve Öğretim Teknolojileri Öğretmenliği (BÖTE)',
  'Biyoloji Öğretmenliği',
  'Coğrafya Öğretmenliği',
  'Din Kültürü ve Ahlak Bilgisi Öğretmenliği',
  'Felsefe Grubu Öğretmenliği',
  'Fen Bilgisi Öğretmenliği',
  'Fizik Öğretmenliği',
  'Görsel Sanatlar / Resim-İş Öğretmenliği',
  'İlköğretim Matematik Öğretmenliği',
  'İngilizce Öğretmenliği',
  'Kimya Öğretmenliği',
  'Matematik Öğretmenliği (Ortaöğretim)',
  'Müzik Öğretmenliği',
  'Okul Öncesi Öğretmenliği',
  'Özel Eğitim Öğretmenliği',
  'Rehberlik ve Psikolojik Danışmanlık (PDR)',
  'Sınıf Öğretmenliği',
  'Sosyal Bilgiler Öğretmenliği',
  'Tarih Öğretmenliği',
  'Türk Dili ve Edebiyatı Öğretmenliği',
  'Türkçe Öğretmenliği',

  // İlahiyat, İletişim, Spor ve Sanat
  'Antrenörlük Eğitimi',
  'Gazetecilik',
  'Görsel İletişim Tasarımı',
  'Grafik Tasarımı',
  'Halkla İlişkiler ve Reklamcılık',
  'Halkla İlişkiler ve Tanıtım',
  'İlahiyat / İslami İlimler',
  'İletişim',
  'Radyo, Televizyon ve Sinema',
  'Rekreasyon',
  'Spor Yöneticiliği',
  'Yeni Medya ve İletişim',
].map((s) => s.trim()).sort((a, b) => a.localeCompare(b, 'tr'));

/** Ön Lisans (2 Yıllık MYO) programları seçenek havuzu */
export const ASSOCIATE_DEPARTMENTS: readonly string[] = [
  'Acil Durum ve Afet Yönetimi (Ön Lisans)',
  'Adalet',
  'Ağız ve Diş Sağlığı',
  'Alternatif Enerji Kaynakları Teknolojisi',
  'Ameliyathane Hizmetleri',
  'Anestezi',
  'Aşçılık',
  'Bankacılık ve Sigortacılık',
  'Bilgisayar Destekli Tasarım ve Animasyon',
  'Bilgisayar Programcılığı',
  'Bilgisayar Teknolojisi',
  'Bilişim Güvenliği Teknolojisi',
  'Biyomedikal Cihaz Teknolojisi',
  'Büro Yönetimi ve Yönetici Asistanlığı',
  'Ceza İnfaz ve Güvenlik Hizmetleri',
  'Çevre Koruma ve Kontrol',
  'Çocuk Gelişimi',
  'Dış Ticaret',
  'Diş Protez Teknolojisi',
  'Diyaliz',
  'Doğalgaz ve Tesisatı Teknolojisi',
  'Eczane Hizmetleri',
  'Elektrik',
  'Elektronik Teknolojisi',
  'Elektronörofizyoloji',
  'Engelli Bakımı ve Rehabilitasyon',
  'Evde Hasta Bakımı',
  'Fizyoterapi',
  'Gıda Teknolojisi',
  'Grafik Tasarımı (Ön Lisans)',
  'Halkla İlişkiler ve Tanıtım (Ön Lisans)',
  'Harita ve Kadastro',
  'İklimlendirme ve Soğutma Teknolojisi',
  'İlahiyat (Ön Lisans)',
  'İlk ve Acil Yardım (Paramedik)',
  'İnşaat Teknolojisi',
  'İnsan Kaynakları Yönetimi (Ön Lisans)',
  'İş Sağlığı ve Güvenliği',
  'İşletme Yönetimi',
  'Laborant ve Veteriner Sağlık',
  'Laboratuvar Teknolojisi',
  'Lojistik',
  'Makine',
  'Maliye (Ön Lisans)',
  'Mekatronik',
  'Mimari Restorasyon',
  'Muhasebe ve Vergi Uygulamaları',
  'Odyometri',
  'Optisyenlik',
  'Ormancılık ve Orman Ürünleri',
  'Otomotiv Teknolojisi',
  'Özel Güvenlik ve Koruma',
  'Patoloji Laboratuvar Teknikleri',
  'Posta Hizmetleri',
  'Radyoterapi',
  'Raylı Sistemler Teknolojisi',
  'Sağlık Kurumları İşletmeciliği',
  'Sivil Havacılık Kabin Hizmetleri',
  'Sivil Savunma ve İtfaiyecilik',
  'Sosyal Güvenlik',
  'Sosyal Hizmetler',
  'Tapu ve Kadastro',
  'Tıbbi Dokümantasyon ve Sekreterlik',
  'Tıbbi Görüntüleme Teknikleri',
  'Tıbbi Laboratuvar Teknikleri',
  'Turizm ve Otel İşletmeciliği',
  'Web Tasarımı ve Kodlama',
  'Yaşlı Bakımı',
  'Yerel Yönetimler',
].sort((a, b) => a.localeCompare(b, 'tr'));

/**
 * Verilen bölüm metnini ilgili eğitim seviyesinin seçenek havuzuyla eşleştirir.
 * Eşleşme bulunursa havuzdaki resmi adı döner, bulunamazsa null döner.
 */
export function resolveDepartmentFromPool(
  rawDept: string | null | undefined,
  level: EducationLevel | null | undefined,
): string | null {
  const cleaned = (rawDept ?? '').trim();
  if (!cleaned) return null;
  const targetPool =
    level === 'onlisans'
      ? ASSOCIATE_DEPARTMENTS
      : isPoolOnlyDepartmentLevel(level)
        ? UNDERGRAD_PLUS_DEPARTMENTS
        : [...UNDERGRAD_PLUS_DEPARTMENTS, ...ASSOCIATE_DEPARTMENTS];

  const n = norm(cleaned);
  // 1) Birebir normalize eşleşme
  const exact = targetPool.find((d) => norm(d) === n);
  if (exact) return exact;

  // 2) Parantez içi açıklaması hariç birebir eşleşme (örn. "Çocuk Gelişimi" -> "Çocuk Gelişimi (Lisans)")
  const withoutParens = targetPool.find((d) => norm(d.replace(/\([^)]*\)/g, '')) === n);
  if (withoutParens) return withoutParens;

  return null;
}
