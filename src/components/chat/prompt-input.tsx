import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PromptInputProps = {
  value: string;
  disabled?: boolean;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

export function PromptInput({ value, disabled, onChangeText, onSubmit }: PromptInputProps) {
  const theme = useTheme();
  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <ThemedView style={[styles.container, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="和 LumiMate 说点什么..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={1000}
          editable={!disabled}
          style={[styles.input, { color: theme.text }]}
          returnKeyType="send"
          onSubmitEditing={canSubmit ? onSubmit : undefined}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="发送消息"
        disabled={!canSubmit}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.sendButton,
          { backgroundColor: canSubmit ? theme.text : theme.backgroundSelected },
          pressed && canSubmit ? styles.pressed : null,
        ]}>
        {disabled ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            ...
          </ThemedText>
        ) : (
          <SymbolView
            name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
            size={18}
            tintColor={canSubmit ? theme.background : theme.textSecondary}
          />
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: Spacing.two,
  },
  inputWrap: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 500,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    maxHeight: 112,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
