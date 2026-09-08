import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatMessageBubble } from '@/components/chat/message';
import { PromptInput } from '@/components/chat/prompt-input';
import { createStreamingStore, useStreamingText } from '@/components/chat/streaming-store';
import type { ChatMessage } from '@/components/chat/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBottomNavigationInset } from '@/hooks/use-bottom-navigation-inset';
import { useTheme } from '@/hooks/use-theme';

const STREAMING_THROTTLE_MS = 32;

const MOCK_RESPONSES = [
  '我在。先不急着解决所有事。你可以把今天最占心的一件事丢给我，我们慢慢拆。',
  '听起来你不是缺答案，是脑子里开了太多窗口。先选一个最小动作：喝水、站起来、或把问题写成一句话。',
  '记住了。等长期记忆接上后，这类偏好会留在本地，只在你允许时进入上下文。',
  '可以。我们把它当成一个小实验：先做能验证方向的版本，再决定要不要加重功能。',
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function streamMockResponse(
  text: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
) {
  for (const chunk of Array.from(text)) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 34));
    onToken(chunk);
  }
}

function StreamingBubble({ store }: { store: ReturnType<typeof createStreamingStore> }) {
  const text = useStreamingText(store);
  return <ChatMessageBubble role="assistant" streaming>{text}</ChatMessageBubble>;
}

export function CompanionChatScreen() {
  const theme = useTheme();
  const bottomInset = useBottomNavigationInset({ collapseWhenKeyboardVisible: true });
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const streamingRef = useRef('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseIndexRef = useRef(0);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content: '嗨，我是 LumiMate。现在是本地 mock 聊天，已经支持输入、滚动、流式回复。',
    },
  ]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
    };
    const assistantMessage: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setIsGenerating(true);
    streamingRef.current = '';
    streamingStore.set('');

    const controller = new AbortController();
    abortRef.current = controller;
    const response = MOCK_RESPONSES[responseIndexRef.current % MOCK_RESPONSES.length];
    responseIndexRef.current += 1;

    try {
      await streamMockResponse(
        response,
        (token) => {
          streamingRef.current += token;
          if (!throttleRef.current) {
            throttleRef.current = setTimeout(() => {
              streamingStore.set(streamingRef.current);
              throttleRef.current = null;
              scrollToBottom(false);
            }, STREAMING_THROTTLE_MS);
          }
        },
        controller.signal,
      );
    } finally {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }

      const finalContent = streamingRef.current || response;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: finalContent } : message,
        ),
      );
      streamingRef.current = '';
      streamingStore.set('');
      abortRef.current = null;
      setIsGenerating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      scrollToBottom();
    }
  }, [input, isGenerating, scrollToBottom, streamingStore]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (isGenerating && item.role === 'assistant' && item.content === '') {
        return <StreamingBubble store={streamingStore} />;
      }

      return <ChatMessageBubble role={item.role}>{item.content}</ChatMessageBubble>;
    },
    [isGenerating, streamingStore],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardView, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <View style={styles.header}>
            <View>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Companion
              </ThemedText>
              <ThemedText type="subtitle">陪伴</ThemedText>
            </View>
            <ThemedView type="backgroundElement" style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: '#35C759' }]} />
              <ThemedText type="small" themeColor="textSecondary">
                Mock
              </ThemedText>
            </ThemedView>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => scrollToBottom(false)}
            showsVerticalScrollIndicator={false}
          />

          <View style={[styles.footer, { paddingBottom: bottomInset }]}>
            <PromptInput
              value={input}
              disabled={isGenerating}
              onChangeText={setInput}
              onSubmit={onSend}
            />
            <View style={styles.hints}>
              {['今天状态', '记住这个', '陪我整理想法'].map((hint) => (
                <Pressable
                  key={hint}
                  disabled={isGenerating}
                  onPress={() => setInput(hint)}
                  style={({ pressed }) => [
                    styles.hintButton,
                    { borderColor: theme.backgroundSelected },
                    pressed ? styles.pressed : null,
                  ]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {hint}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  centered: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  footer: {
    gap: Spacing.two,
  },
  hints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  hintButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.72,
  },
});
