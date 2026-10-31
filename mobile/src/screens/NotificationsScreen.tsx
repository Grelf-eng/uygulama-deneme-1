import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { Empty } from '../components/ui';
import { RootStackParamList } from '../navigation';
import { colors } from '../theme';
import { AppNotification } from '../types';

export function NotificationsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ items: AppNotification[] }>('/notifications')
        .then((r) => {
          setItems(r.items);
          return api('/notifications/read-all', { method: 'POST' });
        })
        .catch((e) => setError((e as Error).message));
    }, []),
  );

  if (error) return <Empty text={error} />;
  if (!items) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => String(n.id)}
      ListEmptyComponent={<Empty text="Henüz bildirim yok. Profilinize uygun yeni ilan çıktığında burada görünür." />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => item.jobId && nav.navigate('JobDetail', { jobId: item.jobId })}
          style={{
            backgroundColor: item.read ? '#fff' : colors.primaryLight,
            padding: 14,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontWeight: '700', color: colors.text }}>{item.title}</Text>
          <Text style={{ color: colors.text, marginTop: 2 }}>{item.body}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{item.createdAt}</Text>
        </Pressable>
      )}
    />
  );
}
