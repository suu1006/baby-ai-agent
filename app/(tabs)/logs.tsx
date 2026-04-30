import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useChildStore } from '../../store/childStore';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type PrimaryLogTab = 'feeding' | 'sleep' | 'diaper';
type HealthLogType = 'medication' | 'temperature' | 'hospital' | 'symptom';
type LogTab = PrimaryLogTab | HealthLogType;
type DateTimeTarget = 'feed' | 'sleepStart' | 'sleepEnd' | 'diaper' | 'health' | 'edit';
type DateTimePickerMode = 'date' | 'time';
type FeedingType = 'breast' | 'formula' | 'mixed' | 'solid';
type EditableDateTimeTable = 'feeding_logs' | 'sleep_logs' | 'diaper_logs' | 'health_logs';
type EditDateTime = {
  title: string;
  table: EditableDateTimeTable;
  column: string;
  id: string;
  value: Date;
};

type FeedingLog = { id: string; fed_at: string; amount_ml: number | null; type: string };
type SleepLog = { id: string; started_at: string; ended_at: string | null; duration_minutes: number | null };
type DiaperLog = { id: string; changed_at: string; type: string };
type HealthLog = {
  id: string;
  recorded_at: string;
  type: HealthLogType;
  title: string;
  value: string | null;
  memo: string | null;
};

const PRIMARY_TABS = [
  { key: 'feeding', label: '수유', icon: 'water' },
  { key: 'sleep', label: '수면', icon: 'moon' },
  { key: 'diaper', label: '기저귀', icon: 'refresh-circle' },
] as const;

const HEALTH_TABS = [
  {
    key: 'medication',
    label: '투약',
    icon: 'medkit',
    color: Colors.error,
    backgroundColor: '#FDEEEB',
    titleLabel: '약 이름',
    titlePlaceholder: '예: 해열제',
    valueLabel: '용량/횟수',
    valuePlaceholder: '예: 3ml, 하루 2회',
  },
  {
    key: 'temperature',
    label: '체온',
    icon: 'thermometer',
    color: Colors.warning,
    backgroundColor: '#FFF8E1',
    titleLabel: '측정 위치/상태',
    titlePlaceholder: '예: 귀 체온, 겨드랑이 체온',
    valueLabel: '체온',
    valuePlaceholder: '예: 38.2',
  },
  {
    key: 'hospital',
    label: '병원',
    icon: 'business',
    color: Colors.secondary,
    backgroundColor: Colors.secondaryLight,
    titleLabel: '방문 내용',
    titlePlaceholder: '예: 소아과 진료',
    valueLabel: '병원명/진단',
    valuePlaceholder: '예: 동네 소아과, 감기',
  },
  {
    key: 'symptom',
    label: '증상',
    icon: 'pulse',
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    titleLabel: '증상',
    titlePlaceholder: '예: 열, 기침, 콧물',
    valueLabel: '정도/횟수',
    valuePlaceholder: '예: 38도 이상, 밤에 심함',
  },
] as const;

function isHealthTab(tab: LogTab | null): tab is HealthLogType {
  return HEALTH_TABS.some((item) => item.key === tab);
}

function getHealthConfig(type: HealthLogType) {
  return HEALTH_TABS.find((item) => item.key === type) ?? HEALTH_TABS[0];
}

// ─── 도우미 ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getDateKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDateHeader(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const formatted = date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  if (getDateKey(iso) === getDateKey(today.toISOString())) {
    return `오늘 · ${formatted}`;
  }

  if (getDateKey(iso) === getDateKey(yesterday.toISOString())) {
    return `어제 · ${formatted}`;
  }

  return formatted;
}

function shouldShowDateHeader<T>(
  logs: T[],
  index: number,
  getDate: (log: T) => string,
) {
  return index === 0 || getDateKey(getDate(logs[index])) !== getDateKey(getDate(logs[index - 1]));
}

function formatDateButton(date: Date) {
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatTimeButton(date: Date) {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function LogsScreen() {
  const { activeChild } = useChildStore();
  const [activeTab, setActiveTab] = useState<LogTab>('feeding');
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [diaperLogs, setDiaperLogs] = useState<DiaperLog[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalType, setModalType] = useState<LogTab | null>(null);
  const [dateTimePicker, setDateTimePicker] = useState<{
    target: DateTimeTarget;
    mode: DateTimePickerMode;
  } | null>(null);
  const [editDateTime, setEditDateTime] = useState<EditDateTime | null>(null);

  // 수유 폼
  const [feedAmount, setFeedAmount] = useState('');
  const [feedType, setFeedType] = useState<FeedingType>('breast');
  const [feedDateTime, setFeedDateTime] = useState<Date | null>(null);
  const [editingFeedingLog, setEditingFeedingLog] = useState<FeedingLog | null>(null);
  // 수면 폼
  const [sleepStart, setSleepStart] = useState<Date | null>(null);
  const [sleepEnd, setSleepEnd] = useState<Date | null>(null);
  // 기저귀 폼
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both' | 'dry'>('wet');
  const [diaperDateTime, setDiaperDateTime] = useState<Date | null>(null);
  // 건강 폼
  const [healthTitle, setHealthTitle] = useState('');
  const [healthValue, setHealthValue] = useState('');
  const [healthMemo, setHealthMemo] = useState('');
  const [healthDateTime, setHealthDateTime] = useState<Date | null>(null);

  const getDateTimeValue = (target: DateTimeTarget) => {
    switch (target) {
      case 'feed':
        return feedDateTime;
      case 'sleepStart':
        return sleepStart;
      case 'sleepEnd':
        return sleepEnd;
      case 'diaper':
        return diaperDateTime;
      case 'health':
        return healthDateTime;
      case 'edit':
        return editDateTime?.value ?? null;
    }
  };

  const setDateTimeValue = (target: DateTimeTarget, value: Date | null) => {
    switch (target) {
      case 'feed':
        setFeedDateTime(value);
        return;
      case 'sleepStart':
        setSleepStart(value);
        return;
      case 'sleepEnd':
        setSleepEnd(value);
        return;
      case 'diaper':
        setDiaperDateTime(value);
        return;
      case 'health':
        setHealthDateTime(value);
        return;
      case 'edit':
        if (value) {
          setEditDateTime((current) => current ? { ...current, value } : current);
        }
    }
  };

  const mergePickerDate = (current: Date | null, selected: Date) => {
    const next = new Date(current ?? new Date());
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    return next;
  };

  const mergePickerTime = (current: Date | null, selected: Date) => {
    const next = new Date(current ?? new Date());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    return next;
  };

  const handleDateTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!dateTimePicker || !selectedDate) return;

    const current = getDateTimeValue(dateTimePicker.target);
    const next = dateTimePicker.mode === 'date'
      ? mergePickerDate(current, selectedDate)
      : mergePickerTime(current, selectedDate);
    setDateTimeValue(dateTimePicker.target, next);
  };

  const loadLogs = useCallback(async () => {
    if (!activeChild) return;
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
        .limit(30),
      supabase
        .from('sleep_logs')
        .select('id, started_at, ended_at, duration_minutes')
        .eq('child_id', activeChild.id)
        .gte('started_at', sinceISO)
        .order('started_at', { ascending: false })
        .limit(30),
      supabase
        .from('diaper_logs')
        .select('id, changed_at, type')
        .eq('child_id', activeChild.id)
        .gte('changed_at', sinceISO)
        .order('changed_at', { ascending: false })
        .limit(30),
      supabase
        .from('health_logs')
        .select('id, recorded_at, type, title, value, memo')
        .eq('child_id', activeChild.id)
        .gte('recorded_at', sinceISO)
        .order('recorded_at', { ascending: false })
        .limit(60),
    ]);

    if (feeding.data) setFeedingLogs(feeding.data);
    if (sleep.data) setSleepLogs(sleep.data);
    if (diaper.data) setDiaperLogs(diaper.data);
    if (health.data) setHealthLogs(health.data as HealthLog[]);
  }, [activeChild]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const resetFeedingForm = () => {
    setFeedAmount('');
    setFeedType('breast');
    setFeedDateTime(null);
    setEditingFeedingLog(null);
  };

  const openAddModal = (tab: LogTab) => {
    setDateTimePicker(null);
    if (tab === 'feeding') {
      resetFeedingForm();
    }
    setModalType(tab);
  };

  const openFeedingEditor = (log: FeedingLog) => {
    setDateTimePicker(null);
    setEditingFeedingLog(log);
    setFeedAmount(log.amount_ml ? String(log.amount_ml) : '');
    setFeedType((['breast', 'formula', 'mixed', 'solid'].includes(log.type) ? log.type : 'breast') as FeedingType);
    setFeedDateTime(new Date(log.fed_at));
    setModalType('feeding');
  };

  const handleSaveFeeding = async () => {
    if (!activeChild) return;

    const payload = {
      fed_at: (feedDateTime ?? new Date()).toISOString(),
      amount_ml: feedAmount ? parseInt(feedAmount, 10) : null,
      type: feedType,
    };

    const { error } = editingFeedingLog
      ? await supabase
        .from('feeding_logs')
        .update(payload)
        .eq('id', editingFeedingLog.id)
      : await supabase.from('feeding_logs').insert({
        child_id: activeChild.id,
        ...payload,
      });

    if (error) {
      console.error('[FeedingLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    resetFeedingForm();
    setModalType(null);
    loadLogs();
  };

  const handleSaveSleep = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from('sleep_logs').insert({
      child_id: activeChild.id,
      started_at: (sleepStart ?? new Date()).toISOString(),
      ended_at: sleepEnd ? sleepEnd.toISOString() : null,
    });
    if (error) {
      console.error('[SleepLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    setSleepStart(null);
    setSleepEnd(null);
    setModalType(null);
    loadLogs();
  };

  const handleSaveDiaper = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from('diaper_logs').insert({
      child_id: activeChild.id,
      changed_at: (diaperDateTime ?? new Date()).toISOString(),
      type: diaperType,
    });
    if (error) {
      console.error('[DiaperLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    setDiaperDateTime(null);
    setModalType(null);
    loadLogs();
  };

  const resetHealthForm = () => {
    setHealthTitle('');
    setHealthValue('');
    setHealthMemo('');
    setHealthDateTime(null);
  };

  const closeLogModal = () => {
    setDateTimePicker(null);
    if (modalType === 'feeding') {
      resetFeedingForm();
    }
    if (isHealthTab(modalType)) {
      resetHealthForm();
    }
    setModalType(null);
  };

  const closeEditDateTimeModal = () => {
    setDateTimePicker(null);
    setEditDateTime(null);
  };

  const handleSaveHealth = async () => {
    if (!activeChild || !isHealthTab(modalType)) return;

    const config = getHealthConfig(modalType);
    const title = healthTitle.trim() || config.label;
    const value = healthValue.trim() || null;
    const memo = healthMemo.trim() || null;

    const { error } = await supabase.from('health_logs').insert({
      child_id: activeChild.id,
      recorded_at: (healthDateTime ?? new Date()).toISOString(),
      type: modalType,
      title,
      value,
      memo,
    });

    if (error) {
      console.error('[HealthLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }

    resetHealthForm();
    setModalType(null);
    loadLogs();
  };

  const openEditDateTime = (
    title: string,
    table: EditableDateTimeTable,
    column: string,
    id: string,
    iso: string,
  ) => {
    setEditDateTime({
      title,
      table,
      column,
      id,
      value: new Date(iso),
    });
  };

  const handleSaveEditDateTime = async () => {
    if (!editDateTime) return;

    const { error } = await supabase
      .from(editDateTime.table)
      .update({ [editDateTime.column]: editDateTime.value.toISOString() })
      .eq('id', editDateTime.id);

    if (error) {
      console.error('[LogDateTime] 수정 실패:', error.code, error.message, error.details);
      Alert.alert('수정 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }

    setEditDateTime(null);
    loadLogs();
  };

  const renderDateTimeField = (
    label: string,
    value: Date | null,
    target: DateTimeTarget,
    emptyText: string,
    allowReset = true,
  ) => (
    <>
      <Text style={styles.modalLabel}>{label}</Text>
      <View style={styles.dateTimeRow}>
        <TouchableOpacity
          style={styles.dateTimeButton}
          onPress={() => setDateTimePicker({ target, mode: 'date' })}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          <View style={styles.dateTimeInfo}>
            <Text style={styles.dateTimeCaption}>날짜</Text>
            <Text style={styles.dateTimeValue}>{value ? formatDateButton(value) : '오늘'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateTimeButton}
          onPress={() => setDateTimePicker({ target, mode: 'time' })}
        >
          <Ionicons name="time-outline" size={18} color={Colors.primary} />
          <View style={styles.dateTimeInfo}>
            <Text style={styles.dateTimeCaption}>시간</Text>
            <Text style={styles.dateTimeValue}>{value ? formatTimeButton(value) : '지금'}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={styles.dateTimeSummaryRow}>
        <Text style={styles.dateTimeSummary}>
          {value ? `${formatDateButton(value)} ${formatTimeButton(value)}` : emptyText}
        </Text>
        {allowReset && value ? (
          <TouchableOpacity onPress={() => setDateTimeValue(target, null)}>
            <Text style={styles.dateTimeReset}>초기화</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {dateTimePicker?.target === target ? (
        <View style={styles.inlinePickerBox}>
          <Text style={styles.inlinePickerTitle}>
            {dateTimePicker.mode === 'date' ? '날짜를 선택해주세요' : '시간을 선택해주세요'}
          </Text>
          <DateTimePicker
            value={getDateTimeValue(target) ?? new Date()}
            mode={dateTimePicker.mode}
            display="spinner"
            locale="ko-KR"
            is24Hour
            onChange={handleDateTimeChange}
          />
          <TouchableOpacity style={styles.inlinePickerDone} onPress={() => setDateTimePicker(null)}>
            <Text style={styles.inlinePickerDoneText}>완료</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  if (!activeChild) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Ionicons name="person-add-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyText}>등록된 아이가 없습니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeHealthLogs = isHealthTab(activeTab)
    ? healthLogs.filter((log) => log.type === activeTab)
    : [];
  const modalHealthConfig = isHealthTab(modalType)
    ? getHealthConfig(modalType)
    : null;

  // ─── 렌더링 ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>기록</Text>
        <Text style={styles.headerSub}>{activeChild.name} · 최근 7일</Text>
      </View>

      {/* 탭 */}
      <View style={styles.tabRow}>
        {PRIMARY_TABS.map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Ionicons name={icon} size={16} color={activeTab === key ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.tabRow, styles.healthTabRow]}>
        {HEALTH_TABS.map(({ key, label, icon, color }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, styles.healthTab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Ionicons name={icon} size={15} color={activeTab === key ? color : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 목록 */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {activeTab === 'feeding' && feedingLogs.map((log, index) => (
          <React.Fragment key={log.id}>
            {shouldShowDateHeader(feedingLogs, index, (item) => item.fed_at) && (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(log.fed_at)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.logCard}
              activeOpacity={0.85}
              onPress={() => openFeedingEditor(log)}
            >
              <View style={[styles.logIconBox, { backgroundColor: '#EBF3FB' }]}>
                <Ionicons name="water" size={20} color="#5B9BD5" />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  {log.type === 'breast' ? '모유' : log.type === 'formula' ? '분유' : log.type === 'mixed' ? '혼합' : '이유식'}
                  {log.amount_ml ? ` · ${log.amount_ml}ml` : ''}
                </Text>
                <Text style={styles.logTime}>{formatTime(log.fed_at)}</Text>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}

        {activeTab === 'sleep' && sleepLogs.map((log, index) => (
          <React.Fragment key={log.id}>
            {shouldShowDateHeader(sleepLogs, index, (item) => item.started_at) && (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(log.started_at)}</Text>
              </View>
            )}
            <View style={styles.logCard}>
              <View style={[styles.logIconBox, { backgroundColor: '#EDE7F6' }]}>
                <Ionicons name="moon" size={20} color="#7E57C2" />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  수면 {formatDuration(log.duration_minutes)}
                </Text>
                <View style={styles.sleepTimeRow}>
                  <TouchableOpacity
                    onPress={() => openEditDateTime('수면 시작 시간 수정', 'sleep_logs', 'started_at', log.id, log.started_at)}
                  >
                    <Text style={styles.logTime}>{formatTime(log.started_at)}</Text>
                  </TouchableOpacity>
                  {log.ended_at ? (
                    <>
                      <Text style={styles.logTime}> ~ </Text>
                      <TouchableOpacity
                        onPress={() => openEditDateTime('수면 종료 시간 수정', 'sleep_logs', 'ended_at', log.id, log.ended_at!)}
                      >
                        <Text style={styles.logTime}>{formatTime(log.ended_at)}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openEditDateTime('수면 종료 시간 추가', 'sleep_logs', 'ended_at', log.id, new Date().toISOString())}
                    >
                      <Text style={styles.logTime}> (진행 중)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </React.Fragment>
        ))}

        {activeTab === 'diaper' && diaperLogs.map((log, index) => (
          <React.Fragment key={log.id}>
            {shouldShowDateHeader(diaperLogs, index, (item) => item.changed_at) && (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(log.changed_at)}</Text>
              </View>
            )}
            <View style={styles.logCard}>
              <View style={[styles.logIconBox, { backgroundColor: '#FFF8E1' }]}>
                <Ionicons name="refresh-circle" size={20} color="#FFA000" />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  {log.type === 'wet' ? '소변' : log.type === 'dirty' ? '대변' : log.type === 'both' ? '소변+대변' : '교체'}
                </Text>
                <TouchableOpacity
                  onPress={() => openEditDateTime('기저귀 날짜/시간 수정', 'diaper_logs', 'changed_at', log.id, log.changed_at)}
                >
                  <Text style={styles.logTime}>{formatTime(log.changed_at)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </React.Fragment>
        ))}

        {isHealthTab(activeTab) && activeHealthLogs.map((log, index) => {
          const config = getHealthConfig(log.type);

          return (
            <React.Fragment key={log.id}>
              {shouldShowDateHeader(activeHealthLogs, index, (item) => item.recorded_at) && (
                <View style={styles.dateHeader}>
                  <Text style={styles.dateHeaderText}>{formatDateHeader(log.recorded_at)}</Text>
                </View>
              )}
              <View style={styles.logCard}>
                <View style={[styles.logIconBox, { backgroundColor: config.backgroundColor }]}>
                  <Ionicons name={config.icon} size={20} color={config.color} />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logTitle}>
                    {log.title}{log.value ? ` · ${log.value}` : ''}
                  </Text>
                  {log.memo ? (
                    <Text style={styles.logMemo}>{log.memo}</Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => openEditDateTime(`${config.label} 날짜/시간 수정`, 'health_logs', 'recorded_at', log.id, log.recorded_at)}
                  >
                    <Text style={styles.logTime}>{formatTime(log.recorded_at)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </React.Fragment>
          );
        })}

        {((activeTab === 'feeding' && feedingLogs.length === 0) ||
          (activeTab === 'sleep' && sleepLogs.length === 0) ||
          (activeTab === 'diaper' && diaperLogs.length === 0) ||
          (isHealthTab(activeTab) && activeHealthLogs.length === 0)) && (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>최근 7일간 기록이 없습니다</Text>
          </View>
        )}
      </ScrollView>

      {/* 추가 버튼 */}
      <TouchableOpacity style={styles.fab} onPress={() => openAddModal(activeTab)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ─── 수유 모달 ─── */}
      <Modal visible={modalType === 'feeding'} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeLogModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {editingFeedingLog ? '수유 기록 수정' : '수유 기록'}
            </Text>
            {renderDateTimeField('날짜/시간', feedDateTime, 'feed', '선택하지 않으면 현재 시각으로 저장돼요')}
            <Text style={styles.modalLabel}>유형</Text>
            <View style={styles.optionRow}>
              {([
                { val: 'breast', label: '모유' },
                { val: 'formula', label: '분유' },
                { val: 'mixed', label: '혼합' },
                { val: 'solid', label: '이유식' },
              ] as const).map(({ val, label }) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.option, feedType === val && styles.optionActive]}
                  onPress={() => setFeedType(val)}
                >
                  <Text style={[styles.optionText, feedType === val && styles.optionTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>양 (ml, 선택)</Text>
            <TextInput
              style={styles.input}
              value={feedAmount}
              onChangeText={setFeedAmount}
              keyboardType="numeric"
              placeholder="예: 150"
              placeholderTextColor={Colors.textLight}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeLogModal}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFeeding}>
                <Text style={styles.saveBtnText}>{editingFeedingLog ? '수정' : '저장'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── 수면 모달 ─── */}
      <Modal visible={modalType === 'sleep'} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeLogModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>수면 기록</Text>
            {renderDateTimeField('시작 날짜/시간', sleepStart, 'sleepStart', '선택하지 않으면 현재 시각으로 시작돼요')}
            {renderDateTimeField('종료 날짜/시간', sleepEnd, 'sleepEnd', '선택하지 않으면 진행 중으로 저장돼요')}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalType(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSleep}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── 기저귀 모달 ─── */}
      <Modal visible={modalType === 'diaper'} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeLogModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>기저귀 교체 기록</Text>
            {renderDateTimeField('날짜/시간', diaperDateTime, 'diaper', '선택하지 않으면 현재 시각으로 저장돼요')}
            <Text style={styles.modalLabel}>유형</Text>
            <View style={styles.optionRow}>
              {([
                { val: 'wet', label: '소변' },
                { val: 'dirty', label: '대변' },
                { val: 'both', label: '소변+대변' },
                { val: 'dry', label: '교체만' },
              ] as const).map(({ val, label }) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.option, diaperType === val && styles.optionActive]}
                  onPress={() => setDiaperType(val)}
                >
                  <Text style={[styles.optionText, diaperType === val && styles.optionTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalType(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDiaper}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── 건강 모달 ─── */}
      <Modal visible={modalHealthConfig !== null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeLogModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {modalHealthConfig?.label ?? '건강'} 기록
            </Text>
            {renderDateTimeField('날짜/시간', healthDateTime, 'health', '선택하지 않으면 현재 시각으로 저장돼요')}
            <Text style={styles.modalLabel}>{modalHealthConfig?.titleLabel}</Text>
            <TextInput
              style={styles.input}
              value={healthTitle}
              onChangeText={setHealthTitle}
              placeholder={modalHealthConfig?.titlePlaceholder}
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.modalLabel}>{modalHealthConfig?.valueLabel}</Text>
            <TextInput
              style={styles.input}
              value={healthValue}
              onChangeText={setHealthValue}
              keyboardType={modalType === 'temperature' ? 'decimal-pad' : 'default'}
              placeholder={modalHealthConfig?.valuePlaceholder}
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.modalLabel}>메모 (선택)</Text>
            <TextInput
              style={[styles.input, styles.memoInput]}
              value={healthMemo}
              onChangeText={setHealthMemo}
              multiline
              placeholder="상세 증상, 복용 후 반응, 진료 메모 등을 적어주세요"
              placeholderTextColor={Colors.textLight}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  resetHealthForm();
                  setModalType(null);
                }}
              >
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveHealth}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── 날짜/시간 수정 모달 ─── */}
      <Modal visible={editDateTime !== null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeEditDateTimeModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>{editDateTime?.title ?? '날짜/시간 수정'}</Text>
            {editDateTime
              ? renderDateTimeField(
                '날짜/시간',
                editDateTime.value,
                'edit',
                '',
                false,
              )
              : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditDateTime(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEditDateTime}>
                <Text style={styles.saveBtnText}>수정</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    ...Shadows.sm,
  },
  healthTabRow: {
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  healthTab: {
    gap: 3,
    paddingHorizontal: 2,
  },
  tabActive: { backgroundColor: Colors.background },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  list: { flex: 1, paddingHorizontal: Spacing.lg },
  dateHeader: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textLight,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  logIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  logInfo: { flex: 1 },
  logTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  logMemo: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  sleepTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  logTime: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyList: { alignItems: 'center', paddingTop: 60 },
  emptyListText: { color: Colors.textLight, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: Colors.textSecondary, fontSize: 16 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  pickerModalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  pickerCurrentValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  pickerOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  pickerOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  optionTextActive: { color: Colors.primary, fontWeight: '700' },
  dateTimeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dateTimeButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  dateTimeInfo: { flex: 1 },
  dateTimeCaption: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dateTimeSummaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: Spacing.xs,
  },
  dateTimeSummary: {
    flex: 1,
    fontSize: 12,
    color: Colors.textLight,
  },
  dateTimeReset: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: Spacing.sm,
  },
  inlinePickerBox: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inlinePickerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inlinePickerDone: {
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  inlinePickerDoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 48,
    fontSize: 15,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  memoInput: {
    height: 92,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
