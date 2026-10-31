import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getApiUrl, getCustomApiUrl, probeBestApiUrl, setCustomApiUrl } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Field } from '../components/ui';
import { AuthStackParamList } from '../navigation';
import { colors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login' | 'Register'>;

export function AuthScreen({ navigation, route }: Props) {
  const isRegister = route.name === 'Register';
  const { login, register, verifyEmail, resendCode } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // E-posta Doğrulama Adımı
  const [verifyMode, setVerifyMode] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState('');
  const [code, setCode] = useState('');

  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [activeUrl, setActiveUrl] = useState(getApiUrl());
  const [showServerCfg, setShowServerCfg] = useState(false);
  const [serverInput, setServerInput] = useState(getCustomApiUrl() ?? '');
  const [checkingConn, setCheckingConn] = useState(false);

  const checkServer = async () => {
    setCheckingConn(true);
    const res = await probeBestApiUrl();
    setConnOk(res.ok);
    setActiveUrl(res.url);
    setCheckingConn(false);
    if (!res.ok) setShowServerCfg(true);
  };

  useEffect(() => {
    checkServer();
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      if (isRegister) {
        const res = await register(email.trim(), password, fullName.trim());
        if (res && res.requiresVerification) {
          setVerifyTarget(res.email || email.trim());
          setVerifyMode(true);
        }
      } else {
        const res = await login(email.trim(), password);
        if (res && res.requiresVerification) {
          setVerifyTarget(res.email || email.trim());
          setVerifyMode(true);
        }
      }
    } catch (e) {
      Alert.alert(isRegister ? 'Kayıt başarısız' : 'Giriş başarısız', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!code || code.trim().length !== 6) {
      Alert.alert('Uyarı', 'Lütfen e-postanıza gönderilen 6 haneli kodu eksiksiz girin.');
      return;
    }
    setBusy(true);
    try {
      await verifyEmail(verifyTarget || email.trim(), code.trim());
    } catch (e) {
      Alert.alert('Doğrulama Başarısız', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    try {
      const res = await resendCode(verifyTarget || email.trim());
      Alert.alert('Başarılı', res.message || 'Yeni doğrulama kodu e-postanıza gönderildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyServerUrl = async () => {
    await setCustomApiUrl(serverInput.trim() || null);
    await checkServer();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 68 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>🇹🇷 Kamu İlan Asistanı</Text>
        <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 18 }}>
          Profilinize uygun kamu ilanlarını bulun, şartlarınızı ve sertifikalarınızı anında kontrol edin.
        </Text>

        <Pressable onPress={() => setShowServerCfg((v) => !v)} style={s.connBar}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: connOk ? colors.ok : connOk === false ? colors.fail : colors.muted }}>
            {checkingConn
              ? '⏳ Sunucu bağlantısı kontrol ediliyor...'
              : connOk
                ? `🟢 Sunucu bağlı (${activeUrl.replace(/\/api$/, '')})`
                : `🔴 Sunucuya ulaşılamadı · Ayarlamak için dokunun`}
          </Text>
        </Pressable>

        {showServerCfg ? (
          <View style={s.cfgBox}>
            <Field
              label="Sunucu Adresi (Boş bırakılırsa otomatik bulunur)"
              value={serverInput}
              onChangeText={setServerInput}
              autoCapitalize="none"
              placeholder="Örn. http://192.168.1.31:4000 veya https://..."
            />
            <View style={{ flexDirection: 'row' }}>
              <Button title="Kaydet ve Test Et" onPress={applyServerUrl} loading={checkingConn} style={{ flex: 1, marginRight: 8 }} />
              <Button
                title="Otomatik"
                variant="outline"
                onPress={async () => {
                  setServerInput('');
                  await setCustomApiUrl(null);
                  await checkServer();
                }}
                style={{ paddingHorizontal: 14 }}
              />
            </View>
          </View>
        ) : null}

        {verifyMode ? (
          <View style={s.card}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 8 }}>
              📧 E-posta Doğrulama Kodu
            </Text>
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#1e40af', lineHeight: 18 }}>
                <Text style={{ fontWeight: '700' }}>{verifyTarget}</Text> adresinize 6 haneli rastgele bir güvenlik doğrulama kodu gönderilmiştir. Hesabınızı onaylamak için kodu girin.
              </Text>
            </View>

            <Field
              label="6 Haneli Güvenlik Kodu"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Örn. 482915"
            />

            <Button title="✅ Kodu Onayla ve Giriş Yap" onPress={submitVerification} loading={busy} />
            <View style={{ height: 10 }} />
            <Button title="🔄 Tekrar Kod Gönder" variant="outline" onPress={handleResend} loading={busy} />
            <View style={{ height: 10 }} />
            <Button title="Geri Dön" variant="outline" onPress={() => setVerifyMode(false)} />
          </View>
        ) : (
          <View style={s.card}>
            {isRegister ? (
              <Field label="Ad Soyad" value={fullName} onChangeText={setFullName} autoComplete="name" />
            ) : null}
            <Field
              label="Kullanıcı Adı veya E-posta"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="default"
              autoComplete="username"
            />
            <Field
              label="Şifre"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Şifreniz"
            />
            <Button title={isRegister ? 'Kayıt Ol' : 'Giriş Yap'} onPress={submit} loading={busy} />
            <View style={{ height: 10 }} />
            <Button
              title={isRegister ? 'Zaten hesabım var (Giriş)' : 'Yeni hesap oluştur'}
              variant="outline"
              onPress={() => navigation.replace(isRegister ? 'Login' : 'Register')}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  connBar: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cfgBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
