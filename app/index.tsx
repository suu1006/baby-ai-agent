import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  return <Redirect href={Platform.OS === 'web' ? '/landing' : '/(auth)/login'} />;
}
