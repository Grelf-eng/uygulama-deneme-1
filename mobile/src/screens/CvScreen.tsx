import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Badge, Button, Chip } from '../components/ui';
import { colors } from '../theme';
import { Profile } from '../types';

interface CvCategoryScore {
  key: string;
  label: string;
  earned: number;
  maxPoints: number;
  lost: number;
}

interface CvDeduction {
  id: string;
  category: string;
  title: string;
  pointsLost: number;
  reason: string;
  suggestion: string;
}

interface CvStrength {
  category: string;
  title: string;
  detail: string;
}

interface CvAnalysisResult {
  score: number;
  totalDeducted: number;
  levelLabel: string;
  targetTrack: string;
  targetTrackLabel: string;
  wordCount: number;
  overallComment: string;
  categories: CvCategoryScore[];
  deductions: CvDeduction[];
  strengths: CvStrength[];
}

const TRACKS = [
  { value: 'genel', label: 'Genel CV' },
  { value: 'memur', label: 'Memur / KPSS-B' },
  { value: 'sozlesmeli', label: '4/B Sözleşmeli' },
  { value: 'uzman', label: 'KPSS-A / Uzman' },
  { value: 'isci', label: 'Kamu İşçisi' },
  { value: 'akademik', label: 'Akademik' },
  { value: 'bilisim', label: 'Bilişim' },
];

export function CvScreen() {
  const { profile, saveProfile } = useAuth();
  const [cvText, setCvText] = useState('');
  const [track, setTrack] = useState('genel');
  const [analysis, setAnalysis] = useState<CvAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{
          saved: { cvText: string; targetTrack: string; analysis: CvAnalysisResult } | null;
        }>('/cv');
        if (res.saved) {
          setCvText(res.saved.cvText);
          setTrack(res.saved.targetTrack || 'genel');
          setAnalysis(res.saved.analysis);
        }
      } catch {
        // İlk girişte kayıtlı CV olmayabilir
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fillDraftFromProfile = () => {
    const lines = [
      profile?.fullName || 'Ad Soyad',
      `${profile?.cities?.[0] ? profile.cities[0] + ' | ' : ''}05XX XXX XX XX | ad.soyad@email.com`,
      '',
      'PROFESYONEL ÖZET',
      `${profile?.department || 'Kamu'} alanında eğitim almış, analitik düşünme ve süreç yönetimi becerileri güçlü adayım.`,
      '',
      'EĞİTİM BİLGİLERİ',
      `${profile?.educationLevel || 'Lisans'}${profile?.department ? ' - ' + profile.department : ''} (2019 - 2023)`,
      '',
      'İŞ VE STAJ DENEYİMİ',
      profile?.experienceYears
        ? `İlgili Kurum (${profile.experienceYears} Yıl Deneyim) - Resmi süreç takibi ve raporlama görevlerini yürüttüm.`
        : '',
      '',
      'SINAV VE SERTİFİKALAR',
      profile?.kpssScore ? `KPSS ${profile.kpssType || 'P3'}: ${profile.kpssScore}` : '',
      profile?.certificates?.length ? `Belgeler: ${profile.certificates.join(', ')}` : '',
      '',
      'TEKNİK VE KİŞİSEL YETKİNLİKLER',
      'MS Office (Word, Excel, PowerPoint), Raporlama, Ekip Çalışması, Zaman Yönetimi',
    ].filter(Boolean);
    setCvText(lines.join('\n'));
  };

  const runAnalysis = async () => {
    if (cvText.trim().length < 15) {
      Alert.alert('Eksik Metin', 'Lütfen değerlendirmek için CV metninizi kutuya yapıştırın.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api<{ cvText: string; analysis: CvAnalysisResult }>('/cv/analyze', {
        method: 'POST',
        body: { cvText, targetTrack: track },
      });
      setAnalysis(res.analysis);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyToProfile = async () => {
    try {
      const res = await api<{ profile: Profile }>('/cv/apply-to-profile', { method: 'POST' });
      await saveProfile(res.profile);
      Alert.alert('Başarılı', 'CV’den tespit edilen bilgiler profilinize aktarıldı!');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
  }

  const scoreColor =
    !analysis
      ? colors.primary
      : analysis.score >= 85
        ? colors.ok
        : analysis.score >= 70
          ? colors.primary
          : analysis.score >= 50
            ? colors.warn
            : colors.fail;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 12, paddingBottom: 36 }}>
      <View style={s.card}>
        <Text style={s.h1}>📄 CV Yorumlama ve Puanlama</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>
          CV metninizi aşağıya yapıştırın; 100 puan üzerinden değerlendirelim ve hangi eksikten kaç puan kırıldığını tek tek gösterelim.
        </Text>

        <Text style={s.label}>🎯 Hedef Kadro Türü</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {TRACKS.map((t) => (
            <Chip key={t.value} label={t.label} selected={track === t.value} onPress={() => setTrack(t.value)} />
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Button
            title="👤 Profilden Taslak"
            variant="outline"
            onPress={fillDraftFromProfile}
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button
            title="🗑️ Temizle"
            variant="outline"
            onPress={() => {
              setCvText('');
              setAnalysis(null);
            }}
            style={{ flex: 1 }}
          />
        </View>

        <TextInput
          value={cvText}
          onChangeText={setCvText}
          placeholder="Özgeçmiş metninizi buraya yapıştırın (Ad Soyad, İletişim, Özet, Eğitim, Deneyim, KPSS/Dil/Sertifikalar, Yetkinlikler)..."
          placeholderTextColor={colors.muted}
          multiline
          style={s.textarea}
        />

        <Button title="🔍 CV’mi Yorumla ve Puanla" onPress={runAnalysis} loading={analyzing} />
      </View>

      {analysis ? (
        <>
          <View style={[s.card, { borderWidth: 2, borderColor: scoreColor }]}>
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700' }}>{analysis.targetTrackLabel}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6 }}>
              <Text style={{ fontSize: 34, fontWeight: '800', color: scoreColor }}>
                {analysis.score} <Text style={{ fontSize: 18, color: colors.muted }}>/ 100</Text>
              </Text>
              <Badge text={`🔻 -${analysis.totalDeducted} Puan Kesinti`} color={colors.fail} bg={colors.failBg} />
            </View>
            <Text style={{ fontWeight: '700', color: scoreColor, marginBottom: 8 }}>{analysis.levelLabel}</Text>
            <Text style={{ color: colors.text, lineHeight: 20, fontSize: 13.5 }}>💬 {analysis.overallComment}</Text>
            <Button
              title="⚡ Bilgileri Profilime Aktar"
              variant="outline"
              onPress={applyToProfile}
              style={{ marginTop: 12 }}
            />
          </View>

          <View style={s.card}>
            <Text style={s.h2}>
              🔻 Neden Puan Kırıldı? ({analysis.deductions.length} Eksik · -{analysis.totalDeducted}p)
            </Text>
            {analysis.deductions.length ? (
              analysis.deductions.map((d) => (
                <View key={d.id} style={s.deductionBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#991b1b' }}>{d.category}</Text>
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.text }}>{d.title}</Text>
                    </View>
                    <Badge text={`-${d.pointsLost} Puan`} color="#b91c1c" bg="#fee2e2" />
                  </View>
                  <Text style={{ color: '#7f1d1d', fontSize: 13, marginTop: 6 }}>Neden: {d.reason}</Text>
                  <View style={s.tipBox}>
                    <Text style={{ color: '#065f46', fontSize: 12.5 }}>
                      💡 Nasıl Düzeltilir (+{d.pointsLost}p): {d.suggestion}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={{ color: colors.ok, fontWeight: '700' }}>
                🎉 Tebrikler! CV’nizde hiçbir puan kesintisi bulunmadı.
              </Text>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.h2}>📊 Bölüm Bazlı Puanlar</Text>
            {analysis.categories.map((c) => {
              const pct = Math.round((c.earned / c.maxPoints) * 100);
              return (
                <View key={c.key} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '600', color: colors.text, fontSize: 13 }}>{c.label}</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>
                      {c.earned} / {c.maxPoints} {c.lost > 0 ? `(-${c.lost}p)` : '✓'}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        backgroundColor: pct >= 75 ? colors.ok : pct >= 50 ? colors.primary : colors.fail,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {analysis.strengths.length ? (
            <View style={s.card}>
              <Text style={s.h2}>✅ Güçlü Yönleriniz ({analysis.strengths.length})</Text>
              {analysis.strengths.map((st, idx) => (
                <View key={idx} style={{ flexDirection: 'row', paddingVertical: 5 }}>
                  <Text style={{ width: 24 }}>✅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13.5 }}>{st.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12.5 }}>{st.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12 },
  h1: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  h2: { fontSize: 15.5, fontWeight: '700', color: colors.text, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 150,
    marginBottom: 10,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 14,
  },
  deductionBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff5f5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  tipBox: {
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
});
