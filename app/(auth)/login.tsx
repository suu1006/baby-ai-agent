import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { getOAuthRedirectUri } from '../../lib/auth/oauthRedirect';
import { createSessionFromUrl } from '../../lib/auth/sessionFromUrl';
import { supabase } from '../../lib/supabase';
import { AUTO_LOGIN_KEY, SAVED_EMAIL_KEY, isAutoLoginEnabled } from '../../lib/authPreferences';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Colors, Spacing } from '../../constants/theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SAVED_EMAIL_KEY),
      AsyncStorage.getItem(AUTO_LOGIN_KEY),
    ]).then(([savedEmail, savedAutoLogin]) => {
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberEmail(true);
      }
      setAutoLogin(isAutoLoginEnabled(savedAutoLogin));
    });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('로그인 실패', '이메일 또는 비밀번호가 올바르지 않습니다.');
      return;
    }

    if (rememberEmail) {
      await AsyncStorage.setItem(SAVED_EMAIL_KEY, email.trim());
    } else {
      await AsyncStorage.removeItem(SAVED_EMAIL_KEY);
    }

    await AsyncStorage.setItem(AUTO_LOGIN_KEY, autoLogin ? 'true' : 'false');
  };

  const signInWithKakao = async () => {
    setKakaoLoading(true);
    try {
      const redirectTo = getOAuthRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;
      if (!data.url) return;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success') {
        await createSessionFromUrl(result.url);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('카카오 로그인 실패', '로그인을 완료하지 못했습니다. 다시 시도해주세요.');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '다시 시도해주세요.';
      Alert.alert('카카오 로그인 실패', message);
    } finally {
      setKakaoLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Image source={require('../../assets/bebimom_logo.png')} style={styles.logo} />
            <Text style={styles.title}>베비맘</Text>
            <Text style={styles.subtitle}>우리 아이의 성장을 함께 기록해요</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              isPassword
            />

            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberEmail((prev) => !prev)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, rememberEmail && styles.checkboxActive]}>
                {rememberEmail && (
                  <Ionicons name="checkmark" size={15} color={Colors.white} />
                )}
              </View>
              <Text style={styles.rememberText}>이메일 저장</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setAutoLogin((prev) => !prev)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, autoLogin && styles.checkboxActive]}>
                {autoLogin && (
                  <Ionicons name="checkmark" size={15} color={Colors.white} />
                )}
              </View>
              <Text style={styles.rememberText}>자동 로그인</Text>
            </TouchableOpacity>

            <Button
              title="로그인"
              onPress={handleLogin}
              loading={loading}
              style={styles.loginButton}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="회원가입"
              onPress={() => router.push('/(auth)/signup')}
              variant="outline"
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>소셜 로그인</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.kakaoButton}
              onPress={signInWithKakao}
              disabled={kakaoLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.kakaoIcon}>💬</Text>
              <Text style={styles.kakaoText}>
                {kakaoLoading ? '연결 중...' : '카카오로 시작하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: 0,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  checkboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  rememberText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  loginButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textLight,
    fontSize: 14,
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
    borderRadius: 12,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  kakaoIcon: {
    fontSize: 20,
  },
  kakaoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#191919',
  },
});
