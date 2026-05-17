import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useChildStore } from '../../store/childStore';
import { supabase } from '../../lib/supabase';
import { runAgent, AgentMessage } from '../../lib/agent';
import { Colors, Spacing, Radius, Shadows } from '../../constants/theme';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

type ConvPair = { question: Message; answer?: Message };
type DateGroup = { dateKey: string; label: string; pairs: ConvPair[] };

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function groupHistoryByDate(messages: Message[]): DateGroup[] {
  const groupMap = new Map<string, ConvPair[]>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const d = new Date(msg.created_at);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const answer = i + 1 < messages.length && messages[i + 1].role === 'assistant'
      ? messages[i + 1] : undefined;

    if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
    groupMap.get(dateKey)!.push({ question: msg, answer });
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, pairs]) => {
      const [year, month, day] = dateKey.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const isToday = d.toDateString() === today.toDateString();
      const isYesterday = d.toDateString() === yesterday.toDateString();
      const label = isToday
        ? `오늘 · ${month}월 ${day}일 (${KO_DAYS[d.getDay()]})`
        : isYesterday
        ? `어제 · ${month}월 ${day}일 (${KO_DAYS[d.getDay()]})`
        : `${month}월 ${day}일 (${KO_DAYS[d.getDay()]})`;
      return { dateKey, label, pairs };
    });
}

const QUICK_QUESTIONS = [
  '이 나이에 잘 자지 않으면 어떡하나요?',
  '이유식은 언제부터 시작하나요?',
  '열이 나는데 어떻게 해야 하나요?',
  '언제쯤 걸을 수 있나요?',
];

const MIN_PENDING_STATUS_MS = 3000;
const PENDING_STATUS_FADE_MS = 300;
const COMPOSING_STATUS = '답변을 작성하고 있어요...';
const COMPOSING_STATUS_INTERVAL_MS = 3500;
const COMPOSING_STATUS_MESSAGES = [
  '아이에게 맞는 답변으로 다듬고 있어요...',
  '중요한 내용을 간단히 정리하고 있어요...',
  '곧 답변을 보여드릴게요...',
  COMPOSING_STATUS,
];

function getStatusIcon(status: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (status.includes('살펴')) return 'search-outline';
  if (status.includes('준비')) return 'time-outline';
  if (status.includes('작성')) return 'create-outline';
  if (status.includes('다듬')) return 'heart-outline';
  if (status.includes('정리')) return 'list-outline';
  if (status.includes('곧')) return 'sparkles';
  return 'ellipsis-horizontal-outline';
}

function formatAssistantMessage(raw: string): string {
  return raw
    .replace(/<\|channel\>thought[\s\S]*?(?=<\|channel\>|$)/g, '')
    .replace(/<\|channel\>/g, '')
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```/g, '').trim()
    )
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    // 일부 기기에서 tofu(□?)로 보이는 이모지/특수심볼 제거
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/�/g, '')
    .trim();
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { activeChild } = useChildStore();
  const { question } = useLocalSearchParams<{ question?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedHistoryAnswers, setExpandedHistoryAnswers] = useState<Set<string>>(new Set());
  const [expandableHistoryAnswers, setExpandableHistoryAnswers] = useState<Set<string>>(new Set());
  const [assistantStatusText, setAssistantStatusText] = useState('답변을 준비하고 있어요...');
  const [displayedStatusText, setDisplayedStatusText] = useState('');
  const statusOpacityRef = useRef(new Animated.Value(1));
  const statusTypewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const lastInjectedQuestionRef = useRef<string | null>(null);
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterQueueRef = useRef<string[]>([]);
  const streamedTextRef = useRef('');
  const typewriterResolversRef = useRef<Array<() => void>>([]);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusQueueRef = useRef<string[]>([]);
  const lastStatusAtRef = useRef(0);
  const currentStatusRef = useRef('답변을 준비하고 있어요...');
  const isStatusTransitioningRef = useRef(false);
  const composingStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const composingStatusIndexRef = useRef(0);

  const loadChatHistory = async () => {
    if (!activeChild) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('child_id', activeChild.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) console.error('[Chat History Load Error]', error.message);
    if (data) setHistoryMessages(data.reverse());
    setHistoryLoading(false);
  };

  const openHistory = async () => {
    setHistoryVisible(true);
    setExpandedDates(new Set());
    setExpandedHistoryAnswers(new Set());
    setExpandableHistoryAnswers(new Set());
    await loadChatHistory();
  };

  const toggleDate = (dateKey: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const toggleHistoryAnswer = (answerId: string) => {
    setExpandedHistoryAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) next.delete(answerId);
      else next.add(answerId);
      return next;
    });
  };

  const markHistoryAnswerExpandable = (answerId: string) => {
    setExpandableHistoryAnswers((prev) => {
      if (prev.has(answerId)) return prev;
      const next = new Set(prev);
      next.add(answerId);
      return next;
    });
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!activeChild) return;
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ child_id: activeChild.id, role, content })
      .select()
      .single();
    if (error) console.error('[saveMessage Error]', error.message, error.code);
    return data;
  };

  const stopTypewriter = () => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    typewriterQueueRef.current = [];
    typewriterResolversRef.current.forEach((resolve) => resolve());
    typewriterResolversRef.current = [];
  };

  const stopStatusTypewriter = () => {
    if (statusTypewriterRef.current) {
      clearInterval(statusTypewriterRef.current);
      statusTypewriterRef.current = null;
    }
  };

  const startStatusTypewriter = (text: string) => {
    stopStatusTypewriter();
    setDisplayedStatusText('');
    let index = 0;
    statusTypewriterRef.current = setInterval(() => {
      index++;
      setDisplayedStatusText(text.slice(0, index));
      if (index >= text.length) {
        stopStatusTypewriter();
      }
    }, 100);
  };

  const scheduleNextAssistantStatus = () => {
    if (statusTimerRef.current || isStatusTransitioningRef.current) return;
    if (statusQueueRef.current.length === 0) return;

    const elapsed = Date.now() - lastStatusAtRef.current;
    const delay = Math.max(MIN_PENDING_STATUS_MS - elapsed, 0);

    statusTimerRef.current = setTimeout(() => {
      statusTimerRef.current = null;
      const nextStatus = statusQueueRef.current.shift();
      if (!nextStatus) return;

      isStatusTransitioningRef.current = true;
      Animated.timing(statusOpacityRef.current, {
        toValue: 0,
        duration: PENDING_STATUS_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        currentStatusRef.current = nextStatus;
        setAssistantStatusText(nextStatus);
        startStatusTypewriter(nextStatus);
        lastStatusAtRef.current = Date.now();

        Animated.timing(statusOpacityRef.current, {
          toValue: 1,
          duration: PENDING_STATUS_FADE_MS,
          useNativeDriver: true,
        }).start(() => {
          isStatusTransitioningRef.current = false;
          scheduleNextAssistantStatus();
        });
      });
    }, delay);
  };

  const showAssistantStatus = (status: string) => {
    if (currentStatusRef.current === status || statusQueueRef.current.at(-1) === status) {
      return;
    }
    statusQueueRef.current.push(status);
    scheduleNextAssistantStatus();
  };

  const clearComposingStatusLoop = () => {
    if (composingStatusTimerRef.current) {
      clearInterval(composingStatusTimerRef.current);
      composingStatusTimerRef.current = null;
    }
    composingStatusIndexRef.current = 0;
  };

  const clearPendingStatusQueue = () => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    statusQueueRef.current = [];
    clearComposingStatusLoop();
  };

  const resetCurrentChat = useCallback(() => {
    setMessages([]);
    setInputText('');
    setDisplayedStatusText('');
    stopTypewriter();
    clearPendingStatusQueue();
    stopStatusTypewriter();
    streamedTextRef.current = '';
    lastInjectedQuestionRef.current = null;
  }, []);

  const startNewChat = useCallback(() => {
    if (sending) return;
    resetCurrentChat();
    setHistoryVisible(false);
  }, [resetCurrentChat, sending]);

  useEffect(() => {
    if (!question || sending) return;
    if (lastInjectedQuestionRef.current === question) return;

    lastInjectedQuestionRef.current = question;
    setInputText(question);
    handleSend(question);
  }, [question, sending, activeChild]);

  const resetAssistantStatus = (status: string) => {
    clearPendingStatusQueue();
    stopStatusTypewriter();
    statusOpacityRef.current.stopAnimation();
    statusOpacityRef.current.setValue(1);
    isStatusTransitioningRef.current = false;
    currentStatusRef.current = status;
    lastStatusAtRef.current = Date.now();
    setAssistantStatusText(status);
    startStatusTypewriter(status);
  };

  const startComposingStatusLoop = () => {
    if (composingStatusTimerRef.current) return;

    composingStatusTimerRef.current = setInterval(() => {
      const status = COMPOSING_STATUS_MESSAGES[composingStatusIndexRef.current];
      composingStatusIndexRef.current =
        (composingStatusIndexRef.current + 1) % COMPOSING_STATUS_MESSAGES.length;
      showAssistantStatus(status);
    }, COMPOSING_STATUS_INTERVAL_MS);
  };

  const handleAssistantStatus = (status: string) => {
    if (status.includes('도구')) return;
    showAssistantStatus(status);
    if (status === COMPOSING_STATUS) {
      startComposingStatusLoop();
    }
  };

  useEffect(() => () => {
    stopTypewriter();
    clearPendingStatusQueue();
    stopStatusTypewriter();
  }, []);

  const resolveTypewriterIfIdle = () => {
    if (typewriterQueueRef.current.length > 0) return;

    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }

    typewriterResolversRef.current.forEach((resolve) => resolve());
    typewriterResolversRef.current = [];
  };

  const startTypewriter = (messageId: string) => {
    if (typewriterTimerRef.current) return;

    typewriterTimerRef.current = setInterval(() => {
      const nextChar = typewriterQueueRef.current.shift();
      if (!nextChar) {
        resolveTypewriterIfIdle();
        return;
      }

      streamedTextRef.current += nextChar;
      const partial = formatAssistantMessage(streamedTextRef.current);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: partial } : m
        )
      );
    }, 16);
  };

  const enqueueAssistantText = (messageId: string, text: string) => {
    if (!text) return;
    typewriterQueueRef.current.push(...Array.from(text));
    startTypewriter(messageId);
  };

  const waitForTypewriter = () => {
    if (typewriterQueueRef.current.length === 0 && !typewriterTimerRef.current) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      typewriterResolversRef.current.push(resolve);
    });
  };

  const handleSend = async (text?: string) => {
    const messageText = (text ?? inputText).trim();
    if (!messageText || !activeChild || sending) return;

    setInputText('');
    setSending(true);
    resetAssistantStatus('질문을 살펴보고 있어요...');
    stopTypewriter();
    streamedTextRef.current = '';

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    saveMessage('user', messageText);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantCreatedAt = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        created_at: assistantCreatedAt,
      },
    ]);

    try {
      const conversationHistory: AgentMessage[] = [
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: messageText },
      ];

      const response = await runAgent(
        conversationHistory,
        {
          id: activeChild.id,
          name: activeChild.name,
          birthdate: activeChild.birthdate,
        },
        {
          onStatus: handleAssistantStatus,
          onToken: (token) => {
            clearPendingStatusQueue();
            enqueueAssistantText(assistantMessageId, token);
          },
        }
      );

      await waitForTypewriter();

      const finalContent =
        formatAssistantMessage(response) ||
        '답변을 생성하지 못했습니다. 잠시 후 다시 질문해주세요.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId ? { ...m, content: finalContent } : m
        )
      );
      saveMessage('assistant', finalContent);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Chat Error]', msg);
      Alert.alert('오류', `AI 응답을 가져오지 못했습니다.\n\n${msg}`);
    } finally {
      setSending(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert('대화 초기화', '대화 내역을 모두 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!activeChild) return;
          const { error } = await supabase
            .from('chat_messages')
            .delete()
            .eq('child_id', activeChild.id);

          if (error) {
            console.error('[Chat Clear Error]', error.message);
            Alert.alert('삭제 실패', `대화 내역을 삭제하지 못했습니다.\n\n${error.message}`);
            return;
          }

          setMessages([]);
          setHistoryMessages([]);
        },
      },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isPendingAssistant = !isUser && !item.content.trim();
    const displayContent = isPendingAssistant
      ? displayedStatusText
      : item.content;

    return (
      <View style={[styles.messagRow, isUser ? styles.userRow : styles.assistantRow]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color={Colors.primary} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <View style={styles.messageContentRow}>
            {isPendingAssistant && (
              <Animated.View style={[styles.pendingIndicator, { opacity: statusOpacityRef.current }]}>
                <Ionicons
                  name={getStatusIcon(assistantStatusText)}
                  size={16}
                  color={Colors.primary}
                />
              </Animated.View>
            )}
            <Text
              style={[
                styles.bubbleText,
                isUser && styles.userBubbleText,
                isPendingAssistant && styles.pendingText,
              ]}
            >
              {displayContent}
            </Text>
          </View>
          <Text style={[styles.timeText, isUser && styles.userTimeText]}>
            {new Date(item.created_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>AI 육아 상담</Text>
            <Text style={styles.headerSubtitle}>
              {activeChild?.name}에 대해 무엇이든 물어보세요
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.headerIconButton,
                sending && styles.headerIconButtonDisabled,
              ]}
              onPress={startNewChat}
              accessibilityLabel="새 대화 시작"
              disabled={sending}
            >
              <Ionicons name="add" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={openHistory}
              accessibilityLabel="대화 히스토리 열기"
            >
              <Ionicons name="time-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 메시지 목록 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Ionicons name="chatbubbles-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.emptyChatTitle}>
                {activeChild?.name}에 대해 궁금한 점을 물어보세요
              </Text>
              <Text style={styles.emptyChatSubtitle}>
                발달, 수면, 이유식, 건강 등 모든 육아 질문에 답해드려요
              </Text>

              <View style={styles.quickQuestions}>
                {QUICK_QUESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.quickQuestion}
                    onPress={() => handleSend(q)}
                  >
                    <Text style={styles.quickQuestionText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {/* 입력창 */}
        <View style={[styles.inputArea, { paddingBottom: insets.bottom || Spacing.md }]}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`${activeChild?.name}에 대해 질문하세요...`}
            placeholderTextColor={Colors.textLight}
            multiline
            maxLength={500}
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={Colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={historyVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <SafeAreaView style={styles.historySafe}>
          <View style={styles.historyHeader}>
            <TouchableOpacity
              style={styles.historyHeaderButton}
              onPress={() => setHistoryVisible(false)}
            >
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.historyHeaderText}>
              <Text style={styles.historyTitle}>대화 히스토리</Text>
              <Text style={styles.historySubtitle}>
                저장된 이전 질문과 답변
              </Text>
            </View>
            <TouchableOpacity
              style={styles.historyHeaderButton}
              onPress={handleClearHistory}
            >
              <Ionicons name="trash-outline" size={21} color={Colors.error} />
            </TouchableOpacity>
          </View>

          {historyLoading ? (
            <View style={styles.historyLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.historyLoadingText}>히스토리를 불러오고 있어요...</Text>
            </View>
          ) : historyMessages.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={Colors.textLight} />
              <Text style={styles.historyEmptyTitle}>아직 저장된 대화가 없어요</Text>
              <Text style={styles.historyEmptyText}>새 채팅에서 질문하면 이곳에 기록됩니다.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.historyList}>
              {groupHistoryByDate(historyMessages).map((group) => {
                const isExpanded = expandedDates.has(group.dateKey);
                return (
                  <View key={group.dateKey} style={styles.dateGroup}>
                    <TouchableOpacity
                      style={styles.dateGroupHeader}
                      onPress={() => toggleDate(group.dateKey)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.dateGroupLeft}>
                        <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
                        <Text style={styles.dateGroupLabel}>{group.label}</Text>
                        <View style={styles.dateGroupBadge}>
                          <Text style={styles.dateGroupCount}>{group.pairs.length}개</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.dateGroupBody}>
                        {group.pairs.map(({ question, answer }) => {
                          const isAnswerExpanded = answer
                            ? expandedHistoryAnswers.has(answer.id)
                            : false;
                          const isAnswerExpandable = answer
                            ? expandableHistoryAnswers.has(answer.id)
                            : false;
                          const shouldCollapseAnswer = isAnswerExpandable && !isAnswerExpanded;

                          return (
                            <View key={question.id} style={styles.convPair}>
                              <View style={styles.convQuestion}>
                                <Ionicons name="person-circle" size={16} color={Colors.primary} />
                                <View style={styles.convQuestionContent}>
                                  <Text style={styles.convQuestionText}>{question.content}</Text>
                                  <Text style={styles.convTime}>
                                    {new Date(question.created_at).toLocaleTimeString('ko-KR', {
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                  </Text>
                                </View>
                              </View>
                              {answer && (
                                <View style={styles.convAnswer}>
                                  <Ionicons name="sparkles" size={14} color={Colors.primary} style={styles.convAnswerIcon} />
                                  <View style={styles.convAnswerBody}>
                                    <Text
                                      style={styles.convAnswerText}
                                      numberOfLines={shouldCollapseAnswer ? 1 : undefined}
                                      onTextLayout={({ nativeEvent }) => {
                                        if (nativeEvent.lines.length > 1) {
                                          markHistoryAnswerExpandable(answer.id);
                                        }
                                      }}
                                    >
                                      {answer.content}
                                    </Text>
                                    {isAnswerExpandable && (
                                      <TouchableOpacity
                                        style={styles.convAnswerToggle}
                                        onPress={() => toggleHistoryAnswer(answer.id)}
                                        activeOpacity={0.75}
                                      >
                                        <Text style={styles.convAnswerToggleText}>
                                          {isAnswerExpanded ? '접기' : '전체 보기'}
                                        </Text>
                                        <Ionicons
                                          name={isAnswerExpanded ? 'chevron-up' : 'chevron-down'}
                                          size={13}
                                          color={Colors.primary}
                                        />
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: '#EEF0F3',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerIconButtonDisabled: {
    opacity: 0.45,
  },
  messageList: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
    backgroundColor: '#F6F7F9',
  },
  messagRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    alignItems: 'flex-end',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  messageContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  pendingIndicator: {
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    color: Colors.textSecondary,
  },
  userBubbleText: {
    color: Colors.white,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimeText: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  emptyChatIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyChatTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyChatSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  quickQuestions: {
    width: '100%',
    gap: Spacing.sm,
  },
  quickQuestion: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickQuestionText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.textLight,
  },
  historySafe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyHeaderButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyHeaderText: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  historySubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  historyList: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  historyLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  historyLoadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  historyEmpty: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  historyEmptyTitle: {
    marginTop: Spacing.md,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  historyEmptyText: {
    marginTop: Spacing.xs,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  dateGroup: {
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  dateGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  dateGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateGroupLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dateGroupBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dateGroupCount: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  dateGroupBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  convPair: {
    gap: 6,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  convQuestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  convQuestionContent: {
    flex: 1,
    gap: 2,
  },
  convQuestionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
  },
  convTime: {
    fontSize: 11,
    color: Colors.textLight,
  },
  convAnswer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginLeft: 24,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  convAnswerIcon: {
    marginTop: 2,
  },
  convAnswerBody: {
    flex: 1,
  },
  convAnswerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  convAnswerToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
  },
  convAnswerToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
});
