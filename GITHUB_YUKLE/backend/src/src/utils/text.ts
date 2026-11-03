/**
 * Türkçe metni arama/karşılaştırma için normalize eder:
 * küçük harf, ı→i, aksan temizleme, fazla boşluk silme.
 */
export function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
