import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  getChatAgentSettings,
  getAvailableChatModels,
  getAvailableImageModels,
  type ChatAgentSettings,
  type ChatModelOption,
  type ImageModelOption,
  updateChatAgentSettings,
} from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';
import { useTheme } from '@/hooks/use-theme';

const FALLBACK_SETTINGS: ChatAgentSettings = {
  agentName: 'LumiMate',
  agentProfile: '',
  responseStyle: '温和、简洁',
  modelId: 'deepseek-flash',
  imageModelId: 'gpt-image-2.5-flare',
  contextMessageLimit: 100,
  maxContextMessageLimit: 200,
};

export default function AgentSettingsScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{
    conversationId?: string;
    title?: string;
  }>();
  const theme = useTheme();
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [availableModels, setAvailableModels] = useState<ChatModelOption[]>([]);
  const [availableImageModels, setAvailableImageModels] = useState<ImageModelOption[]>([]);
  const [contextLimit, setContextLimit] = useState(String(FALLBACK_SETTINGS.contextMessageLimit));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelPickerCapability, setModelPickerCapability] = useState<'chat' | 'image-generation' | null>(null);

  const changeContextLimit = useCallback(
    (delta: number) => {
      setContextLimit((current) => {
        const value = Number(current) || FALLBACK_SETTINGS.contextMessageLimit;
        return String(Math.min(settings.maxContextMessageLimit, Math.max(1, value + delta)));
      });
    },
    [settings.maxContextMessageLimit],
  );

  useEffect(() => {
    let active = true;

    Promise.all([getChatAgentSettings(conversationId), getAvailableChatModels(), getAvailableImageModels()])
      .then(([next, models, imageModels]) => {
        if (!active) return;
        setSettings(next);
        setAvailableModels(models);
        setAvailableImageModels(imageModels);
        setContextLimit(String(next.contextMessageLimit));
      })
      .catch((error: unknown) => {
        if (!active) return;
        Alert.alert('无法读取智能体设置', getApiErrorMessage(error, '读取设置失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [conversationId]);

  const save = useCallback(async () => {
    const parsedLimit = Number(contextLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > settings.maxContextMessageLimit) {
      Alert.alert('上下文上限无效', `请输入 1–${settings.maxContextMessageLimit} 的整数。`);
      return;
    }

    setSaving(true);
    try {
      const next = await updateChatAgentSettings(conversationId, {
        agentName: settings.agentName.trim() || FALLBACK_SETTINGS.agentName,
        agentProfile: settings.agentProfile.trim(),
        responseStyle: settings.responseStyle.trim() || FALLBACK_SETTINGS.responseStyle,
        modelId: settings.modelId,
        imageModelId: settings.imageModelId,
        contextMessageLimit: parsedLimit,
      });
      setSettings(next);
      setContextLimit(String(next.contextMessageLimit));
      Alert.alert('已保存', '下一条消息起使用新的智能体设定。');
    } catch (error) {
      Alert.alert('无法保存智能体设置', getApiErrorMessage(error, '保存设置失败'));
    } finally {
      setSaving(false);
    }
  }, [contextLimit, conversationId, settings]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '陪伴设定',
          headerBackTitle: title,
          headerBackTitleStyle: { fontSize: 15 },
        }}
      />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#2878E8" />
          </View>
        ) : (
          <View style={styles.page}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.eyebrowRow}>
                <View style={styles.statusDot} />
                <ThemedText type="smallBold" themeColor="textSecondary">智能体在线</ThemedText>
              </View>

              <View style={styles.heroCard}>
                <View style={styles.agentAvatar}>
                  <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={24} tintColor="#FFFFFF" />
                </View>
                <View style={styles.heroCopy}>
                  <ThemedText type="default" style={styles.heroTitle}>{settings.agentName || 'LumiMate'}</ThemedText>
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">角色档案</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">会在下一次对话生效</ThemedText>
              </View>

              <View style={[styles.groupCard, { backgroundColor: theme.backgroundElement }]}>
                <SettingsField icon={{ ios: 'person.fill', android: 'person', web: 'person' }} label="智能体名称" hint="聊天时怎样称呼它">
                  <TextInput
                    value={settings.agentName}
                    onChangeText={(agentName) => setSettings((current) => ({ ...current, agentName }))}
                    maxLength={32}
                    placeholder="LumiMate"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                  />
                </SettingsField>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <SettingsField icon={{ ios: 'theatermasks.fill', android: 'face', web: 'face' }} label="角色设定" hint="关系、偏好、边界，都会成为陪伴线索">
                  <TextInput
                    value={settings.agentProfile}
                    onChangeText={(agentProfile) => setSettings((current) => ({ ...current, agentProfile }))}
                    maxLength={2000}
                    multiline
                    textAlignVertical="top"
                    placeholder="例如：像可靠朋友一样陪伴我，熟悉我的健身目标。"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, styles.textarea, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                  />
                </SettingsField>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <SettingsField icon={{ ios: 'text.quote', android: 'format_quote', web: 'format_quote' }} label="回复风格" hint="一句话描述你喜欢的交流方式">
                  <TextInput
                    value={settings.responseStyle}
                    onChangeText={(responseStyle) => setSettings((current) => ({ ...current, responseStyle }))}
                    maxLength={500}
                    placeholder="温和、简洁"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                  />
                </SettingsField>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="选择聊天模型"
                  onPress={() => setModelPickerCapability('chat')}
                  style={({ pressed }) => [styles.advancedToggle, pressed ? styles.pressed : null]}>
                  <View style={styles.fieldTitleRow}>
                    <View style={styles.advancedIcon}>
                      <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={16} tintColor="#2878E8" />
                    </View>
                    <View style={styles.fieldTitleCopy}>
                      <ThemedText type="default">高级设置</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">聊天模型与协议</ThemedText>
                    </View>
                    <View style={[styles.selectedModelChip, { backgroundColor: theme.background }]}>
                      <ThemedText type="smallBold" numberOfLines={1} style={styles.selectedModelText}>
                        {availableModels.find((model) => model.id === settings.modelId)?.label || settings.modelId}
                      </ThemedText>
                      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor="#2878E8" />
                    </View>
                  </View>
                </Pressable>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="选择图片创作模型"
                  onPress={() => setModelPickerCapability('image-generation')}
                  style={({ pressed }) => [styles.advancedToggle, pressed ? styles.pressed : null]}>
                  <View style={styles.fieldTitleRow}>
                    <View style={styles.advancedIcon}>
                      <SymbolView name={{ ios: 'photo.badge.plus', android: 'auto_awesome', web: 'auto_awesome' }} size={16} tintColor="#2878E8" />
                    </View>
                    <View style={styles.fieldTitleCopy}>
                      <ThemedText type="default">图片创作</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">生图与编辑图片</ThemedText>
                    </View>
                    <View style={[styles.selectedModelChip, { backgroundColor: theme.background }]}>
                      <ThemedText type="smallBold" numberOfLines={1} style={styles.selectedModelText}>
                        {availableImageModels.find((model) => model.id === settings.imageModelId)?.label || settings.imageModelId}
                      </ThemedText>
                      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor="#2878E8" />
                    </View>
                  </View>
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">记忆范围</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">影响 token 消耗</ThemedText>
              </View>

              <View style={[styles.memoryCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.memoryTopRow}>
                  <View style={styles.memoryIcon}>
                    <SymbolView name={{ ios: 'brain.head.profile', android: 'psychology', web: 'psychology' }} size={21} tintColor="#2878E8" />
                  </View>
                  <View style={styles.memoryCopy}>
                    <ThemedText type="default">上下文记忆</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>每次带上最近对话</ThemedText>
                  </View>
                  <View style={[styles.limitStepper, { backgroundColor: theme.background }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="减少上下文消息"
                      disabled={Number(contextLimit) <= 1}
                      onPress={() => changeContextLimit(-10)}
                      style={({ pressed }) => [styles.stepperButton, (pressed || Number(contextLimit) <= 1) ? styles.pressed : null]}>
                      <SymbolView name={{ ios: 'minus', android: 'remove', web: 'remove' }} size={15} tintColor={theme.textSecondary} />
                    </Pressable>
                    <ThemedText style={[styles.limitValue, { color: theme.text }]}>{contextLimit} 条</ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="增加上下文消息"
                      disabled={Number(contextLimit) >= settings.maxContextMessageLimit}
                      onPress={() => changeContextLimit(10)}
                      style={({ pressed }) => [styles.stepperButton, (pressed || Number(contextLimit) >= settings.maxContextMessageLimit) ? styles.pressed : null]}>
                      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={15} tintColor="#2878E8" />
                    </Pressable>
                  </View>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.memoryHint}>
                更多上下文更连贯；过长会增加等待时间与模型费用。
              </ThemedText>
            </ScrollView>

            <View style={[styles.saveBar, { backgroundColor: theme.background, borderTopColor: theme.backgroundElement }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="保存智能体设置"
                disabled={saving}
                onPress={() => void save()}
                style={({ pressed }) => [styles.saveButton, (pressed || saving) ? styles.pressed : null]}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveText}>保存智能体设定</ThemedText>}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      <Modal
        visible={modelPickerCapability !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModelPickerCapability(null)}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭模型选择"
            onPress={() => setModelPickerCapability(null)}
            style={styles.modalBackdrop}
          />
          <View style={[styles.modelSheet, { backgroundColor: theme.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.sheetHeader}>
              <View>
                <ThemedText type="subtitle">{modelPickerCapability === 'image-generation' ? '选择图片创作模型' : '选择聊天模型'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">模型切换将在保存设置后生效</ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭模型选择"
                onPress={() => setModelPickerCapability(null)}
                style={[styles.closeButton, { backgroundColor: theme.backgroundElement }]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={17} tintColor={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {(modelPickerCapability === 'image-generation' ? availableImageModels : availableModels).map((model) => {
                      const selected = modelPickerCapability === 'image-generation'
                        ? model.id === settings.imageModelId
                        : model.id === settings.modelId;
                      return (
                        <Pressable
                          key={model.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setSettings((current) => modelPickerCapability === 'image-generation'
                              ? { ...current, imageModelId: model.id }
                              : { ...current, modelId: model.id });
                            setModelPickerCapability(null);
                          }}
                          style={({ pressed }) => [
                            styles.modelOption,
                            { backgroundColor: selected ? '#EAF2FF' : theme.backgroundElement },
                            pressed ? styles.pressed : null,
                          ]}>
                          <View style={styles.modelBadge}>
                            <SymbolView name={{ ios: modelPickerCapability === 'image-generation' ? 'photo.fill' : model.protocol === 'anthropic-messages' ? 'text.bubble.fill' : 'bolt.fill', android: modelPickerCapability === 'image-generation' ? 'image' : model.protocol === 'anthropic-messages' ? 'chat' : 'bolt', web: modelPickerCapability === 'image-generation' ? 'image' : model.protocol === 'anthropic-messages' ? 'chat' : 'bolt' }} size={15} tintColor={selected ? '#1769D1' : theme.textSecondary} />
                          </View>
                          <View style={styles.modelCopy}>
                            <ThemedText style={selected ? styles.modelNameSelected : undefined}>{model.label}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">{model.id}</ThemedText>
                          </View>
                          {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={21} tintColor="#2878E8" /> : null}
                        </Pressable>
                      );
                    })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SettingsField({
  icon,
  label,
  hint,
  children,
}: {
  icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldTitleRow}>
        <View style={styles.fieldIcon}>
          <SymbolView name={icon} size={16} tintColor="#2878E8" />
        </View>
        <View style={styles.fieldTitleCopy}>
          <ThemedText type="default">{label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.two, padding: Spacing.three, paddingBottom: 108 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, marginTop: Spacing.one },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#31B77A' },
  heroCard: { alignItems: 'center', backgroundColor: '#1D4ED8', borderRadius: 18, flexDirection: 'row', gap: Spacing.two, minHeight: 76, overflow: 'hidden', paddingHorizontal: Spacing.three, paddingVertical: 12 },
  agentAvatar: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  heroCopy: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', lineHeight: 30 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  groupCard: { borderRadius: 18, overflow: 'hidden', paddingHorizontal: Spacing.three },
  field: { gap: Spacing.two, paddingVertical: Spacing.three },
  advancedToggle: { paddingVertical: Spacing.three },
  fieldTitleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  fieldIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 9, height: 30, justifyContent: 'center', width: 30 },
  advancedIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  fieldTitleCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, fontSize: 16, marginRight: Spacing.two, minHeight: 48, paddingHorizontal: Spacing.three },
  textarea: { minHeight: 118, paddingVertical: Spacing.two },
  selectedModelChip: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 3, maxWidth: 154, minHeight: 34, paddingHorizontal: Spacing.two },
  selectedModelText: { color: '#1769D1', flexShrink: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 16, 32, 0.42)' },
  modelSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78%', paddingTop: Spacing.two },
  sheetHandle: { alignSelf: 'center', borderRadius: 2, height: 4, width: 38 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  closeButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  sheetContent: { gap: Spacing.three, padding: Spacing.three, paddingBottom: 44 },
  modelGroup: { gap: Spacing.one },
  modelOption: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: Spacing.two, minHeight: 64, paddingHorizontal: Spacing.two },
  modelBadge: { alignItems: 'center', backgroundColor: 'rgba(40,120,232,0.1)', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  modelCopy: { flex: 1, gap: 2 },
  modelNameSelected: { color: '#1769D1', fontWeight: '700' },
  memoryCard: { borderRadius: 18, padding: Spacing.three },
  memoryTopRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  memoryIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  memoryCopy: { flex: 1, gap: 1, minWidth: 0 },
  limitStepper: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', height: 42, paddingHorizontal: Spacing.one },
  stepperButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 28 },
  limitValue: { fontSize: 15, fontWeight: '700', minWidth: 46, textAlign: 'center' },
  memoryHint: { lineHeight: 18, paddingHorizontal: Spacing.one },
  saveBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  saveButton: { alignItems: 'center', backgroundColor: '#2878E8', borderRadius: 15, minHeight: 52, justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
