import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../store/authStore';
import { useChildStore } from '../store/childStore';
import { createSessionFromUrl } from '../lib/auth/sessionFromUrl';
import { supabase, supabaseConfigError } from '../lib/supabase';
import { AUTO_LOGIN_KEY, isAutoLoginEnabled } from '../lib/authPreferences';
import { Colors, Spacing } from '../constants/theme';

function useProtectedRoute() {
  const { session, loading, setSession } = useAuthStore();
  const { children, fetchChildren } = useChildStore();
  const segments = useSegments();

  useEffect(() => {
    if (supabaseConfigError) {
      setSession(null);
      return;
    }

    const handleUrl = async (url: string) => {
      try {
        await createSessionFromUrl(url);
      } catch (error) {
        console.warn('[auth] deep link session error:', error);
      }
    };

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const autoLogin = isAutoLoginEnabled(await AsyncStorage.getItem(AUTO_LOGIN_KEY));
      if (session && !autoLogin) {
        await supabase.auth.signOut();
        setSession(null);
        return;
      }
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  useEffect(() => {
    if (supabaseConfigError) return;
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const inLanding = segments[0] === 'landing';
    const isWeb = Platform.OS === 'web';

    if (!session) {
      if (!inAuthGroup && !inLanding) {
        router.replace(isWeb ? '/landing' : '/(auth)/login');
      } else if (!isWeb && inLanding) {
        router.replace('/(auth)/login');
      }
    } else if (inAuthGroup || inLanding) {
      fetchChildren(session.user.id).then(() => {
        const hasChildren = useChildStore.getState().children.length > 0;
        router.replace(hasChildren ? '/(tabs)' : '/onboarding');
      });
    } else if (!inOnboarding && children.length === 0) {
      fetchChildren(session.user.id).then(() => {
        const hasChildren = useChildStore.getState().children.length > 0;
        if (!hasChildren) {
          router.replace('/onboarding');
        }
      });
    }
  }, [session, loading, segments]);
}

export default function RootLayout() {
  const segments = useSegments();
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useProtectedRoute();

  if (!fontsLoaded) {
    return null;
  }

  const isPublicLanding =
    Platform.OS === 'web' && (!segments[0] || segments[0] === 'landing');

  if (supabaseConfigError && !isPublicLanding) {
    return (
      <View style={styles.configErrorContainer}>
        <StatusBar style="dark" />
        <Text style={styles.configErrorTitle}>앱 설정이 누락되었습니다</Text>
        <Text style={styles.configErrorText}>{supabaseConfigError}</Text>
        <Text style={styles.configErrorText}>
          EAS production 환경에 Supabase URL과 anon key를 설정한 뒤 다시 빌드해주세요.
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="landing" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  configErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  configErrorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  configErrorText: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
});
