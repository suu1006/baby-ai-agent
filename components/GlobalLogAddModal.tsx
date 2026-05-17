import React, { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChildStore } from '../store/childStore';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Shadows, Spacing } from '../constants/theme';

type LogType = 'feeding' | 'sleep' | 'diaper' | 'medication' | 'temperature' | 'hospital' | 'symptom';

type GlobalLogAddModalProps = {
  visible: boolean;
  onClose: () => void;
};

const LOG_OPTIONS = [
  { key: 'feeding', label: '수유', icon: 'water', color: '#5B9BD5', backgroundColor: '#EBF3FB' },
  { key: 'sleep', label: '수면', icon: 'moon', color: '#7E57C2', backgroundColor: '#EDE7F6' },
  { key: 'diaper', label: '기저귀', icon: 'refresh-circle', color: '#FFA000', backgroundColor: '#FFF8E1' },
  { key: 'medication', label: '투약', icon: 'medkit', color: Colors.error, backgroundColor: '#FDEEEB' },
  { key: 'temperature', label: '체온', icon: 'thermometer', color: Colors.warning, backgroundColor: '#FFF8E1' },
  { key: 'hospital', label: '병원', icon: 'business', color: Colors.secondary, backgroundColor: Colors.secondaryLight },
  { key: 'symptom', label: '증상', icon: 'pulse', color: Colors.primary, backgroundColor: Colors.primaryLight },
] as const;

function nowIso() {
  return new Date().toISOString();
}

export function GlobalLogAddModal({ visible, onClose }: GlobalLogAddModalProps) {
  const { activeChild } = useChildStore();
  const [selectedType, setSelectedType] = useState<LogType | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedingAmount, setFeedingAmount] = useState('');
  const [feedingType, setFeedingType] = useState<'breast' | 'formula' | 'mixed' | 'solid'>('breast');
  const [sleepMinutes, setSleepMinutes] = useState('');
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both' | 'dry'>('wet');
  const [healthTitle, setHealthTitle] = useState('');
  const [healthValue, setHealthValue] = useState('');
  const [memo, setMemo] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const resetForm = () => {
    setSelectedType(null);
    setSaving(false);
    setFeedingAmount('');
    setFeedingType('breast');
    setSleepMinutes('');
    setDiaperType('wet');
    setHealthTitle('');
    setHealthValue('');
    setMemo('');
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const saveLog = async () => {
    if (!activeChild || !selectedType || saving) return;
    setSaving(true);

    const recordedAt = nowIso();
    let result: { error: { message: string } | null } = { error: null };

    if (selectedType === 'feeding') {
      result = await supabase.from('feeding_logs').insert({
        child_id: activeChild.id,
        fed_at: recordedAt,
        amount_ml: feedingAmount ? Number(feedingAmount) : null,
        type: feedingType,
        memo: memo || null,
      });
    } else if (selectedType === 'sleep') {
      const minutes = sleepMinutes ? Number(sleepMinutes) : null;
      const started = new Date();
      if (minutes) started.setMinutes(started.getMinutes() - minutes);
      result = await supabase.from('sleep_logs').insert({
        child_id: activeChild.id,
        started_at: started.toISOString(),
        ended_at: minutes ? recordedAt : null,
        memo: memo || null,
      });
    } else if (selectedType === 'diaper') {
      result = await supabase.from('diaper_logs').insert({
        child_id: activeChild.id,
        changed_at: recordedAt,
        type: diaperType,
        memo: memo || null,
      });
    } else {
      const fallbackTitle =
        selectedType === 'temperature'
          ? '체온'
          : selectedType === 'hospital'
          ? '병원 방문'
          : selectedType === 'medication'
          ? '투약'
          : '증상';
      result = await supabase.from('health_logs').insert({
        child_id: activeChild.id,
        recorded_at: recordedAt,
        type: selectedType,
        title: healthTitle || fallbackTitle,
        value: healthValue || null,
        memo: memo || null,
      });
    }

    setSaving(false);
    if (result.error) {
      Alert.alert('저장 실패', result.error.message);
      return;
    }
    closeModal();
  };

  const title = selectedType
    ? LOG_OPTIONS.find((option) => option.key === selectedType)?.label ?? '기록'
    : '어떤 기록을 추가할까요?';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior="height"
      >
        <Pressable
          style={[
            styles.backdrop,
            keyboardVisible && styles.backdropKeyboardVisible,
          ]}
          onPress={closeModal}
        >
          <Pressable style={styles.dialog}>
          <View style={styles.header}>
            {selectedType ? (
              <TouchableOpacity style={styles.headerButton} onPress={() => setSelectedType(null)}>
                <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSide} />
            )}
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.headerButton} onPress={closeModal}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!selectedType ? (
            <View style={styles.optionGrid}>
              {LOG_OPTIONS.map(({ key, label, icon, color, backgroundColor }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.option, { backgroundColor }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} 기록 추가`}
                  onPress={() => setSelectedType(key)}
                >
                  <Ionicons name={icon} size={17} color={color} />
                  <Text style={[styles.optionText, { color }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
              {selectedType === 'feeding' && (
                <>
                  <Text style={styles.label}>유형</Text>
                  <View style={styles.segmentRow}>
                    {[
                      ['breast', '모유'],
                      ['formula', '분유'],
                      ['mixed', '혼합'],
                      ['solid', '이유식'],
                    ].map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.segment, feedingType === value && styles.segmentActive]}
                        onPress={() => setFeedingType(value as typeof feedingType)}
                      >
                        <Text style={[styles.segmentText, feedingType === value && styles.segmentTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.label}>양 (ml, 선택)</Text>
                  <TextInput
                    style={styles.input}
                    value={feedingAmount}
                    onChangeText={setFeedingAmount}
                    keyboardType="number-pad"
                    placeholder="예: 120"
                    placeholderTextColor={Colors.textLight}
                  />
                </>
              )}

              {selectedType === 'sleep' && (
                <>
                  <Text style={styles.label}>수면 시간 (분, 선택)</Text>
                  <TextInput
                    style={styles.input}
                    value={sleepMinutes}
                    onChangeText={setSleepMinutes}
                    keyboardType="number-pad"
                    placeholder="예: 80"
                    placeholderTextColor={Colors.textLight}
                  />
                </>
              )}

              {selectedType === 'diaper' && (
                <>
                  <Text style={styles.label}>유형</Text>
                  <View style={styles.segmentRow}>
                    {[
                      ['wet', '소변'],
                      ['dirty', '대변'],
                      ['both', '둘 다'],
                      ['dry', '마름'],
                    ].map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.segment, diaperType === value && styles.segmentActive]}
                        onPress={() => setDiaperType(value as typeof diaperType)}
                      >
                        <Text style={[styles.segmentText, diaperType === value && styles.segmentTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {selectedType !== 'feeding' && selectedType !== 'sleep' && selectedType !== 'diaper' && (
                <>
                  <Text style={styles.label}>제목</Text>
                  <TextInput
                    style={styles.input}
                    value={healthTitle}
                    onChangeText={setHealthTitle}
                    placeholder="기록 제목"
                    placeholderTextColor={Colors.textLight}
                  />
                  <Text style={styles.label}>값 (선택)</Text>
                  <TextInput
                    style={styles.input}
                    value={healthValue}
                    onChangeText={setHealthValue}
                    keyboardType={selectedType === 'temperature' ? 'decimal-pad' : 'default'}
                    placeholder={selectedType === 'temperature' ? '예: 36.8' : '예: 3ml'}
                    placeholderTextColor={Colors.textLight}
                  />
                </>
              )}

              <Text style={styles.label}>메모 (선택)</Text>
              <TextInput
                style={[styles.input, styles.memoInput]}
                value={memo}
                onChangeText={setMemo}
                multiline
                placeholder="간단한 메모"
                placeholderTextColor={Colors.textLight}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={saveLog}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: Spacing.lg,
  },
  backdropKeyboardVisible: {
    justifyContent: 'flex-end',
    paddingBottom: 15,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '82%',
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    ...Shadows.md,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerSide: {
    width: 34,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    minWidth: 82,
    flexGrow: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  formContent: {
    paddingBottom: Spacing.lg,
  },
  label: {
    marginTop: Spacing.sm,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  input: {
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  memoInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    flexGrow: 1,
    minWidth: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.primary,
  },
  saveButton: {
    marginTop: Spacing.md,
    minHeight: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
});
