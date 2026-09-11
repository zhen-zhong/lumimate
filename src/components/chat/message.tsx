import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MessageProps = {
  role: 'user' | 'assistant';
  children: string;
  imageUri?: string;
  audioUri?: string;
  audioDuration?: number;
  streaming?: boolean;
};

export function ChatMessageBubble({
  role,
  children,
  imageUri,
  audioUri,
  audioDuration,
  streaming,
}: MessageProps) {
  const theme = useTheme();
  const isUser = role === 'user';
  const audioOnly = Boolean(audioUri && !imageUri && !children);
  const bubbleColor = isUser ? theme.backgroundSelected : theme.backgroundElement;

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <ThemedView
        type={isUser ? 'backgroundSelected' : 'backgroundElement'}
        style={[
          styles.bubble,
          imageUri ? styles.imageBubble : null,
          audioOnly ? styles.voiceBubble : null,
          isUser ? styles.userBubble : styles.assistantBubble,
          { borderColor: theme.backgroundSelected },
        ]}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.messageImage} /> : null}
        {audioUri ? (
          <VoiceMessage uri={audioUri} duration={audioDuration} isUser={isUser} />
        ) : null}
        {children ? (
          <ThemedText
            selectable
            style={[styles.messageText, imageUri ? styles.imageCaption : null]}
            themeColor={isUser ? 'text' : 'text'}>
            {children}
            {streaming ? (
              <ThemedText style={styles.cursor} themeColor="textSecondary">
                |
              </ThemedText>
            ) : null}
          </ThemedText>
        ) : streaming ? (
          <ThemedText selectable style={styles.messageText}>
            ...
            <ThemedText style={styles.cursor} themeColor="textSecondary">
              |
            </ThemedText>
          </ThemedText>
        ) : null}
        {audioOnly ? (
          <View
            pointerEvents="none"
            style={[
              styles.voiceTail,
              isUser ? styles.userVoiceTail : styles.assistantVoiceTail,
              { backgroundColor: bubbleColor },
            ]}
          />
        ) : null}
      </ThemedView>
    </View>
  );
}

function VoiceMessage({
  uri,
  duration,
  isUser,
}: {
  uri: string;
  duration?: number;
  isUser: boolean;
}) {
  const theme = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const label = duration ? `${duration}"` : '1"';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="播放语音"
      onPress={() => {
        if (playing) {
          player.pause();
        } else {
          player.seekTo(0).finally(() => player.play());
        }
      }}
      style={[styles.voiceRow, isUser ? styles.userVoiceRow : styles.assistantVoiceRow]}>
      {isUser ? (
        <>
          <ThemedText type="subtitle" style={styles.voiceDuration}>
            {label}
          </ThemedText>
          <SymbolView
            name={{
              ios: playing ? 'pause' : 'waveform',
              android: playing ? 'pause' : 'graphic_eq',
              web: playing ? 'pause' : 'graphic_eq',
            }}
            size={playing ? 18 : 20}
            tintColor={theme.text}
          />
        </>
      ) : (
        <>
          <SymbolView
            name={{
              ios: playing ? 'pause' : 'waveform',
              android: playing ? 'pause' : 'graphic_eq',
              web: playing ? 'pause' : 'graphic_eq',
            }}
            size={playing ? 18 : 20}
            tintColor={theme.text}
          />
          <ThemedText type="subtitle" style={styles.voiceDuration}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginBottom: Spacing.three,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  userBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
  },
  imageBubble: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  voiceBubble: {
    width: 112,
    minHeight: 44,
    overflow: 'visible',
    borderWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  messageImage: {
    width: 188,
    height: 188,
    borderRadius: 14,
    backgroundColor: '#D8DADF',
  },
  imageCaption: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 30,
  },
  userVoiceRow: {
    justifyContent: 'flex-end',
  },
  assistantVoiceRow: {
    justifyContent: 'flex-start',
  },
  voiceDuration: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  voiceTail: {
    position: 'absolute',
    width: 14,
    height: 14,
    top: 8,
    transform: [{ rotate: '45deg' }],
  },
  userVoiceTail: {
    right: -4,
  },
  assistantVoiceTail: {
    left: -4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: 500,
  },
  cursor: {
    opacity: 0.5,
  },
});
