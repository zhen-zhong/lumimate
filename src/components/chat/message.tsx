import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MessageProps = {
  role: 'user' | 'assistant';
  children: string;
  streaming?: boolean;
};

export function ChatMessageBubble({ role, children, streaming }: MessageProps) {
  const theme = useTheme();
  const isUser = role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <ThemedView
        type={isUser ? 'backgroundSelected' : 'backgroundElement'}
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          { borderColor: theme.backgroundSelected },
        ]}>
        <ThemedText
          selectable
          style={styles.messageText}
          themeColor={isUser ? 'text' : 'text'}>
          {children || '...'}
          {streaming ? (
            <ThemedText style={styles.cursor} themeColor="textSecondary">
              |
            </ThemedText>
          ) : null}
        </ThemedText>
      </ThemedView>
    </View>
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
  messageText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: 500,
  },
  cursor: {
    opacity: 0.5,
  },
});
