import { norm } from '../utils/text';

export interface EstimatedSalary {
  minSalary: number;
  maxSalary: number;
  averageSalary: number;
  rangeText: string;
  category: string;
  summary: string;
  benefits: string[];
  disclaimer: string;
}

export function estimateJobSalary(job: {
  title: string;
  institution?: string | null;
  jobType?: string | null;
  minEducation?: string | null;
  description?: string | null;
  city?: string | null;
}): EstimatedSalary {
  const fullText = `${job.title} ${job.institution || ''} ${job.jobType || ''} ${job.description || ''}`;
  const n = norm(fullText);
  const titleNorm = norm(job.title || '');

  // 1. Sözleşmeli Bilişim / Yazılım Personeli
  if (/\b(?:yazilim|bilisim|siber|programci|sistem\s*uzman|veritabani)\b/.test(n)) {
    return {
      minSalary: 68000,
      maxSalary: 115000,
      averageSalary: 88000,
      rangeText: '68.000 ₺ - 115.000 ₺ / Ay',
      category: 'Sözleşmeli Bilişim Personeli (375 KHK)',
      summary: 'Kamu kurumlarındaki sözleşmeli bilişim kadroları, 657 memur tavan ücretinin 2 ile 4 katına kadar brüt tavan katsayısı ile istihdam edilmektedir.',
      benefits: ['Tavan Ücret Katsayısı (2x - 4x)', 'Ek Proje Tazminatı', 'Geliştirme / Hibrit Çalışma İmkânı'],
      disclaimer: 'Tecrübe yılı ve bilinen yazılım dillerine göre tavan ücret katsayısı değişkenlik gösterir.',
    };
  }

  // 2. Doktor / Diş Hekimi / Eczacı
  if (/\b(?:uzman\s*tabip|tabip|doktor|dis\s*hekimi|eczaci)\b/.test(titleNorm)) {
    return {
      minSalary: 88000,
      maxSalary: 145000,
      averageSalary: 112000,
      rangeText: '88.000 ₺ - 145.000 ₺ / Ay',
      category: 'Sağlık Hizmetleri Sınıfı (Tabip Kadrosu)',
      summary: 'Temel memur maaşına ek olarak aylık sabit ek ödeme, taban ve teşvik ek ödemeleri ve nöbet ücretleri bordroya dahil edilir.',
      benefits: ['Taban ve Teşvik Ek Ödemesi', 'Sabit Ek Ödeme', 'Aylık Nöbet Ücretleri'],
      disclaimer: 'Hastane sınıfına, poliklinik/ameliyat teşvik katsayısına ve nöbet saatine göre toplam kazanç artar.',
    };
  }

  // 3. Akademik Personel (Prof, Doçent, Dr. Öğr. Üyesi, Öğr. Gör., Arş. Gör.)
  if (/\b(?:profesor|docent)\b/.test(titleNorm)) {
    return {
      minSalary: 82000,
      maxSalary: 118000,
      averageSalary: 96000,
      rangeText: '82.000 ₺ - 118.000 ₺ / Ay',
      category: 'Akademik Personel (2547 Sayılı Kanun)',
      summary: 'Kıdemli akademik unvan maaşına ek olarak akademik teşvik, ek ders ücretleri ve üniversite geliştirme ödeneği uygulanır.',
      benefits: ['Akademik Teşvik Ödeneği', 'Haftalık Ek Ders Ücretleri', 'Üniversite Geliştirme Ödeneği'],
      disclaimer: 'Yayınlanan makale sayısı ve ek ders yüküne göre aylık gelir farklılık gösterir.',
    };
  }
  if (/\b(?:doktor\s*ogretim|dr\.\s*ogr|dr\s*ogretim)\b/.test(titleNorm)) {
    return {
      minSalary: 65000,
      maxSalary: 78000,
      averageSalary: 71000,
      rangeText: '65.000 ₺ - 78.000 ₺ / Ay',
      category: 'Akademik Personel (Dr. Öğretim Üyesi)',
      summary: 'Temel akademik kadro maaşına ek olarak ek ders ücretleri, jüri/sınav ödemeleri ve akademik teşvik dahildir.',
      benefits: ['Ek Ders Ücreti', 'Akademik Teşvik Puanı', 'Geliştirme / Araştırma Ödeneği'],
      disclaimer: 'Haftalık verilen ek ders saatine göre net maaş yükselir.',
    };
  }
  if (/\b(?:ogretim\s*gorevlisi|arastirma\s*gorevlisi|ars\.\s*gor)\b/.test(titleNorm)) {
    return {
      minSalary: 56000,
      maxSalary: 66000,
      averageSalary: 61000,
      rangeText: '56.000 ₺ - 66.000 ₺ / Ay',
      category: 'Öğretim / Araştırma Görevlisi (2547 S.K.)',
      summary: 'Yeni başlayan araştırma veya öğretim görevlisi için taban net aylık ve üniversite ödeneğidir.',
      benefits: ['Üniversite Ödeneği', 'Ek Ders Payı', 'Yayın ve Kongre Destekleri'],
      disclaimer: 'Büyükşehir dışındaki devlet üniversitelerinde ilave geliştirme ödeneği ödenir.',
    };
  }

  // 4. Kariyer Meslek / Müfettiş / Uzman / Denetçi
  if (/\b(?:mufettis|denetci|kontrolor|uzman\s*yardimci|hazine\s*uzman|kaymakam)\b/.test(titleNorm)) {
    return {
      minSalary: 62000,
      maxSalary: 75000,
      averageSalary: 68000,
      rangeText: '62.000 ₺ - 75.000 ₺ / Ay',
      category: 'Kariyer Meslek (A Grubu Kadro)',
      summary: 'Bakanlık ve genel müdürlüklerdeki kariyer kadrolarında özel hizmet tazminatı ve yüksek ek gösterge uygulanır.',
      benefits: ['Özel Hizmet Tazminatı', '3600/4200 Ek Gösterge', 'Görev Harcırahı / Yolluk'],
      disclaimer: 'Turne / denetim görevlerinde günlük resmi harcırah ödemesi eklenir.',
    };
  }

  // 5. Mühendis / Mimar / Şehir Plancısı
  if (/\b(?:muhendis|mimar|sehir\s*plancisi|peyzaj)\b/.test(titleNorm)) {
    return {
      minSalary: 58000,
      maxSalary: 68000,
      averageSalary: 63000,
      rangeText: '58.000 ₺ - 68.000 ₺ / Ay',
      category: 'Teknik Hizmetler Sınıfı (Mühendis / Mimar)',
      summary: 'Devlet kadrolarındaki mühendis ve mimarlar arazi tazminatı ve teknik sorumluluk ek ödemesi alır.',
      benefits: ['3 Aylık Arazi Tazminatı', 'Teknik Sorumluluk Zammı', 'Ek Gösterge Avantajı'],
      disclaimer: 'Arazide veya şantiyede görev yapılan günlere göre ek arazi tazminatı ödenir.',
    };
  }

  // 6. Avukat / Hukuk Müşaviri
  if (/\b(?:avukat|hukuk\s*musaviri)\b/.test(titleNorm)) {
    return {
      minSalary: 56000,
      maxSalary: 67000,
      averageSalary: 61000,
      rangeText: '56.000 ₺ - 67.000 ₺ / Ay',
      category: 'Avukatlık Hizmetleri Sınıfı',
      summary: 'Kamu avukatları aylık sabit net maaşın yanında kurumun kazandığı davalardan yasal vekalet ücreti payı alır.',
      benefits: ['Yıllık Vekalet Ücreti Payı', 'Özel Hizmet Tazminatı', 'Baro Aidat / Sigorta Karşılama'],
      disclaimer: 'Yıllık vekalet ücreti tavanı aylık kazanca önemli ölçüde ilave katkı sağlar.',
    };
  }

  // 7. Polis / Bekçi / Asker / Güvenlik
  if (/\b(?:subay|astsubay|uzman\s*cavus|uzman\s*erbas)\b/.test(titleNorm)) {
    return {
      minSalary: 56000,
      maxSalary: 72000,
      averageSalary: 64000,
      rangeText: '56.000 ₺ - 72.000 ₺ / Ay',
      category: 'Türk Silahlı Kuvvetleri Personeli',
      summary: 'Kadro maaşına ek olarak operasyon tazminatı, tayin bedeli ve fiili hizmet zammı (yıpranma) uygulanır.',
      benefits: ['Operasyon / Asayiş Tazminatı', 'Tayin Bedeli (Yemek Yardımı)', 'Fiili Hizmet Zammı (Yıpranma)'],
      disclaimer: 'Görev yapılan bölgeye (doğu/hudut) göre tazminatlar 15.000 TL\'ye kadar artabilir.',
    };
  }
  if (/\b(?:polis|komiser)\b/.test(titleNorm)) {
    return {
      minSalary: 55000,
      maxSalary: 65000,
      averageSalary: 59000,
      rangeText: '55.000 ₺ - 65.000 ₺ / Ay',
      category: 'Emniyet Hizmetleri Sınıfı (Polis Memuru)',
      summary: 'Polis memurlarına emniyet hizmeti tazminatı, fazla çalışma ücreti ve yıpranma payı dahil net aylıktır.',
      benefits: ['Emniyet Hizmet Tazminatı', 'Maktu Fazla Çalışma Ücreti', 'Silah ve Teçhizat Ödeneği'],
      disclaimer: 'Doğu ve terör bölgesi görevlerinde ilave operasyon tazminatı ödenir.',
    };
  }
  if (/\b(?:bekci|carsi\s*ve\s*mahalle)\b/.test(titleNorm)) {
    return {
      minSalary: 49000,
      maxSalary: 55000,
      averageSalary: 52000,
      rangeText: '49.000 ₺ - 55.000 ₺ / Ay',
      category: 'Çarşı ve Mahalle Bekçisi',
      summary: 'Emniyet Genel Müdürlüğü bünyesinde gece çalışma tazminatı ve maktu mesai ile net ele geçen tutardır.',
      benefits: ['Gece Görev Tazminatı', 'Maktu Çalışma Ücreti', 'Yıpranma Payı'],
      disclaimer: 'Haftalık nöbet saatlerine göre fazla çalışma ücreti eklenir.',
    };
  }
  if (/\b(?:guvenlik|koruma)\b/.test(titleNorm)) {
    return {
      minSalary: 44000,
      maxSalary: 51000,
      averageSalary: 47000,
      rangeText: '44.000 ₺ - 51.000 ₺ / Ay',
      category: 'Koruma ve Güvenlik Görevlisi (Memur/4B/İşçi)',
      summary: 'Nöbet, vardiya zammı ve resmi kıyafet ödeneği ile birlikte net ele geçen aylık tutardır.',
      benefits: ['Vardiya / Gece Zammı', 'Giyim / Üniforma Desteği', 'Yol ve Yemek Yardımı'],
      disclaimer: 'Sürekli işçi statüsünde olanlar yılda 52 günlük ilave tediye alır.',
    };
  }

  // 8. Hemşire / Ebe / Sağlık Teknikeri
  if (/\b(?:hemsire|ebe|saglik\s*teknikeri|radyoloji|anestezi|laborant|paramedik|acil\s*tip)\b/.test(titleNorm)) {
    return {
      minSalary: 48000,
      maxSalary: 58000,
      averageSalary: 52000,
      rangeText: '48.000 ₺ - 58.000 ₺ / Ay',
      category: 'Sağlık Hizmetleri Sınıfı (SHS)',
      summary: 'Hastanelerde görev yapan sağlık personeline temel maaş haricinde taban ek ödeme ve nöbet ücreti verilir.',
      benefits: ['Sağlık Taban Ek Ödemesi', 'Aylık Nöbet Ücretleri', 'Teşvik / Döner Sermaye Payı'],
      disclaimer: 'Aylık tutulan nöbet sayısına ve hastanenin döner sermaye puanına göre artar.',
    };
  }

  // 9. Zabıta / İtfaiye
  if (/\b(?:zabita|itfaiye)\b/.test(titleNorm)) {
    return {
      minSalary: 46000,
      maxSalary: 54000,
      averageSalary: 50000,
      rangeText: '46.000 ₺ - 54.000 ₺ / Ay',
      category: 'Belediye Zabıta / İtfaiye Personeli',
      summary: 'Belediyelerin zabıta ve itfaiye kadrolarında maktu fazla çalışma ücreti ve SDS (Sosyal Denge Sözleşmesi) uygulanır.',
      benefits: ['Maktu Fazla Mesai Ücreti', 'Sosyal Denge Sözleşmesi (SDS)', 'Yıpranma Payı (İtfaiye)'],
      disclaimer: 'Belediyenin bütçesine göre ödenen SDS tutarı 10.000 TL\'ye kadar çıkabilmektedir.',
    };
  }

  // 10. Öğretmen / Eğitici
  if (/\b(?:ogretmen|egitici|egitmen)\b/.test(titleNorm)) {
    return {
      minSalary: 47000,
      maxSalary: 56000,
      averageSalary: 51000,
      rangeText: '47.000 ₺ - 56.000 ₺ / Ay',
      category: 'Eğitim ve Öğretim Hizmetleri (EÖHS)',
      summary: 'Kadrolu ve sözleşmeli öğretmenler aylık taban maaş üzerine haftalık ek ders ücreti alırlar.',
      benefits: ['Haftalık Ek Ders Ücreti', 'Eğitime Hazırlık Ödeneği', 'Kıdem ve Derece Tazminatı'],
      disclaimer: 'Haftada ortalama 15-20 saat ek ders alan öğretmenin net kazancı artar.',
    };
  }

  // 11. Tekniker / Teknisyen
  if (/\btekniker\b/.test(titleNorm)) {
    return {
      minSalary: 47500,
      maxSalary: 54000,
      averageSalary: 50500,
      rangeText: '47.500 ₺ - 54.000 ₺ / Ay',
      category: 'Teknik Hizmetler Sınıfı (Tekniker)',
      summary: 'Önlisans mezunu tekniker kadrolarında özel hizmet tazminatı ve teknik sorumluluk zammı uygulanır.',
      benefits: ['Teknik Tazminat', 'Arazi / Saha Ödeneği', 'Yol ve Yemek Desteği'],
      disclaimer: 'Arazide veya atölyede görev yapılan günlere göre ek tazminat ödenir.',
    };
  }
  if (/\b(?:teknisyen|usta)\b/.test(titleNorm)) {
    return {
      minSalary: 44500,
      maxSalary: 49500,
      averageSalary: 47000,
      rangeText: '44.500 ₺ - 49.500 ₺ / Ay',
      category: 'Teknik Hizmetler Sınıfı (Teknisyen)',
      summary: 'Meslek lisesi mezunu teknisyen kadroları için taban net aylık ve teknik yan ödemelerdir.',
      benefits: ['Teknik Hizmet Tazminatı', 'Atölye / Bakım Zammı', 'Yemek / Servis'],
      disclaimer: 'Vardiyalı çalışan teknisyenlere ilave nöbet/vardiya ücreti ödenir.',
    };
  }

  // 12. Sürekli İşçi (Kamu Çerçeve Protokolü) - Temizlik, Güvenlik, Şoför, Aşçı, Hizmetli
  if (job.jobType === 'isci' || /\b(?:isci|temizlik|hizmetli|destek\s*personeli|asci|sofor|bakim|bahcivan)\b/.test(titleNorm)) {
    return {
      minSalary: 43000,
      maxSalary: 49000,
      averageSalary: 46000,
      rangeText: '43.000 ₺ - 49.000 ₺ / Ay',
      category: 'Sürekli İşçi (4857 S.K. & Kamu Çerçeve Protokolü)',
      summary: 'Kamu işçileri taban maaşa ek olarak yılda 52 günlük İlave Tediye ve toplu iş sözleşmesi (TİS) ikramiyesi alırlar. İkramiyelerle birlikte aylık ortalama kazanç ~52.000 ₺ - 58.000 ₺ seviyesine ulaşır.',
      benefits: ['52 Günlük İlave Tediye (Yılda 4 Taksit)', 'Toplu İş Sözleşmesi (TİS) İkramiyesi', 'Sosyal Yardım & Yemek Ücreti'],
      disclaimer: 'Kamu Çerçeve Protokolü kapsamındaki ikramiyeler ve primler aylık net ortalamayı ciddi oranda yükseltir.',
    };
  }

  // 13. Büro Personeli / VHKİ / Memur / Muhasebe / Sekreter
  if (/\b(?:buro|memur|vhki|bilgisayar\s*isletmen|muhasebe|sekreter|veznedar)\b/.test(titleNorm)) {
    return {
      minSalary: 44500,
      maxSalary: 50000,
      averageSalary: 47000,
      rangeText: '44.500 ₺ - 50.000 ₺ / Ay',
      category: 'Genel İdare Hizmetleri Sınıfı (GİHS)',
      summary: 'Yeni başlayan bekar 9/1 memur veya sözleşmeli büro personeli için temel net aylık bordro tutarıdır.',
      benefits: ['Taban Aylık & Yan Ödeme', 'Aile ve Çocuk Yardımı', 'Banka Maaş Promosyonu'],
      disclaimer: 'Evli ve çocuklu memurlarda aile yardımı ödeneği ile tutar artış gösterir.',
    };
  }

  // 14. Varsayılan Kamu Personeli (Eğitim seviyesine göre akıllı hesaplama)
  const edu = (job.minEducation || '').toLowerCase();
  if (edu === 'lisans' || edu === 'yukseklisans' || edu === 'doktora') {
    return {
      minSalary: 45000,
      maxSalary: 51000,
      averageSalary: 48000,
      rangeText: '45.000 ₺ - 51.000 ₺ / Ay',
      category: 'Kamu Personeli (657 Sayılı Kanun / 4B)',
      summary: 'Lisans mezunu yeni başlayan kamu görevlisi için net temel maaş ve kanuni ek ödemelerdir.',
      benefits: ['Taban Aylık', 'Özel Hizmet Tazminatı', 'Sendika ve Aile Yardımı'],
      disclaimer: 'Kurumun tabi olduğu teşkilat kanununa ve döner sermaye imkânlarına göre net maaş değişebilir.',
    };
  } else if (edu === 'onlisans') {
    return {
      minSalary: 43500,
      maxSalary: 48500,
      averageSalary: 46000,
      rangeText: '43.500 ₺ - 48.500 ₺ / Ay',
      category: 'Kamu Personeli (Önlisans Kadrosu)',
      summary: 'Önlisans mezunu memur veya sözleşmeli personel başlangıç derecesi net maaşıdır.',
      benefits: ['Taban Aylık', 'Ek Ödeme', 'Yol ve Yemek Desteği'],
      disclaimer: 'Kadro unvanına göre teknik sorumluluk veya vardiya ücreti eklenebilir.',
    };
  }

  return {
    minSalary: 42500,
    maxSalary: 47000,
    averageSalary: 44500,
    rangeText: '42.500 ₺ - 47.000 ₺ / Ay',
    category: 'Kamu Personeli (Temel Kadro)',
    summary: '2026 yılı güncel en düşük memur taban aylığı ve yan ödemeleri baz alınarak hesaplanmıştır.',
    benefits: ['Devlet Güvencesi & Taban Aylık', 'Aile Yardımı', 'Yemek / Servis İmkânı'],
    disclaimer: 'Kamu kurum ve kuruluşlarının ek ödeme kararnamelerine göre net tutar artabilir.',
  };
}
