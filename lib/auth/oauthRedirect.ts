import * as Linking from 'expo-linking';

/** Supabase OAuth / magic-link redirect (Expo Go: exp://…, standalone: baby-ai://…) */
export function getOAuthRedirectUri(): string {
  return Linking.createURL('auth/callback');
}
