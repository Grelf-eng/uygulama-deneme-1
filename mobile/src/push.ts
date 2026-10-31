import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function isAndroidExpoGo(): boolean {
  return Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
}

async function ensureLocalPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Yeni ilanlar',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  return status === 'granted';
}

/**
 * Bildirim izni ister ve Expo push token'ı döndürür.
 * Android Expo Go (SDK 53+) uzaktan push desteklemediği için sessizce yerel bildirim modunda kalır.
 */
export async function registerForPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const granted = await ensureLocalPermission();
    if (!granted) return null;
    if (isAndroidExpoGo()) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    return res.data;
  } catch {
    return null;
  }
}

/** Telefonda anında yerel bildirim başlığı gösterir (Expo Go ve APK içinde çalışır) */
export async function sendLocalTestNotification(): Promise<boolean> {
  try {
    const granted = await ensureLocalPermission();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🇹🇷 Kamu İlan Asistanı',
        body: 'Bildirim sistemi aktif! Profilinize uygun yeni kamu ilanı yayınlandığında haber verilecek.',
        sound: true,
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
