import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/AuthContext';
import { AuthStackParamList, RootStackParamList, TabParamList } from './src/navigation';
import { AuthScreen } from './src/screens/AuthScreen';
import { JobDetailScreen } from './src/screens/JobDetailScreen';
import { AllJobsScreen, MatchesScreen } from './src/screens/JobsScreen';
import { CvScreen } from './src/screens/CvScreen';
import { ApplicationsScreen } from './src/screens/ListScreens';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { colors } from './src/theme';

const navRef = createNavigationContainerRef<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Root = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icons: Record<keyof TabParamList, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Jobs: ['list', 'list-outline'],
  Matches: ['sparkles', 'sparkles-outline'],
  CvAnalysis: ['document-text', 'document-text-outline'],
  Applications: ['checkmark-done', 'checkmark-done-outline'],
  Profile: ['person', 'person-outline'],
};

function Tabs() {
  const { profile } = useAuth();
  // Profil henüz doldurulmamışsa kullanıcıyı önce profile yönlendir
  const initial: keyof TabParamList = profile?.educationLevel ? 'Matches' : 'Profile';
  return (
    <Tab.Navigator
      initialRouteName={initial}
      screenOptions={({ route, navigation }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={icons[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
        headerRight: () => (
          <Pressable onPress={() => navigation.getParent()?.navigate('Notifications')} style={{ marginRight: 16 }}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
          </Pressable>
        ),
      })}
    >
      <Tab.Screen name="Jobs" component={AllJobsScreen} options={{ title: 'İlanlar' }} />
      <Tab.Screen name="Matches" component={MatchesScreen} options={{ title: 'Eşleşenler' }} />
      <Tab.Screen name="CvAnalysis" component={CvScreen} options={{ title: 'CV Analiz' }} />
      <Tab.Screen name="Applications" component={ApplicationsScreen} options={{ title: 'Başvurular' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

function Navigation() {
  const { loading, signedIn } = useAuth();

  // Bildirime dokunulunca ilgili ilanı aç
  useEffect(() => {
    const open = (data: unknown) => {
      const jobId = Number((data as { jobId?: number } | undefined)?.jobId);
      if (jobId && navRef.isReady()) navRef.navigate('JobDetail', { jobId });
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      {signedIn ? (
        <Root.Navigator>
          <Root.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Root.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'İlan Detayı' }} />
          <Root.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Bildirimler' }} />
        </Root.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={AuthScreen} />
          <AuthStack.Screen name="Register" component={AuthScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
