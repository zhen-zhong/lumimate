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

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <ThemedView
        type={isUser ? 'backgroundSelected' : 'backgroundElement'}
        style={[
          styles.bubble,
          imageUri ? styles.imageBubble : null,
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
      style={styles.voiceRow}>
      <SymbolView
        name={{ ios: playing ? 'pause.fill' : 'play.fill', android: playing ? 'pause' : 'play_arrow', web: playing ? 'pause' : 'play_arrow' }}
        size={18}
        tintColor={theme.text}
      />
      <View
        style={[
          styles.voiceWave,
          { backgroundColor: isUser ? theme.background : theme.backgroundSelected },
        ]}>
        <View style={[styles.voiceBar, { backgroundColor: theme.textSecondary }]} />
        <View style={[styles.voiceBarTall, { backgroundColor: theme.textSecondary }]} />
        <View style={[styles.voiceBar, { backgroundColor: theme.textSecondary }]} />
        <View style={[styles.voiceBarTall, { backgroundColor: theme.textSecondary }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {duration ? `${duration}s` : '语音'}
      </ThemedText>
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
    minWidth: 136,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  voiceWave: {
    height: 28,
    minWidth: 54,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
  },
  voiceBar: {
    width: 3,
    height: 10,
    borderRadius: 2,
    opacity: 0.7,
  },
  voiceBarTall: {
    width: 3,
    height: 18,
    borderRadius: 2,
    opacity: 0.7,
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
