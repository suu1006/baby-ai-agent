import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';
import { getFAQById } from '../../constants/faqs';

export default function FAQDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const faq = id ? getFAQById(id) : undefined;

  if (!faq) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.textLight} />
          <Text style={styles.notFoundText}>질문을 찾을 수 없습니다.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>뒤로 가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>자주 묻는 질문</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>질문</Text>
          <Text style={styles.questionText}>{faq.question}</Text>
        </View>

        <View style={styles.answerCard}>
          <Text style={styles.sectionTitle}>답변</Text>
          <Text style={styles.answerText}>{faq.answer}</Text>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.sectionTitle}>핵심 포인트</Text>
          {faq.tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() =>
            router.push({ pathname: '/(tabs)/chat', params: { question: faq.question } })
          }
        >
          <Ionicons name="chatbubble-ellipses" size={18} color={Colors.white} />
          <Text style={styles.chatButtonText}>AI 상담으로 이어서 질문하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  questionCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  questionLabel: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: 6,
  },
  questionText: {
    fontSize: 17,
    lineHeight: 24,
    color: Colors.text,
    fontWeight: '700',
  },
  answerCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  tipsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  chatButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chatButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
  },
  notFoundText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  backButton: {
    marginTop: 8,
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  backButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
});
