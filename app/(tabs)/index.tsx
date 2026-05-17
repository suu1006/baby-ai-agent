import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { calculateAgeInMonths } from '../../lib/age';
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
  icon: string;
  bgColor: string;
};

function InsightText({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\d+[가-힣a-zA-Z]*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^\d+/.test(part) ? (
          <Text key={i} style={{ color: '#E87060', fontWeight: '800' }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

function formatKoTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
}

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

function healthIconInfo(type: HealthLogType): { icon: string; bgColor: string; color: string } {
  if (type === 'medication') return { icon: 'medkit', bgColor: '#FDEEEB', color: Colors.error };
  if (type === 'temperature') return { icon: 'thermometer', bgColor: '#FFF8E1', color: Colors.warning };
  if (type === 'hospital') return { icon: 'business', bgColor: '#E8F4FD', color: Colors.secondary };
  return { icon: 'pulse', bgColor: '#FFF0F5', color: Colors.primary };
}

function healthColor(type: HealthLogType) {
  if (type === 'medication') return Colors.error;
  if (type === 'temperature') return Colors.warning;
  if (type === 'hospital') return Colors.secondary;
  return Colors.primary;
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { activeChild, children, fetchChildren } = useChildStore();
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [diaperLogs, setDiaperLogs] = useState<DiaperLog[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
      scrollRef.current?.scrollTo({ y: 0, animated: false });
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
      color: '#5B9BD5',
      icon: 'water',
      bgColor: '#EBF3FB',
    }));

    const sleepItems: TimelineItem[] = todaySleeps.map((log) => ({
      id: `s-${log.id}`,
      type: 'sleep',
      title: `수면 ${formatDuration(log.duration_minutes)}`,
      subtitle: log.ended_at
        ? `${formatHm(log.started_at)} - ${formatHm(log.ended_at)}`
        : `${formatHm(log.started_at)} 시작`,
      timestamp: new Date(log.started_at).getTime(),
      color: '#7E57C2',
      icon: 'moon',
      bgColor: '#EDE7F6',
    }));

    const diaperItems: TimelineItem[] = todayDiapers.map((log) => ({
      id: `d-${log.id}`,
      type: 'diaper',
      title: `기저귀 ${diaperLabel(log.type)}`,
      subtitle: '교체 기록',
      timestamp: new Date(log.changed_at).getTime(),
      color: '#FFA000',
      icon: 'refresh-circle',
      bgColor: '#FFF8E1',
    }));

    const healthItems: TimelineItem[] = todayHealthLogs.map((log) => {
      const hi = healthIconInfo(log.type);
      return {
        id: `h-${log.id}`,
        type: 'health',
        title: `${healthLabel(log.type)} ${log.value ? `${log.title} · ${log.value}` : log.title}`,
        subtitle: log.memo || '건강 기록',
        timestamp: new Date(log.recorded_at).getTime(),
        color: hi.color,
        icon: hi.icon,
        bgColor: hi.bgColor,
      };
    });

    return [...feedingItems, ...sleepItems, ...diaperItems, ...healthItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [todayFeedings, todaySleeps, todayDiapers, todayHealthLogs]);

  const lastFeedingLog = feedingLogs[0] ?? null;
  const latestTempLog = todayHealthLogs
    .filter((l) => l.type === 'temperature')
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null;

  const expectedSleepByAge = ageInMonths < 6 ? 14 : ageInMonths < 12 ? 13 : 12;
  const expectedFeedIntervalHours = ageInMonths < 3 ? 2.5 : ageInMonths < 6 ? 3 : ageInMonths < 12 ? 4 : 5;
  const now = new Date();
  const hoursSinceLastFeed = lastFeedingLog
    ? (now.getTime() - new Date(lastFeedingLog.fed_at).getTime()) / 3600000
    : null;
  const sleepDeltaMinutes = expectedSleepByAge * 60 - todaySleepMinutes;

  const insight = (() => {
    // 1. 체온 이상
    if (latestTempLog) {
      const temp = parseFloat(latestTempLog.value ?? '0');
      if (temp >= 38.0) return `체온이 ${temp}°C예요. 열이 있을 수 있으니 소아과 방문을 권장해요.`;
      if (temp >= 37.5) return `체온이 ${temp}°C로 약간 높아요. 수분을 충분히 보충해주세요.`;
    }

    // 2. 수유 간격 초과
    if (hoursSinceLastFeed !== null && hoursSinceLastFeed > expectedFeedIntervalHours + 1) {
      const h = Math.floor(hoursSinceLastFeed);
      return `마지막 수유로부터 ${h}시간이 지났어요. 수유 시간이 다가오고 있어요.`;
    }

    // 3. 오늘 기록 없음
    if (todaySleepMinutes === 0 && todayFeedings.length === 0) {
      return `아직 오늘 기록이 없어요. 수유·수면을 기록하면 맞춤 조언을 드려요.`;
    }

    // 4. 수면 부족
    if (sleepDeltaMinutes > 120) {
      const h = Math.round((sleepDeltaMinutes / 60) * 10) / 10;
      return `오늘 수면이 ${h}시간 부족해요. 낮잠 환경을 조용히 준비해주세요.`;
    }
    if (sleepDeltaMinutes > 40) {
      return `오늘 수면이 평균보다 ${Math.round(sleepDeltaMinutes)}분 부족해요. 다음 낮잠 전에 조용한 환경으로 전환해보세요.`;
    }

    // 5. 수면 충분 + 수유 횟수 함께
    if (sleepDeltaMinutes < -40) {
      const feedCount = todayFeedings.length;
      if (feedCount > 0) return `수유 ${feedCount}회, 수면도 충분해요. 오늘 컨디션이 안정적이에요.`;
      return `오늘 수면이 충분해요. 컨디션이 안정적일 가능성이 높아요.`;
    }

    // 6. 기저귀 이상 (기록 없거나 너무 적음)
    if (ageInMonths < 12 && todayDiapers.length === 0 && now.getHours() >= 10) {
      return `오늘 기저귀 기록이 없어요. 수분 섭취와 배변 상태를 확인해보세요.`;
    }

    // 7. 정상
    const feedCount = todayFeedings.length;
    if (feedCount > 0) {
      return `수유 ${feedCount}회로 오늘 패턴이 안정적이에요. 현재 루틴을 유지해보세요.`;
    }
    return `오늘 수면 패턴이 평균 범위에 가까워요. 현재 루틴을 유지해보세요.`;
  })();

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
        ref={scrollRef}
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
        <View style={styles.profileHero}>
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
            <View style={styles.profileActions}>
              <TouchableOpacity
                style={styles.profileActionButton}
                onPress={() => router.push('/(tabs)/logs')}
                accessibilityLabel="기록 달력 보기"
              >
                <Ionicons name="calendar-outline" size={24} color="#8F92A3" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.profileActionButton}
                onPress={() => router.push('/(tabs)/settings')}
                accessibilityLabel="설정 열기"
              >
                <Ionicons name="settings-outline" size={24} color="#8F92A3" />
              </TouchableOpacity>
            </View>
          </View>

          </View>

        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <View style={styles.aiCardTitleRow}>
              <Ionicons name="sparkles" size={20} color="#F6B84B" />
              <Text style={styles.aiCardTitle}>베베 AI 코칭</Text>
            </View>
            <TouchableOpacity
              style={styles.aiCardMoreBtn}
              onPress={() => router.push({ pathname: '/(tabs)/chat', params: { question: '오늘 내 아기의 전체적인 상태를 체크해주고 필요한 부분 조언해줘' } })}
            >
              <Text style={styles.aiCardMoreText}>자세히 보기</Text>
              <Ionicons name="chevron-forward" size={12} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.aiContentBox}>
            <View style={styles.aiTextBox}>
              <InsightText text={insight} style={styles.aiInsight} />
            </View>
          </View>
        </View>

        <View style={styles.summarySection}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>오늘 요약</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/logs')} style={styles.summaryMoreBtn}>
              <Text style={styles.summaryMoreText}>더보기</Text>
              <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryGrid}>
            {/* 마지막 수유 */}
            <View style={styles.summaryTile}>
              <View style={[styles.summaryIcon, { backgroundColor: '#EBF3FB' }]}>
                <Ionicons name="water" size={18} color="#5B9BD5" />
              </View>
              <View style={styles.summaryTileText}>
                <Text style={styles.summaryStatLabel}>마지막 수유</Text>
                <Text style={styles.summaryStatValue}>
                  {lastFeedingLog ? formatTimeAgo(lastFeedingLog.fed_at) : '-'}
                </Text>
                <Text style={styles.summaryStatSub}>
                  {lastFeedingLog ? `(${formatKoTime(new Date(lastFeedingLog.fed_at))})` : '기록 없음'}
                </Text>
              </View>
            </View>

            {/* 오늘 총 수면 */}
            <View style={styles.summaryTile}>
              <View style={[styles.summaryIcon, { backgroundColor: '#EDE7F6' }]}>
                <Ionicons name="moon" size={18} color="#7E57C2" />
              </View>
              <View style={styles.summaryTileText}>
                <Text style={styles.summaryStatLabel}>오늘 총 수면</Text>
                <Text style={styles.summaryStatValue}>
                  {todaySleepMinutes > 0 ? formatDuration(todaySleepMinutes) : '-'}
                </Text>
                <Text style={styles.summaryStatSub}>평균 {expectedSleepByAge}시간</Text>
              </View>
            </View>

            {/* 기저귀 */}
            <View style={styles.summaryTile}>
              <View style={[styles.summaryIcon, { backgroundColor: '#FFF8E1' }]}>
                <Ionicons name="refresh-circle" size={18} color="#FFA000" />
              </View>
              <View style={styles.summaryTileText}>
                <Text style={styles.summaryStatLabel}>기저귀</Text>
                <Text style={styles.summaryStatValue}>{todayDiapers.length}회</Text>
                <Text style={styles.summaryStatSub}>
                  {todayDiapers.length === 0 ? '기록 없음' : '정상'}
                </Text>
              </View>
            </View>

            {/* 체온 */}
            <View style={styles.summaryTile}>
              <View style={[styles.summaryIcon, { backgroundColor: '#FFF8E1' }]}>
                <Ionicons name="thermometer" size={18} color={Colors.warning} />
              </View>
              <View style={styles.summaryTileText}>
                <Text style={styles.summaryStatLabel}>체온</Text>
                <Text style={styles.summaryStatValue}>
                  {latestTempLog?.value ? `${latestTempLog.value}°C` : '-'}
                </Text>
                <Text style={styles.summaryStatSub}>
                  {latestTempLog ? '정상' : '기록 없음'}
                </Text>
              </View>
            </View>
          </View>

        </View>

        <View style={styles.timelineSection}>
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>오늘 타임라인</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/logs')}>
              <Text style={styles.timelineMore}>전체 보기</Text>
            </TouchableOpacity>
          </View>

          {timelineItems.length === 0 ? (
            <Text style={styles.timelineEmpty}>아직 오늘 기록이 없어요. 첫 기록을 남겨보세요.</Text>
          ) : (
            timelineItems.map((item, index) => (
              <View key={item.id} style={styles.timelineItem}>
                <Text style={styles.timelineTime}>{formatHm(item.timestamp)}</Text>

                <View style={styles.timelineRail}>
                  <View style={[styles.railLine, index === 0 && styles.railLineHidden]} />
                  <View style={[styles.railDot, { backgroundColor: item.color }]} />
                  <View style={[styles.railLine, index === timelineItems.length - 1 && styles.railLineHidden]} />
                </View>

                <View style={styles.timelineEntry}>
                  <View style={[styles.timelineIconBox, { backgroundColor: item.bgColor }]}>
                    <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={item.color} />
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineItemTitle}>{item.title}</Text>
                    <Text style={styles.timelineItemSub}>{item.subtitle}</Text>
                  </View>
                  <TouchableOpacity style={styles.timelineMenuBtn} onPress={() => router.push('/(tabs)/logs')}>
                    <Ionicons name="ellipsis-horizontal" size={16} color={Colors.textLight} />
                  </TouchableOpacity>
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
    backgroundColor: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  profileHero: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
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
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  profileActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
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
  aiCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md + 2,
    marginBottom: Spacing.md + 4,
    ...Shadows.sm,
  },
  aiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  aiCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiCoachTitleIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  aiCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  aiCardMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  aiCardMoreText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  aiContentBox: {
    marginTop: Spacing.sm,
  },
  aiTextBox: {
    backgroundColor: '#FFF5F0',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 4,
    justifyContent: 'center',
  },
  aiInsight: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 22,
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
  summarySection: {
    marginBottom: Spacing.md + 4,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  summaryMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  summaryMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  summaryTile: {
    width: '48%',
    minHeight: 86,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  summaryTileText: {
    flex: 1,
    minWidth: 0,
  },
  summaryStatLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  summaryStatValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryStatSub: {
    marginTop: 2,
    fontSize: 10,
    color: Colors.textSecondary,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md + 4,
  },
  metricCard: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    ...Shadows.sm,
  },
  feedingMetricCard: {
    backgroundColor: '#FFF8D8',
    borderColor: '#F6E9A8',
  },
  sleepMetricCard: {
    backgroundColor: '#FFEAF1',
    borderColor: '#F7C9D8',
  },
  diaperMetricCard: {
    backgroundColor: '#EAF8E8',
    borderColor: '#C8EAC2',
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
  timelineSection: {
    marginTop: Spacing.sm,
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
    alignItems: 'stretch',
    minHeight: 74,
    marginBottom: Spacing.sm,
  },
  timelineTime: {
    width: 44,
    fontSize: 12,
    color: Colors.textLight,
    alignSelf: 'center',
    paddingRight: 2,
  },
  timelineRail: {
    width: 20,
    alignItems: 'center',
  },
  railLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: Colors.border,
  },
  railLineHidden: {
    opacity: 0,
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineEntry: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 4,
    ...Shadows.sm,
  },
  timelineIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timelineBody: {
    flex: 1,
  },
  timelineItemTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  timelineItemSub: {
    marginTop: 2,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  timelineMenuBtn: {
    padding: 8,
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
