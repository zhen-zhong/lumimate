import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getConversationSkillPlugins,
  getSkillPluginCatalog,
  type ConversationSkillPlugin,
  type SkillPluginCatalogItem,
  updateConversationSkillPlugin,
} from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';

function skillIcon(pluginId: string): { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol } {
  return pluginId === 'relationship-coach'
    ? { ios: 'heart.text.square.fill', android: 'favorite', web: 'favorite' }
    : { ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' };
}

function labelTool(tool: string) {
  const labels: Record<string, string> = {
    'knowledge.search': '知识查询',
    'task.create': '创建提醒',
    'map.searchNearby': '附近搜索',
    'map.planRoute': '路线规划',
  };
  return labels[tool] ?? tool;
}

export default function CompanionSkillsScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{
    conversationId?: string;
    title?: string;
  }>();
  const theme = useTheme();
  const [catalog, setCatalog] = useState<SkillPluginCatalogItem[]>([]);
  const [bindings, setBindings] = useState<ConversationSkillPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPluginId, setSavingPluginId] = useState<string | null>(null);

  const bindingByPluginId = useMemo(
    () => new Map(bindings.map((binding) => [binding.plugin.id, binding])),
    [bindings],
  );

  const load = useCallback(async () => {
    const [plugins, nextBindings] = await Promise.all([
      getSkillPluginCatalog(),
      getConversationSkillPlugins(conversationId),
    ]);
    setCatalog(plugins);
    setBindings(nextBindings);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load)
      .catch((error: unknown) => {
        if (active) Alert.alert('无法读取技能', getApiErrorMessage(error, '读取技能目录失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]);

  const setEnabled = useCallback(async (plugin: SkillPluginCatalogItem, enabled: boolean) => {
    const version = bindingByPluginId.get(plugin.id)?.version.version ?? plugin.versions[0]?.version;
    if (!version) return;
    const update = async () => {
      setSavingPluginId(plugin.id);
      try {
        const next = await updateConversationSkillPlugin(conversationId, plugin.id, { enabled, version });
        setBindings(next);
      } catch (error) {
        Alert.alert('无法更新技能', getApiErrorMessage(error, '请检查网络后重试。'));
      } finally {
        setSavingPluginId(null);
      }
    };
    if (!enabled) {
      await update();
      return;
    }
    Alert.alert(
      `启用${plugin.displayName}？`,
      '技能会在下一条消息起加入当前会话。其可用工具仍需经过用户确认和服务端权限策略。',
      [
        { text: '取消', style: 'cancel' },
        { text: '启用', onPress: () => void update() },
      ],
    );
  }, [bindingByPluginId, conversationId]);

  const setMemoryEnabled = useCallback(async (plugin: SkillPluginCatalogItem, memoryEnabled: boolean) => {
    const binding = bindingByPluginId.get(plugin.id);
    const version = binding?.version.version ?? plugin.versions[0]?.version;
    if (!version) return;
    const update = async () => {
      setSavingPluginId(plugin.id);
      try {
        const next = await updateConversationSkillPlugin(conversationId, plugin.id, {
          enabled: true,
          version,
          memoryEnabled,
        });
        setBindings(next);
      } catch (error) {
        Alert.alert('无法更新记忆授权', getApiErrorMessage(error, '请检查网络后重试。'));
      } finally {
        setSavingPluginId(null);
      }
    };
    if (!memoryEnabled) {
      await update();
      return;
    }
    Alert.alert(
      `允许${plugin.displayName}读取记忆？`,
      '仅会读取已确认的相关长期记忆和关系资料；不会自动保存新记忆。你可随时关闭。',
      [
        { text: '取消', style: 'cancel' },
        { text: '允许', onPress: () => void update() },
      ],
    );
  }, [bindingByPluginId, conversationId]);

  return (
    <>
      <Stack.Screen options={{ title: '技能中心', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading ? <View style={styles.loading}><ActivityIndicator color="#2878E8" /></View> : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name={{ ios: 'lock.shield.fill', android: 'shield', web: 'shield' }} size={18} tintColor="#2878E8" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.noticeText}>
                技能只会注入已审核规则和知识范围；不会执行插件脚本，也不能越过你的工具授权。
              </ThemedText>
            </View>

            <View style={styles.sectionHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary">可用技能</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">作用于当前陪伴</ThemedText>
            </View>

            {catalog.map((plugin) => {
              const binding = bindingByPluginId.get(plugin.id);
              const enabled = binding?.enabled ?? false;
              const pluginMemoryEnabled = binding?.memoryEnabled ?? false;
              const version = binding?.version ?? plugin.versions[0];
              const manifest = version?.manifest;
              const saving = savingPluginId === plugin.id;
              return (
                <View key={plugin.id} style={[styles.skillCard, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.skillHeader}>
                    <View style={styles.skillIcon}><SymbolView name={skillIcon(plugin.id)} size={19} tintColor="#2878E8" /></View>
                    <View style={styles.skillCopy}>
                      <ThemedText type="default">{plugin.displayName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">v{version?.version ?? '—'}</ThemedText>
                    </View>
                    {saving ? <ActivityIndicator color="#2878E8" /> : <Switch value={enabled} onValueChange={(next) => void setEnabled(plugin, next)} trackColor={{ false: theme.backgroundSelected, true: '#8FC0FA' }} thumbColor={enabled ? '#2878E8' : theme.background} />}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.description}>{plugin.description}</ThemedText>
                  {manifest ? <View style={[styles.meta, { backgroundColor: theme.background }]}>
                    <MetaRow label="工具" value={manifest.toolGrants.map(labelTool).join('、') || '无'} />
                    <MetaRow label="知识" value={manifest.knowledgeBindings.length ? '已审核知识包' : '不访问知识库'} />
                    {manifest.memoryCategories.length ? <View style={styles.memoryRow}>
                      <View style={styles.memoryCopy}>
                        <ThemedText type="small" themeColor="textSecondary">记忆</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {enabled ? (pluginMemoryEnabled ? '允许读取已确认记忆' : '未授权读取') : '启用后可授权'}
                        </ThemedText>
                      </View>
                      <Switch
                        disabled={!enabled || saving}
                        value={enabled && pluginMemoryEnabled}
                        onValueChange={(next) => void setMemoryEnabled(plugin, next)}
                        trackColor={{ false: theme.backgroundSelected, true: '#8FC0FA' }}
                        thumbColor={enabled && pluginMemoryEnabled ? '#2878E8' : theme.background}
                      />
                    </View> : <MetaRow label="记忆" value="不使用长期记忆" />}
                  </View> : null}
                </View>
              );
            })}
            {!catalog.length ? <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary">暂无可启用技能。</ThemedText></View> : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.metaRow}><ThemedText type="small" themeColor="textSecondary" style={styles.metaLabel}>{label}</ThemedText><ThemedText type="small" numberOfLines={1} style={styles.metaValue}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: Spacing.two, maxWidth: MaxContentWidth, padding: Spacing.three, paddingBottom: 40, width: '100%' },
  notice: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: Spacing.two, padding: Spacing.two },
  noticeText: { flex: 1, lineHeight: 19 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  skillCard: { borderRadius: 18, gap: Spacing.two, padding: Spacing.three },
  skillHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  skillIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  skillCopy: { flex: 1, gap: 2 },
  description: { lineHeight: 20 },
  meta: { borderRadius: 12, gap: Spacing.one, padding: Spacing.two },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  memoryRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  memoryCopy: { flex: 1, gap: 2 },
  metaLabel: { width: 34 },
  metaValue: { flex: 1 },
  emptyCard: { alignItems: 'center', borderRadius: 18, padding: Spacing.four },
});
