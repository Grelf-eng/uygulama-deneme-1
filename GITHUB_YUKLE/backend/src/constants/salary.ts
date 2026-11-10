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
  const titleNorm = norm(job.title || '');
  // Başlıkta generic "Sözleşmeli Personel Alacak" yazsa bile detay metnindeki unvanları (ilk 2800 karakter) tara
  const descSnippet = norm((job.description || '').slice(0, 2800));
  const full = `${titleNorm} ${norm(job.institution || '')} ${norm(job.jobType || '')} ${descSnippet}`;

  // 1. Doktor / Uzman Tabip / Diş Hekimi / Eczacı (~110.000 ₺ - 165.000 ₺)
  if (
    /\b(?:uzman\s*tabip|tabip|doktor|dis\s*hekimi|eczaci)\b/.test(titleNorm) ||
    (/\b(?:tabip|doktor|dis\s*hekimi)\b/.test(descSnippet) && !/\b(?:doktora|doktor\s*ogretim)\b/.test(full))
  ) {
    return {
      minSalary: 110000,
      maxSalary: 165000,
      averageSalary: 135000,
      rangeText: '110.000 ₺ - 165.000 ₺ / Ay',
      category: 'Sağlık Hizmetleri (Tabip / Uzman Hekim)',
      summary: 'Temel memur maaşına ek olarak aylık sabit ek ödeme, taban ve teşvik ek ödemeleri ve nöbet ücretleri bordroya dahil edilir.',
      benefits: ['Taban ve Teşvik Ek Ödemesi', 'Sabit Ek Ödeme', 'Aylık Nöbet Ücretleri'],
      disclaimer: 'Hastane sınıfına, poliklinik/ameliyat teşvik katsayısına ve nöbet saatine göre aylık net gelir yükselir.',
    };
  }

  // 2. Sözleşmeli Bilişim / Yazılım Personeli (375 KHK) (~95.000 ₺ - 150.000 ₺)
  if (
    /\b(?:yazilim|bilisim|siber|programci|sistem\s*uzman|veritabani)\b/.test(titleNorm) ||
    /\b(?:sozlesmeli\s*bilisim|yazilim\s*gelistirme|siber\s*guvenlik|veritabani\s*yonet)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 95000,
      maxSalary: 150000,
      averageSalary: 118000,
      rangeText: '95.000 ₺ - 150.000 ₺ / Ay',
      category: 'Sözleşmeli Bilişim Personeli (375 KHK)',
      summary: 'Kamu kurumlarındaki sözleşmeli bilişim kadroları, memur tavan ücretinin 2 ile 4 katına kadar brüt tavan katsayısı ile istihdam edilmektedir.',
      benefits: ['Tavan Ücret Katsayısı (2x - 4x)', 'Ek Proje Tazminatı', 'Hibrit Çalışma Desteği'],
      disclaimer: 'Tecrübe yılı ve bilinen programlama teknolojilerine göre tavan katsayısı değişkenlik gösterir.',
    };
  }

  // 3. Profesör / Doçent (~105.000 ₺ - 135.000 ₺)
  if (/\b(?:profesor|docent)\b/.test(titleNorm) || /\b(?:profesor|docent\s*kadrosu)\b/.test(descSnippet)) {
    return {
      minSalary: 105000,
      maxSalary: 135000,
      averageSalary: 118000,
      rangeText: '105.000 ₺ - 135.000 ₺ / Ay',
      category: 'Akademik Personel (Prof. / Doçent)',
      summary: 'Kıdemli akademik kadro maaşına ek olarak akademik teşvik, ek ders ücretleri ve üniversite geliştirme ödeneği uygulanır.',
      benefits: ['Akademik Teşvik Ödeneği', 'Haftalık Ek Ders Ücretleri', 'Üniversite Geliştirme Ödeneği'],
      disclaimer: 'Yayınlanan makale sayısı ve ek ders yüküne göre aylık gelir farklılık gösterir.',
    };
  }

  // 4. Dr. Öğretim Üyesi (~88.000 ₺ - 105.000 ₺)
  if (
    /\b(?:doktor\s*ogretim|dr\s*ogr|dr\s*ogretim|ogretim\s*uyesi)\b/.test(titleNorm) ||
    /\b(?:dr\s*ogretim\s*uyesi|ogretim\s*uyesi\s*alimi)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 88000,
      maxSalary: 105000,
      averageSalary: 95000,
      rangeText: '88.000 ₺ - 105.000 ₺ / Ay',
      category: 'Akademik Personel (Dr. Öğretim Üyesi)',
      summary: 'Temel akademik kadro maaşına ek ders ücretleri, jüri/sınav ödemeleri ve akademik teşvik dahildir.',
      benefits: ['Ek Ders Ücreti', 'Akademik Teşvik Puanı', 'Geliştirme / Araştırma Ödeneği'],
      disclaimer: 'Haftalık verilen ek ders saatine göre net maaş yükselir.',
    };
  }

  // 5. Araştırma Görevlisi / Öğretim Görevlisi (~76.000 ₺ - 88.000 ₺)
  if (
    /\b(?:ogretim\s*gorevlisi|arastirma\s*gorevlisi|ars\s*gor)\b/.test(titleNorm) ||
    /\b(?:ogretim\s*gorevlisi|arastirma\s*gorevlisi)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 76000,
      maxSalary: 88000,
      averageSalary: 81000,
      rangeText: '76.000 ₺ - 88.000 ₺ / Ay',
      category: 'Öğretim / Araştırma Görevlisi (2547 S.K.)',
      summary: 'Yeni başlayan araştırma veya öğretim görevlisi için taban net aylık ve üniversite ödeneğidir.',
      benefits: ['Üniversite Ödeneği', 'Ek Ders Payı', 'Yayın ve Kongre Destekleri'],
      disclaimer: 'Büyükşehir dışındaki devlet üniversitelerinde ilave geliştirme ödeneği ödenir.',
    };
  }

  // 6. Kariyer Meslek / Müfettiş / Uzman Yardımcısı / Denetçi / Kaymakam (~85.000 ₺ - 105.000 ₺)
  if (
    /\b(?:mufettis|denetci|kontrolor|uzman\s*yardimci|hazine\s*uzman|kaymakam)\b/.test(titleNorm) ||
    /\b(?:mufettis\s*yardimciligi|uzman\s*yardimciligi|kontrolor\s*alimi)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 85000,
      maxSalary: 105000,
      averageSalary: 94000,
      rangeText: '85.000 ₺ - 105.000 ₺ / Ay',
      category: 'Kariyer Meslek (A Grubu Kadro)',
      summary: 'Bakanlık ve genel müdürlüklerdeki kariyer kadrolarında özel hizmet tazminatı ve 3600/4200 ek gösterge uygulanır.',
      benefits: ['Özel Hizmet Tazminatı', '3600/4200 Ek Gösterge', 'Görev Harcırahı / Yolluk'],
      disclaimer: 'Turne / denetim görevlerinde günlük resmi harcırah ödemesi eklenir.',
    };
  }

  // 7. Mühendis / Mimar / Şehir Plancısı (~82.000 ₺ - 98.000 ₺)
  if (
    /\b(?:muhendis|mimar|sehir\s*plancisi|peyzaj)\b/.test(titleNorm) ||
    /\b(?:insaat\s*muhendisi|makine\s*muhendisi|elektrik\s*muhendisi|orman\s*muhendisi|ziraat\s*muhendisi|cevre\s*muhendisi|bilgisayar\s*muhendisi|mimar\s*kadrosu)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 82000,
      maxSalary: 98000,
      averageSalary: 89000,
      rangeText: '82.000 ₺ - 98.000 ₺ / Ay',
      category: 'Teknik Hizmetler Sınıfı (Mühendis / Mimar)',
      summary: 'Devlet kadrolarındaki mühendis ve mimarlar arazi tazminatı ve teknik sorumluluk ek ödemesi alır.',
      benefits: ['3 Aylık Arazi Tazminatı', 'Teknik Sorumluluk Zammı', 'Ek Gösterge Avantajı'],
      disclaimer: 'Arazide veya şantiyede görev yapılan günlere göre ek arazi tazminatı ödenir.',
    };
  }

  // 8. Avukat / Hukuk Müşaviri (~78.000 ₺ - 92.000 ₺)
  if (/\b(?:avukat|hukuk\s*musaviri)\b/.test(titleNorm) || /\b(?:avukat\s*kadrosu|hukuk\s*musaviri)\b/.test(descSnippet)) {
    return {
      minSalary: 78000,
      maxSalary: 92000,
      averageSalary: 84000,
      rangeText: '78.000 ₺ - 92.000 ₺ / Ay',
      category: 'Avukatlık Hizmetleri Sınıfı',
      summary: 'Kamu avukatları aylık sabit net maaşın yanında kurumun kazandığı davalardan yasal vekalet ücreti payı alır.',
      benefits: ['Yıllık Vekalet Ücreti Payı', 'Özel Hizmet Tazminatı', 'Baro Aidat / Sigorta Karşılama'],
      disclaimer: 'Yıllık vekalet ücreti payı aylık ortalama kazanca ciddi oranda katkı sağlar.',
    };
  }

  // 9. TSK / Askeri Personel / Uzman Erbaş / Subay / Astsubay / Polis (~78.000 ₺ - 105.000 ₺)
  if (
    /\b(?:subay|astsubay|uzman\s*cavus|uzman\s*erbas|polis|komiser)\b/.test(titleNorm) ||
    /\b(?:deniz\s*kuvvetleri|kara\s*kuvvetleri|hava\s*kuvvetleri|sozlesmeli\s*er|uzman\s*erbas|polis\s*memuru)\b/.test(full)
  ) {
    return {
      minSalary: 78000,
      maxSalary: 105000,
      averageSalary: 88000,
      rangeText: '78.000 ₺ - 105.000 ₺ / Ay',
      category: 'Güvenlik / TSK / Emniyet Hizmetleri',
      summary: 'Kadro maaşına ek olarak operasyon tazminatı, tayin bedeli ve fiili hizmet zammı (yıpranma) uygulanır.',
      benefits: ['Operasyon / Asayiş Tazminatı', 'Tayin Bedeli (Yemek Yardımı)', 'Fiili Hizmet Zammı (Yıpranma)'],
      disclaimer: 'Görev yapılan bölgeye ve operasyonel şartlara göre ek tazminatlar uygulanır.',
    };
  }

  // 10. Hemşire / Ebe / Sağlık Teknikeri / Paramedik / Laborant (~72.000 ₺ - 86.000 ₺)
  if (/\b(?:hemsire|ebe|saglik\s*teknikeri|radyoloji|anestezi|laborant|paramedik|acil\s*tip)\b/.test(full)) {
    return {
      minSalary: 72000,
      maxSalary: 86000,
      averageSalary: 78000,
      rangeText: '72.000 ₺ - 86.000 ₺ / Ay',
      category: 'Sağlık Hizmetleri Sınıfı (Hemşire / SHS)',
      summary: 'Hastanelerde görev yapan sağlık personeline temel maaş haricinde taban ek ödeme, nöbet ve teşvik ücreti verilir.',
      benefits: ['Sağlık Taban ve Teşvik Ek Ödemesi', 'Aylık Nöbet Ücretleri', 'Yemek ve Giyim Yardımı'],
      disclaimer: 'Aylık tutulan nöbet sayısına ve hastanenin döner sermaye puanına göre artar.',
    };
  }

  // 11. Psikolog / Sosyal Çalışmacı / Diyetisyen / Fizyoterapist (~74.000 ₺ - 85.000 ₺)
  if (/\b(?:psikolog|sosyal\s*calismaci|diyetisyen|fizyoterapist|cocuk\s*gelisimcisi)\b/.test(full)) {
    return {
      minSalary: 74000,
      maxSalary: 85000,
      averageSalary: 79000,
      rangeText: '74.000 ₺ - 85.000 ₺ / Ay',
      category: 'Sağlık & Sosyal Hizmetler Sınıfı (Uzman)',
      summary: 'Kamu kurumları ve yurtlardaki uzman personele temel memur maaşı üzerine ek özel hizmet tazminatı ödenir.',
      benefits: ['Özel Hizmet Tazminatı', 'Sabit Ek Ödeme', 'Yol ve Yemek Yardımı'],
      disclaimer: 'Kurumun tabi olduğu ek ödeme katsayısına göre net tutar artabilir.',
    };
  }

  // 12. Zabıta / İtfaiye (~70.000 ₺ - 82.000 ₺)
  if (/\b(?:zabita|itfaiye)\b/.test(full)) {
    return {
      minSalary: 70000,
      maxSalary: 82000,
      averageSalary: 75000,
      rangeText: '70.000 ₺ - 82.000 ₺ / Ay',
      category: 'Belediye Zabıta / İtfaiye Personeli',
      summary: 'Belediyelerin zabıta ve itfaiye kadrolarında maktu mesai ve SDS (Sosyal Denge Sözleşmesi) uygulanır.',
      benefits: ['Maktu Fazla Mesai Ücreti', 'Sosyal Denge Sözleşmesi (SDS)', 'Yıpranma Payı'],
      disclaimer: 'Belediye meclisinin belirlediği SDS oranı bordroya ilave edilir.',
    };
  }

  // 13. Öğretmen / Eğitici (~72.000 ₺ - 84.000 ₺)
  if (/\b(?:ogretmen|egitici|egitmen)\b/.test(titleNorm) || /\b(?:ogretmen\s*kadrosu|egitici\s*personel)\b/.test(descSnippet)) {
    return {
      minSalary: 72000,
      maxSalary: 84000,
      averageSalary: 77000,
      rangeText: '72.000 ₺ - 84.000 ₺ / Ay',
      category: 'Eğitim ve Öğretim Hizmetleri (EÖHS)',
      summary: 'Öğretmenler aylık taban maaşın üzerine haftalık ek ders ücreti ve hazırlık ödeneği alırlar.',
      benefits: ['Haftalık Ek Ders Ücreti', 'Eğitime Hazırlık Ödeneği', 'Kıdem ve Derece Tazminatı'],
      disclaimer: 'Haftalık ek ders saatine göre aylık net kazanç artar.',
    };
  }

  // 14. Tekniker / Teknisyen / Laborant (~70.000 ₺ - 80.000 ₺)
  if (/\b(?:tekniker|teknisyen|laborant|harita\s*kadastro|topograf|operator)\b/.test(full)) {
    return {
      minSalary: 70000,
      maxSalary: 80000,
      averageSalary: 74500,
      rangeText: '70.000 ₺ - 80.000 ₺ / Ay',
      category: 'Teknik Hizmetler Sınıfı (Tekniker / Teknisyen)',
      summary: 'Tekniker ve teknisyen kadrolarında özel hizmet tazminatı ve teknik sorumluluk zammı uygulanır.',
      benefits: ['Teknik Tazminat', 'Arazi / Atölye Ödeneği', 'Yol ve Yemek Desteği'],
      disclaimer: 'Arazide veya atölyede görev yapılan günlere göre ek tazminat ödenir.',
    };
  }

  // 15. Büro Personeli / VHKİ / Memur / Sekreter / Muhasebeci (~68.000 ₺ - 75.000 ₺)
  if (/\b(?:buro\s*personeli|vhki|veri\s*hazirlama|bilgisayar\s*isletmen|muhasebe|sekreter|veznedar|memur)\b/.test(full)) {
    return {
      minSalary: 68000,
      maxSalary: 75000,
      averageSalary: 69200,
      rangeText: '68.000 ₺ - 75.000 ₺ / Ay',
      category: 'Genel İdare Hizmetleri (Büro / VHKİ / Memur)',
      summary: 'VHKİ ve idari büro personeli kadrolarında yemek dahil net maaş ~68.700 TL ile 69.700 TL arasında gerçekleşmektedir.',
      benefits: ['Yemek Dahil Net Maaş (~68.700 - 69.700 ₺)', 'Taban Aylık & Yan Ödeme', 'Banka Maaş Promosyonu & Aile Yardımı'],
      disclaimer: 'İkramiye veya ek ödeme yatan aylarda ele geçen toplam gelir 87.000 TL üzerine çıkabilir.',
    };
  }

  // 16. Koruma ve Güvenlik Görevlisi / Bekçi (~68.000 ₺ - 77.000 ₺)
  if (/\b(?:koruma\s*ve\s*guvenlik|guvenlik\s*gorevlisi|bekci|ozel\s*guvenlik|silahli\s*guvenlik)\b/.test(full)) {
    return {
      minSalary: 68000,
      maxSalary: 77000,
      averageSalary: 72500,
      rangeText: '68.000 ₺ - 77.000 ₺ / Ay',
      category: 'Güvenlik ve Koruma Hizmetleri (Kamusal)',
      summary: 'Kamu kurumlarında vardiyalı çalışan koruma ve güvenlik personeli net maaş, gece mesai farkı ve yemek yardımı dahil ortalama ~72.500 TL net almaktadır.',
      benefits: ['Gece Görev / Vardiya Zammı', 'Giyim / Üniforma Desteği', 'Yol ve Yemek Yardımı'],
      disclaimer: 'Sürekli işçi statüsündeki personelde yılda 52 günlük tediye ve TİS ikramiyesi ile kazanç katlanır.',
    };
  }

  // 17. Sürekli İşçi (Kamu Çerçeve Protokolü & TİS) (~68.000 ₺ - 78.000 ₺)
  if (job.jobType === 'isci' || /\b(?:surekli\s*isci|kamu\s*iscisi|belediye\s*iscisi)\b/.test(full)) {
    return {
      minSalary: 68000,
      maxSalary: 78000,
      averageSalary: 73000,
      rangeText: '68.000 ₺ - 78.000 ₺ / Ay',
      category: 'Sürekli İşçi (Kamu Çerçeve Protokolü & TİS)',
      summary: 'Ortalama kamu işçisi net maaşı 68.000 TL – 78.000 TL aralığındadır. 13 günlük İlave Tediye (taksit başı ~21.900 - 25.500 TL) ve TİS ikramiyeleri (~49.400 TL) yatan aylarda ele geçen toplam gelir 87.000 TL ila 130.000 TL bandına ulaşmaktadır.',
      benefits: [
        '52 Günlük İlave Tediye (Taksit Başı ~22.000 - 25.500 ₺)',
        'TİS İkramiyesi (Yılda 2 Kez ~49.400 ₺)',
        'Tediye/İkramiye Aylarında 87.000 - 130.000 ₺ Toplam Gelir'
      ],
      disclaimer: 'Toplu İş Sözleşmesi (TİS) ve İlave Tediye ödemeleri kamu işçilerinin aylık ortalamasını ciddi oranda yükseltir.',
    };
  }

  // 18. Destek Personeli / Temizlik / Hizmetli / Aşçı / Şoför / Bahçıvan (~65.400 ₺ - 72.000 ₺)
  if (
    /\b(?:destek\s*personeli|temizlik|hizmetli|asci|sofor|bahcivan|kaloriferci|bulasikci|hastabakici)\b/.test(full) ||
    /\b(?:yardimci\s*hizmetler|temizlik\s*gorevlisi)\b/.test(descSnippet)
  ) {
    return {
      minSalary: 65400,
      maxSalary: 72000,
      averageSalary: 67600,
      rangeText: '65.400 ₺ - 72.000 ₺ / Ay',
      category: 'Yardımcı Hizmetler (Destek / Temizlik / Hizmetli)',
      summary: 'Temizlik personeli ve yardımcı hizmet kadrolarında yemek dahil net maaş ~67.600 TL (yemek hariç ~65.400 TL) seviyesindedir. İkramiye ve tediye aylarında ele geçen tutar ~87.000 TL - 95.000 TL bandına ulaşır.',
      benefits: ['Yemek Dahil Net Maaş (~67.600 ₺)', '52 Günlük İlave Tediye (Yılda 4 Taksit)', 'TİS İkramiyesi (Yılda 2 Tam İkramiye)'],
      disclaimer: 'Sürekli işçi statüsündeki personele toplu sözleşme gereği yılda 52 günlük ilave tediye ve ikramiye ödenir.',
    };
  }

  // 19. Eğitim Seviyesi Tabanı Fallback (Yalnızca Resmi Kamu Bordroları)
  const edu = (job.minEducation || '').toLowerCase();
  if (edu === 'lisans' || edu === 'yukseklisans' || edu === 'doktora') {
    return {
      minSalary: 68000,
      maxSalary: 76000,
      averageSalary: 71000,
      rangeText: '68.000 ₺ - 76.000 ₺ / Ay',
      category: 'Kamu Personeli (Lisans Başlangıç)',
      summary: 'Lisans mezunu yeni başlayan kamu görevlisi için net temel maaş ve kanuni ek ödemelerdir.',
      benefits: ['Devlet Güvencesi & Taban Aylık', 'Özel Hizmet Tazminatı', 'Sendika ve Aile Yardımı'],
      disclaimer: 'Kurumun tabi olduğu teşkilat kanununa ve döner sermaye/ek ödeme imkânlarına göre net maaş değişebilir.',
    };
  } else if (edu === 'onlisans') {
    return {
      minSalary: 66500,
      maxSalary: 73500,
      averageSalary: 69500,
      rangeText: '66.500 ₺ - 73.500 ₺ / Ay',
      category: 'Kamu Personeli (Önlisans Başlangıç)',
      summary: 'Önlisans mezunu memur veya sözleşmeli personel başlangıç derecesi net maaşıdır.',
      benefits: ['Taban Aylık & Ek Ödeme', 'Yemek ve Yol Desteği', 'Banka Promosyonu'],
      disclaimer: 'Kadro unvanına göre teknik sorumluluk veya vardiya ücreti eklenebilir.',
    };
  }

  // Genel En Düşük Kamu Net Tabanı (~65.000 ₺ - 71.000 ₺)
  return {
    minSalary: 65000,
    maxSalary: 71000,
    averageSalary: 67600,
    rangeText: '65.000 ₺ - 71.000 ₺ / Ay',
    category: 'Kamu Personeli (En Düşük Kamu Tabanı)',
    summary: 'Temmuz 2026 sonrası kamu çerçeve protokolü ve memur taban maaşları baz alınmıştır. Yemek yardımı, tediye ve ikramiyelerle birlikte kamuda en düşük başlangıç gelirleri net 65.000 TL üzerindedir.',
    benefits: ['Devlet Güvencesi & Taban Aylık', 'Yol ve Yemek Desteği', 'İlave Tediye & İkramiye İmkânı'],
    disclaimer: 'Sadece kamu kurum ve kuruluşları baz alınmıştır; özel sektör asgari ücreti dahil edilmemiştir.',
  };
}
