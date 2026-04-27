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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChildStore } from '../../store/childStore';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type LogTab = 'feeding' | 'sleep' | 'diaper';

type FeedingLog = { id: string; fed_at: string; amount_ml: number | null; type: string };
type SleepLog = { id: string; started_at: string; ended_at: string | null; duration_minutes: number | null };
type DiaperLog = { id: string; changed_at: string; type: string };

// ─── 도우미 ───────────────────────────────────────────────────────────────────

function parseUserDate(input: string): Date | null {
  if (!input.trim()) return null;

  // "HH:mm" → 오늘 날짜에 적용
  const timeOnly = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const d = new Date();
    d.setHours(parseInt(timeOnly[1], 10), parseInt(timeOnly[2], 10), 0, 0);
    return d;
  }

  // "YYYY-MM-DD HH:mm" → 공백을 T로 교체해서 ISO 형식으로 변환
  const dateTime = input.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (dateTime) {
    const d = new Date(`${dateTime[1]}T${dateTime[2]}:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  // 그 외 ISO 형식 시도
  const d = new Date(input.trim());
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
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
  const [refreshing, setRefreshing] = useState(false);
  const [modalType, setModalType] = useState<LogTab | null>(null);

  // 수유 폼
  const [feedAmount, setFeedAmount] = useState('');
  const [feedType, setFeedType] = useState<'breast' | 'formula' | 'mixed' | 'solid'>('breast');
  // 수면 폼
  const [sleepStart, setSleepStart] = useState('');
  const [sleepEnd, setSleepEnd] = useState('');
  // 기저귀 폼
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both' | 'dry'>('wet');

  const loadLogs = useCallback(async () => {
    if (!activeChild) return;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    const [feeding, sleep, diaper] = await Promise.all([
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
    ]);

    if (feeding.data) setFeedingLogs(feeding.data);
    if (sleep.data) setSleepLogs(sleep.data);
    if (diaper.data) setDiaperLogs(diaper.data);
  }, [activeChild]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const handleSaveFeeding = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from('feeding_logs').insert({
      child_id: activeChild.id,
      fed_at: new Date().toISOString(),
      amount_ml: feedAmount ? parseInt(feedAmount, 10) : null,
      type: feedType,
    });
    if (error) {
      console.error('[FeedingLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    setFeedAmount('');
    setModalType(null);
    loadLogs();
  };

  const handleSaveSleep = async () => {
    if (!activeChild) return;
    const started = parseUserDate(sleepStart) ?? new Date();
    const ended = sleepEnd ? parseUserDate(sleepEnd) : null;
    if (sleepStart && !started) {
      Alert.alert('입력 오류', '시작 시간 형식이 올바르지 않습니다.\n예) 22:00 또는 2025-01-01 22:00');
      return;
    }
    if (sleepEnd && !ended) {
      Alert.alert('입력 오류', '종료 시간 형식이 올바르지 않습니다.\n예) 06:30 또는 2025-01-02 06:30');
      return;
    }
    const { error } = await supabase.from('sleep_logs').insert({
      child_id: activeChild.id,
      started_at: started.toISOString(),
      ended_at: ended ? ended.toISOString() : null,
    });
    if (error) {
      console.error('[SleepLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    setSleepStart('');
    setSleepEnd('');
    setModalType(null);
    loadLogs();
  };

  const handleSaveDiaper = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from('diaper_logs').insert({
      child_id: activeChild.id,
      changed_at: new Date().toISOString(),
      type: diaperType,
    });
    if (error) {
      console.error('[DiaperLog] 저장 실패:', error.code, error.message, error.details);
      Alert.alert('저장 실패', `${error.message}\n\n코드: ${error.code}`);
      return;
    }
    setModalType(null);
    loadLogs();
  };

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

  // ─── 렌더링 ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>기록</Text>
        <Text style={styles.headerSub}>{activeChild.name} · 최근 7일</Text>
      </View>

      {/* 탭 */}
      <View style={styles.tabRow}>
        {([
          { key: 'feeding', label: '수유', icon: 'water' },
          { key: 'sleep', label: '수면', icon: 'moon' },
          { key: 'diaper', label: '기저귀', icon: 'refresh-circle' },
        ] as const).map(({ key, label, icon }) => (
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

      {/* 목록 */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {activeTab === 'feeding' && feedingLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
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
          </View>
        ))}

        {activeTab === 'sleep' && sleepLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={[styles.logIconBox, { backgroundColor: '#EDE7F6' }]}>
              <Ionicons name="moon" size={20} color="#7E57C2" />
            </View>
            <View style={styles.logInfo}>
              <Text style={styles.logTitle}>
                수면 {formatDuration(log.duration_minutes)}
              </Text>
              <Text style={styles.logTime}>
                {formatTime(log.started_at)}{log.ended_at ? ` ~ ${formatTime(log.ended_at)}` : ' (진행 중)'}
              </Text>
            </View>
          </View>
        ))}

        {activeTab === 'diaper' && diaperLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={[styles.logIconBox, { backgroundColor: '#FFF8E1' }]}>
              <Ionicons name="refresh-circle" size={20} color="#FFA000" />
            </View>
            <View style={styles.logInfo}>
              <Text style={styles.logTitle}>
                {log.type === 'wet' ? '소변' : log.type === 'dirty' ? '대변' : log.type === 'both' ? '소변+대변' : '교체'}
              </Text>
              <Text style={styles.logTime}>{formatTime(log.changed_at)}</Text>
            </View>
          </View>
        ))}

        {((activeTab === 'feeding' && feedingLogs.length === 0) ||
          (activeTab === 'sleep' && sleepLogs.length === 0) ||
          (activeTab === 'diaper' && diaperLogs.length === 0)) && (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>최근 7일간 기록이 없습니다</Text>
          </View>
        )}
      </ScrollView>

      {/* 추가 버튼 */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalType(activeTab)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ─── 수유 모달 ─── */}
      <Modal visible={modalType === 'feeding'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>수유 기록</Text>
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalType(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFeeding}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── 수면 모달 ─── */}
      <Modal visible={modalType === 'sleep'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>수면 기록</Text>
            <Text style={styles.modalLabel}>시작 시간 (비워두면 지금)</Text>
            <TextInput
              style={styles.input}
              value={sleepStart}
              onChangeText={setSleepStart}
              placeholder="예: 22:00  또는  2025-01-01 22:00"
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.modalLabel}>종료 시간 (비워두면 진행 중)</Text>
            <TextInput
              style={styles.input}
              value={sleepEnd}
              onChangeText={setSleepEnd}
              placeholder="예: 06:30  또는  2025-01-02 06:30"
              placeholderTextColor={Colors.textLight}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalType(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSleep}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── 기저귀 모달 ─── */}
      <Modal visible={modalType === 'diaper'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>기저귀 교체 기록</Text>
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
          </View>
        </View>
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
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    ...Shadows.sm,
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
  tabActive: { backgroundColor: Colors.background },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  list: { flex: 1, paddingHorizontal: Spacing.lg },
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
