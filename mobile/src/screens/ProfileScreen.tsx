import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Chip, Field } from '../components/ui';
import { sendLocalTestNotification } from '../push';
import { colors } from '../theme';
import { EducationLevel, JobType, Profile } from '../types';

const KPSS_TYPES = [
  { value: 'P94', label: 'Ortaöğretim' },
  { value: 'P93', label: 'Ön Lisans' },
  { value: 'P3', label: 'Lisans' },
  { value: 'P1', label: 'Uzmanlık (Sayısal)' },
  { value: 'P2', label: 'Uzmanlık (Eşit Ağırlık)' },
  { value: 'P48', label: 'Uzmanlık (Alan Bilgisi)' },
  { value: 'P10', label: 'Öğretmenlik (Eğitim)' },
  { value: 'P121', label: 'Öğretmenlik (ÖABT)' },
  { value: 'P123', label: 'Din Hizmetleri' },
];
const FALLBACK_NO_DEPT: EducationLevel[] = ['ilkokul', 'ortaokul', 'lise'];

export function ProfileScreen() {
  const { profile, meta, email, saveProfile, logout } = useAuth();
  const [p, setP] = useState<Profile>(profile!);
  const [birthYear, setBirthYear] = useState(profile?.birthYear?.toString() ?? '');
  const [kpss, setKpss] = useState(profile?.kpssScore?.toString() ?? '');
  const [exp, setExp] = useState(String(profile?.experienceYears ?? 0));
  const [deptQuery, setDeptQuery] = useState('');
  const [certQuery, setCertQuery] = useState('');
  const [customCert, setCustomCert] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setP(profile);
    setBirthYear(profile.birthYear?.toString() ?? '');
    setKpss(profile.kpssScore?.toString() ?? '');
    setExp(String(profile.experienceYears ?? 0));
  }, [profile]);

  const noDeptLevels = meta?.noDepartmentLevels ?? FALLBACK_NO_DEPT;
  const hideDepartment = !p.educationLevel || noDeptLevels.includes(p.educationLevel);
  const poolOnly = p.educationLevel === 'lisans' || p.educationLevel === 'yuksek_lisans' || p.educationLevel === 'doktora';
  const isAssociate = p.educationLevel === 'onlisans';

  const departmentList = useMemo(() => {
    const rawList = poolOnly
      ? meta?.undergradDepartments ?? []
      : isAssociate
        ? meta?.associateDepartments ?? []
        : [];
    const q = deptQuery.trim().toLocaleLowerCase('tr');
    const filtered = q ? rawList.filter((d) => d.toLocaleLowerCase('tr').includes(q)) : rawList;
    return filtered;
  }, [poolOnly, isAssociate, meta?.undergradDepartments, meta?.associateDepartments, deptQuery]);

  // Lise ve altı eğitimde bölüm yoktur: seçim değişince alanı temizle
  const setEducation = (level: Profile['educationLevel']) =>
    setP({
      ...p,
      educationLevel: level,
      department: !level || noDeptLevels.includes(level) ? '' : p.department,
    });

  const allCertificates = useMemo(() => {
    const base = meta?.certificates ?? [];
    const custom = p.certificates.filter((c) => !base.includes(c));
    const merged = [...base, ...custom];
    const q = certQuery.trim().toLocaleLowerCase('tr');
    const filtered = q ? merged.filter((c) => c.toLocaleLowerCase('tr').includes(q)) : merged;
    return filtered.sort((a, b) => (p.certificates.includes(b) ? 1 : 0) - (p.certificates.includes(a) ? 1 : 0));
  }, [meta?.certificates, p.certificates, certQuery]);

  const sortedCities = useMemo(() => {
    const list = meta?.cities ?? [];
    const q = cityQuery.trim().toLocaleLowerCase('tr');
    const filtered = q ? list.filter((c) => c.toLocaleLowerCase('tr').includes(q)) : list;
    return [...filtered].sort((a, b) => (p.cities.includes(b) ? 1 : 0) - (p.cities.includes(a) ? 1 : 0));
  }, [meta?.cities, p.cities, cityQuery]);

  const toggleCert = (name: string) =>
    setP({
      ...p,
      certificates: p.certificates.includes(name)
        ? p.certificates.filter((c) => c !== name)
        : [...p.certificates, name],
    });

  const addCustomCert = () => {
    const v = customCert.trim();
    if (v.length >= 2 && !p.certificates.includes(v)) {
      setP({ ...p, certificates: [...p.certificates, v] });
    }
    setCustomCert('');
  };

  const toggleCity = (city: string) =>
    setP({
      ...p,
      cities: p.cities.includes(city) ? p.cities.filter((c) => c !== city) : [...p.cities, city],
    });

  const toggleType = (t: JobType) =>
    setP({ ...p, jobTypes: p.jobTypes.includes(t) ? p.jobTypes.filter((x) => x !== t) : [...p.jobTypes, t] });

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const save = async () => {
    const kpssScore = num(kpss);
    const by = num(birthYear);
    const years = num(exp) ?? 0;
    if (kpssScore !== null && (Number.isNaN(kpssScore) || kpssScore < 0 || kpssScore > 100))
      return Alert.alert('Hata', 'KPSS puanı 0-100 arasında olmalı');
    if (by !== null && (Number.isNaN(by) || by < 1940 || by > new Date().getFullYear()))
      return Alert.alert('Hata', 'Geçerli bir doğum yılı girin');
    if (Number.isNaN(years) || years < 0) return Alert.alert('Hata', 'Geçerli bir deneyim yılı girin');
    setSaving(true);
    try {
      await saveProfile({
        ...p,
        department: hideDepartment ? '' : p.department,
        kpssScore,
        birthYear: by,
        experienceYears: years,
      });
      Alert.alert('Kaydedildi ✅', 'Profiliniz güncellendi. Eşleşen ilanlar ve şart kontrolleri buna göre yenilendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const triggerTestNotification = async () => {
    try {
      await api('/notifications/test', { method: 'POST' });
      const shownLocal = await sendLocalTestNotification();
      if (!shownLocal) {
        Alert.alert('Gönderildi', 'Uygulama içi bildirim oluşturuldu (sağ üstteki 🔔 simgesinden görebilirsiniz).');
      }
    } catch (e) {
      Alert.alert('Bildirim gönderilemedi', (e as Error).message);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <Text style={{ color: colors.muted, marginBottom: 12 }}>👤 {email}</Text>

      <Field label="Ad Soyad" value={p.fullName} onChangeText={(v) => setP({ ...p, fullName: v })} />
      <Field label="Doğum Yılı" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} placeholder="Örn. 1998" />

      <Text style={s.label}>Eğitim Seviyesi</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {meta?.educationLevels.map((e) => (
          <Chip
            key={e.value}
            label={e.label}
            selected={p.educationLevel === e.value}
            onPress={() => setEducation(p.educationLevel === e.value ? null : e.value)}
          />
        ))}
      </View>

      {!hideDepartment ? (
        poolOnly || isAssociate ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.label}>
              🎓 Bölüm / Program Seçimi {p.department ? `(Seçili: ${p.department})` : '(Zorunlu)'}
            </Text>
            <TextInput
              value={deptQuery}
              onChangeText={setDeptQuery}
              placeholder="Bölüm ara... (seçmek için üzerine dokunun)"
              placeholderTextColor={colors.muted}
              style={s.filterInput}
            />
            <ScrollView style={s.chipBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {departmentList.slice(0, 40).map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    selected={p.department === d}
                    onPress={() => setP({ ...p, department: d })}
                  />
                ))}
              </View>
            </ScrollView>
            {poolOnly ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: -4 }}>
                🔒 Lisans ve üstü eğitimde bölüm yalnızca seçenek havuzundan seçilebilir.
              </Text>
            ) : null}
          </View>
        ) : (
          <Field
            label="Bölüm / Program"
            value={p.department}
            onChangeText={(v) => setP({ ...p, department: v })}
            placeholder="Örn. Bilgisayar Programcılığı"
          />
        )
      ) : null}

      <View style={s.sectionHead}>
        <Text style={s.label}>
          📜 Sertifikalar ve Belgeler {p.certificates.length ? `(${p.certificates.length} seçili)` : ''}
        </Text>
        {p.certificates.length > 0 ? (
          <Pressable onPress={() => setP({ ...p, certificates: [] })}>
            <Text style={s.clearBtn}>Temizle</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={certQuery}
        onChangeText={setCertQuery}
        placeholder="Sertifika ara... (seçmek için üzerine dokunun)"
        placeholderTextColor={colors.muted}
        style={s.filterInput}
      />
      <ScrollView style={s.chipBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {allCertificates.map((c) => (
            <Chip key={c} label={c} selected={p.certificates.includes(c)} onPress={() => toggleCert(c)} />
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field
            label="Listede yoksa kendiniz ekleyin"
            value={customCert}
            onChangeText={setCustomCert}
            placeholder="Örn. Havuz Suyu Operatörü Belgesi"
          />
        </View>
        <Button title="Ekle" variant="outline" onPress={addCustomCert} style={{ marginBottom: 12, paddingHorizontal: 16 }} />
      </View>

      <Field label="KPSS Puanı" value={kpss} onChangeText={setKpss} keyboardType="decimal-pad" placeholder="Örn. 82.5" />
      <Text style={s.label}>KPSS Puan Türü</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {KPSS_TYPES.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={p.kpssType === t.value}
            onPress={() => setP({ ...p, kpssType: p.kpssType === t.value ? null : t.value })}
          />
        ))}
      </View>

      <Field label="Deneyim (Yıl)" value={exp} onChangeText={setExp} keyboardType="decimal-pad" />

      <Text style={s.label}>İş Türü Tercihleri</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        {meta?.jobTypes.map((t) => (
          <Chip key={t.value} label={t.label} selected={p.jobTypes.includes(t.value)} onPress={() => toggleType(t.value)} />
        ))}
      </View>

      <View style={s.sectionHead}>
        <Text style={s.label}>
          📍 Tercih Edilen Şehirler {p.cities.length ? `(${p.cities.length} seçili)` : '(Tümü)'}
        </Text>
        {p.cities.length > 0 ? (
          <Pressable onPress={() => setP({ ...p, cities: [] })}>
            <Text style={s.clearBtn}>Temizle</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={cityQuery}
        onChangeText={setCityQuery}
        placeholder="81 il içinde filtrele... (seçmek için şehre dokunun)"
        placeholderTextColor={colors.muted}
        style={s.filterInput}
      />
      <ScrollView style={s.chipBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sortedCities.map((city) => (
            <Chip key={city} label={city} selected={p.cities.includes(city)} onPress={() => toggleCity(city)} />
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14 }}>
        <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>🔔 Yeni uygun ilan bildirimleri</Text>
        <Switch
          value={p.notificationsEnabled}
          onValueChange={(v) => setP({ ...p, notificationsEnabled: v })}
          trackColor={{ true: colors.primary }}
        />
      </View>

      <Button title="Profili Kaydet" onPress={save} loading={saving} />
      <View style={{ height: 10 }} />
      <Button title="🔔 Test Bildirimi Gönder" variant="outline" onPress={triggerTestNotification} />
      <View style={{ height: 10 }} />
      <Button title="Çıkış Yap" variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, color: colors.muted, marginBottom: 6, marginTop: 4, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  clearBtn: { fontSize: 13, color: colors.fail, fontWeight: '700' },
  filterInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
    marginBottom: 8,
  },
  chipBox: {
    maxHeight: 195,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
});
