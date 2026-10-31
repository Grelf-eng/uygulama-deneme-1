import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { daysLeft, formatKpssTypeName, kpssBadge } from '../components/JobCard';
import { Badge, Button, Chip } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { colors, statusMeta } from '../theme';
import {
  APPLICATION_STATUS_LABELS,
  ApplicationStatus,
  EDUCATION_LABELS,
  Job,
  JOB_TYPE_LABELS,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

const SOURCE_LABELS: Record<string, string> = {
  memurlar: 'İlan.memurlar.net (Resmi İlan)',
  kamuilan: 'Cumhurbaşkanlığı SBB Kamu İlan',
  aile: 'Aile ve Sosyal Hizmetler Bakanlığı',
  iskur: 'İŞKUR Kamu',
};

export function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const j = await api<Job>(`/jobs/${jobId}`);
        setJob(j);
        setStatus(j.applicationStatus);
        if (j.applicationStatus) {
          const apps = await api<{ items: { status: string; notes: string; job: Job }[] }>('/applications');
          setNotes(apps.items.find((a) => a.job.id === jobId)?.notes ?? '');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [jobId]);

  const saveApplication = async (next: ApplicationStatus | null) => {
    setSaving(true);
    try {
      if (next === null) {
        await api(`/applications/${jobId}`, { method: 'DELETE' });
        setNotes('');
      } else {
        await api(`/applications/${jobId}`, { method: 'PUT', body: { status: next, notes } });
      }
      setStatus(next);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Text style={{ padding: 24, color: colors.fail }}>{error}</Text>;
  if (!job) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;

  const meta = statusMeta[job.eligibility.overall];
  const kb = kpssBadge(job);
  const left = daysLeft(job.deadline);
  const linkTitle = 'İlan Sayfasına Git ↗';

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={s.card}>
        <Text style={s.title}>{job.title}</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>
          {[job.institution, job.city].filter(Boolean).join(' • ')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          <Badge text={JOB_TYPE_LABELS[job.jobType]} color={colors.text} bg={colors.border} />
          <Badge {...kb} />
          {job.positions ? <Badge text={`${job.positions} kişi`} color={colors.text} bg={colors.border} /> : null}
          {left ? <Badge text={`⏰ ${left}`} color={colors.warn} bg={colors.warnBg} /> : null}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <Button
            title="📄 CV Analiz"
            variant="outline"
            onPress={() => navigation.navigate('Tabs', { screen: 'CvAnalysis' })}
            style={{ flex: 1, marginRight: 8 }}
          />
          {job.url ? (
            <Button
              title={linkTitle}
              onPress={() => Linking.openURL(job.url!).catch(() => Alert.alert('Bağlantı açılamadı', job.url!))}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      </View>

      {job.historicalPlacement ? (
        <View style={[s.card, { backgroundColor: '#f0fdf4', borderColor: '#86efac', borderWidth: 1.5 }]}>
          <Text style={[s.h2, { color: '#166534', marginTop: 0 }]}>📊 Geçmiş Yıllar Atama Puanları</Text>
          <Text style={{ color: '#14532d', fontSize: 13.5, lineHeight: 19, marginBottom: 8 }}>
            {job.historicalPlacement.summary}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Badge text={`Ortalama: ~${job.historicalPlacement.avgScore}`} color="#15803d" bg="#dcfce7" />
            <Badge text={`Aralık: ${job.historicalPlacement.minPlacedScore} - ${job.historicalPlacement.maxPlacedScore}`} color="#0369a1" bg="#e0f2fe" />
            <Badge text={job.historicalPlacement.period} color="#92400e" bg="#fef3c7" />
          </View>
        </View>
      ) : null}

      <View style={s.card}>
        <View style={[s.verdict, { backgroundColor: meta.bg }]}>
          <Text style={{ color: meta.color, fontWeight: '800', fontSize: 16 }}>
            {meta.emoji} {meta.label} · Uyum %{job.eligibility.score}
          </Text>
        </View>
        <Text style={s.h2}>Şart Kontrolü</Text>
        {job.eligibility.checks?.length ? (
          job.eligibility.checks.map((c) => (
            <View key={c.key} style={s.checkRow}>
              <Text style={{ fontSize: 18, width: 28 }}>{statusMeta[c.status].emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{c.label}</Text>
                <Text style={{ color: colors.muted }}>{c.detail}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted }}>İlanda kontrol edilebilir bir şart bulunamadı.</Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.h2}>Başvuru Takibi</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[]).map((k) => (
            <Chip
              key={k}
              label={APPLICATION_STATUS_LABELS[k]}
              selected={status === k}
              onPress={() => saveApplication(k)}
            />
          ))}
        </View>
        {status ? (
          <>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notlarınız (başvuru no, sınav tarihi...)"
              placeholderTextColor={colors.muted}
              multiline
              style={s.notes}
            />
            <View style={{ flexDirection: 'row' }}>
              <Button
                title="Notu Kaydet"
                onPress={() => saveApplication(status)}
                loading={saving}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button title="Takibi Bırak" variant="danger" onPress={() => saveApplication(null)} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.h2}>Aranan Şartlar</Text>
        <Info k="Eğitim" v={job.minEducation ? `En az ${EDUCATION_LABELS[job.minEducation]}` : null} />
        <Info
          k="KPSS"
          v={
            job.kpssRequired === false
              ? 'Aranmıyor'
              : job.kpssRequired
                ? `${formatKpssTypeName(job.kpssType) || job.kpssType || ''} ${job.minKpssScore ? `en az ${job.minKpssScore}` : '(taban puan belirtilmemiş)'}`.trim()
                : null
          }
        />
        <Info k="Bölüm" v={job.requiredDepartments.join(', ') || null} />
        <Info
          k="Sertifika"
          v={
            job.requiredCertificates.length
              ? job.requiredCertificates.join(job.certificateMode === 'any' ? ' veya ' : ', ')
              : null
          }
        />
        <Info k="Deneyim" v={job.minExperienceYears ? `${job.minExperienceYears} yıl` : null} />
        <Info k="Azami yaş" v={job.maxAge ? String(job.maxAge) : null} />
        <Info k="Son başvuru" v={job.deadline} />
        <Info k="Kaynak" v={SOURCE_LABELS[job.source] ?? job.source} />
      </View>

      <View style={s.card}>
        <Text style={s.h2}>İlan Açıklaması</Text>
        <Text style={{ color: colors.text, lineHeight: 21 }}>{job.description}</Text>
      </View>
    </ScrollView>
  );
}

function Info({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
      <Text style={{ width: 100, color: colors.muted }}>{k}</Text>
      <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 8, color: colors.text },
  verdict: { padding: 10, borderRadius: 10 },
  checkRow: { flexDirection: 'row', paddingVertical: 6 },
  notes: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    marginBottom: 10,
    textAlignVertical: 'top',
    color: colors.text,
  },
});
