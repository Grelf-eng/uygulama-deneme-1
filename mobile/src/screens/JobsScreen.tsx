import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { JobList } from '../components/JobList';
import { Chip, PickerModal } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { colors } from '../theme';
import { Job, Paged } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Tüm ilanlar (arama + filtre) — `matchesOnly` ise profile uygun ilanlar */
export function JobsScreen({ matchesOnly = false }: { matchesOnly?: boolean }) {
  const nav = useNavigation<Nav>();
  const { meta, profile } = useAuth();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [kpss, setKpss] = useState<'' | 'yes' | 'no'>('');
  const [jobType, setJobType] = useState('');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState<'newest' | 'deadline'>('newest');
  const [cityModal, setCityModal] = useState(false);
  const [minScore, setMinScore] = useState<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);

  const userCities = profile?.cities || [];
  const filters = matchesOnly
    ? { minScore: minScore > 0 ? minScore : undefined }
    : { query, kpss, jobType, city, sort };

  const header = matchesOnly ? (
    <View style={{ padding: 12, paddingBottom: 4 }}>
      <View
        style={{
          backgroundColor: '#eff6ff',
          borderColor: '#bfdbfe',
          borderWidth: 1,
          borderRadius: 10,
          padding: 10,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>
          📍 Tercih Ettiğiniz Şehirler:
        </Text>
        <Text style={{ fontSize: 13, color: userCities.length > 0 ? colors.text : colors.fail }}>
          {userCities.length > 0
            ? userCities.join(', ')
            : 'Henüz şehir seçmediniz. Lütfen Profil sekmesinden şehir seçin.'}
        </Text>
      </View>

      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6 }}>
        UYUM ORANINA GÖRE FİLTRELE:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
        <Chip label="Tümü" selected={minScore === 0} onPress={() => setMinScore(0)} />
        <Chip label="💯 %100 Tam Uyum" selected={minScore === 100} onPress={() => setMinScore(100)} />
        <Chip label="⭐ %75 ve Üzeri" selected={minScore === 75} onPress={() => setMinScore(75)} />
        <Chip label="🎯 %50 ve Üzeri" selected={minScore === 50} onPress={() => setMinScore(50)} />
      </ScrollView>
    </View>
  ) : (
    <View style={{ padding: 12, paddingBottom: 0 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="İlan, kurum veya şehir ara..."
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: '#fff',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 16,
          marginBottom: 10,
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Chip label="Tümü" selected={kpss === ''} onPress={() => setKpss('')} />
        <Chip label="KPSS'li" selected={kpss === 'yes'} onPress={() => setKpss('yes')} />
        <Chip label="KPSS'siz" selected={kpss === 'no'} onPress={() => setKpss('no')} />
        <Chip
          label={city ? `📍 ${city}` : '📍 Şehir'}
          selected={!!city}
          onPress={() => (city ? setCity('') : setCityModal(true))}
        />
        <Chip
          label={sort === 'deadline' ? '⏰ Son tarihe göre' : '🆕 En yeni'}
          onPress={() => setSort(sort === 'deadline' ? 'newest' : 'deadline')}
        />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Chip label="Tüm türler" selected={jobType === ''} onPress={() => setJobType('')} />
        {meta?.jobTypes.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={jobType === t.value}
            onPress={() => setJobType(jobType === t.value ? '' : t.value)}
          />
        ))}
      </ScrollView>
      <PickerModal
        visible={cityModal}
        title="Şehir seç"
        options={meta?.cities ?? []}
        selected={city ? [city] : []}
        onClose={() => setCityModal(false)}
        onChange={(v) => setCity(v[0] ?? '')}
      />
    </View>
  );

  return (
    <JobList
      reloadKey={JSON.stringify({ filters, matchesOnly })}
      load={(page) =>
        api<Paged<Job>>(matchesOnly ? '/jobs/matches' : '/jobs', { query: { ...filters, page, limit: 20 } })
      }
      header={header}
      emptyText={
        matchesOnly
          ? 'Uygun ilan bulunamadı. Profilinizi (eğitim, KPSS, şehir) tamamlayın veya filtreleri temizleyin.'
          : 'Aramanıza uygun ilan bulunamadı.'
      }
      onOpen={(job) => nav.navigate('JobDetail', { jobId: job.id })}
    />
  );
}

export const AllJobsScreen = () => <JobsScreen />;
export const MatchesScreen = () => <JobsScreen matchesOnly />;
