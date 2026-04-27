import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';
import { useChildStore } from '../store/childStore';
import { supabase } from '../lib/supabase';

function useProtectedRoute() {
  const { session, loading, setSession } = useAuthStore();
  const { children, fetchChildren } = useChildStore();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      if (inAuthGroup) {
        fetchChildren(session.user.id).then(() => {
          const hasChildren = useChildStore.getState().children.length > 0;
          if (hasChildren) {
            router.replace('/(tabs)');
          } else {
            router.replace('/onboarding');
          }
        });
      } else if (!inOnboarding && children.length === 0) {
        fetchChildren(session.user.id).then(() => {
          const hasChildren = useChildStore.getState().children.length > 0;
          if (!hasChildren) {
            router.replace('/onboarding');
          }
        });
      }
    }
  }, [session, loading]);
}

export default function RootLayout() {
  useProtectedRoute();

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </>
  );
}
