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
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useChildStore } from '../../store/childStore';
import { calculateAgeInMonths } from '../../lib/age';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.lg * 2 - 20;

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const { activeChild, children, setActiveChild, deleteChild } = useChildStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleDeleteChild = (child: { id: string; name: string }) => {
    Alert.alert(
      '아이 삭제',
      `${child.name}의 모든 기록이 삭제됩니다. 계속하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteChild(child.id);
            if (!ok) Alert.alert('오류', '삭제에 실패했어요. 다시 시도해주세요.');
          },
        },
      ]
    );
  };

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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>설정</Text>

        {/* 아이 프로필 캐러셀 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + Spacing.md}
          snapToAlignment="start"
          contentContainerStyle={styles.carouselContent}
          style={styles.carousel}
        >
          {children.map((child) => {
            const months = calculateAgeInMonths(child.birthdate);
            const age = months < 12
              ? `${months}개월`
              : `${Math.floor(months / 12)}세 ${months % 12}개월`;
            const isActive = activeChild?.id === child.id;
            return (
              <TouchableOpacity
                key={child.id}
                activeOpacity={0.85}
                onPress={() => setActiveChild(child)}
              >
                <Card style={isActive ? { ...styles.profileCard, ...styles.profileCardActive } : styles.profileCard}>
                  <View style={styles.profileRow}>
                    {child.photo_url ? (
                      <Image source={{ uri: child.photo_url }} style={styles.profilePhoto} />
                    ) : (
                      <View style={styles.profilePhotoPlaceholder}>
                        <Ionicons
                          name={child.gender === 'male' ? 'man' : 'woman'}
                          size={34}
                          color={Colors.primary}
                        />
                      </View>
                    )}
                    <View style={styles.profileInfo}>
                      <View style={styles.profileNameRow}>
                        <Text style={styles.profileName}>{child.name}</Text>
                        <Text style={styles.profileAge}>{age}</Text>
                      </View>
                      <Text style={styles.profileGender}>
                        {child.gender === 'male' ? '남자아이' : '여자아이'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteChild(child)}
                      style={styles.deleteButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}

          {/* 아이 추가 카드 */}
          <TouchableOpacity
            style={styles.addChildCard}
            onPress={() => router.push('/onboarding')}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            <Text style={styles.addChildText}>아이 추가하기</Text>
          </TouchableOpacity>
        </ScrollView>

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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  carousel: {
    marginBottom: Spacing.lg,
  },
  carouselContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  profileCard: {
    width: CARD_WIDTH,
  },
  profileCardActive: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
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
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
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
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  addChildCard: {
    width: CARD_WIDTH,
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
    ...Shadows.sm,
  },
  addChildText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
  },
  section: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginHorizontal: Spacing.lg,
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
