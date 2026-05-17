import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Baby, GenderMale, GenderFemale } from 'phosphor-react-native';
import { useAuthStore } from '../store/authStore';
import { useChildStore } from '../store/childStore';
import { uploadChildProfilePhoto } from '../lib/profilePhoto';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Colors, Radius, Spacing, Shadows } from '../constants/theme';

export default function OnboardingScreen() {
  const { user } = useAuthStore();
  const { addChild } = useChildStore();

  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState(new Date());
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const maxDateRef = useRef(new Date());

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled) {
      setPhotoAsset(result.assets[0]);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) {
      Alert.alert('입력 오류', '아이 이름을 입력해주세요.');
      return;
    }
    if (!gender) {
      Alert.alert('입력 오류', '성별을 선택해주세요.');
      return;
    }
    if (!user) return;

    setLoading(true);

    let photoUrl: string | null = null;
    if (photoAsset) {
      try {
        photoUrl = await uploadChildProfilePhoto({
          userId: user.id,
          asset: photoAsset,
        });
      } catch {
        setLoading(false);
        Alert.alert('사진 업로드 오류', '사진 저장에 실패했습니다. 다시 선택해주세요.');
        return;
      }
    }

    const child = await addChild({
      user_id: user.id,
      name: name.trim(),
      birthdate: birthdate.toISOString().split('T')[0],
      gender,
      photo_url: photoUrl,
    });

    setLoading(false);

    if (child) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('오류', '아이 정보 등록에 실패했습니다. 다시 시도해주세요.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>우리 아이를 소개해주세요</Text>
          <Text style={styles.subtitle}>
            아이 정보를 입력하면 맞춤 육아 조언을 드릴게요
          </Text>

          <TouchableOpacity style={styles.photoPicker} onPress={pickImage}>
            {photoAsset ? (
              <Image source={{ uri: photoAsset.uri }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={32} color={Colors.textLight} />
                <Text style={styles.photoText}>사진 추가</Text>
              </View>
            )}
          </TouchableOpacity>

          <Input
            label="아이 이름"
            value={name}
            onChangeText={setName}
            placeholder="이름을 입력하세요"
            maxLength={20}
          />

          <Text style={styles.fieldLabel}>생년월일</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              setPendingDate(birthdate);
              setShowDatePicker(true);
            }}
          >
            <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.dateText}>
              {birthdate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <View>
              <DateTimePicker
                value={pendingDate}
                mode="date"
                display="spinner"
                maximumDate={maxDateRef.current}
                onChange={(_event, date) => {
                  if (date) setPendingDate(date);
                }}
                locale="ko-KR"
              />
              <TouchableOpacity
                style={styles.dateConfirmButton}
                onPress={() => {
                  setBirthdate(pendingDate);
                  setShowDatePicker(false);
                }}
              >
                <Text style={styles.dateConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.fieldLabel}>성별</Text>
          <View style={styles.genderRow}>
            {(['male', 'female'] as const).map((g) => {
              const isMale = g === 'male';
              const activeColor = isMale ? '#5B9BD5' : '#E87EB0';
              const isSelected = gender === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderButton,
                    isSelected && { borderColor: activeColor, backgroundColor: isMale ? '#EBF3FB' : '#FDE8F3' },
                  ]}
                  onPress={() => setGender(g)}
                >
                  <View style={styles.genderIconWrapper}>
                    <Baby
                      size={44}
                      color={isSelected ? activeColor : Colors.textSecondary}
                      weight={isSelected ? 'fill' : 'regular'}
                    />
                    <View style={[styles.genderBadge, { backgroundColor: isSelected ? activeColor : Colors.textSecondary }]}>
                      {isMale ? (
                        <GenderMale size={12} color="#fff" weight="bold" />
                      ) : (
                        <GenderFemale size={12} color="#fff" weight="bold" />
                      )}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.genderText,
                      isSelected && { color: activeColor, fontWeight: '700' },
                    ]}
                  >
                    {isMale ? '남자아이' : '여자아이'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            title="시작하기"
            onPress={handleComplete}
            loading={loading}
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  photoPicker: {
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  photoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  photoText: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 52,
    marginBottom: Spacing.md,
  },
  dateText: {
    fontSize: 16,
    color: Colors.text,
  },
  genderRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  genderButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  genderIconWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
  },
  genderBadge: {
    position: 'absolute',
    bottom: -2,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  genderText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  genderTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dateConfirmButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  dateConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
