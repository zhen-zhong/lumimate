import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  getCompanionProactivePolicy,
  getChatAgentSettings,
  getAvailableChatModels,
  getAvailableImageModels,
  generateChatPersonaDraft,
  type ChatAgentSettings,
  type ChatModelOption,
  type CompanionProactivePolicy,
  type ImageModelOption,
  type PersonaGenerationPreferences,
  updateCompanionProactivePolicy,
  updateChatAgentSettings,
} from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';
import { useTheme } from '@/hooks/use-theme';

const FALLBACK_SETTINGS: ChatAgentSettings = {
  agentName: 'LumiMate',
  agentProfile: '',
  personaProfile: null,
  personaVersion: 1,
  responseStyle: '温和、简洁',
  modelId: 'deepseek-flash',
  imageModelId: 'gpt-image-2.5-flare',
  imageUseContext: true,
  contextMessageLimit: 100,
  maxContextMessageLimit: 200,
};

const FALLBACK_PROACTIVE_POLICY: CompanionProactivePolicy = {
  enabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  dailyLimit: 1,
  minimumIntervalMinutes: 720,
};

export default function AgentSettingsScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{
    conversationId?: string;
    title?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [availableModels, setAvailableModels] = useState<ChatModelOption[]>([]);
  const [availableImageModels, setAvailableImageModels] = useState<ImageModelOption[]>([]);
  const [contextLimit, setContextLimit] = useState(String(FALLBACK_SETTINGS.contextMessageLimit));
  const [proactivePolicy, setProactivePolicy] = useState(FALLBACK_PROACTIVE_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [personaPreferences, setPersonaPreferences] = useState<PersonaGenerationPreferences>({
    relationshipType: '可靠朋友，熟悉后可以更自然一点',
    activityLevel: '自然，不频繁主动打扰',
    speechTone: '克制、真诚、有一点俏皮',
    proactiveBoundary: '只在有真实依据时轻轻联系一次，不追问',
  });
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
      .then(async ([next, models, imageModels]) => {
        if (!active) return;
        setSettings(next);
        setAvailableModels(models);
        setAvailableImageModels(imageModels);
        setContextLimit(String(next.contextMessageLimit));
        const policy = await getCompanionProactivePolicy(conversationId).catch(() => null);
        if (active && policy) setProactivePolicy(policy);
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
        personaProfile: settings.personaProfile,
        personaVersion: settings.personaVersion,
        responseStyle: settings.responseStyle.trim() || FALLBACK_SETTINGS.responseStyle,
        modelId: settings.modelId,
        imageModelId: settings.imageModelId,
        imageUseContext: settings.imageUseContext,
        contextMessageLimit: parsedLimit,
      });
      const nextPolicy = await updateCompanionProactivePolicy(conversationId, {
        enabled: proactivePolicy.enabled,
      });
      setSettings(next);
      setProactivePolicy(nextPolicy);
      setContextLimit(String(next.contextMessageLimit));
      Alert.alert('已保存', '下一条消息起使用新的智能体设定。');
    } catch (error) {
      Alert.alert('无法保存智能体设置', getApiErrorMessage(error, '保存设置失败'));
    } finally {
      setSaving(false);
    }
  }, [contextLimit, conversationId, proactivePolicy.enabled, settings]);

  const generatePersona = useCallback(async () => {
    setGeneratingPersona(true);
    try {
      const draft = await generateChatPersonaDraft(conversationId, {
        modelId: settings.modelId,
        agentName: settings.agentName.trim() || FALLBACK_SETTINGS.agentName,
        agentProfile: settings.agentProfile.trim(),
        responseStyle: settings.responseStyle.trim() || FALLBACK_SETTINGS.responseStyle,
        ...personaPreferences,
      });
      setSettings((current) => ({ ...current, ...draft }));
      Alert.alert('角色草稿已生成', '已填入当前页面。确认后点“保存智能体设定”才会生效。');
    } catch (error) {
      Alert.alert('无法生成角色草稿', getApiErrorMessage(error, '角色生成失败，请稍后重试。'));
    } finally {
      setGeneratingPersona(false);
    }
  }, [conversationId, personaPreferences, settings]);

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
            <ActivityIndicator color={theme.primary} />
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
                    onChangeText={(agentName) => setSettings((current) => ({ ...current, agentName, personaProfile: null }))}
                    maxLength={32}
                    placeholder="LumiMate"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
                  />
                </SettingsField>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <SettingsField icon={{ ios: 'theatermasks.fill', android: 'face', web: 'face' }} label="角色设定" hint="关系、偏好、边界，都会成为陪伴线索">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="使用当前聊天模型生成角色设定"
                    disabled={generatingPersona}
                    onPress={() => void generatePersona()}
                    style={({ pressed }) => [
                      styles.generatePersonaButton,
                      { backgroundColor: theme.primarySurface },
                      (pressed || generatingPersona) ? styles.pressed : null,
                    ]}>
                    {generatingPersona ? <ActivityIndicator size="small" color={theme.primary} /> : <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={16} tintColor={theme.primary} />}
                    <View style={styles.generatePersonaCopy}>
                      <ThemedText type="smallBold" style={{ color: theme.primary }}>{generatingPersona ? '正在生成角色草稿…' : 'AI 生成角色设定'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>使用当前聊天模型：{availableModels.find((model) => model.id === settings.modelId)?.label || settings.modelId}</ThemedText>
                    </View>
                  </Pressable>
                  <View style={[styles.personaPreferences, { borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}>
                    <ThemedText type="smallBold" style={{ color: theme.text }}>生成偏好（可改）</ThemedText>
                    <PersonaPreferenceInput label="关系" value={personaPreferences.relationshipType ?? ''} placeholder="例如：可靠朋友" onChangeText={(relationshipType) => setPersonaPreferences((current) => ({ ...current, relationshipType }))} theme={theme} />
                    <PersonaPreferenceInput label="活跃度" value={personaPreferences.activityLevel ?? ''} placeholder="例如：自然，不频繁主动" onChangeText={(activityLevel) => setPersonaPreferences((current) => ({ ...current, activityLevel }))} theme={theme} />
                    <PersonaPreferenceInput label="语气" value={personaPreferences.speechTone ?? ''} placeholder="例如：克制、真诚、有一点俏皮" onChangeText={(speechTone) => setPersonaPreferences((current) => ({ ...current, speechTone }))} theme={theme} />
                    <PersonaPreferenceInput label="主动边界" value={personaPreferences.proactiveBoundary ?? ''} placeholder="例如：不追问、不施压" onChangeText={(proactiveBoundary) => setPersonaPreferences((current) => ({ ...current, proactiveBoundary }))} theme={theme} />
                  </View>
                  <TextInput
                    value={settings.agentProfile}
                    onChangeText={(agentProfile) => setSettings((current) => ({ ...current, agentProfile, personaProfile: null }))}
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
                    <View style={[styles.advancedIcon, { backgroundColor: theme.primarySurface }]}>
                      <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={16} tintColor={theme.primary} />
                    </View>
                    <View style={styles.fieldTitleCopy}>
                      <ThemedText type="default">高级设置</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">聊天模型与协议</ThemedText>
                    </View>
                    <View style={[styles.selectedModelChip, { backgroundColor: theme.background }]}>
                      <ThemedText type="smallBold" numberOfLines={1} style={[styles.selectedModelText, { color: theme.primary }]}>
                        {availableModels.find((model) => model.id === settings.modelId)?.label || settings.modelId}
                      </ThemedText>
                      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={theme.primary} />
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
                    <View style={[styles.advancedIcon, { backgroundColor: theme.primarySurface }]}>
                      <SymbolView name={{ ios: 'photo.badge.plus', android: 'auto_awesome', web: 'auto_awesome' }} size={16} tintColor={theme.primary} />
                    </View>
                    <View style={styles.fieldTitleCopy}>
                      <ThemedText type="default">图片创作</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">生图与编辑图片</ThemedText>
                    </View>
                    <View style={[styles.selectedModelChip, { backgroundColor: theme.background }]}>
                      <ThemedText type="smallBold" numberOfLines={1} style={[styles.selectedModelText, { color: theme.primary }]}>
                        {availableImageModels.find((model) => model.id === settings.imageModelId)?.label || settings.imageModelId}
                      </ThemedText>
                      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={theme.primary} />
                    </View>
                  </View>
                </Pressable>

                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

                <View style={styles.companionRow}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'text.bubble.fill', android: 'forum', web: 'forum' }} size={16} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">生图使用上下文</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {settings.imageUseContext ? '参考角色档案与最近对话；仅生成虚拟角色创作' : '仅依据当前这句话生成；不代表真实照片'}
                    </ThemedText>
                  </View>
                  <Switch
                    accessibilityLabel="生图使用上下文"
                    value={settings.imageUseContext}
                    onValueChange={(imageUseContext) => setSettings((current) => ({ ...current, imageUseContext }))}
                    trackColor={{ false: theme.backgroundSelected, true: theme.primarySurface }}
                    thumbColor={settings.imageUseContext ? theme.primary : theme.background}
                  />
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">记忆范围</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">影响 token 消耗</ThemedText>
              </View>

              <View style={[styles.memoryCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.memoryTopRow}>
                  <View style={[styles.memoryIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'brain.head.profile', android: 'psychology', web: 'psychology' }} size={21} tintColor={theme.primary} />
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
                      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={15} tintColor={theme.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.memoryHint}>
                更多上下文更连贯；过长会增加等待时间与模型费用。
              </ThemedText>

              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">陪伴记忆</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">由你确认才会使用</ThemedText>
              </View>

              <View style={[styles.groupCard, { backgroundColor: theme.backgroundElement }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="打开此刻状态"
                  onPress={() => router.push({ pathname: '/companion/presence' as never, params: { conversationId, title } })}
                  style={({ pressed }) => [styles.companionRow, pressed ? styles.pressed : null]}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={17} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">此刻状态</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">查看记录中的陪伴状态和近期事件</ThemedText>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="打开角色相册"
                  onPress={() => router.push({ pathname: '/companion/gallery' as never, params: { conversationId, title } })}
                  style={({ pressed }) => [styles.companionRow, pressed ? styles.pressed : null]}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' }} size={17} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">角色相册</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">只展示虚拟角色创作，不含用户照片</ThemedText>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="打开技能中心"
                  onPress={() => router.push({ pathname: '/companion/skills' as never, params: { conversationId, title } })}
                  style={({ pressed }) => [styles.companionRow, pressed ? styles.pressed : null]}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' }} size={17} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">技能中心</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">为当前陪伴启用专属能力</ThemedText>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="管理陪伴记忆"
                  onPress={() => router.push({ pathname: '/companion/memory' as never, params: { conversationId, title } })}
                  style={({ pressed }) => [styles.companionRow, pressed ? styles.pressed : null]}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'brain.head.profile', android: 'psychology', web: 'psychology' }} size={17} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">管理记忆与称呼</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">查看候选记忆，编辑长期偏好</ThemedText>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="打开提醒与主动陪伴"
                  onPress={() => router.push({ pathname: '/companion/tasks' as never, params: { conversationId, title } })}
                  style={({ pressed }) => [styles.companionRow, pressed ? styles.pressed : null]}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'checklist', android: 'checklist', web: 'checklist' }} size={17} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">提醒与主动陪伴</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">查看提醒、静默时间与联系频率</ThemedText>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <View style={styles.companionRow}>
                  <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
                    <SymbolView name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }} size={16} tintColor={theme.primary} />
                  </View>
                  <View style={styles.fieldTitleCopy}>
                    <ThemedText type="default">主动陪伴</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">默认关闭；受静默时间和频率限制</ThemedText>
                  </View>
                  <Switch
                    style={styles.toggle}
                    value={proactivePolicy.enabled}
                    onValueChange={(enabled) => setProactivePolicy((current) => ({ ...current, enabled }))}
                    trackColor={{ false: theme.backgroundSelected, true: theme.primarySurface }}
                    thumbColor={proactivePolicy.enabled ? theme.primary : theme.background}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={[styles.saveBar, { backgroundColor: theme.background, borderTopColor: theme.backgroundElement }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="保存智能体设置"
                disabled={saving}
                onPress={() => void save()}
                style={({ pressed }) => [styles.saveButton, { backgroundColor: theme.primary }, (pressed || saving) ? styles.pressed : null]}>
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
                            { backgroundColor: selected ? theme.primarySurface : theme.backgroundElement },
                            pressed ? styles.pressed : null,
                          ]}>
                          <View style={styles.modelBadge}>
                            <SymbolView name={{ ios: modelPickerCapability === 'image-generation' ? 'photo.fill' : model.protocol === 'anthropic-messages' ? 'text.bubble.fill' : 'bolt.fill', android: modelPickerCapability === 'image-generation' ? 'image' : model.protocol === 'anthropic-messages' ? 'chat' : 'bolt', web: modelPickerCapability === 'image-generation' ? 'image' : model.protocol === 'anthropic-messages' ? 'chat' : 'bolt' }} size={15} tintColor={selected ? theme.primary : theme.textSecondary} />
                          </View>
                          <View style={styles.modelCopy}>
                            <ThemedText style={selected ? [styles.modelNameSelected, { color: theme.primary }] : undefined}>{model.label}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">{model.id}</ThemedText>
                          </View>
                          {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={21} tintColor={theme.primary} /> : null}
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
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <View style={styles.fieldTitleRow}>
        <View style={[styles.fieldIcon, { backgroundColor: theme.primarySurface }]}>
          <SymbolView name={icon} size={16} tintColor={theme.primary} />
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

function PersonaPreferenceInput({ label, value, placeholder, onChangeText, theme }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.personaPreferenceRow}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.personaPreferenceLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        maxLength={120}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.personaPreferenceInput, { color: theme.text }]}
      />
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
  generatePersonaButton: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: Spacing.two, minHeight: 58, paddingHorizontal: Spacing.two },
  generatePersonaCopy: { flex: 1, gap: 2 },
  personaPreferences: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one, padding: Spacing.two },
  personaPreferenceRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 32 },
  personaPreferenceLabel: { width: 46 },
  personaPreferenceInput: { flex: 1, fontSize: 14, minHeight: 32, paddingVertical: 3 },
  advancedToggle: { paddingVertical: Spacing.three },
  fieldTitleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  fieldIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 9, height: 30, justifyContent: 'center', width: 30 },
  advancedIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  fieldTitleCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, fontSize: 16, marginRight: Spacing.two, minHeight: 48, paddingHorizontal: Spacing.three },
  textarea: { minHeight: 118, paddingVertical: Spacing.two },
  selectedModelChip: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 3, maxWidth: 154, minHeight: 34, paddingHorizontal: Spacing.two },
  selectedModelText: { flexShrink: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 16, 32, 0.42)' },
  modelSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78%', paddingTop: Spacing.two },
  sheetHandle: { alignSelf: 'center', borderRadius: 2, height: 4, width: 38 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  closeButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  sheetContent: { gap: Spacing.three, padding: Spacing.three, paddingBottom: 44 },
  modelGroup: { gap: Spacing.one },
  modelOption: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: Spacing.two, minHeight: 64, paddingHorizontal: Spacing.two },
  modelBadge: { alignItems: 'center', backgroundColor: 'rgba(40,120,232,0.1)', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  modelCopy: { flex: 1, gap: 2 },
  modelNameSelected: { fontWeight: '700' },
  memoryCard: { borderRadius: 18, padding: Spacing.three },
  memoryTopRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  memoryIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  memoryCopy: { flex: 1, gap: 1, minWidth: 0 },
  limitStepper: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', height: 42, paddingHorizontal: Spacing.one },
  stepperButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 36 },
  limitValue: { fontSize: 15, fontWeight: '700', minWidth: 46, textAlign: 'center' },
  memoryHint: { lineHeight: 18, paddingHorizontal: Spacing.one },
  companionRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 66, paddingVertical: Spacing.two },
  toggle: { marginTop: Spacing.one },
  saveBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  saveButton: { alignItems: 'center', borderRadius: 15, minHeight: 52, justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
