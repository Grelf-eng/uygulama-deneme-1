export const colors = {
  primary: '#1d4ed8',
  primaryLight: '#dbeafe',
  bg: '#f3f4f6',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  ok: '#16a34a',
  okBg: '#dcfce7',
  warn: '#d97706',
  warnBg: '#fef3c7',
  fail: '#dc2626',
  failBg: '#fee2e2',
};

export const statusMeta = {
  ok: { emoji: '✅', label: 'Uygun', color: colors.ok, bg: colors.okBg },
  warn: { emoji: '⚠️', label: 'Kontrol et', color: colors.warn, bg: colors.warnBg },
  fail: { emoji: '❌', label: 'Uygun değil', color: colors.fail, bg: colors.failBg },
} as const;
