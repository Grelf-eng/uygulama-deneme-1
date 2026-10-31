import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, statusMeta } from '../theme';
import { APPLICATION_STATUS_LABELS, Job, JOB_TYPE_LABELS } from '../types';
import { Badge } from './ui';

const KPSS_TYPE_MAP: Record<string, string> = {
  P94: 'Ortaöğretim',
  P93: 'Ön Lisans',
  P3: 'Lisans',
  P1: 'Uzmanlık (Sayısal)',
  P2: 'Uzmanlık (Eşit Ağırlık)',
  P48: 'Uzmanlık (Alan Bilgisi)',
  P10: 'Öğretmenlik (Eğitim Bilimleri)',
  P121: 'Öğretmenlik (ÖABT)',
  P123: 'Din Hizmetleri (DHBT)',
};

export function formatKpssTypeName(t: string | null | undefined): string {
  if (!t) return '';
  const u = t.toUpperCase().replace(/\s+/g, '');
  return KPSS_TYPE_MAP[u] ?? t;
}

export function kpssBadge(job: Job): { text: string; color: string; bg: string } {
  if (job.kpssRequired === false) return { text: 'KPSS Şartsız', color: colors.ok, bg: colors.okBg };
  if (job.kpssRequired === null) return { text: 'KPSS Belirsiz', color: colors.warn, bg: colors.warnBg };
  const parts = ['KPSS'];
  const typeName = formatKpssTypeName(job.kpssType);
  if (typeName) parts.push(typeName);
  if (job.minKpssScore) parts.push(`≥ ${job.minKpssScore}`);
  else parts.push('Şartlı');
  return { text: parts.join(' '), color: colors.primary, bg: colors.primaryLight };
}

export function daysLeft(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = Math.ceil((Date.parse(deadline) - Date.now()) / 86400000);
  if (d < 0) return 'Süresi doldu';
  if (d === 0) return 'Son gün bugün!';
  return `${d} gün kaldı`;
}

export function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const meta = statusMeta[job.eligibility.overall];
  const kb = kpssBadge(job);
  const left = daysLeft(job.deadline);

  return (
    <Pressable onPress={onPress} style={s.card}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>
            {job.title}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {[job.institution, job.city].filter(Boolean).join(' • ')}
          </Text>
        </View>
      </View>

      <View style={s.row}>
        <Badge text={JOB_TYPE_LABELS[job.jobType]} color={colors.text} bg={colors.border} />
        <Badge {...kb} />
        {job.positions ? <Badge text={`${job.positions} kişi`} color={colors.text} bg={colors.border} /> : null}
        {job.applicationStatus ? (
          <Badge
            text={APPLICATION_STATUS_LABELS[job.applicationStatus]}
            color={colors.primary}
            bg={colors.primaryLight}
          />
        ) : null}
      </View>

      {job.requiredCertificates.length ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
          📜 {job.requiredCertificates.join(job.certificateMode === 'any' ? ' veya ' : ', ')}
        </Text>
      ) : null}

      {job.historicalPlacement ? (
        <View style={s.historicalBox}>
          <Text style={s.historicalText} numberOfLines={2}>
            📊 Atama Ortalaması: ~{job.historicalPlacement.avgScore} ({job.historicalPlacement.period} · {job.historicalPlacement.minPlacedScore}-{job.historicalPlacement.maxPlacedScore})
          </Text>
        </View>
      ) : null}

      <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }]}>
        <View style={[s.elig, { backgroundColor: meta.bg }]}>
          <Text style={{ color: meta.color, fontWeight: '700', fontSize: 13 }}>
            {meta.emoji} {meta.label} · %{job.eligibility.score}
          </Text>
        </View>
        {left ? <Text style={{ color: colors.muted, fontSize: 12 }}>⏰ {left}</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  historicalBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 6,
  },
  historicalText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  elig: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
});
