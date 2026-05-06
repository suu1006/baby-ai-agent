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
  Platform,
  Keyboard,
  InputAccessoryView,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useChildStore } from '../../store/childStore';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type OverviewLogTab = 'all';
type PrimaryLogTab = 'feeding' | 'sleep' | 'diaper';
type HealthLogType = 'medication' | 'temperature' | 'hospital' | 'symptom';
type LogTab = OverviewLogTab | PrimaryLogTab | HealthLogType;
type DateTimeTarget = 'feed' | 'sleepStart' | 'sleepEnd' | 'diaper' | 'health';
type DateTimePickerMode = 'date' | 'time';
type FeedingType = 'breast' | 'formula' | 'mixed' | 'solid';

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
type TimelineItem =
  | { id: string; tab: 'feeding'; at: string; title: string; subtitle: string; icon: IconName; color: string; backgroundColor: string; log: FeedingLog }
  | { id: string; tab: 'sleep'; at: string; title: string; subtitle: string; detail: string; icon: IconName; color: string; backgroundColor: string; log: SleepLog }
  | { id: string; tab: 'diaper'; at: string; title: string; subtitle: string; icon: IconName; color: string; backgroundColor: string; log: DiaperLog }
  | { id: string; tab: HealthLogType; at: string; title: string; subtitle: string; icon: IconName; color: string; backgroundColor: string; log: HealthLog };

const ALL_TAB = {
  key: 'all',
  label: '전체',
  icon: 'list',
  color: Colors.primary,
  backgroundColor: Colors.primaryLight,
} as const;

const PRIMARY_TABS = [
  { key: 'feeding', label: '수유', icon: 'water', color: '#5B9BD5', backgroundColor: '#EBF3FB' },
  { key: 'sleep', label: '수면', icon: 'moon', color: '#7E57C2', backgroundColor: '#EDE7F6' },
  { key: 'diaper', label: '기저귀', icon: 'refresh-circle', color: '#FFA000', backgroundColor: '#FFF8E1' },
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

function feedingLabel(type: string) {
  return type === 'breast'
    ? '모유'
    : type === 'formula'
      ? '분유'
      : type === 'mixed'
        ? '혼합'
        : '이유식';
}

function diaperLabel(type: string) {
  return type === 'wet'
    ? '소변'
    : type === 'dirty'
      ? '대변'
      : type === 'both'
        ? '소변+대변'
        : '교체';
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

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date: Date) {
  const start = startOfLocalDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function isSameLocalDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatCalendarMonth(date: Date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  });
}

function withCurrentTime(date: Date) {
  const now = new Date();
  const next = new Date(date);
  next.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return next;
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

const IOS_NUMERIC_INPUT_ACCESSORY_ID = 'logsNumericInputAccessory';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** + 버튼과 바텀 탭 사이 / 리스트가 FAB에 가리지 않도록 */
const FAB_SIZE = 56;
const FAB_GAP_ABOVE_TAB = 12;
const LIST_PADDING_BOTTOM = FAB_GAP_ABOVE_TAB + FAB_SIZE + Spacing.sm;

/** 전체 딤·시트 뒤 배경 (키보드 피하며 시트만 올릴 때 틈으로 목록이 비치지 않게) */
const MODAL_DIM = 'rgba(0,0,0,0.4)';

function LogSheetModal({
  visible,
  onClose,
  children,
  /** iOS 숫자·소수 키보드용 상단 「완료」 바 */
  numericAccessory,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  numericAccessory?: boolean;
}) {
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardBottomInset(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      setKeyboardBottomInset(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardBottomInset(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <View style={styles.modalKeyboardRoot}>
        {Platform.OS === 'ios' && numericAccessory ? (
          <InputAccessoryView nativeID={IOS_NUMERIC_INPUT_ACCESSORY_ID}>
            <View style={styles.inputAccessoryBar}>
              <TouchableOpacity
                onPress={() => Keyboard.dismiss()}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              >
                <Text style={styles.inputAccessoryDone}>완료</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
        <Pressable
          style={styles.modalDimBackdrop}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
        <View
          style={[
            styles.modalSheetWrap,
            { bottom: keyboardBottomInset },
          ]}
        >
          <View style={styles.modalBox}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function LogsScreen() {
  const { activeChild } = useChildStore();
  const [activeTab, setActiveTab] = useState<LogTab>('all');
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [diaperLogs, setDiaperLogs] = useState<DiaperLog[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [modalType, setModalType] = useState<LogTab | null>(null);
  const [dateTimePicker, setDateTimePicker] = useState<{
    target: DateTimeTarget;
    mode: DateTimePickerMode;
  } | null>(null);
  // 수유 폼
  const [feedAmount, setFeedAmount] = useState('');
  const [feedType, setFeedType] = useState<FeedingType>('breast');
  const [feedDateTime, setFeedDateTime] = useState<Date | null>(null);
  const [editingFeedingLog, setEditingFeedingLog] = useState<FeedingLog | null>(null);
  // 수면 폼
  const [sleepStart, setSleepStart] = useState<Date | null>(null);
  const [sleepEnd, setSleepEnd] = useState<Date | null>(null);
  const [editingSleepLog, setEditingSleepLog] = useState<SleepLog | null>(null);
  // 기저귀 폼
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both' | 'dry'>('wet');
  const [diaperDateTime, setDiaperDateTime] = useState<Date | null>(null);
  const [editingDiaperLog, setEditingDiaperLog] = useState<DiaperLog | null>(null);
  // 건강 폼
  const [healthTitle, setHealthTitle] = useState('');
  const [healthValue, setHealthValue] = useState('');
  const [healthMemo, setHealthMemo] = useState('');
  const [healthDateTime, setHealthDateTime] = useState<Date | null>(null);
  const [editingHealthLog, setEditingHealthLog] = useState<HealthLog | null>(null);

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
    const dayStartISO = startOfLocalDay(selectedDate).toISOString();
    const dayEndISO = endOfLocalDay(selectedDate).toISOString();

    const [feeding, sleep, diaper, health] = await Promise.all([
      supabase
        .from('feeding_logs')
        .select('id, fed_at, amount_ml, type')
        .eq('child_id', activeChild.id)
        .gte('fed_at', dayStartISO)
        .lt('fed_at', dayEndISO)
        .order('fed_at', { ascending: false })
        .limit(100),
      supabase
        .from('sleep_logs')
        .select('id, started_at, ended_at, duration_minutes')
        .eq('child_id', activeChild.id)
        .gte('started_at', dayStartISO)
        .lt('started_at', dayEndISO)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('diaper_logs')
        .select('id, changed_at, type')
        .eq('child_id', activeChild.id)
        .gte('changed_at', dayStartISO)
        .lt('changed_at', dayEndISO)
        .order('changed_at', { ascending: false })
        .limit(100),
      supabase
        .from('health_logs')
        .select('id, recorded_at, type, title, value, memo')
        .eq('child_id', activeChild.id)
        .gte('recorded_at', dayStartISO)
        .lt('recorded_at', dayEndISO)
        .order('recorded_at', { ascending: false })
        .limit(100),
    ]);

    if (feeding.data) setFeedingLogs(feeding.data);
    if (sleep.data) setSleepLogs(sleep.data);
    if (diaper.data) setDiaperLogs(diaper.data);
    if (health.data) setHealthLogs(health.data as HealthLog[]);
  }, [activeChild, selectedDate]);

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

  const resetSleepForm = () => {
    setEditingSleepLog(null);
    setSleepStart(null);
    setSleepEnd(null);
  };

  const openAddModal = (tab: LogTab) => {
    setDateTimePicker(null);
    if (tab === 'feeding') {
      resetFeedingForm();
      setFeedDateTime(withCurrentTime(selectedDate));
    }
    if (tab === 'sleep') {
      resetSleepForm();
      setSleepStart(withCurrentTime(selectedDate));
    }
    if (tab === 'diaper') {
      resetDiaperForm();
      setDiaperDateTime(withCurrentTime(selectedDate));
    }
    if (isHealthTab(tab)) {
      resetHealthForm();
      setHealthDateTime(withCurrentTime(selectedDate));
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

  const openSleepEditor = (log: SleepLog) => {
    setDateTimePicker(null);
    setEditingSleepLog(log);
    setSleepStart(new Date(log.started_at));
    setSleepEnd(log.ended_at ? new Date(log.ended_at) : null);
    setModalType('sleep');
  };

  const resetDiaperForm = () => {
    setEditingDiaperLog(null);
    setDiaperDateTime(null);
    setDiaperType('wet');
  };

  const openDiaperEditor = (log: DiaperLog) => {
    setDateTimePicker(null);
    setEditingDiaperLog(log);
    setDiaperDateTime(new Date(log.changed_at));
    const t = log.type;
    setDiaperType(
      t === 'wet' || t === 'dirty' || t === 'both' || t === 'dry' ? t : 'wet',
    );
    setModalType('diaper');
  };

  const openHealthEditor = (log: HealthLog) => {
    if (!isHealthTab(log.type)) return;
    setDateTimePicker(null);
    setEditingHealthLog(log);
    setHealthTitle(log.title);
    setHealthValue(log.value ?? '');
    setHealthMemo(log.memo ?? '');
    setHealthDateTime(new Date(log.recorded_at));
    setModalType(log.type);
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
    const startedAt = (sleepStart ?? new Date()).toISOString();
    const endedAt = sleepEnd ? sleepEnd.toISOString() : null;

    const { error } = editingSleepLog
      ? await supabase
        .from('sleep_logs')
        .update({
          started_at: startedAt,
          ended_at: endedAt,
        })
        .eq('id', editingSleepLog.id)
      : await supabase.from('sleep_logs').insert({
        child_id: activeChild.id,
        started_at: startedAt,
        ended_at: endedAt,
      });

    if (error) {
      console.error('[SleepLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    resetSleepForm();
    setModalType(null);
    loadLogs();
  };

  const handleSaveDiaper = async () => {
    if (!activeChild) return;
    const changedAt = (diaperDateTime ?? new Date()).toISOString();
    const payload = { changed_at: changedAt, type: diaperType };

    const { error } = editingDiaperLog
      ? await supabase.from('diaper_logs').update(payload).eq('id', editingDiaperLog.id)
      : await supabase.from('diaper_logs').insert({
        child_id: activeChild.id,
        ...payload,
      });

    if (error) {
      console.error('[DiaperLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    resetDiaperForm();
    setModalType(null);
    loadLogs();
  };

  const resetHealthForm = () => {
    setEditingHealthLog(null);
    setHealthTitle('');
    setHealthValue('');
    setHealthMemo('');
    setHealthDateTime(null);
  };

  const closeLogModal = () => {
    Keyboard.dismiss();
    setDateTimePicker(null);
    if (modalType === 'feeding') {
      resetFeedingForm();
    }
    if (isHealthTab(modalType)) {
      resetHealthForm();
    }
    if (modalType === 'sleep') {
      resetSleepForm();
    }
    if (modalType === 'diaper') {
      resetDiaperForm();
    }
    setModalType(null);
  };

  const handleSaveHealth = async () => {
    if (!activeChild || !isHealthTab(modalType)) return;

    const config = getHealthConfig(modalType);
    const title = healthTitle.trim() || config.label;
    const value = healthValue.trim() || null;
    const memo = healthMemo.trim() || null;
    const recordedAt = (healthDateTime ?? new Date()).toISOString();

    const { error } = editingHealthLog
      ? await supabase
        .from('health_logs')
        .update({
          recorded_at: recordedAt,
          title,
          value,
          memo,
        })
        .eq('id', editingHealthLog.id)
      : await supabase.from('health_logs').insert({
        child_id: activeChild.id,
        recorded_at: recordedAt,
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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
  const calendarWeekStart = getWeekStart(selectedDate);
  const calendarDays = Array.from({ length: 7 }, (_, index) => addDays(calendarWeekStart, index));
  const timelineItems: TimelineItem[] = [
    ...feedingLogs.map((log) => ({
      id: `feeding-${log.id}`,
      tab: 'feeding' as const,
      at: log.fed_at,
      title: `${feedingLabel(log.type)}${log.amount_ml ? ` · ${log.amount_ml}ml` : ''}`,
      subtitle: '수유',
      icon: 'water' as IconName,
      color: '#5B9BD5',
      backgroundColor: '#EBF3FB',
      log,
    })),
    ...sleepLogs.map((log) => ({
      id: `sleep-${log.id}`,
      tab: 'sleep' as const,
      at: log.started_at,
      title: `수면 ${formatDuration(log.duration_minutes)}`,
      subtitle: '수면',
      detail: log.ended_at ? `${formatTime(log.started_at)} ~ ${formatTime(log.ended_at)}` : `${formatTime(log.started_at)} 시작 · 진행 중`,
      icon: 'moon' as IconName,
      color: '#7E57C2',
      backgroundColor: '#EDE7F6',
      log,
    })),
    ...diaperLogs.map((log) => ({
      id: `diaper-${log.id}`,
      tab: 'diaper' as const,
      at: log.changed_at,
      title: diaperLabel(log.type),
      subtitle: '기저귀',
      icon: 'refresh-circle' as IconName,
      color: '#FFA000',
      backgroundColor: '#FFF8E1',
      log,
    })),
    ...healthLogs.map((log) => {
      const config = getHealthConfig(log.type);

      return {
        id: `health-${log.id}`,
        tab: log.type,
        at: log.recorded_at,
        title: `${log.title}${log.value ? ` · ${log.value}` : ''}`,
        subtitle: config.label,
        icon: config.icon as IconName,
        color: config.color,
        backgroundColor: config.backgroundColor,
        log,
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // ─── 렌더링 ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>기록</Text>
        <Text style={styles.headerSub}>{activeChild.name} · {formatDateButton(selectedDate)}</Text>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={styles.calendarNavButton}
            onPress={() => setSelectedDate((prev) => addDays(prev, -7))}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.calendarTitle}>{formatCalendarMonth(selectedDate)}</Text>
          <TouchableOpacity
            style={styles.calendarNavButton}
            onPress={() => setSelectedDate((prev) => addDays(prev, 7))}
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.calendarDays}>
          {calendarDays.map((day) => {
            const selected = isSameLocalDate(day, selectedDate);
            const today = isSameLocalDate(day, new Date());

            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[
                  styles.calendarDay,
                  today && styles.calendarDayToday,
                  selected && styles.calendarDaySelected,
                ]}
                onPress={() => setSelectedDate(day)}
              >
                <Text style={[styles.calendarWeekday, selected && styles.calendarTextSelected]}>
                  {WEEKDAY_LABELS[day.getDay()]}
                </Text>
                <Text style={[styles.calendarDate, selected && styles.calendarTextSelected]}>
                  {day.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!isSameLocalDate(selectedDate, new Date()) ? (
          <TouchableOpacity style={styles.todayButton} onPress={() => setSelectedDate(new Date())}>
            <Text style={styles.todayButtonText}>오늘로 이동</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 탭 */}
      <View style={styles.tabRow}>
        {[ALL_TAB, ...PRIMARY_TABS].map(({ key, label, icon, color, backgroundColor }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.tab,
              activeTab === key && styles.tabActive,
              activeTab === key && { backgroundColor, borderColor: color },
            ]}
            onPress={() => setActiveTab(key)}
          >
            <Ionicons name={icon} size={16} color={activeTab === key ? color : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive, activeTab === key && { color }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.tabRow, styles.healthTabRow]}>
        {HEALTH_TABS.map(({ key, label, icon, color, backgroundColor }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.tab,
              styles.healthTab,
              activeTab === key && styles.tabActive,
              activeTab === key && { backgroundColor, borderColor: color },
            ]}
            onPress={() => setActiveTab(key)}
          >
            <Ionicons name={icon} size={15} color={activeTab === key ? color : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive, activeTab === key && { color }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 목록 */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: LIST_PADDING_BOTTOM }}
      >
        {activeTab === 'all' && timelineItems.map((item, index) => (
          <React.Fragment key={item.id}>
            {shouldShowDateHeader(timelineItems, index, (timelineItem) => timelineItem.at) && (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(item.at)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.logCard}
              activeOpacity={0.85}
              onPress={() => {
                if (item.tab === 'feeding') openFeedingEditor(item.log);
                if (item.tab === 'sleep') openSleepEditor(item.log);
                if (item.tab === 'diaper') openDiaperEditor(item.log);
                if (isHealthTab(item.tab)) openHealthEditor(item.log as HealthLog);
              }}
            >
              <View style={[styles.logIconBox, { backgroundColor: item.backgroundColor }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.logInfo}>
                <View style={styles.timelineTitleRow}>
                  <Text style={styles.logTitle}>{item.title}</Text>
                  {item.tab !== 'sleep' ? (
                    <Text style={[styles.timelineBadge, { color: item.color, backgroundColor: item.backgroundColor }]}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                {'memo' in item.log && item.log.memo ? (
                  <Text style={styles.logMemo}>{item.log.memo}</Text>
                ) : null}
                <Text style={styles.logTime}>{item.tab === 'sleep' ? item.detail : formatTime(item.at)}</Text>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}

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
                  {feedingLabel(log.type)}
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
            <TouchableOpacity
              style={styles.logCard}
              activeOpacity={0.85}
              onPress={() => openSleepEditor(log)}
            >
              <View style={[styles.logIconBox, { backgroundColor: '#EDE7F6' }]}>
                <Ionicons name="moon" size={20} color="#7E57C2" />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  수면 {formatDuration(log.duration_minutes)}
                </Text>
                <View style={styles.sleepTimeRow}>
                  <Text style={styles.logTime}>{formatTime(log.started_at)}</Text>
                  {log.ended_at ? (
                    <>
                      <Text style={styles.logTime}> ~ </Text>
                      <Text style={styles.logTime}>{formatTime(log.ended_at)}</Text>
                    </>
                  ) : (
                    <Text style={styles.logTime}> (진행 중)</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}

        {activeTab === 'diaper' && diaperLogs.map((log, index) => (
          <React.Fragment key={log.id}>
            {shouldShowDateHeader(diaperLogs, index, (item) => item.changed_at) && (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(log.changed_at)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.logCard}
              activeOpacity={0.85}
              onPress={() => openDiaperEditor(log)}
            >
              <View style={[styles.logIconBox, { backgroundColor: '#FFF8E1' }]}>
                <Ionicons name="refresh-circle" size={20} color="#FFA000" />
              </View>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  {diaperLabel(log.type)}
                </Text>
                <Text style={styles.logTime}>{formatTime(log.changed_at)}</Text>
              </View>
            </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.logCard}
                activeOpacity={0.85}
                onPress={() => openHealthEditor(log)}
              >
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
                  <Text style={styles.logTime}>{formatTime(log.recorded_at)}</Text>
                </View>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}

        {((activeTab === 'all' && timelineItems.length === 0) ||
          (activeTab === 'feeding' && feedingLogs.length === 0) ||
          (activeTab === 'sleep' && sleepLogs.length === 0) ||
          (activeTab === 'diaper' && diaperLogs.length === 0) ||
          (isHealthTab(activeTab) && activeHealthLogs.length === 0)) && (
            <View style={styles.emptyList}>
              <Text style={styles.emptyListText}>선택한 날짜에 기록이 없습니다</Text>
            </View>
          )}
      </ScrollView>

      {/* 추가 버튼 */}
      {activeTab !== 'all' ? (
        <TouchableOpacity style={styles.fab} onPress={() => openAddModal(activeTab)}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* ─── 수유 모달 ─── */}
      <LogSheetModal visible={modalType === 'feeding'} onClose={closeLogModal} numericAccessory>
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
          inputAccessoryViewID={Platform.OS === 'ios' ? IOS_NUMERIC_INPUT_ACCESSORY_ID : undefined}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
        />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={closeLogModal}>
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFeeding}>
            <Text style={styles.saveBtnText}>{editingFeedingLog ? '수정' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LogSheetModal>

      {/* ─── 수면 모달 ─── */}
      <LogSheetModal
        visible={modalType === 'sleep'}
        onClose={() => {
          Keyboard.dismiss();
          setDateTimePicker(null);
          resetSleepForm();
          setModalType(null);
        }}
      >
        <Text style={styles.modalTitle}>
          {editingSleepLog ? '수면 기록 수정' : '수면 기록'}
        </Text>
        {renderDateTimeField('시작 날짜/시간', sleepStart, 'sleepStart', '선택하지 않으면 현재 시각으로 시작돼요')}
        {renderDateTimeField('종료 날짜/시간', sleepEnd, 'sleepEnd', '선택하지 않으면 진행 중으로 저장돼요')}
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              Keyboard.dismiss();
              setDateTimePicker(null);
              resetSleepForm();
              setModalType(null);
            }}
          >
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSleep}>
            <Text style={styles.saveBtnText}>{editingSleepLog ? '수정' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LogSheetModal>

      {/* ─── 기저귀 모달 ─── */}
      <LogSheetModal
        visible={modalType === 'diaper'}
        onClose={() => {
          Keyboard.dismiss();
          setDateTimePicker(null);
          resetDiaperForm();
          setModalType(null);
        }}
      >
        <Text style={styles.modalTitle}>
          {editingDiaperLog ? '기저귀 기록 수정' : '기저귀 교체 기록'}
        </Text>
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
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              Keyboard.dismiss();
              setDateTimePicker(null);
              resetDiaperForm();
              setModalType(null);
            }}
          >
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDiaper}>
            <Text style={styles.saveBtnText}>{editingDiaperLog ? '수정' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LogSheetModal>

      {/* ─── 건강 모달 ─── */}
      <LogSheetModal
        visible={modalHealthConfig !== null}
        onClose={closeLogModal}
        numericAccessory={modalType === 'temperature'}
      >
        <Text style={styles.modalTitle}>
          {editingHealthLog
            ? `${modalHealthConfig?.label ?? '건강'} 기록 수정`
            : `${modalHealthConfig?.label ?? '건강'} 기록`}
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
          inputAccessoryViewID={
            Platform.OS === 'ios' && modalType === 'temperature'
              ? IOS_NUMERIC_INPUT_ACCESSORY_ID
              : undefined
          }
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
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
              Keyboard.dismiss();
              setDateTimePicker(null);
              resetHealthForm();
              setModalType(null);
            }}
          >
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveHealth}>
            <Text style={styles.saveBtnText}>{editingHealthLog ? '수정' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LogSheetModal>

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
  calendarCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    ...Shadows.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  calendarTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  calendarNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  calendarDays: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarDay: {
    flex: 1,
    minHeight: 58,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  calendarDayToday: {
    borderColor: Colors.primary,
  },
  calendarDaySelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  calendarWeekday: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  calendarDate: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  calendarTextSelected: {
    color: Colors.white,
  },
  todayButton: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
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
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
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
    bottom: FAB_GAP_ABOVE_TAB,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  modalKeyboardRoot: {
    flex: 1,
    backgroundColor: MODAL_DIM,
  },
  modalDimBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: MODAL_DIM,
  },
  modalSheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    zIndex: 2,
    elevation: 24,
  },
  inputAccessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#E8E8ED',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  inputAccessoryDone: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
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
