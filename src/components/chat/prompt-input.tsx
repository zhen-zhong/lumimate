import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MIN_TEXT_INPUT_HEIGHT = 40;
const TEXT_INPUT_LINE_HEIGHT = 22;
const TEXT_INPUT_VERTICAL_PADDING = (MIN_TEXT_INPUT_HEIGHT - TEXT_INPUT_LINE_HEIGHT) / 2;
const MAX_TEXT_INPUT_LINES = 10;
const MAX_TEXT_INPUT_HEIGHT =
  TEXT_INPUT_LINE_HEIGHT * MAX_TEXT_INPUT_LINES + TEXT_INPUT_VERTICAL_PADDING * 2;
const TEXT_INPUT_RIGHT_INSET = 38;

export type PromptInputMode = 'keyboard' | 'voice' | 'emoji' | 'actions';

type PromptInputProps = {
  value: string;
  mode: PromptInputMode;
  disabled?: boolean;
  submitting?: boolean;
  recording?: boolean;
  recordingDuration?: number;
  onChangeText: (value: string) => void;
  onFocusText: () => void;
  onSubmit: () => void;
  onToggleVoice: () => void;
  onToggleEmoji: () => void;
  onToggleActions: () => void;
  onVoicePressIn: () => void;
  onVoicePressOut: () => void;
};

export function PromptInput({
  value,
  mode,
  disabled,
  submitting,
  recording,
  recordingDuration,
  onChangeText,
  onFocusText,
  onSubmit,
  onToggleActions,
  onToggleEmoji,
  onToggleVoice,
  onVoicePressIn,
  onVoicePressOut,
}: PromptInputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const previousModeRef = useRef(mode);
  const [textInputHeight, setTextInputHeight] = useState(MIN_TEXT_INPUT_HEIGHT);
  const [textInputScrollable, setTextInputScrollable] = useState(false);
  const [textMeasureWidth, setTextMeasureWidth] = useState(0);
  const canSubmit = value.trim().length > 0 && !disabled && !submitting;
  const voiceMode = mode === 'voice';
  const visibleTextInputHeight = value ? textInputHeight : MIN_TEXT_INPUT_HEIGHT;
  const visibleTextInputScrollable = value ? textInputScrollable : false;
  const measureText = value.length > 0 ? value : ' ';

  const updateInputHeight = (contentHeight: number) => {
    if (contentHeight <= 0) return;

    const paddedContentHeight = Math.ceil(contentHeight) + TEXT_INPUT_VERTICAL_PADDING * 2;
    const nextHeight = Math.min(
      MAX_TEXT_INPUT_HEIGHT,
      Math.max(MIN_TEXT_INPUT_HEIGHT, paddedContentHeight),
    );

    setTextInputHeight((current) => (current === nextHeight ? current : nextHeight));
    setTextInputScrollable(paddedContentHeight > MAX_TEXT_INPUT_HEIGHT);
  };

  const onShellLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.max(
      0,
      Math.floor(event.nativeEvent.layout.width - Spacing.two - TEXT_INPUT_RIGHT_INSET),
    );

    setTextMeasureWidth((current) => (Math.abs(current - nextWidth) < 1 ? current : nextWidth));
  };

  useEffect(() => {
    if (
      mode === 'keyboard' &&
      previousModeRef.current !== 'keyboard' &&
      previousModeRef.current !== 'voice'
    ) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      previousModeRef.current = mode;
      return () => clearTimeout(timer);
    }

    previousModeRef.current = mode;
    return undefined;
  }, [mode]);

  return (
    <View style={styles.container}>
      <IconButton
        accessibilityLabel="语音"
        icon={
          voiceMode
            ? { ios: 'keyboard', android: 'keyboard', web: 'keyboard' }
            : { ios: 'waveform', android: 'keyboard_voice', web: 'keyboard_voice' }
        }
        disabled={disabled}
        onPress={onToggleVoice}
      />

      <View style={styles.inputWrap}>
        {voiceMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="按住说话"
            disabled={disabled}
            onPressIn={onVoicePressIn}
            onPressOut={onVoicePressOut}
            style={({ pressed }) => [
              styles.voiceInput,
              { backgroundColor: theme.background },
              pressed || recording ? styles.voiceInputActive : null,
            ]}>
            <ThemedText type="default">
              {recording ? `松开发送 ${recordingDuration ?? 0}s` : '按住说话'}
            </ThemedText>
          </Pressable>
        ) : (
          <View
            onLayout={onShellLayout}
            style={[
              styles.textInputShell,
              { backgroundColor: theme.background, height: visibleTextInputHeight },
            ]}>
            {textMeasureWidth > 0 ? (
              <Text
                aria-hidden
                onLayout={(event) => updateInputHeight(event.nativeEvent.layout.height)}
                style={[styles.measureText, { color: theme.text, width: textMeasureWidth }]}>
                {measureText}
              </Text>
            ) : null}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              onFocus={onFocusText}
              placeholder=""
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={1000}
              editable={!disabled}
              style={[styles.input, { color: theme.text, height: visibleTextInputHeight }]}
              returnKeyType="send"
              enterKeyHint="send"
              enablesReturnKeyAutomatically
              blurOnSubmit={false}
              scrollEnabled={visibleTextInputScrollable}
              submitBehavior="submit"
              onSubmitEditing={canSubmit ? onSubmit : undefined}
            />
            <SymbolView
              name={{ ios: 'mic', android: 'mic', web: 'mic' }}
              size={22}
              tintColor={theme.textSecondary}
              style={styles.inputMic}
            />
          </View>
        )}
      </View>

      <IconButton
        accessibilityLabel="表情"
        icon={
          mode === 'emoji'
            ? { ios: 'keyboard', android: 'keyboard', web: 'keyboard' }
            : { ios: 'face.smiling', android: 'sentiment_satisfied', web: 'sentiment_satisfied' }
        }
        disabled={disabled}
        onPress={onToggleEmoji}
      />

      {canSubmit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送消息"
          disabled={disabled || submitting}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: theme.text },
            pressed ? styles.pressed : null,
            submitting ? styles.disabled : null,
          ]}>
          {submitting ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              ...
            </ThemedText>
          ) : (
            <SymbolView
              name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
              size={18}
              tintColor={theme.background}
            />
          )}
        </Pressable>
      ) : (
        <IconButton
          accessibilityLabel="更多功能"
          icon={
            mode === 'actions'
              ? { ios: 'keyboard', android: 'keyboard', web: 'keyboard' }
              : { ios: 'plus', android: 'add', web: 'add' }
          }
          disabled={disabled}
          onPress={onToggleActions}
        />
      )}
    </View>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      <SymbolView name={icon} size={22} tintColor={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inputWrap: {
    flex: 1,
    minHeight: MIN_TEXT_INPUT_HEIGHT,
    maxHeight: MAX_TEXT_INPUT_HEIGHT,
    justifyContent: 'center',
  },
  textInputShell: {
    minHeight: MIN_TEXT_INPUT_HEIGHT,
    maxHeight: MAX_TEXT_INPUT_HEIGHT,
    borderRadius: 4,
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    fontSize: 16,
    lineHeight: TEXT_INPUT_LINE_HEIGHT,
    fontWeight: 500,
    paddingHorizontal: Spacing.two,
    paddingRight: TEXT_INPUT_RIGHT_INSET,
    paddingVertical: TEXT_INPUT_VERTICAL_PADDING,
    maxHeight: MAX_TEXT_INPUT_HEIGHT,
    minHeight: MIN_TEXT_INPUT_HEIGHT,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  measureText: {
    position: 'absolute',
    left: Spacing.two,
    top: 0,
    opacity: 0,
    fontSize: 16,
    lineHeight: TEXT_INPUT_LINE_HEIGHT,
    fontWeight: 500,
    includeFontPadding: false,
  },
  inputMic: {
    position: 'absolute',
    right: Spacing.two,
  },
  voiceInput: {
    minHeight: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  voiceInputActive: {
    opacity: 0.7,
  },
  iconButton: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
