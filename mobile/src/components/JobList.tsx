import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { colors } from '../theme';
import { Job } from '../types';
import { JobCard } from './JobCard';
import { Empty } from './ui';

interface Props {
  /** Sayfa getirici; `key` değişince liste sıfırlanır */
  load: (page: number) => Promise<{ items: Job[]; total: number }>;
  reloadKey: string;
  header?: React.ReactElement;
  emptyText: string;
  onOpen: (job: Job) => void;
}

/** Sonsuz kaydırma + çekerek yenileme + ekrana dönünce yenileme yapan ilan listesi */
export function JobList({ load, reloadKey, header, emptyText, onOpen }: Props) {
  const [items, setItems] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(1);
  const busy = useRef(false);
  const seq = useRef(0);

  const fetchPage = useCallback(
    async (p: number, replace: boolean) => {
      if (busy.current && !replace) return;
      busy.current = true;
      const mine = ++seq.current;
      try {
        const r = await load(p);
        if (mine !== seq.current) return; // eski istek
        setItems((prev) => (replace ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
        page.current = p;
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError((e as Error).message);
      } finally {
        if (mine === seq.current) {
          busy.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadKey],
  );

  useEffect(() => {
    setLoading(true);
    busy.current = false;
    fetchPage(1, true);
  }, [fetchPage]);

  // Detaydan dönünce (favori/başvuru değişmiş olabilir) sessizce yenile
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      busy.current = false;
      fetchPage(1, true);
    }, [fetchPage]),
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(j) => String(j.id)}
      renderItem={({ item }) => <JobCard key={item.id} job={item} onPress={() => onOpen(item)} />}
      ListHeaderComponent={
        <View>
          {header}
          {!loading && !error ? (
            <Text style={{ marginHorizontal: 14, marginTop: 8, color: colors.muted, fontSize: 12 }}>
              {total} ilan
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : error ? (
          <Empty text={error} />
        ) : (
          <Empty text={emptyText} />
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            busy.current = false;
            fetchPage(1, true);
          }}
        />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && items.length < total) fetchPage(page.current + 1, false);
      }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
      style={{ backgroundColor: colors.bg }}
    />
  );
}
