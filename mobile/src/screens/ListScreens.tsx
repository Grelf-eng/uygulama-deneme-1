import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { api } from '../api';
import { JobList } from '../components/JobList';
import { Chip } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, Job } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FavoritesScreen() {
  const nav = useNavigation<Nav>();
  return (
    <JobList
      reloadKey="favorites"
      load={async () => {
        const r = await api<{ items: Job[] }>('/favorites');
        return { items: r.items, total: r.items.length };
      }}
      emptyText="Henüz favori ilanınız yok. İlan kartındaki 🤍 simgesine dokunarak kaydedin."
      onOpen={(j) => nav.navigate('JobDetail', { jobId: j.id })}
    />
  );
}

export function ApplicationsScreen() {
  const nav = useNavigation<Nav>();
  const [filter, setFilter] = useState<ApplicationStatus | ''>('');
  const statuses = Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[];

  return (
    <JobList
      reloadKey={`applications:${filter}`}
      load={async () => {
        const r = await api<{ items: { status: ApplicationStatus; job: Job }[] }>('/applications');
        const items = r.items
          .filter((a) => !filter || a.status === filter)
          .map((a) => ({ ...a.job, applicationStatus: a.status }));
        return { items, total: items.length };
      }}
      header={
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip label="Tümü" selected={filter === ''} onPress={() => setFilter('')} />
            {statuses.map((s) => (
              <Chip
                key={s}
                label={APPLICATION_STATUS_LABELS[s]}
                selected={filter === s}
                onPress={() => setFilter(filter === s ? '' : s)}
              />
            ))}
          </ScrollView>
        </View>
      }
      emptyText="Takip ettiğiniz başvuru yok. İlan detayından durum seçerek başvurunuzu takip edin."
      onOpen={(j) => nav.navigate('JobDetail', { jobId: j.id })}
    />
  );
}
