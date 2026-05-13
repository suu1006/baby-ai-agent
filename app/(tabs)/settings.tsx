import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useChildStore } from '../../store/childStore';
import { calculateAgeInMonths } from '../../lib/age';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const { activeChild, children, setActiveChild } = useChildStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleSignOut = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  const ageInMonths = activeChild
    ? calculateAgeInMonths(activeChild.birthdate)
    : 0;

  const ageText =
    ageInMonths < 12
      ? `${ageInMonths}개월`
      : `${Math.floor(ageInMonths / 12)}세 ${ageInMonths % 12}개월`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>설정</Text>

        {/* 아이 프로필 */}
        {activeChild && (
          <Card style={styles.profileCard}>
            <View style={styles.profileRow}>
              {activeChild.photo_url ? (
                <Image
                  source={{ uri: activeChild.photo_url }}
                  style={styles.profilePhoto}
                />
              ) : (
                <View style={styles.profilePhotoPlaceholder}>
                  <Ionicons
                    name={activeChild.gender === 'male' ? 'man' : 'woman'}
                    size={34}
                    color={Colors.primary}
                  />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{activeChild.name}</Text>
                <Text style={styles.profileAge}>{ageText}</Text>
                <Text style={styles.profileGender}>
                  {activeChild.gender === 'male' ? '남자아이' : '여자아이'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* 아이 전환 (여러 아이 있을 때) */}
        {children.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>아이 선택</Text>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childItem,
                  activeChild?.id === child.id && styles.childItemActive,
                ]}
                onPress={() => setActiveChild(child)}
              >
                <View style={styles.childItemIcon}>
                  <Ionicons
                    name={child.gender === 'male' ? 'man' : 'woman'}
                    size={18}
                    color={Colors.primary}
                  />
                </View>
                <Text style={styles.childItemName}>{child.name}</Text>
                {activeChild?.id === child.id && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 아이 추가 */}
        <TouchableOpacity
          style={styles.addChildButton}
          onPress={() => router.push('/onboarding')}
        >
          <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
          <Text style={styles.addChildText}>아이 추가하기</Text>
        </TouchableOpacity>

        {/* 알림 설정 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>알림</Text>
          <Card>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.settingLabel}>육아 팁 알림</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
                thumbColor={notificationsEnabled ? Colors.primary : Colors.textLight}
              />
            </View>
          </Card>
        </View>

        {/* 계정 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정</Text>
          <Card>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.settingLabel}>{user?.email}</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <Card>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.settingLabel}>버전</Text>
              </View>
              <Text style={styles.settingValue}>1.0.0</Text>
            </View>
          </Card>
        </View>

        {/* 로그아웃 */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.signOutText}>로그아웃</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>베비맘 - 우리 아이의 성장을 함께해요</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  profileCard: {
    marginBottom: Spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profilePhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    ...Shadows.sm,
  },
  profilePhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    gap: 2,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  profileAge: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  profileGender: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  childItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  childItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  addChildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginBottom: Spacing.lg,
  },
  addChildText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  settingValue: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '10',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  signOutText: {
    fontSize: 15,
    color: Colors.error,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textLight,
    marginTop: Spacing.sm,
  },
});
