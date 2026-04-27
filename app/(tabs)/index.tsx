import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useChildStore } from '../../store/childStore';
import { calculateAgeInMonths } from '../../lib/claude';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, Shadows, Radius } from '../../constants/theme';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { activeChild, children, fetchChildren, setActiveChild } = useChildStore();

  useEffect(() => {
    if (user) fetchChildren(user.id);
  }, [user]);

  const ageInMonths = activeChild
    ? calculateAgeInMonths(activeChild.birthdate)
    : 0;

  const ageText =
    ageInMonths < 12
      ? `${ageInMonths}개월`
      : `${Math.floor(ageInMonths / 12)}세 ${ageInMonths % 12}개월`;

  if (!activeChild) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>아이 정보가 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>안녕하세요 👋</Text>
            <Text style={styles.childName}>{activeChild.name}의 육아 AI</Text>
          </View>
          {activeChild.photo_url ? (
            <Image source={{ uri: activeChild.photo_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarEmoji}>
                {activeChild.gender === 'male' ? '👦' : '👧'}
              </Text>
            </View>
          )}
        </View>

        {/* 아이 정보 카드 */}
        <Card style={styles.childCard}>
          <View style={styles.childInfo}>
            <View style={styles.childInfoItem}>
              <Text style={styles.childInfoLabel}>이름</Text>
              <Text style={styles.childInfoValue}>{activeChild.name}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.childInfoItem}>
              <Text style={styles.childInfoLabel}>나이</Text>
              <Text style={styles.childInfoValue}>{ageText}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.childInfoItem}>
              <Text style={styles.childInfoLabel}>성별</Text>
              <Text style={styles.childInfoValue}>
                {activeChild.gender === 'male' ? '남자' : '여자'}
              </Text>
            </View>
          </View>
        </Card>

        {/* 여러 아이 전환 */}
        {children.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.childScroll}
          >
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childTab,
                  activeChild.id === child.id && styles.childTabActive,
                ]}
                onPress={() => setActiveChild(child)}
              >
                <Text
                  style={[
                    styles.childTabText,
                    activeChild.id === child.id && styles.childTabTextActive,
                  ]}
                >
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* AI 상담 바로가기 */}
        <TouchableOpacity
          style={styles.chatBanner}
          onPress={() => router.push('/(tabs)/chat')}
          activeOpacity={0.85}
        >
          <View style={styles.chatBannerLeft}>
            <Text style={styles.chatBannerEmoji}>🤖</Text>
            <View>
              <Text style={styles.chatBannerTitle}>AI 육아 상담 시작하기</Text>
              <Text style={styles.chatBannerSubtitle}>
                {activeChild.name}에 대해 무엇이든 물어보세요
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>

        {/* 빠른 질문 */}
        <Text style={styles.sectionTitle}>자주 묻는 질문</Text>
        {[
          '이 나이에 잘 자지 않으면 어떡하나요?',
          '이유식은 언제부터 시작하나요?',
          '열이 나는데 어떻게 해야 하나요?',
        ].map((q) => (
          <TouchableOpacity
            key={q}
            style={styles.quickQuestion}
            onPress={() =>
              router.push({ pathname: '/(tabs)/chat', params: { question: q } })
            }
          >
            <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
            <Text style={styles.quickQuestionText}>{q}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textLight} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  childName: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    ...Shadows.sm,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  childCard: {
    marginBottom: Spacing.md,
  },
  childInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  childInfoItem: {
    alignItems: 'center',
    flex: 1,
  },
  childInfoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  childInfoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  childScroll: {
    marginBottom: Spacing.md,
  },
  childTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  childTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  childTabText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  childTabTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    marginBottom: Spacing.md,
  },
  chatBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  chatBannerEmoji: {
    fontSize: 32,
  },
  chatBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  chatBannerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  quickQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  quickQuestionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
