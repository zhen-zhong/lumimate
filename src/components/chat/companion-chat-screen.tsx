import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
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
const MAP_TILE_ZOOM = 16;

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
type PendingImage = {
  uri: string;
  label: string;
};
type LocationCandidate = {
  id: string;
  name: string;
  detail: string;
  coordinateText: string;
  latitude: number;
  longitude: number;
  mapTileUri: string;
};

function StreamingBubble({ store }: { store: ReturnType<typeof createStreamingStore> }) {
  const text = useStreamingText(store);
  return <ChatMessageBubble role="assistant" streaming>{text}</ChatMessageBubble>;
}

function formatAddress(address?: Location.LocationGeocodedAddress) {
  if (!address) return '';

  return (
    address.formattedAddress ||
    [
      address.country,
      address.region,
      address.city,
      address.district,
      address.street,
      address.streetNumber,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function getMapTileUri(latitude: number, longitude: number) {
  const clampedLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const zoomScale = 2 ** MAP_TILE_ZOOM;
  const x = Math.floor(((longitude + 180) / 360) * zoomScale);
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) *
      zoomScale,
  );

  return `https://tile.openstreetmap.org/${MAP_TILE_ZOOM}/${x}/${y}.png`;
}

function createLocationCandidates(
  location: Location.LocationObject,
  address?: Location.LocationGeocodedAddress,
): LocationCandidate[] {
  const { latitude, longitude } = location.coords;
  const coordinateText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const addressText = formatAddress(address);
  const primaryName = address?.name || address?.street || address?.district || '当前位置';
  const primaryDetail = addressText || coordinateText;

  return [
    {
      id: 'current',
      name: primaryName,
      detail: `100m内 | ${primaryDetail}`,
      coordinateText,
      latitude,
      longitude,
      mapTileUri: getMapTileUri(latitude, longitude),
    },
  ];
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
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [mode, setMode] = useState<PanelMode>('keyboard');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [pendingImageSelected, setPendingImageSelected] = useState(true);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationCandidates, setLocationCandidates] = useState<LocationCandidate[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
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

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  const scheduleScrollToBottom = useCallback(
    (animated = true) => {
      clearScrollTimers();
      scrollToBottom(animated);
      [80, 180, 320, 520, 760].forEach((delay) => {
        const timer = setTimeout(() => scrollToBottom(animated), delay);
        scrollTimersRef.current.push(timer);
      });
    },
    [clearScrollTimers, scrollToBottom],
  );

  const onFooterLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      setFooterHeight((current) => {
        if (Math.abs(current - nextHeight) < 1) return current;
        scheduleScrollToBottom(false);
        return nextHeight;
      });
    },
    [scheduleScrollToBottom],
  );

  const appendUserTurn = useCallback(
    async ({
      content,
      imageUri,
      audioUri,
      audioDuration,
      modeAfterSend,
    }: {
      content: string;
      imageUri?: string;
      audioUri?: string;
      audioDuration?: number;
      modeAfterSend?: PanelMode;
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
      setMode((current) => modeAfterSend ?? (current === 'emoji' || current === 'actions' ? current : 'keyboard'));
      setIsGenerating(true);
      scheduleScrollToBottom();
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
        scheduleScrollToBottom();
      }
    },
    [isGenerating, scheduleScrollToBottom, scrollToBottom, streamingStore],
  );

  const openImagePreview = useCallback((asset: ImagePicker.ImagePickerAsset | undefined, label: string) => {
    if (!asset?.uri) return;

    Keyboard.dismiss();
    setKeyboardHeight(0);
    setMode('actions');
    setPendingImage({ uri: asset.uri, label });
    setPendingImageSelected(true);
  }, []);

  const sendPendingImage = useCallback(async () => {
    if (!pendingImage || !pendingImageSelected) return;

    const imageToSend = pendingImage;
    setPendingImage(null);
    setPendingImageSelected(true);
    await appendUserTurn({
      content: imageToSend.label,
      imageUri: imageToSend.uri,
      modeAfterSend: 'actions',
    });
  }, [appendUserTurn, pendingImage, pendingImageSelected]);

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
      openImagePreview(result.assets[0], '图片');
    }
  }, [openImagePreview]);

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
      openImagePreview(result.assets[0], '拍摄');
    }
  }, [openImagePreview]);

  const openLocationPicker = useCallback(async () => {
    Keyboard.dismiss();
    setKeyboardHeight(0);
    setMode('actions');
    setLocationModalVisible(true);
    setLocationLoading(true);
    setLocationCandidates([]);
    setSelectedLocationId(null);

    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setLocationLoading(false);
      setLocationModalVisible(false);
      Alert.alert('需要位置权限', '请允许 LumiMate 访问当前位置后再发送位置。');
      return;
    }

    try {
      const cachedLocation = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 200,
      });
      const location =
        cachedLocation ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      const { latitude, longitude } = location.coords;
      let address: Location.LocationGeocodedAddress | undefined;

      try {
        [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      } catch {
        address = undefined;
      }

      const candidates = createLocationCandidates(location, address);
      setLocationCandidates(candidates);
      setSelectedLocationId(candidates[0]?.id ?? null);
    } catch (error) {
      console.warn('Failed to share location', error);
      setLocationModalVisible(false);
      Alert.alert('定位失败', '暂时无法获取当前位置，请稍后再试。');
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const sendSelectedLocation = useCallback(async () => {
    const selectedLocation = locationCandidates.find((item) => item.id === selectedLocationId);
    if (!selectedLocation) return;

    setLocationModalVisible(false);
    await appendUserTurn({
      content: `位置：${selectedLocation.name}\n${selectedLocation.detail}\n${selectedLocation.coordinateText}`,
      modeAfterSend: 'actions',
    });
  }, [appendUserTurn, locationCandidates, selectedLocationId]);

  const showKeyboard = useCallback(() => {
    setMode('keyboard');
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

  const togglePanel = useCallback((nextMode: PanelMode) => {
    setMode((current) => {
      const next = current === nextMode ? 'keyboard' : nextMode;
      if (next !== 'keyboard') {
        setKeyboardHeight(0);
        Keyboard.dismiss();
      }
      return next;
    });
    scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

  const startRecording = useCallback(async () => {
    if (isGenerating || recorderState.isRecording) return;

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要麦克风权限', '请允许 LumiMate 使用麦克风后再发送语音。');
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingActiveRef.current = true;
      recordingStartedAtRef.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (error) {
      console.warn('Failed to start recording', error);
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
    } finally {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => {});
    }
  }, [appendUserTurn, recorder]);

  useEffect(() => {
    scheduleScrollToBottom(false);
  }, [messages.length, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearTimeout(throttleRef.current);
      clearScrollTimers();
    };
  }, [clearScrollTimers]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const updateKeyboardHeight = (event: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      scheduleScrollToBottom();
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
  }, [scheduleScrollToBottom]);

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
  const listBottomPadding = footerHeight + footerBottom + Spacing.three;
  const panelStyle = { height: CHAT_PANEL_HEIGHT + insets.bottom, paddingBottom: insets.bottom + Spacing.three };

  useEffect(() => {
    scheduleScrollToBottom(false);
  }, [listBottomPadding, scheduleScrollToBottom]);

  return (
    <View style={[styles.keyboardView, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.centered}>
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            extraData={listBottomPadding}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messageList}
            ListFooterComponent={<View style={{ height: listBottomPadding }} />}
            onContentSizeChange={() => scheduleScrollToBottom(false)}
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
          ]}
          onLayout={onFooterLayout}>
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
                onPress={openLocationPicker}
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

      <ImagePreviewModal
        image={pendingImage}
        selected={pendingImageSelected}
        onToggleSelected={() => setPendingImageSelected((current) => !current)}
        onClose={() => setPendingImage(null)}
        onSend={sendPendingImage}
      />
      <LocationPickerModal
        visible={locationModalVisible}
        loading={locationLoading}
        candidates={locationCandidates}
        selectedId={selectedLocationId}
        onSelect={setSelectedLocationId}
        onClose={() => setLocationModalVisible(false)}
        onSend={sendSelectedLocation}
      />
    </View>
  );
}

function ImagePreviewModal({
  image,
  selected,
  onToggleSelected,
  onClose,
  onSend,
}: {
  image: PendingImage | null;
  selected: boolean;
  onToggleSelected: () => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={Boolean(image)} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View
        style={[
          styles.imagePreview,
          {
            backgroundColor: '#151515',
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom,
          },
        ]}>
        <View style={styles.imagePreviewHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消" onPress={onClose} style={styles.modalIconButton}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={24} tintColor="#FFFFFF" />
          </Pressable>
          <ThemedText style={styles.imagePreviewTitle}>最近项目</ThemedText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择图片"
          onPress={onToggleSelected}
          style={styles.imagePreviewBody}>
          {image ? <Image source={{ uri: image.uri }} style={styles.imagePreviewPhoto} resizeMode="contain" /> : null}
          <View style={[styles.imageCheck, selected ? styles.imageCheckSelected : null]}>
            {selected ? (
              <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor="#FFFFFF" />
            ) : null}
          </View>
        </Pressable>

        <View style={styles.imagePreviewFooter}>
          <ThemedText style={styles.imageFooterText}>预览{selected ? ' (1)' : ''}</ThemedText>
          <View style={styles.originalRow}>
            <View style={[styles.originalCircle, selected ? { borderColor: theme.backgroundSelected } : null]} />
            <ThemedText style={styles.imageFooterText}>原图</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送图片"
            disabled={!selected}
            onPress={onSend}
            style={[styles.imageSendButton, !selected ? styles.disabled : null]}>
            <ThemedText style={styles.imageSendText}>发送{selected ? ' (1)' : ''}</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LocationPickerModal({
  visible,
  loading,
  candidates,
  selectedId,
  onSelect,
  onClose,
  onSend,
}: {
  visible: boolean;
  loading: boolean;
  candidates: LocationCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const selectedLocation = candidates.find((item) => item.id === selectedId);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.locationPreview, { backgroundColor: theme.background }]}>
        <View style={styles.locationMap}>
          {selectedLocation?.mapTileUri ? (
            <Image
              source={{ uri: selectedLocation.mapTileUri }}
              style={styles.mapTile}
              resizeMode="cover"
            />
          ) : null}
          <View style={[styles.mapPinOuter, { backgroundColor: theme.backgroundSelected }]}>
            <View style={styles.mapPinInner} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="重新定位" style={styles.locateButton}>
            <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={22} tintColor="#208AEF" />
          </Pressable>
        </View>

        <View style={[styles.locationHeader, { top: insets.top + Spacing.two }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消" onPress={onClose} style={styles.locationTextButton}>
            <ThemedText style={styles.locationCancelText}>取消</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送位置"
            disabled={!selectedLocation || loading}
            onPress={onSend}
            style={[styles.locationSendButton, !selectedLocation || loading ? styles.disabled : null]}>
            <ThemedText style={styles.locationSendText}>发送</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.locationSheet, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
          <View style={[styles.locationSearch, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} tintColor={theme.textSecondary} />
            <TextInput
              editable={false}
              placeholder="搜索地点"
              placeholderTextColor={theme.textSecondary}
              style={[styles.locationSearchText, { color: theme.text }]}
            />
          </View>

          {loading ? (
            <View style={styles.locationLoading}>
              <ActivityIndicator color="#208AEF" />
              <ThemedText type="small" themeColor="textSecondary">正在定位</ThemedText>
            </View>
          ) : candidates.length > 0 ? (
            candidates.map((candidate) => (
              <Pressable
                key={candidate.id}
                accessibilityRole="button"
                accessibilityLabel={`选择位置 ${candidate.name}`}
                onPress={() => onSelect(candidate.id)}
                style={({ pressed }) => [styles.locationRow, pressed ? styles.pressed : null]}>
                <View style={styles.locationTextBlock}>
                  <ThemedText style={styles.locationName} numberOfLines={1}>{candidate.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {candidate.detail}
                  </ThemedText>
                </View>
                {selectedId === candidate.id ? (
                  <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={22} tintColor="#208AEF" />
                ) : null}
              </Pressable>
            ))
          ) : (
            <View style={styles.locationLoading}>
              <ThemedText type="small" themeColor="textSecondary">未获取到当前位置</ThemedText>
            </View>
          )}
        </View>
      </View>
    </Modal>
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
  imagePreview: {
    flex: 1,
  },
  imagePreviewHeader: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  modalIconButton: {
    position: 'absolute',
    left: Spacing.three,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: 700,
  },
  imagePreviewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  imagePreviewPhoto: {
    width: '100%',
    height: '100%',
  },
  imageCheck: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCheckSelected: {
    backgroundColor: '#208AEF',
    borderColor: '#208AEF',
  },
  imagePreviewFooter: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  imageFooterText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 500,
  },
  originalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  originalCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  imageSendButton: {
    minWidth: 94,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  imageSendText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
  },
  locationPreview: {
    flex: 1,
  },
  locationMap: {
    height: '58%',
    backgroundColor: '#E8EEF2',
    overflow: 'hidden',
  },
  mapTile: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  mapPinOuter: {
    position: 'absolute',
    left: '50%',
    top: '43%',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -26 }, { translateY: -26 }],
  },
  mapPinInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#208AEF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  locateButton: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationHeader: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  locationTextButton: {
    minWidth: 64,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  locationCancelText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  locationSendButton: {
    minWidth: 72,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  locationSendText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 700,
  },
  locationSheet: {
    flex: 1,
    marginTop: -18,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: Spacing.three,
  },
  locationSearch: {
    height: 46,
    marginHorizontal: Spacing.three,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  locationSearchText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    padding: 0,
  },
  locationLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  locationRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8DADF',
  },
  locationTextBlock: {
    flex: 1,
    gap: Spacing.one,
  },
  locationName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
