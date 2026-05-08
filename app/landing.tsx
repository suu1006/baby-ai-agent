import React from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radius, Shadows, Spacing } from '../constants/theme';

const features = [
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: '아이 맞춤 상담',
    body: '생후 개월 수와 최근 기록을 반영해 수면, 이유식, 발달 질문에 답해요.',
  },
  {
    icon: 'calendar-outline' as const,
    title: '하루 기록 정리',
    body: '수유, 수면, 기저귀, 건강 기록을 한 화면에서 빠르게 남기고 확인해요.',
  },
  {
    icon: 'sparkles-outline' as const,
    title: '패턴 인사이트',
    body: '반복되는 루틴을 읽고 다음 낮잠, 컨디션 변화 힌트를 알려줘요.',
  },
];

const stats = [
  { value: '4종', label: '육아 기록' },
  { value: 'AI', label: '상담 코치' },
  { value: '7일', label: '최근 패턴' },
];

const LandingColors = {
  background: '#FFF8D9',
  surface: '#FFFDF3',
  surfaceSoft: '#FFF2C2',
  line: '#EFE1A7',
  text: '#3E3524',
  textMuted: '#766C58',
  honey: '#E9A93F',
  honeyDark: '#8B5E16',
  peach: '#FFD9C8',
  coral: '#E88975',
  mint: '#DDF4E8',
  mintText: '#397665',
  lilac: '#EDE5FF',
  lilacText: '#6E5C9E',
  blue: '#E3F1FF',
} as const;

export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <View style={styles.brand}>
            <Image source={require('../assets/bebimom_logo.png')} style={styles.brandIcon} />
            <Text style={styles.brandName}>베비맘</Text>
          </View>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.82}
          >
            <Text style={styles.navButtonText}>로그인</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
            <Text style={styles.kicker}>Gemma 3n E2B 기반 육아 코치</Text>
            <Text style={styles.title}>베비맘</Text>
            <Text style={styles.subtitle}>
              아이의 하루 기록을 모으고, 지금 필요한 육아 질문에 바로 답하는
              모바일 어시스턴트입니다.
            </Text>

            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push('/(auth)/signup')}
                activeOpacity={0.86}
              >
                <Text style={styles.primaryButtonText}>시작하기</Text>
                <Ionicons name="arrow-forward" size={18} color={LandingColors.surface} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push('/(auth)/login')}
                activeOpacity={0.82}
              >
                <Text style={styles.secondaryButtonText}>이미 계정이 있어요</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.preview, isWide && styles.previewWide]}>
            <View style={styles.phoneShell}>
              <View style={styles.phoneHeader}>
                <View style={styles.childAvatar}>
                  <Ionicons name="happy-outline" size={20} color={LandingColors.coral} />
                </View>
                <View style={styles.phoneHeaderText}>
                  <Text style={styles.childName}>민준</Text>
                  <Text style={styles.childAge}>생후 8개월</Text>
                </View>
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>오늘</Text>
                </View>
              </View>

              <View style={styles.insightPanel}>
                <View style={styles.insightTop}>
                  <Text style={styles.insightTitle}>육아코치 AI</Text>
                  <Ionicons name="sparkles" size={15} color={LandingColors.honeyDark} />
                </View>
                <Text style={styles.insightBody}>
                  오늘 낮잠 간격이 길어졌어요. 저녁 전 조용한 놀이로 전환해보세요.
                </Text>
              </View>

              <View style={styles.metricGrid}>
                <View style={[styles.metric, styles.metricMint]}>
                  <Text style={styles.metricValue}>5회</Text>
                  <Text style={styles.metricLabel}>수유</Text>
                </View>
                <View style={[styles.metric, styles.metricLilac]}>
                  <Text style={styles.metricValue}>3시간</Text>
                  <Text style={styles.metricLabel}>수면</Text>
                </View>
                <View style={[styles.metric, styles.metricYellow]}>
                  <Text style={styles.metricValue}>4회</Text>
                  <Text style={styles.metricLabel}>기저귀</Text>
                </View>
              </View>

              <View style={styles.timeline}>
                <Text style={styles.timelineTitle}>오늘 타임라인</Text>
                {['수유 160ml', '낮잠 42분', '기저귀 교체'].map((item, index) => (
                  <View key={item} style={styles.timelineItem}>
                    <View style={[styles.timelineDot, index === 1 && styles.timelineDotAlt]} />
                    <Text style={styles.timelineText}>{item}</Text>
                    <Text style={styles.timelineTime}>{index === 0 ? '14:20' : index === 1 ? '12:10' : '10:45'}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          {stats.map((item) => (
            <View key={item.label} style={styles.statItem}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.featureSection}>
          {features.map((feature, index) => (
            <View
              key={feature.title}
              style={[
                styles.featureCard,
                index === 0 && styles.featureCardMint,
                index === 1 && styles.featureCardBlue,
                index === 2 && styles.featureCardLilac,
              ]}
            >
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={LandingColors.honeyDark} />
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureBody}>{feature.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LandingColors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  nav: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: LandingColors.text,
  },
  navButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: LandingColors.surface,
    borderWidth: 1,
    borderColor: LandingColors.line,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: LandingColors.text,
  },
  hero: {
    paddingTop: Spacing.md,
    gap: Spacing.xl,
  },
  heroWide: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  heroCopy: {
    gap: Spacing.md,
  },
  heroCopyWide: {
    flex: 1,
    paddingRight: Spacing.xl,
  },
  kicker: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: LandingColors.mint,
    color: LandingColors.mintText,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
    color: LandingColors.text,
  },
  subtitle: {
    maxWidth: 560,
    fontSize: 18,
    lineHeight: 28,
    color: LandingColors.textMuted,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: LandingColors.honey,
    ...Shadows.sm,
  },
  primaryButtonText: {
    color: LandingColors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: LandingColors.surface,
    borderWidth: 1,
    borderColor: LandingColors.line,
  },
  secondaryButtonText: {
    color: LandingColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  preview: {
    alignItems: 'center',
  },
  previewWide: {
    flex: 1,
  },
  phoneShell: {
    width: '100%',
    maxWidth: 390,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: LandingColors.surface,
    borderWidth: 1,
    borderColor: LandingColors.line,
    ...Shadows.md,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  childAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LandingColors.peach,
  },
  phoneHeaderText: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  childName: {
    fontSize: 20,
    fontWeight: '900',
    color: LandingColors.text,
  },
  childAge: {
    marginTop: 2,
    fontSize: 13,
    color: LandingColors.textMuted,
  },
  todayBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: LandingColors.surfaceSoft,
  },
  todayBadgeText: {
    color: LandingColors.honeyDark,
    fontSize: 12,
    fontWeight: '800',
  },
  insightPanel: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: LandingColors.mint,
    borderWidth: 1,
    borderColor: '#BEE5D4',
  },
  insightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: LandingColors.text,
  },
  insightBody: {
    fontSize: 14,
    lineHeight: 21,
    color: LandingColors.textMuted,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metric: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  metricMint: {
    backgroundColor: LandingColors.mint,
  },
  metricLilac: {
    backgroundColor: LandingColors.lilac,
  },
  metricYellow: {
    backgroundColor: LandingColors.surfaceSoft,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: LandingColors.text,
  },
  metricLabel: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: LandingColors.textMuted,
  },
  timeline: {
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: '#FFFBE8',
    borderWidth: 1,
    borderColor: LandingColors.line,
  },
  timelineTitle: {
    marginBottom: Spacing.sm,
    fontSize: 15,
    fontWeight: '900',
    color: LandingColors.text,
  },
  timelineItem: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
    backgroundColor: LandingColors.coral,
  },
  timelineDotAlt: {
    backgroundColor: LandingColors.mintText,
  },
  timelineText: {
    flex: 1,
    fontSize: 14,
    color: LandingColors.text,
    fontWeight: '700',
  },
  timelineTime: {
    fontSize: 12,
    color: '#A89D82',
  },
  statsRow: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    flexDirection: 'row',
    marginTop: Spacing.xl,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: LandingColors.surface,
    borderWidth: 1,
    borderColor: LandingColors.line,
  },
  statItem: {
    flex: 1,
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: LandingColors.line,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: LandingColors.text,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: LandingColors.textMuted,
  },
  featureSection: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingBottom: Platform.OS === 'web' ? Spacing.xl : 0,
  },
  featureCard: {
    borderRadius: Radius.sm,
    padding: Spacing.md,
    backgroundColor: LandingColors.surface,
    borderWidth: 1,
    borderColor: LandingColors.line,
  },
  featureCardMint: {
    backgroundColor: LandingColors.mint,
    borderColor: '#BEE5D4',
  },
  featureCardBlue: {
    backgroundColor: LandingColors.blue,
    borderColor: '#C7DDF2',
  },
  featureCardLilac: {
    backgroundColor: LandingColors.lilac,
    borderColor: '#D6C9F4',
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    backgroundColor: LandingColors.peach,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: LandingColors.text,
  },
  featureBody: {
    marginTop: Spacing.xs,
    fontSize: 14,
    lineHeight: 21,
    color: LandingColors.textMuted,
  },
});
