import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessageBubble } from '@/components/chat/message';
import { PromptInput } from '@/components/chat/prompt-input';
import { createStreamingStore, useStreamingText } from '@/components/chat/streaming-store';
import type { ChatMessage } from '@/components/chat/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STREAMING_THROTTLE_MS = 32;
const CHAT_PANEL_HEIGHT = 236;
const KEYBOARD_UNDERLAY = Platform.OS === 'ios' ? 10 : 0;

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

type PanelMode = 'keyboard' | 'voice' | 'emoji' | 'actions';

function StreamingBubble({ store }: { store: ReturnType<typeof createStreamingStore> }) {
  const text = useStreamingText(store);
  return <ChatMessageBubble role="assistant" streaming>{text}</ChatMessageBubble>;
}

type CompanionChatScreenProps = {
  title?: string;
  subtitle?: string;
};

export function CompanionChatScreen({ title = 'LumiMate', subtitle = '长期陪伴' }: CompanionChatScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 150);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const streamingRef = useRef('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseIndexRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingActiveRef = useRef(false);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [mode, setMode] = useState<PanelMode>('keyboard');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content: `嗨，我是 ${title}。现在是本地 mock 聊天，已经支持文本、图片、拍摄和语音录入。`,
    },
  ]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const appendUserTurn = useCallback(
    async ({
      content,
      imageUri,
      audioUri,
      audioDuration,
    }: {
      content: string;
      imageUri?: string;
      audioUri?: string;
      audioDuration?: number;
    }) => {
      if (isGenerating) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        content,
        imageUri,
        audioUri,
        audioDuration,
      };
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: '',
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput('');
      setMode('keyboard');
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
    },
    [isGenerating, scrollToBottom, streamingStore],
  );

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    await appendUserTurn({ content: trimmed });
  }, [appendUserTurn, input, isGenerating]);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要照片权限', '请允许 LumiMate 访问照片后再选择图片。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled) {
      await appendUserTurn({ content: '图片', imageUri: result.assets[0]?.uri });
    }
  }, [appendUserTurn]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相机权限', '请允许 LumiMate 使用相机后再拍摄。');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled) {
      await appendUserTurn({ content: '拍摄', imageUri: result.assets[0]?.uri });
    }
  }, [appendUserTurn]);

  const showKeyboard = useCallback(() => {
    setMode('keyboard');
  }, []);

  const togglePanel = useCallback((nextMode: PanelMode) => {
    setMode((current) => {
      const next = current === nextMode ? 'keyboard' : nextMode;
      if (next !== 'keyboard') {
        setKeyboardHeight(0);
        Keyboard.dismiss();
      }
      return next;
    });
  }, []);

  const startRecording = useCallback(async () => {
    if (isGenerating || recorderState.isRecording) return;

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要麦克风权限', '请允许 LumiMate 使用麦克风后再发送语音。');
      return;
    }

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingActiveRef.current = true;
      recordingStartedAtRef.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      Alert.alert('录音失败', '麦克风暂时不可用，请稍后再试。');
    }
  }, [isGenerating, recorder, recorderState.isRecording]);

  const stopRecording = useCallback(async () => {
    if (!recordingActiveRef.current) return;

    const startedAt = recordingStartedAtRef.current ?? Date.now();
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    try {
      await recorder.stop();
      const audioUri = recorder.uri;
      recordingActiveRef.current = false;
      recordingStartedAtRef.current = null;

      if (!audioUri || duration < 1) return;
      await appendUserTurn({ content: '', audioUri, audioDuration: duration });
    } catch {
      recordingActiveRef.current = false;
      Alert.alert('录音失败', '语音没有保存成功，请重新录制。');
    }
  }, [appendUserTurn, recorder]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const updateKeyboardHeight = (event: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    };
    const hideKeyboard = () => setKeyboardHeight(0);

    const show = Keyboard.addListener(showEvent, updateKeyboardHeight);
    const change = Keyboard.addListener(changeEvent, updateKeyboardHeight);
    const hide = Keyboard.addListener(hideEvent, hideKeyboard);

    return () => {
      show.remove();
      change.remove();
      hide.remove();
    };
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (isGenerating && item.role === 'assistant' && item.content === '') {
        return <StreamingBubble store={streamingStore} />;
      }

      return (
        <ChatMessageBubble
          role={item.role}
          imageUri={item.imageUri}
          audioUri={item.audioUri}
          audioDuration={item.audioDuration}>
          {item.content}
        </ChatMessageBubble>
      );
    },
    [isGenerating, streamingStore],
  );

  const panelOpen = mode === 'emoji' || mode === 'actions';
  const keyboardUnderlay = keyboardHeight > 0 && mode === 'keyboard' ? KEYBOARD_UNDERLAY : 0;
  const footerBottom =
    mode === 'keyboard' ? Math.max(0, keyboardHeight - keyboardUnderlay) : 0;
  const footerBottomPadding =
    keyboardHeight > 0 && mode === 'keyboard'
      ? keyboardUnderlay
      : panelOpen
        ? 0
        : insets.bottom + Spacing.two;
  const listBottomPadding =
    76 + footerBottomPadding + footerBottom + (panelOpen ? CHAT_PANEL_HEIGHT : 0);
  const panelStyle = { height: CHAT_PANEL_HEIGHT + insets.bottom, paddingBottom: insets.bottom + Spacing.three };

  return (
    <View style={[styles.keyboardView, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.centered}>
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.messageList, { paddingBottom: listBottomPadding }]}
            onContentSizeChange={() => scrollToBottom(false)}
            showsVerticalScrollIndicator={false}
          />
        </View>

        <ThemedView
          type="backgroundElement"
          style={[
            styles.footer,
            {
              bottom: footerBottom,
              paddingBottom: footerBottomPadding,
            },
          ]}>
          <View style={styles.footerContent}>
            <PromptInput
              value={input}
              mode={mode}
              submitting={isGenerating}
              recording={recorderState.isRecording}
              recordingDuration={Math.max(0, Math.round((recorderState.durationMillis ?? 0) / 1000))}
              onChangeText={setInput}
              onFocusText={showKeyboard}
              onSubmit={onSend}
              onToggleVoice={() => togglePanel('voice')}
              onToggleEmoji={() => togglePanel('emoji')}
              onToggleActions={() => togglePanel('actions')}
              onVoicePressIn={startRecording}
              onVoicePressOut={stopRecording}
            />
          </View>

          {mode === 'emoji' ? (
            <View style={[styles.panelContent, styles.emojiPanel, panelStyle]}>
              {['😀', '🥹', '❤️', '👍', '✨', '😭', '😂', '🤝'].map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`输入表情 ${emoji}`}
                  onPress={() => setInput((current) => `${current}${emoji}`)}
                  style={({ pressed }) => [styles.emojiButton, pressed ? styles.pressed : null]}>
                  <ThemedText style={styles.emojiText}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {mode === 'actions' ? (
            <View style={[styles.panelContent, styles.actionPanel, panelStyle]}>
              <ActionTile
                label="照片"
                icon={{ ios: 'photo', android: 'image', web: 'image' }}
                disabled={isGenerating}
                onPress={pickImage}
              />
              <ActionTile
                label="拍摄"
                icon={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
                disabled={isGenerating}
                onPress={takePhoto}
              />
              <ActionTile
                label="位置"
                icon={{ ios: 'location.fill', android: 'location_on', web: 'location_on' }}
                disabled={isGenerating}
                onPress={() => {}}
              />
              <ActionTile
                label="语音输入"
                icon={{ ios: 'mic.fill', android: 'mic', web: 'mic' }}
                disabled={isGenerating}
                onPress={() => togglePanel('voice')}
              />
              <ActionTile
                label="收藏"
                icon={{ ios: 'cube.fill', android: 'inventory_2', web: 'inventory_2' }}
                disabled={isGenerating}
                onPress={() => {}}
              />
              <ActionTile
                label="个人名片"
                icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
                disabled={isGenerating}
                onPress={() => {}}
              />
              <ActionTile
                label="文件"
                icon={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
                disabled={isGenerating}
                onPress={() => {}}
              />
              <ActionTile
                label="音乐"
                icon={{ ios: 'music.note', android: 'music_note', web: 'music_note' }}
                disabled={isGenerating}
                onPress={() => {}}
              />
            </View>
          ) : null}
        </ThemedView>
      </SafeAreaView>
    </View>
  );
}

function ActionTile({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionTile,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      <ThemedView style={styles.actionIcon}>
        <SymbolView name={icon} size={24} tintColor={theme.text} />
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flex: 1,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    gap: 0,
    borderRadius: 0,
  },
  footerContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  panelContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  actionPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 28,
    lineHeight: 34,
  },
  actionTile: {
    alignItems: 'center',
    gap: Spacing.two,
    width: '22%',
  },
  actionIcon: {
    width: 62,
    height: 62,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
