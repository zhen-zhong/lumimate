import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelAgentIntent,
  disablePushDevice,
  getAgentIntents,
  getCompanionProactivePolicy,
  getPushDevices,
  registerPushDevice,
  type AgentIntent,
  type CompanionProactivePolicy,
  updateCompanionProactivePolicy,
} from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';
import { getExpoPushToken, getStoredExpoPushToken } from '@/services/push-notifications';

const FALLBACK_POLICY: CompanionProactivePolicy = {
  enabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
  dailyLimit: 1,
  minimumIntervalMinutes: 720,
};

const ACTIVE_STATUSES = new Set<AgentIntent['status']>(['AWAITING_CONFIRMATION', 'SCHEDULED', 'RUNNING']);
const STATUS_LABEL: Record<AgentIntent['status'], string> = {
  AWAITING_CONFIRMATION: '待确认',
  SCHEDULED: '已安排',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
};

export default function CompanionTasksScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{
    conversationId?: string;
    title?: string;
  }>();
  const theme = useTheme();
  const [intents, setIntents] = useState<AgentIntent[]>([]);
  const [policy, setPolicy] = useState(FALLBACK_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushDeviceCount, setPushDeviceCount] = useState(0);
  const [updatingPush, setUpdatingPush] = useState(false);

  const activeIntents = useMemo(() => intents.filter((intent) => ACTIVE_STATUSES.has(intent.status)), [intents]);
  const pastIntents = useMemo(() => intents.filter((intent) => !ACTIVE_STATUSES.has(intent.status)).slice(0, 8), [intents]);

  const load = useCallback(async () => {
    const [nextIntents, nextPolicy, devices] = await Promise.all([
      getAgentIntents(conversationId),
      getCompanionProactivePolicy(conversationId),
      getPushDevices(conversationId),
    ]);
    setIntents(nextIntents);
    setPolicy(nextPolicy);
    setPushDeviceCount(devices.filter((device) => device.enabled).length);
    setPushEnabled(devices.some((device) => device.enabled));
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load)
      .catch((error: unknown) => {
        if (active) Alert.alert('无法读取提醒', getApiErrorMessage(error, '读取任务失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    let active = true;
    void getExpoPushToken(false)
      .then((token) => token ? registerPushDevice(conversationId, {
        expoPushToken: token,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      }) : null)
      .then((device) => {
        if (!active || !device) return;
        setPushEnabled(device.enabled);
        setPushDeviceCount((count) => Math.max(1, count));
      })
      .catch(() => {
        // System permission, simulator, or network may prevent silent registration.
      });
    return () => { active = false; };
  }, [conversationId]);

  const savePolicy = useCallback(async () => {
    const start = policy.quietHoursStart?.trim() || null;
    const end = policy.quietHoursEnd?.trim() || null;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if ((start && !timePattern.test(start)) || (end && !timePattern.test(end))) {
      Alert.alert('时间格式不正确', '请使用 24 小时格式，例如 23:00。');
      return;
    }
    setSaving(true);
    try {
      const next = await updateCompanionProactivePolicy(conversationId, {
        enabled: policy.enabled,
        quietHoursStart: start,
        quietHoursEnd: end,
        dailyLimit: policy.dailyLimit,
        minimumIntervalMinutes: policy.minimumIntervalMinutes,
      });
      setPolicy(next);
      Alert.alert('已保存', '主动陪伴将按此频率和静默时间执行。');
    } catch (error) {
      Alert.alert('无法保存策略', getApiErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [conversationId, policy]);

  const updatePush = useCallback(async (enabled: boolean) => {
    setUpdatingPush(true);
    try {
      if (enabled) {
        const token = await getExpoPushToken(true);
        if (!token) {
          Alert.alert('未开启推送权限', '请在系统设置中允许 LumiMate 发送通知。');
          return;
        }
        const platform = Platform.OS === 'android' ? 'android' : 'ios';
        const device = await registerPushDevice(conversationId, { expoPushToken: token, platform });
        setPushEnabled(device.enabled);
        setPushDeviceCount((count) => Math.max(1, count));
        return;
      }
      const token = await getStoredExpoPushToken();
      if (token) await disablePushDevice(conversationId, token);
      setPushEnabled(false);
      setPushDeviceCount((count) => Math.max(0, count - 1));
    } catch (error) {
      Alert.alert('无法更新推送设置', getApiErrorMessage(error, '请检查网络后重试。'));
    } finally {
      setUpdatingPush(false);
    }
  }, [conversationId]);

  const cancel = useCallback((intent: AgentIntent) => {
    Alert.alert('取消这个提醒？', intent.title, [
      { text: '返回', style: 'cancel' },
      {
        text: '取消提醒', style: 'destructive', onPress: () => {
          void cancelAgentIntent(conversationId, intent.id)
            .then(() => setIntents((current) => current.map((item) => item.id === intent.id ? { ...item, status: 'CANCELLED' } : item)))
            .catch((error: unknown) => Alert.alert('无法取消提醒', getApiErrorMessage(error, '操作失败')));
        },
      },
    ]);
  }, [conversationId]);

  return (
    <>
      <Stack.Screen options={{ title: '提醒与陪伴', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading ? <View style={styles.loading}><ActivityIndicator color="#2878E8" /></View> : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }} size={18} tintColor="#2878E8" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.noticeText}>
                在聊天中发送“明天 9 点提醒我开会”，确认后才会创建提醒。
              </ThemedText>
            </View>

            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <ThemedText type="default">推送提醒</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {pushEnabled ? `已登记 ${pushDeviceCount} 台设备` : '到期提醒和主动陪伴将发送到此设备'}
                  </ThemedText>
                </View>
                {updatingPush ? <ActivityIndicator color="#2878E8" /> : <Switch value={pushEnabled} onValueChange={(enabled) => void updatePush(enabled)} trackColor={{ false: theme.backgroundSelected, true: '#8FC0FA' }} thumbColor={pushEnabled ? '#2878E8' : theme.background} />}
              </View>
            </View>

            <SectionTitle title="待执行" subtitle={`${activeIntents.length} 条`} />
            {activeIntents.length ? activeIntents.map((intent) => <IntentCard key={intent.id} intent={intent} theme={theme} onCancel={() => cancel(intent)} />) : <EmptyCard text="暂无待执行提醒。" theme={theme} />}

            <SectionTitle title="主动陪伴" subtitle="默认关闭" />
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}><ThemedText type="default">允许主动联系</ThemedText><ThemedText type="small" themeColor="textSecondary">只用于提醒、明确跟进与重要约定</ThemedText></View>
                <Switch value={policy.enabled} onValueChange={(enabled) => setPolicy((current) => ({ ...current, enabled }))} trackColor={{ false: theme.backgroundSelected, true: '#8FC0FA' }} thumbColor={policy.enabled ? '#2878E8' : theme.background} />
              </View>
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <View style={styles.timeRow}>
                <View style={styles.timeCopy}><ThemedText type="default">静默时间</ThemedText><ThemedText type="small" themeColor="textSecondary">期间不主动联系</ThemedText></View>
                <TextInput value={policy.quietHoursStart ?? ''} onChangeText={(quietHoursStart) => setPolicy((current) => ({ ...current, quietHoursStart }))} placeholder="23:00" placeholderTextColor={theme.textSecondary} keyboardType="numbers-and-punctuation" style={[styles.timeInput, { color: theme.text, backgroundColor: theme.background }]} />
                <ThemedText themeColor="textSecondary">至</ThemedText>
                <TextInput value={policy.quietHoursEnd ?? ''} onChangeText={(quietHoursEnd) => setPolicy((current) => ({ ...current, quietHoursEnd }))} placeholder="08:00" placeholderTextColor={theme.textSecondary} keyboardType="numbers-and-punctuation" style={[styles.timeInput, { color: theme.text, backgroundColor: theme.background }]} />
              </View>
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <StepperRow label="每日主动联系" value={`${policy.dailyLimit} 次`} onDecrease={() => setPolicy((current) => ({ ...current, dailyLimit: Math.max(0, current.dailyLimit - 1) }))} onIncrease={() => setPolicy((current) => ({ ...current, dailyLimit: Math.min(10, current.dailyLimit + 1) }))} theme={theme} />
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <StepperRow label="最短联系间隔" value={`${Math.round(policy.minimumIntervalMinutes / 60)} 小时`} onDecrease={() => setPolicy((current) => ({ ...current, minimumIntervalMinutes: Math.max(30, current.minimumIntervalMinutes - 60) }))} onIncrease={() => setPolicy((current) => ({ ...current, minimumIntervalMinutes: Math.min(10_080, current.minimumIntervalMinutes + 60) }))} theme={theme} />
              <Pressable disabled={saving} onPress={() => void savePolicy()} style={({ pressed }) => [styles.saveButton, pressed || saving ? styles.pressed : null]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText type="smallBold" style={styles.saveText}>保存主动陪伴策略</ThemedText>}</Pressable>
            </View>

            {pastIntents.length ? <><SectionTitle title="历史" subtitle="最近 8 条" />{pastIntents.map((intent) => <IntentCard key={intent.id} intent={intent} theme={theme} />)}</> : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.sectionTitle}><ThemedText type="smallBold" themeColor="textSecondary">{title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText></View>;
}

function IntentCard({ intent, theme, onCancel }: { intent: AgentIntent; theme: ReturnType<typeof useTheme>; onCancel?: () => void }) {
  const date = new Date(intent.dueAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return <View style={[styles.intentCard, { backgroundColor: theme.backgroundElement }]}><View style={styles.intentHeading}><View style={styles.statusChip}><ThemedText type="smallBold" style={styles.statusText}>{STATUS_LABEL[intent.status]}</ThemedText></View><ThemedText type="small" themeColor="textSecondary">{date}</ThemedText></View><ThemedText style={styles.intentTitle}>{intent.title}</ThemedText>{onCancel ? <Pressable onPress={onCancel} style={styles.cancelLink}><ThemedText type="smallBold" style={styles.cancelText}>取消提醒</ThemedText></Pressable> : null}</View>;
}

function StepperRow({ label, value, onDecrease, onIncrease, theme }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void; theme: ReturnType<typeof useTheme> }) {
  return <View style={styles.stepperRow}><ThemedText type="default">{label}</ThemedText><View style={[styles.stepper, { backgroundColor: theme.background }]}><Pressable onPress={onDecrease} style={styles.stepperButton}><SymbolView name={{ ios: 'minus', android: 'remove', web: 'remove' }} size={15} tintColor={theme.textSecondary} /></Pressable><ThemedText type="smallBold" style={styles.stepperValue}>{value}</ThemedText><Pressable onPress={onIncrease} style={styles.stepperButton}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={15} tintColor="#2878E8" /></Pressable></View></View>;
}

function EmptyCard({ text, theme }: { text: string; theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary">{text}</ThemedText></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignSelf: 'center', gap: Spacing.two, maxWidth: MaxContentWidth, padding: Spacing.three, paddingBottom: 40, width: '100%' },
  notice: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: Spacing.two, padding: Spacing.two }, noticeText: { flex: 1, lineHeight: 19 },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  card: { borderRadius: 18, overflow: 'hidden', paddingHorizontal: Spacing.three }, settingRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 72 }, settingCopy: { flex: 1, gap: 3 },
  divider: { height: StyleSheet.hairlineWidth }, timeRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minHeight: 66 }, timeCopy: { flex: 1, gap: 3 }, timeInput: { borderRadius: 10, fontSize: 15, height: 36, paddingHorizontal: 8, textAlign: 'center', width: 58 },
  stepperRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 60 }, stepper: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', height: 38 }, stepperButton: { alignItems: 'center', height: 38, justifyContent: 'center', width: 32 }, stepperValue: { minWidth: 68, textAlign: 'center' },
  saveButton: { alignItems: 'center', backgroundColor: '#2878E8', borderRadius: 12, height: 45, justifyContent: 'center', marginBottom: Spacing.three, marginTop: Spacing.two }, saveText: { color: '#FFFFFF' },
  intentCard: { borderRadius: 18, gap: Spacing.two, padding: Spacing.three }, intentHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, statusChip: { backgroundColor: '#EAF2FF', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }, statusText: { color: '#1769D1', fontSize: 12 }, intentTitle: { fontSize: 16, lineHeight: 23 }, cancelLink: { alignSelf: 'flex-end', paddingVertical: 2 }, cancelText: { color: '#D95C5C' },
  emptyCard: { borderRadius: 18, padding: Spacing.three }, pressed: { opacity: 0.68 },
});
