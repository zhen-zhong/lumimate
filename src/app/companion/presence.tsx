import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { CompanionIllustration } from '@/components/companion-illustration';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCompanionPresence, getCompanionSharedEpisodes, type CompanionPresence, type CompanionSharedEpisode } from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';

export default function CompanionPresenceScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{ conversationId?: string; title?: string }>();
  const theme = useTheme();
  const [presence, setPresence] = useState<CompanionPresence | null>(null);
  const [episodes, setEpisodes] = useState<CompanionSharedEpisode[]>([]);
  const [briefVisible, setBriefVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [next, nextEpisodes] = await Promise.all([getCompanionPresence(conversationId), getCompanionSharedEpisodes(conversationId)]);
    setPresence(next);
    setEpisodes(nextEpisodes);
  }, [conversationId]);

  const latestEpisode = useMemo(() => episodes.find((episode) => episode.status === 'CONFIRMED' && !episode.archivedAt) ?? null, [episodes]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch((error: unknown) => {
      if (active) Alert.alert('无法读取陪伴状态', getApiErrorMessage(error, '读取状态失败'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: '此刻状态', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading || !presence ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View> : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.hero, { backgroundColor: theme.backgroundElement }]}>
              <CompanionIllustration size={96} />
              <ThemedText type="subtitle">{presence.activityLabel}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                {presence.nextPlan ?? '没有待办状态'}
              </ThemedText>
            </View>

            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                这里是服务记录的虚拟陪伴状态，不表示现实经历或离线持续活动。
              </ThemedText>
            </View>

            {briefVisible ? <View style={[styles.brief, { backgroundColor: theme.primarySurface }]}>
              <View style={styles.briefHeading}><ThemedText type="smallBold" style={{ color: theme.primary }}>角色小报</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="关闭角色小报" onPress={() => setBriefVisible(false)}><ThemedText type="smallBold" style={{ color: theme.primary }}>暂不展示</ThemedText></Pressable></View>
              <ThemedText type="small" themeColor="textSecondary">此刻在{presence.activityLabel}。{latestEpisode ? `最近留下「${latestEpisode.title}」。` : '还没有保存共同片段。'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">只根据系统状态和你确认的共同经历生成；未保存为角色记忆。</ThemedText>
            </View> : <Pressable accessibilityRole="button" onPress={() => setBriefVisible(true)} style={styles.restoreBrief}><ThemedText type="smallBold" style={{ color: theme.primary }}>显示角色小报</ThemedText></Pressable>}

            <View style={styles.sectionTitle}>
              <ThemedText type="smallBold" themeColor="textSecondary">近期事件</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="刷新陪伴状态" onPress={() => void load()}><ThemedText type="smallBold" style={{ color: theme.primary }}>刷新</ThemedText></Pressable>
            </View>
            {presence.recentEvents.length ? presence.recentEvents.map((event) => (
              <View key={event.id} style={[styles.event, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">{event.content}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{new Date(event.occurredAt).toLocaleString('zh-CN')}</ThemedText>
              </View>
            )) : <View style={[styles.event, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary">还没有可展示的事件。</ThemedText></View>}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: Spacing.two, maxWidth: MaxContentWidth, padding: Spacing.three, width: '100%' },
  hero: { alignItems: 'center', borderRadius: 20, gap: Spacing.two, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  notice: { borderRadius: 14, padding: Spacing.two },
  brief: { borderRadius: 16, gap: Spacing.one, padding: Spacing.three },
  briefHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  restoreBrief: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  event: { borderRadius: 16, gap: 6, padding: Spacing.two },
});
