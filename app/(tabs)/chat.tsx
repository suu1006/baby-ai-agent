import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const QUICK_QUESTIONS = [
  '이 나이에 잘 자지 않으면 어떡하나요?',
  '이유식은 언제부터 시작하나요?',
  '열이 나는데 어떻게 해야 하나요?',
  '언제쯤 걸을 수 있나요?',
];

const MIN_PENDING_STATUS_MS = 1500;
const PENDING_STATUS_FADE_MS = 220;
const COMPOSING_STATUS = '답변을 작성하고 있어요...';
const COMPOSING_STATUS_INTERVAL_MS = 1800;
const COMPOSING_STATUS_MESSAGES = [
  '아이에게 맞는 답변으로 다듬고 있어요...',
  '중요한 내용을 간단히 정리하고 있어요...',
  '곧 답변을 보여드릴게요...',
  COMPOSING_STATUS,
];

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
  const { activeChild } = useChildStore();
  const { question } = useLocalSearchParams<{ question?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [assistantStatusText, setAssistantStatusText] = useState('답변을 준비하고 있어요...');
  const statusOpacityRef = useRef(new Animated.Value(1));
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

  useEffect(() => {
    if (activeChild) loadChatHistory();
  }, [activeChild]);

  useEffect(() => {
    if (!question || sending) return;
    if (lastInjectedQuestionRef.current === question) return;

    lastInjectedQuestionRef.current = question;
    setInputText(question);
    handleSend(question);
  }, [question, sending, activeChild]);

  const loadChatHistory = async () => {
    if (!activeChild) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('child_id', activeChild.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (data) setMessages(data);
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!activeChild) return;
    const { data } = await supabase
      .from('chat_messages')
      .insert({ child_id: activeChild.id, role, content })
      .select()
      .single();
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

  const resetAssistantStatus = (status: string) => {
    clearPendingStatusQueue();
    statusOpacityRef.current.stopAnimation();
    statusOpacityRef.current.setValue(1);
    isStatusTransitioningRef.current = false;
    currentStatusRef.current = status;
    lastStatusAtRef.current = Date.now();
    setAssistantStatusText(status);
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
    showAssistantStatus(status);
    if (status === COMPOSING_STATUS) {
      startComposingStatusLoop();
    }
  };

  useEffect(() => () => {
    stopTypewriter();
    clearPendingStatusQueue();
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
          await supabase
            .from('chat_messages')
            .delete()
            .eq('child_id', activeChild.id);
          setMessages([]);
        },
      },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isPendingAssistant = !isUser && !item.content.trim();
    const displayContent = isPendingAssistant
      ? assistantStatusText
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
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={styles.pendingIndicator}
              />
            )}
            <Animated.Text
              style={[
                styles.bubbleText,
                isUser && styles.userBubbleText,
                isPendingAssistant && styles.pendingText,
                isPendingAssistant && { opacity: statusOpacityRef.current },
              ]}
            >
              {displayContent}
            </Animated.Text>
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
          <View>
            <Text style={styles.headerTitle}>AI 육아 상담</Text>
            <Text style={styles.headerSubtitle}>
              {activeChild?.name}에 대해 무엇이든 물어보세요
            </Text>
          </View>
          <TouchableOpacity onPress={handleClearHistory}>
            <Ionicons name="trash-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
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
        <View style={styles.inputArea}>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
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
  messageList: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
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
    marginRight: Spacing.sm,
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
    color: Colors.primary,
    fontWeight: '500',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
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
});
