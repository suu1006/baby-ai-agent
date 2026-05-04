import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useChildStore } from '../../store/childStore';
import { calculateAgeInMonths } from '../../lib/claude';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Shadows, Radius } from '../../constants/theme';

type FeedingLog = {
  id: string;
  fed_at: string;
  amount_ml: number | null;
  type: 'breast' | 'formula' | 'mixed' | 'solid';
};

type SleepLog = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
};

type DiaperLog = {
  id: string;
  changed_at: string;
  type: 'wet' | 'dirty' | 'both' | 'dry';
};

type HealthLogType = 'medication' | 'temperature' | 'hospital' | 'symptom';

type HealthLog = {
  id: string;
  recorded_at: string;
  type: HealthLogType;
  title: string;
  value: string | null;
  memo: string | null;
};

type TimelineItem = {
  id: string;
  type: 'feeding' | 'sleep' | 'diaper' | 'health';
  title: string;
  subtitle: string;
  timestamp: number;
  color: string;
};

function formatHm(dateLike: string | number | Date) {
  return new Date(dateLike).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function diaperLabel(type: DiaperLog['type']) {
  if (type === 'wet') return '소변';
  if (type === 'dirty') return '대변';
  if (type === 'both') return '소변+대변';
  return '교체';
}

function feedingLabel(type: FeedingLog['type']) {
  if (type === 'breast') return '모유';
  if (type === 'formula') return '분유';
  if (type === 'mixed') return '혼합';
  return '이유식';
}

function healthLabel(type: HealthLogType) {
  if (type === 'medication') return '투약';
  if (type === 'temperature') return '체온';
  if (type === 'hospital') return '병원 방문';
  return '증상';
}

function healthColor(type: HealthLogType) {
  if (type === 'medication') return Colors.error;
  if (type === 'temperature') return Colors.warning;
  if (type === 'hospital') return Colors.secondary;
  return Colors.primary;
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { activeChild, children, fetchChildren, setActiveChild } = useChildStore();
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [diaperLogs, setDiaperLogs] = useState<DiaperLog[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) fetchChildren(user.id);
  }, [user]);

  const loadDashboard = useCallback(async () => {
    if (!activeChild) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    const [feeding, sleep, diaper, health] = await Promise.all([
      supabase
        .from('feeding_logs')
        .select('id, fed_at, amount_ml, type')
        .eq('child_id', activeChild.id)
        .gte('fed_at', sinceISO)
        .order('fed_at', { ascending: false })
        .limit(80),
      supabase
        .from('sleep_logs')
        .select('id, started_at, ended_at, duration_minutes')
        .eq('child_id', activeChild.id)
        .gte('started_at', sinceISO)
        .order('started_at', { ascending: false })
        .limit(80),
      supabase
        .from('diaper_logs')
        .select('id, changed_at, type')
        .eq('child_id', activeChild.id)
        .gte('changed_at', sinceISO)
        .order('changed_at', { ascending: false })
        .limit(80),
      supabase
        .from('health_logs')
        .select('id, recorded_at, type, title, value, memo')
        .eq('child_id', activeChild.id)
        .gte('recorded_at', sinceISO)
        .order('recorded_at', { ascending: false })
        .limit(80),
    ]);

    if (feeding.data) setFeedingLogs(feeding.data as FeedingLog[]);
    if (sleep.data) setSleepLogs(sleep.data as SleepLog[]);
    if (diaper.data) setDiaperLogs(diaper.data as DiaperLog[]);
    if (health.data) setHealthLogs(health.data as HealthLog[]);
    setLoading(false);
  }, [activeChild]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const ageInMonths = activeChild
    ? calculateAgeInMonths(activeChild.birthdate)
    : 0;

  const ageText =
    ageInMonths < 12
      ? `${ageInMonths}개월`
      : `${Math.floor(ageInMonths / 12)}세 ${ageInMonths % 12}개월`;

  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, []);

  const todayFeedings = feedingLogs.filter(
    (log) => new Date(log.fed_at).getTime() >= todayStart
  );
  const todaySleeps = sleepLogs.filter(
    (log) => new Date(log.started_at).getTime() >= todayStart
  );
  const todayDiapers = diaperLogs.filter(
    (log) => new Date(log.changed_at).getTime() >= todayStart
  );
  const todayHealthLogs = healthLogs.filter(
    (log) => new Date(log.recorded_at).getTime() >= todayStart
  );
  const todaySleepMinutes = todaySleeps.reduce(
    (sum, log) => sum + (log.duration_minutes ?? 0),
    0
  );

  const averageWakeMinutes = useMemo(() => {
    const completed = [...sleepLogs]
      .filter((log) => log.ended_at)
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      );
    const gaps: number[] = [];

    for (let i = 1; i < completed.length; i += 1) {
      const prevEnd = completed[i - 1].ended_at
        ? new Date(completed[i - 1].ended_at as string).getTime()
        : 0;
      const currentStart = new Date(completed[i].started_at).getTime();
      const gap = Math.round((currentStart - prevEnd) / 60000);

      if (gap > 30 && gap < 360) gaps.push(gap);
    }

    if (gaps.length === 0) return 150;
    return Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
  }, [sleepLogs]);

  const lastSleepEnd = sleepLogs
    .filter((log) => log.ended_at)
    .sort(
      (a, b) =>
        new Date(b.ended_at as string).getTime() -
        new Date(a.ended_at as string).getTime()
    )[0]?.ended_at;

  const nextNapTime = useMemo(() => {
    const base = lastSleepEnd ? new Date(lastSleepEnd) : new Date();
    base.setMinutes(base.getMinutes() + averageWakeMinutes);
    return base;
  }, [lastSleepEnd, averageWakeMinutes]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const feedingItems: TimelineItem[] = todayFeedings.map((log) => ({
      id: `f-${log.id}`,
      type: 'feeding',
      title: `수유 ${log.amount_ml ? `${log.amount_ml}ml` : ''}`.trim(),
      subtitle: feedingLabel(log.type),
      timestamp: new Date(log.fed_at).getTime(),
      color: Colors.secondary,
    }));

    const sleepItems: TimelineItem[] = todaySleeps.map((log) => ({
      id: `s-${log.id}`,
      type: 'sleep',
      title: `수면 ${formatDuration(log.duration_minutes)}`,
      subtitle: log.ended_at
        ? `${formatHm(log.started_at)} - ${formatHm(log.ended_at)}`
        : `${formatHm(log.started_at)} 시작`,
      timestamp: new Date(log.started_at).getTime(),
      color: '#B9A8F6',
    }));

    const diaperItems: TimelineItem[] = todayDiapers.map((log) => ({
      id: `d-${log.id}`,
      type: 'diaper',
      title: `기저귀 ${diaperLabel(log.type)}`,
      subtitle: '교체 기록',
      timestamp: new Date(log.changed_at).getTime(),
      color: Colors.warning,
    }));

    const healthItems: TimelineItem[] = todayHealthLogs.map((log) => ({
      id: `h-${log.id}`,
      type: 'health',
      title: `${healthLabel(log.type)} ${log.value ? `${log.title} · ${log.value}` : log.title}`,
      subtitle: log.memo || '건강 기록',
      timestamp: new Date(log.recorded_at).getTime(),
      color: healthColor(log.type),
    }));

    return [...feedingItems, ...sleepItems, ...diaperItems, ...healthItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [todayFeedings, todaySleeps, todayDiapers, todayHealthLogs]);

  const expectedSleepByAge = ageInMonths < 6 ? 14 : ageInMonths < 12 ? 13 : 12;
  const sleepDeltaMinutes = expectedSleepByAge * 60 - todaySleepMinutes;
  const insight =
    sleepDeltaMinutes > 40
      ? `오늘 수면이 평균보다 ${Math.round(
        sleepDeltaMinutes
      )}분 부족해요. 다음 낮잠 전에는 조용한 환경으로 미리 전환해보세요.`
      : sleepDeltaMinutes < -40
        ? '오늘 수면량이 충분해서 컨디션이 안정적일 가능성이 높아요.'
        : '오늘 수면 패턴이 평균 범위에 가까워요. 현재 루틴을 유지해보세요.';

  if (!activeChild) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>아이 정보가 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadDashboard}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileIdentity}>
              {activeChild.photo_url ? (
                <Image source={{ uri: activeChild.photo_url }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <Ionicons
                    name={activeChild.gender === 'male' ? 'man' : 'woman'}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
              )}
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{activeChild.name}</Text>
                <Text style={styles.profileMeta}>생후 {ageText}</Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Ionicons name="happy" size={14} color={Colors.primary} />
              <Text style={styles.badgeText}>오늘</Text>
            </View>
          </View>

          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(tabs)/logs')}
            >
              <Ionicons name="water-outline" size={16} color={Colors.secondary} />
              <Text style={styles.quickActionText}>수유</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(tabs)/logs')}
            >
              <Ionicons name="moon-outline" size={16} color="#8F7CE8" />
              <Text style={styles.quickActionText}>수면</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(tabs)/logs')}
            >
              <Ionicons name="refresh-circle-outline" size={16} color={Colors.warning} />
              <Text style={styles.quickActionText}>기저귀</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(tabs)/chat')}
            >
              <Ionicons name="sparkles-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickActionText}>상담</Text>
            </TouchableOpacity>
          </View>
        </View>

        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childScroll}>
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

        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <Text style={styles.aiCardTitle}>육아코치 AI</Text>
            <Ionicons name="sparkles" size={14} color={Colors.success} />
          </View>
          <Text style={styles.aiInsight}>{insight}</Text>
          <Text style={styles.nextHint}>
            다음 낮잠 예상 {formatHm(nextNapTime)} (평균 각성 {averageWakeMinutes}분)
          </Text>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: { question: `${activeChild.name}의 오늘 수면 패턴을 분석해줘` },
              })
            }
          >
            <Text style={styles.aiButtonText}>패턴 질문하기</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{todayFeedings.length}회</Text>
            <Text style={styles.metricLabel}>수유</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatDuration(todaySleepMinutes)}</Text>
            <Text style={styles.metricLabel}>수면</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{todayDiapers.length}회</Text>
            <Text style={styles.metricLabel}>기저귀</Text>
          </View>
        </View>

        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>오늘 타임라인</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/logs')}>
              <Text style={styles.timelineMore}>전체 보기</Text>
            </TouchableOpacity>
          </View>

          {timelineItems.length === 0 ? (
            <Text style={styles.timelineEmpty}>아직 오늘 기록이 없어요. 첫 기록을 남겨보세요.</Text>
          ) : (
            timelineItems.map((item) => (
              <View key={item.id} style={styles.timelineItem}>
                <Text style={styles.timelineTime}>{formatHm(item.timestamp)}</Text>
                <View style={[styles.timelineDot, { backgroundColor: item.color }]} />
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineItemTitle}>{item.title}</Text>
                  <Text style={styles.timelineItemSub}>{item.subtitle}</Text>
                </View>
              </View>
            ))
          )}
        </View>
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
    paddingBottom: Spacing.lg,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md + 2,
    marginBottom: Spacing.md + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm + 2,
  },
  profileIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    flexShrink: 1,
  },
  profileMeta: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    flexShrink: 0,
  },
  badgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  profileImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  profileImagePlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm + 2,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 5,
  },
  childScroll: {
    marginBottom: Spacing.md + 4,
  },
  childTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
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
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  childTabTextActive: {
    color: Colors.white,
  },
  aiCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md + 2,
    marginBottom: Spacing.md + 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  aiCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  aiInsight: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 23,
  },
  nextHint: {
    marginTop: 6,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  aiButton: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md + 4,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  metricLabel: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm + 2,
  },
  timelineTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  timelineMore: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  timelineEmpty: {
    color: Colors.textLight,
    fontSize: 13,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timelineTime: {
    width: 52,
    color: Colors.textLight,
    fontSize: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 10,
  },
  timelineBody: {
    flex: 1,
  },
  timelineItemTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  timelineItemSub: {
    marginTop: 1,
    color: Colors.textSecondary,
    fontSize: 12,
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
