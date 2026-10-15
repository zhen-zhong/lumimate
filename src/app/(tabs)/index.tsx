import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { CompanionChats } from '@/data/companion-chats';
import {
  getAgentIntents,
  getChatAgentSettings,
  getCompanionProactivePolicy,
  type AgentIntent,
  type ChatAgentSettings,
  type CompanionProactivePolicy,
} from '@/services/chat-api';
import { useBottomNavigationInset } from '@/hooks/use-bottom-navigation-inset';
import { useTheme } from '@/hooks/use-theme';

const CONVERSATION_ID = 'lumimate';

const FALLBACK_SETTINGS: Pick<ChatAgentSettings, 'agentName'> = { agentName: 'LumiMate' };
const FALLBACK_POLICY: CompanionProactivePolicy = {
  enabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  dailyLimit: 1,
  minimumIntervalMinutes: 720,
};

type SymbolName = { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };

type QuickActionProps = {
  icon: SymbolName;
  label: string;
  onPress: () => void;
};

function greetingForHour(hour: number) {
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatDueAt(intent: AgentIntent) {
  const date = new Date(intent.dueAt);
  if (Number.isNaN(date.getTime())) return '等待确认时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function QuickAction({ icon, label, onPress }: QuickActionProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed ? styles.pressed : null]}>
      <View style={[styles.quickIcon, { backgroundColor: theme.primarySurface }]}>
        <SymbolView name={icon} size={19} tintColor={theme.primary} />
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>{label}</ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const bottomInset = useBottomNavigationInset();
  const [settings, setSettings] = useState<Pick<ChatAgentSettings, 'agentName'>>(FALLBACK_SETTINGS);
  const [policy, setPolicy] = useState(FALLBACK_POLICY);
  const [intents, setIntents] = useState<AgentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [nextSettings, nextPolicy, nextIntents] = await Promise.all([
      getChatAgentSettings(CONVERSATION_ID),
      getCompanionProactivePolicy(CONVERSATION_ID),
      getAgentIntents(CONVERSATION_ID),
    ]);
    setSettings({ agentName: nextSettings.agentName || FALLBACK_SETTINGS.agentName });
    setPolicy(nextPolicy);
    setIntents(nextIntents);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void load()
      .catch(() => {
        // Keep home useful with its local fallback when the API is unavailable.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }, [load]);

  const activeIntents = useMemo(
    () => intents.filter((intent) => ['AWAITING_CONFIRMATION', 'SCHEDULED', 'RUNNING'].includes(intent.status)),
    [intents],
  );
  const nextIntent = activeIntents
    .slice()
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())[0];
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now);
  const greeting = greetingForHour(now.getHours());

  const openChat = useCallback(() => {
    router.push({ pathname: '/companion/[chatId]', params: { chatId: CONVERSATION_ID } });
  }, [router]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <ThemedText type="smallBold" themeColor="textSecondary">{dateLabel}</ThemedText>
              <ThemedText type="subtitle" style={styles.greeting}>{greeting}</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开设置"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, pressed ? styles.pressed : null]}>
              <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={19} tintColor={theme.text} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`与 ${settings.agentName} 继续聊天`}
            onPress={openChat}
            style={({ pressed }) => [styles.heroCard, { backgroundColor: theme.primary }, pressed ? styles.pressed : null]}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroAvatar}>
                <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={22} tintColor={theme.primary} />
              </View>
              <View style={styles.heroStatus}>
                <View style={styles.heroStatusDot} />
                <ThemedText type="smallBold" style={styles.heroStatusText}>随时在</ThemedText>
              </View>
            </View>
            <View style={styles.heroCopy}>
              <ThemedText type="default" style={styles.heroName}>{settings.agentName}</ThemedText>
              <ThemedText style={styles.heroMessage}>留一点时间，和自己好好说句话。</ThemedText>
            </View>
            <View style={styles.heroAction}>
              <ThemedText type="smallBold" style={styles.heroActionText}>继续对话</ThemedText>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={16} tintColor="#FFFFFF" />
            </View>
          </Pressable>

          <View style={styles.quickActions}>
            <QuickAction icon={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} label="聊一聊" onPress={openChat} />
            <QuickAction icon={{ ios: 'checklist', android: 'checklist', web: 'checklist' }} label="提醒" onPress={() => router.push({ pathname: '/companion/tasks', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })} />
            <QuickAction icon={{ ios: 'brain.head.profile', android: 'psychology', web: 'psychology' }} label="记忆" onPress={() => router.push({ pathname: '/companion/memory', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })} />
            <QuickAction icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} label="陪伴设定" onPress={() => router.push({ pathname: '/companion/settings', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })} />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="default">今天的安排</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="查看全部提醒" onPress={() => router.push({ pathname: '/companion/tasks', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>全部查看</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            {loading ? (
              <View style={styles.summaryLoading}><ActivityIndicator color={theme.primary} /></View>
            ) : nextIntent ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`查看提醒：${nextIntent.title}`} onPress={() => router.push({ pathname: '/companion/tasks', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })} style={({ pressed }) => [styles.reminderRow, pressed ? styles.pressed : null]}>
                <View style={[styles.reminderIcon, { backgroundColor: theme.primarySurface }]}><SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={18} tintColor={theme.primary} /></View>
                <View style={styles.reminderCopy}><ThemedText type="smallBold" numberOfLines={1}>{nextIntent.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{formatDueAt(nextIntent)}</ThemedText></View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="打开提醒与主动陪伴" onPress={() => router.push({ pathname: '/companion/tasks', params: { conversationId: CONVERSATION_ID, title: settings.agentName } })} style={({ pressed }) => [styles.reminderRow, pressed ? styles.pressed : null]}>
                <View style={[styles.reminderIcon, { backgroundColor: theme.primarySurface }]}><SymbolView name={{ ios: 'calendar.badge.plus', android: 'add_alert', web: 'add_alert' }} size={18} tintColor={theme.primary} /></View>
                <View style={styles.reminderCopy}><ThemedText type="smallBold">还没有待办提醒</ThemedText><ThemedText type="small" themeColor="textSecondary">在聊天里说“明天提醒我…”就能创建</ThemedText></View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
              </Pressable>
            )}
            <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, { backgroundColor: policy.enabled ? theme.primarySurface : theme.background }]}>
                <SymbolView name={{ ios: policy.enabled ? 'bell.badge.fill' : 'bell.slash', android: policy.enabled ? 'notifications_active' : 'notifications_off', web: policy.enabled ? 'notifications_active' : 'notifications_off' }} size={17} tintColor={policy.enabled ? theme.primary : theme.textSecondary} />
              </View>
              <View style={styles.reminderCopy}><ThemedText type="smallBold">主动陪伴{policy.enabled ? '已开启' : '未开启'}</ThemedText><ThemedText type="small" themeColor="textSecondary">{policy.enabled ? `每天最多 ${policy.dailyLimit} 次，按你的节奏联系` : '需要时再打开，不会主动打扰'}</ThemedText></View>
            </View>
          </View>

          <View style={styles.sectionHeader}><ThemedText type="default">继续陪伴</ThemedText></View>
          <View style={styles.chatList}>
            {CompanionChats.slice(1).map((chat) => (
              <Pressable key={chat.id} accessibilityRole="button" accessibilityLabel={`打开${chat.name}`} onPress={() => router.push({ pathname: '/companion/[chatId]', params: { chatId: chat.id } })} style={({ pressed }) => [styles.chatItem, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, pressed ? styles.pressed : null]}>
                <View style={[styles.chatAvatar, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>{chat.name.slice(0, 1)}</ThemedText></View>
                <View style={styles.chatCopy}><View style={styles.chatTitleRow}><ThemedText type="smallBold">{chat.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{chat.time}</ThemedText></View><ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{chat.lastMessage}</ThemedText></View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, alignItems: 'center' },
  scrollView: { width: '100%' },
  scrollContent: { width: '100%', alignItems: 'center', paddingHorizontal: 12 },
  container: { width: '100%', maxWidth: MaxContentWidth, paddingTop: Spacing.three, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  greeting: { marginTop: Spacing.one },
  headerButton: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  heroCard: { minHeight: 222, borderRadius: 24, padding: Spacing.four, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroAvatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 6 },
  heroStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B6F4D0' },
  heroStatusText: { color: '#FFFFFF' },
  heroCopy: { gap: Spacing.one },
  heroName: { color: '#FFFFFF', fontSize: 21, fontWeight: 700, lineHeight: 28 },
  heroMessage: { color: 'rgba(255,255,255,0.86)', fontSize: 17, lineHeight: 25, fontWeight: 500 },
  heroAction: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: Spacing.two },
  heroActionText: { color: '#FFFFFF' },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  quickAction: { flex: 1, alignItems: 'center', gap: Spacing.two },
  quickIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  summaryCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryLoading: { height: 82, alignItems: 'center', justifyContent: 'center' },
  reminderRow: { minHeight: 80, paddingHorizontal: Spacing.three, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  reminderIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  reminderCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  statusRow: { minHeight: 76, paddingHorizontal: Spacing.three, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chatList: { gap: Spacing.two },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  chatAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chatCopy: { flex: 1, gap: 2 },
  chatTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  pressed: { opacity: 0.72 },
});
