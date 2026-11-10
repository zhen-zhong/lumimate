import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CompanionIllustration } from '@/components/companion-illustration';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  archiveCompanionMemory,
  archiveCompanionSharedEpisode,
  confirmCompanionMemory,
  confirmCompanionSharedEpisode,
  createCompanionSharedEpisode,
  getCompanionMemories,
  getCompanionMemoryProvenance,
  getCompanionRelationship,
  getCompanionSharedEpisodeProvenance,
  getCompanionSharedEpisodes,
  removeCompanionMemory,
  removeCompanionSharedEpisode,
  type CompanionMemory,
  type CompanionMemoryProvenance,
  type CompanionRelationship,
  type CompanionSharedEpisode,
  type CompanionSharedEpisodeKind,
  type CompanionSharedEpisodeProvenance,
  updateCompanionMemory,
  updateCompanionRelationship,
  updateCompanionSharedEpisode,
} from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';

const EMPTY_RELATIONSHIP: CompanionRelationship = {
  preferredName: null,
  relationshipSummary: null,
  communicationStyle: null,
  emotionSummary: null,
  lastInteractionAt: null,
};

const CATEGORY_LABEL: Record<CompanionMemory['category'], string> = {
  PREFERENCE: '偏好',
  RELATIONSHIP: '关系',
  COMMITMENT: '约定',
  PLACE: '地点',
  EVENT: '事件',
  FACT: '信息',
};

export default function CompanionMemoryScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{
    conversationId?: string;
    title?: string;
  }>();
  const theme = useTheme();
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [relationship, setRelationship] = useState(EMPTY_RELATIONSHIP);
  const [episodes, setEpisodes] = useState<CompanionSharedEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [editing, setEditing] = useState<CompanionMemory | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [provenance, setProvenance] = useState<CompanionMemoryProvenance | null>(null);
  const [episodeEditorKind, setEpisodeEditorKind] = useState<CompanionSharedEpisodeKind | null>(null);
  const [editingEpisode, setEditingEpisode] = useState<CompanionSharedEpisode | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeContent, setEpisodeContent] = useState('');
  const [savingEpisode, setSavingEpisode] = useState(false);
  const [episodeProvenance, setEpisodeProvenance] = useState<CompanionSharedEpisodeProvenance | null>(null);

  const candidates = useMemo(
    () => memories.filter((memory) => memory.status === 'CANDIDATE'),
    [memories],
  );
  const confirmed = useMemo(
    () => memories.filter((memory) => memory.status === 'CONFIRMED'),
    [memories],
  );
  const archived = useMemo(
    () => memories.filter((memory) => memory.status === 'ARCHIVED'),
    [memories],
  );
  const episodeCandidates = useMemo(() => episodes.filter((episode) => episode.status === 'CANDIDATE'), [episodes]);
  const activeEpisodes = useMemo(() => episodes.filter((episode) => episode.status === 'CONFIRMED' && !episode.archivedAt), [episodes]);

  const load = useCallback(async () => {
    const [nextMemories, nextRelationship, nextEpisodes] = await Promise.all([
      getCompanionMemories(conversationId),
      getCompanionRelationship(conversationId),
      getCompanionSharedEpisodes(conversationId),
    ]);
    setMemories(nextMemories);
    setRelationship(nextRelationship);
    setEpisodes(nextEpisodes);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load)
      .catch((error: unknown) => {
        if (active) Alert.alert('无法读取陪伴记忆', getApiErrorMessage(error, '读取记忆失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]);

  const confirm = useCallback(async (memory: CompanionMemory) => {
    try {
      const next = await confirmCompanionMemory(conversationId, memory.id);
      setMemories((current) => current.map((item) => item.id === next.id ? next : item));
    } catch (error) {
      Alert.alert('无法确认记忆', getApiErrorMessage(error, '操作失败'));
    }
  }, [conversationId]);

  const remove = useCallback((memory: CompanionMemory) => {
    Alert.alert('删除这条记忆？', '删除后不会再作为陪伴上下文使用。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void removeCompanionMemory(conversationId, memory.id)
            .then(() => setMemories((current) => current.filter((item) => item.id !== memory.id)))
            .catch((error: unknown) => Alert.alert('无法删除记忆', getApiErrorMessage(error, '操作失败')));
        },
      },
    ]);
  }, [conversationId]);

  const archive = useCallback((memory: CompanionMemory) => {
    Alert.alert('归档这条记忆？', '归档后不会再作为陪伴上下文使用，之后仍可查看来源。', [
      { text: '取消', style: 'cancel' },
      {
        text: '归档',
        onPress: () => {
          void archiveCompanionMemory(conversationId, memory.id)
            .then((next) => setMemories((current) => current.map((item) => item.id === next.id ? next : item)))
            .catch((error: unknown) => Alert.alert('无法归档记忆', getApiErrorMessage(error, '操作失败')));
        },
      },
    ]);
  }, [conversationId]);

  const openProvenance = useCallback(async (memory: CompanionMemory) => {
    try {
      setProvenance(await getCompanionMemoryProvenance(conversationId, memory.id));
    } catch (error) {
      Alert.alert('无法读取记忆来源', getApiErrorMessage(error, '读取来源失败'));
    }
  }, [conversationId]);

  const saveRelationship = useCallback(async () => {
    setSavingRelationship(true);
    try {
      const next = await updateCompanionRelationship(conversationId, {
        preferredName: relationship.preferredName?.trim() || null,
        relationshipSummary: relationship.relationshipSummary?.trim() || null,
        communicationStyle: relationship.communicationStyle?.trim() || null,
      });
      setRelationship(next);
      Alert.alert('已保存', '下一次对话会参考这些陪伴偏好。');
    } catch (error) {
      Alert.alert('无法保存关系资料', getApiErrorMessage(error, '保存失败'));
    } finally {
      setSavingRelationship(false);
    }
  }, [conversationId, relationship]);

  const openEdit = useCallback((memory: CompanionMemory) => {
    setEditing(memory);
    setDraftContent(memory.content);
  }, []);

  const saveMemory = useCallback(async () => {
    if (!editing || !draftContent.trim()) return;
    setSavingMemory(true);
    try {
      const next = await updateCompanionMemory(conversationId, editing.id, { content: draftContent.trim() });
      setMemories((current) => current.map((item) => item.id === next.id ? next : item));
      setEditing(null);
    } catch (error) {
      Alert.alert('无法保存记忆', getApiErrorMessage(error, '保存失败'));
    } finally {
      setSavingMemory(false);
    }
  }, [conversationId, draftContent, editing]);

  const saveEpisode = useCallback(async () => {
    if (!episodeEditorKind || !episodeTitle.trim() || !episodeContent.trim()) return;
    setSavingEpisode(true);
    try {
      const next = editingEpisode
        ? await updateCompanionSharedEpisode(conversationId, editingEpisode.id, { title: episodeTitle.trim(), content: episodeContent.trim() })
        : await createCompanionSharedEpisode(conversationId, { title: episodeTitle.trim(), content: episodeContent.trim(), kind: episodeEditorKind });
      setEpisodes((current) => editingEpisode ? current.map((item) => item.id === next.id ? next : item) : [next, ...current]);
      setEpisodeEditorKind(null);
      setEditingEpisode(null);
      setEpisodeTitle('');
      setEpisodeContent('');
    } catch (error) {
      Alert.alert('无法保存共同经历', getApiErrorMessage(error, '保存失败'));
    } finally {
      setSavingEpisode(false);
    }
  }, [conversationId, editingEpisode, episodeContent, episodeEditorKind, episodeTitle]);

  const replaceEpisode = useCallback((next: CompanionSharedEpisode) => {
    setEpisodes((current) => current.map((item) => item.id === next.id ? next : item));
  }, []);

  const confirmEpisode = useCallback(async (episode: CompanionSharedEpisode) => {
    try { replaceEpisode(await confirmCompanionSharedEpisode(conversationId, episode.id)); }
    catch (error) { Alert.alert('无法确认共同经历', getApiErrorMessage(error, '操作失败')); }
  }, [conversationId, replaceEpisode]);

  const archiveEpisode = useCallback(async (episode: CompanionSharedEpisode) => {
    try { replaceEpisode(await archiveCompanionSharedEpisode(conversationId, episode.id)); }
    catch (error) { Alert.alert('无法归档共同经历', getApiErrorMessage(error, '操作失败')); }
  }, [conversationId, replaceEpisode]);

  const resolveAgreement = useCallback(async (episode: CompanionSharedEpisode, resolution: 'COMPLETED' | 'DEFERRED' | 'ABANDONED') => {
    try { replaceEpisode(await updateCompanionSharedEpisode(conversationId, episode.id, { resolution })); }
    catch (error) { Alert.alert('无法更新小约定', getApiErrorMessage(error, '操作失败')); }
  }, [conversationId, replaceEpisode]);

  const removeEpisode = useCallback((episode: CompanionSharedEpisode) => {
    Alert.alert('删除这段共同经历？', '删除后不会再进入对话上下文。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void removeCompanionSharedEpisode(conversationId, episode.id)
        .then(() => setEpisodes((current) => current.filter((item) => item.id !== episode.id)))
        .catch((error: unknown) => Alert.alert('无法删除共同经历', getApiErrorMessage(error, '操作失败'))) },
    ]);
  }, [conversationId]);

  const openEpisodeEdit = useCallback((episode: CompanionSharedEpisode) => {
    setEditingEpisode(episode); setEpisodeEditorKind(episode.kind); setEpisodeTitle(episode.title); setEpisodeContent(episode.content);
  }, []);

  const openEpisodeProvenance = useCallback(async (episode: CompanionSharedEpisode) => {
    try { setEpisodeProvenance(await getCompanionSharedEpisodeProvenance(conversationId, episode.id)); }
    catch (error) { Alert.alert('无法读取共同经历来源', getApiErrorMessage(error, '读取来源失败')); }
  }, [conversationId]);

  return (
    <>
      <Stack.Screen options={{ title: '陪伴记忆', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.memoryHero, { backgroundColor: theme.primarySurface }]}>
              <View style={styles.memoryHeroCopy}>
                <ThemedText type="default">由你决定，什么值得被记住</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">确认、查看来源、归档或删除，都由你掌控。</ThemedText>
              </View>
              <CompanionIllustration size={86} />
            </View>
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.noticeIcon, { backgroundColor: theme.primarySurface }]}>
                <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={15} tintColor={theme.primary} />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.noticeText}>
                候选内容不会自动写入长期记忆。确认后，AI 只会在相关对话中参考它。
              </ThemedText>
            </View>

            <SectionTitle title="怎样陪伴你" subtitle="关系资料只用于本会话" />
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ProfileInput label="希望怎样称呼你" value={relationship.preferredName ?? ''} onChangeText={(preferredName) => setRelationship((current) => ({ ...current, preferredName }))} placeholder="例如：小林" theme={theme} />
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <ProfileInput label="你们的关系" value={relationship.relationshipSummary ?? ''} onChangeText={(relationshipSummary) => setRelationship((current) => ({ ...current, relationshipSummary }))} placeholder="例如：可靠的日常陪伴者" theme={theme} />
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <ProfileInput label="沟通偏好" value={relationship.communicationStyle ?? ''} onChangeText={(communicationStyle) => setRelationship((current) => ({ ...current, communicationStyle }))} placeholder="例如：少说教，多给具体建议" theme={theme} />
              <Pressable accessibilityRole="button" accessibilityLabel="保存陪伴资料" onPress={() => void saveRelationship()} disabled={savingRelationship} style={({ pressed }) => [styles.saveProfile, pressed || savingRelationship ? styles.pressed : null]}>
                {savingRelationship ? <ActivityIndicator color={theme.primary} /> : <ThemedText type="smallBold" style={[styles.saveProfileText, { color: theme.primary }]}>保存资料</ThemedText>}
              </Pressable>
            </View>

            <SectionTitle title="共同经历" subtitle={`${activeEpisodes.length} 段`} />
            <View style={styles.episodeShortcuts}>
              <Pressable accessibilityRole="button" accessibilityLabel="记录今日片段" onPress={() => { setEditingEpisode(null); setEpisodeTitle(''); setEpisodeContent(''); setEpisodeEditorKind('TODAY_FRAGMENT'); }} style={[styles.episodeShortcut, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>记录今日片段</ThemedText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="建立共同小约定" onPress={() => { setEditingEpisode(null); setEpisodeTitle(''); setEpisodeContent(''); setEpisodeEditorKind('SMALL_AGREEMENT'); }} style={[styles.episodeShortcut, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>共同小约定</ThemedText></Pressable>
            </View>
            {episodeCandidates.length ? <><SectionTitle title="待确认的话" subtitle={`${episodeCandidates.length} 条`} />{episodeCandidates.map((episode) => <EpisodeCard key={episode.id} episode={episode} theme={theme} onConfirm={() => void confirmEpisode(episode)} onEdit={() => openEpisodeEdit(episode)} onProvenance={() => void openEpisodeProvenance(episode)} onArchive={() => void archiveEpisode(episode)} onRemove={() => removeEpisode(episode)} />)}</> : null}
            {activeEpisodes.length ? activeEpisodes.map((episode) => <EpisodeCard key={episode.id} episode={episode} theme={theme} onEdit={() => openEpisodeEdit(episode)} onProvenance={() => void openEpisodeProvenance(episode)} onArchive={() => void archiveEpisode(episode)} onRemove={() => removeEpisode(episode)} onResolve={episode.kind === 'SMALL_AGREEMENT' && episode.resolution === 'OPEN' ? (resolution) => void resolveAgreement(episode, resolution) : undefined} />) : <EmptyCard text="把今天的一件小事、还没说完的话或一个小约定留在这里。" theme={theme} />}

            <SectionTitle title="待确认" subtitle={`${candidates.length} 条`} />
            {candidates.length ? candidates.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} theme={theme} onConfirm={() => void confirm(memory)} onEdit={() => openEdit(memory)} onArchive={() => archive(memory)} onProvenance={() => void openProvenance(memory)} onRemove={() => remove(memory)} />
            )) : <EmptyCard text="暂时没有候选记忆。聊天里说“请记住…”后，会先出现在这里。" theme={theme} />}

            <SectionTitle title="已确认" subtitle={`${confirmed.length} 条`} />
            {confirmed.length ? confirmed.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} theme={theme} onEdit={() => openEdit(memory)} onArchive={() => archive(memory)} onProvenance={() => void openProvenance(memory)} onRemove={() => remove(memory)} />
            )) : <EmptyCard text="还没有已确认的长期记忆。" theme={theme} />}

            <SectionTitle title="已归档" subtitle={`${archived.length} 条`} />
            {archived.length ? archived.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} theme={theme} onEdit={() => openEdit(memory)} onProvenance={() => void openProvenance(memory)} onRemove={() => remove(memory)} />
            )) : <EmptyCard text="没有已归档的记忆。" theme={theme} />}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal transparent animationType="fade" visible={Boolean(editing)} onRequestClose={() => setEditing(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)} />
          <View style={[styles.editor, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle">编辑记忆</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">保存后会确认这条记忆。</ThemedText>
            <TextInput
              autoFocus
              multiline
              maxLength={500}
              value={draftContent}
              onChangeText={setDraftContent}
              placeholder="写下想让它记住的事"
              placeholderTextColor={theme.textSecondary}
              style={[styles.editorInput, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="取消编辑记忆" onPress={() => setEditing(null)} style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">取消</ThemedText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="保存并确认记忆" disabled={!draftContent.trim() || savingMemory} onPress={() => void saveMemory()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: theme.primary }, pressed || savingMemory ? styles.pressed : null]}>
                {savingMemory ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText type="smallBold" style={styles.confirmText}>保存并确认</ThemedText>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(episodeEditorKind)} onRequestClose={() => { setEpisodeEditorKind(null); setEditingEpisode(null); }}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setEpisodeEditorKind(null); setEditingEpisode(null); }} />
          <View style={[styles.editor, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle">{editingEpisode ? '编辑共同经历' : episodeEditorKind === 'SMALL_AGREEMENT' ? '共同小约定' : '记录今日片段'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{episodeEditorKind === 'SMALL_AGREEMENT' ? '只写一个能完成、延期或放弃的小动作。' : '只保存你确认想留下的共同片段。'}</ThemedText>
            <TextInput autoFocus maxLength={120} value={episodeTitle} onChangeText={setEpisodeTitle} placeholder={episodeEditorKind === 'SMALL_AGREEMENT' ? '例如：今晚只整理桌面五分钟' : '例如：下班路上的一阵风'} placeholderTextColor={theme.textSecondary} style={[styles.episodeTitleInput, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
            <TextInput multiline maxLength={4000} value={episodeContent} onChangeText={setEpisodeContent} placeholder="写下这一刻，或这个小动作对你的意义" placeholderTextColor={theme.textSecondary} style={[styles.editorInput, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="取消共同经历编辑" onPress={() => { setEpisodeEditorKind(null); setEditingEpisode(null); }} style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">取消</ThemedText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="保存共同经历" disabled={!episodeTitle.trim() || !episodeContent.trim() || savingEpisode} onPress={() => void saveEpisode()} style={({ pressed }) => [styles.confirmButton, { backgroundColor: theme.primary }, pressed || savingEpisode ? styles.pressed : null]}>{savingEpisode ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText type="smallBold" style={styles.confirmText}>确认保存</ThemedText>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(episodeProvenance)} onRequestClose={() => setEpisodeProvenance(null)}>
        <View style={styles.modalRoot}><Pressable style={styles.modalBackdrop} onPress={() => setEpisodeProvenance(null)} /><View style={[styles.editor, { backgroundColor: theme.background }]}><ThemedText type="subtitle">共同经历来源</ThemedText><ThemedText type="small" themeColor="textSecondary">{episodeProvenance?.source ? `来自 ${new Date(episodeProvenance.source.createdAt).toLocaleString('zh-CN')} 的对话：` : '这是你手动保存的共同经历。'}</ThemedText>{episodeProvenance?.source ? <View style={[styles.sourceBox, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small">{episodeProvenance.source.content}</ThemedText></View> : null}<View style={styles.modalActions}><Pressable accessibilityRole="button" onPress={() => setEpisodeProvenance(null)} style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">关闭</ThemedText></Pressable></View></View></View>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(provenance)} onRequestClose={() => setProvenance(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setProvenance(null)} />
          <View style={[styles.editor, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle">为什么记住</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {provenance?.source ? `来自 ${new Date(provenance.source.createdAt).toLocaleString('zh-CN')} 的对话：` : '这条记忆没有保留可读取的来源消息。'}
            </ThemedText>
            {provenance?.source ? <View style={[styles.sourceBox, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small">{provenance.source.content}</ThemedText></View> : null}
            {provenance?.supersededBy ? <ThemedText type="small" themeColor="textSecondary">已被“{provenance.supersededBy.content}”替代。</ThemedText> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭记忆来源" onPress={() => setProvenance(null)} style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">关闭</ThemedText></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.sectionTitle}><ThemedText type="smallBold" themeColor="textSecondary">{title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText></View>;
}

function ProfileInput({ label, value, onChangeText, placeholder, theme }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; theme: ReturnType<typeof useTheme> }) {
  return <View style={styles.profileInput}><ThemedText type="smallBold">{label}</ThemedText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.textSecondary} maxLength={160} style={[styles.profileTextInput, { color: theme.text }]} /></View>;
}

function MemoryCard({ memory, theme, onConfirm, onEdit, onArchive, onProvenance, onRemove }: { memory: CompanionMemory; theme: ReturnType<typeof useTheme>; onConfirm?: () => void; onEdit: () => void; onArchive?: () => void; onProvenance: () => void; onRemove: () => void }) {
  return (
    <View style={[styles.memoryCard, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.memoryHeader}><View style={[styles.categoryChip, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={[styles.categoryText, { color: theme.primary }]}>{CATEGORY_LABEL[memory.category]}</ThemedText></View><ThemedText type="small" themeColor="textSecondary">{new Date(memory.updatedAt).toLocaleDateString('zh-CN')}</ThemedText></View>
      <ThemedText style={styles.memoryContent}>{memory.content}</ThemedText>
      <View style={styles.memoryActions}>
        {onConfirm ? <Pressable accessibilityRole="button" accessibilityLabel="确认记忆" onPress={onConfirm} style={[styles.primaryAction, { backgroundColor: theme.primary }]}><ThemedText type="smallBold" style={styles.primaryActionText}>确认</ThemedText></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="查看记忆来源" onPress={onProvenance} style={styles.textAction}><ThemedText type="smallBold" style={{ color: theme.primary }}>来源</ThemedText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="编辑记忆" onPress={onEdit} style={[styles.secondaryAction, { backgroundColor: theme.background }]}><ThemedText type="smallBold">编辑</ThemedText></Pressable>
        {onArchive ? <Pressable accessibilityRole="button" accessibilityLabel="归档记忆" onPress={onArchive} style={styles.textAction}><ThemedText type="smallBold" themeColor="textSecondary">归档</ThemedText></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="删除记忆" onPress={onRemove} style={styles.iconAction}><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={17} tintColor={theme.danger} /></Pressable>
      </View>
    </View>
  );
}

const EPISODE_KIND_LABEL: Record<CompanionSharedEpisodeKind, string> = { TODAY_FRAGMENT: '今日片段', UNFINISHED_THREAD: '未完的话', SMALL_AGREEMENT: '小约定' };
const RESOLUTION_LABEL = { OPEN: '进行中', COMPLETED: '完成', DEFERRED: '延期', ABANDONED: '放弃', CLOSED: '已关闭' } as const;

function EpisodeCard({ episode, theme, onConfirm, onEdit, onProvenance, onArchive, onRemove, onResolve }: { episode: CompanionSharedEpisode; theme: ReturnType<typeof useTheme>; onConfirm?: () => void; onEdit: () => void; onProvenance: () => void; onArchive: () => void; onRemove: () => void; onResolve?: (resolution: 'COMPLETED' | 'DEFERRED' | 'ABANDONED') => void }) {
  return <View style={[styles.memoryCard, { backgroundColor: theme.backgroundElement }]}>
    <View style={styles.memoryHeader}><View style={[styles.categoryChip, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={[styles.categoryText, { color: theme.primary }]}>{EPISODE_KIND_LABEL[episode.kind]}</ThemedText></View><ThemedText type="small" themeColor="textSecondary">{RESOLUTION_LABEL[episode.resolution]}</ThemedText></View>
    <ThemedText type="smallBold">{episode.title}</ThemedText><ThemedText style={styles.memoryContent}>{episode.content}</ThemedText>
    <View style={styles.memoryActions}>
      {onConfirm ? <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.primaryAction, { backgroundColor: theme.primary }]}><ThemedText type="smallBold" style={styles.primaryActionText}>确认</ThemedText></Pressable> : null}
      {onResolve ? <><Pressable accessibilityRole="button" onPress={() => onResolve('COMPLETED')} style={styles.textAction}><ThemedText type="smallBold" style={{ color: theme.primary }}>完成</ThemedText></Pressable><Pressable accessibilityRole="button" onPress={() => onResolve('DEFERRED')} style={styles.textAction}><ThemedText type="smallBold" themeColor="textSecondary">延期</ThemedText></Pressable><Pressable accessibilityRole="button" onPress={() => onResolve('ABANDONED')} style={styles.textAction}><ThemedText type="smallBold" themeColor="textSecondary">放弃</ThemedText></Pressable></> : null}
      <Pressable accessibilityRole="button" onPress={onProvenance} style={styles.textAction}><ThemedText type="smallBold" style={{ color: theme.primary }}>来源</ThemedText></Pressable><Pressable accessibilityRole="button" onPress={onEdit} style={styles.textAction}><ThemedText type="smallBold" themeColor="textSecondary">编辑</ThemedText></Pressable>
      <Pressable accessibilityRole="button" onPress={onArchive} style={styles.textAction}><ThemedText type="smallBold" themeColor="textSecondary">归档</ThemedText></Pressable><Pressable accessibilityRole="button" onPress={onRemove} style={styles.iconAction}><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={17} tintColor={theme.danger} /></Pressable>
    </View>
  </View>;
}

function EmptyCard({ text, theme }: { text: string; theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>{text}</ThemedText></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.two, padding: Spacing.three, paddingBottom: 40 },
  memoryHero: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', minHeight: 112, overflow: 'hidden', paddingLeft: Spacing.three, paddingRight: Spacing.two },
  memoryHeroCopy: { flex: 1, gap: 6, paddingVertical: Spacing.three },
  notice: { alignItems: 'flex-start', borderRadius: 14, flexDirection: 'row', gap: Spacing.two, padding: Spacing.two },
  noticeIcon: { alignItems: 'center', borderRadius: 10, height: 30, justifyContent: 'center', width: 30 },
  noticeText: { flex: 1, lineHeight: 19, paddingTop: 4 },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  card: { borderRadius: 18, overflow: 'hidden', paddingHorizontal: Spacing.three },
  profileInput: { gap: 6, paddingVertical: Spacing.two },
  profileTextInput: { fontSize: 16, minHeight: 30, padding: 0 },
  divider: { height: StyleSheet.hairlineWidth },
  saveProfile: { alignSelf: 'flex-end', marginBottom: Spacing.two, marginTop: Spacing.one, paddingHorizontal: Spacing.one },
  saveProfileText: {},
  episodeShortcuts: { flexDirection: 'row', gap: Spacing.two },
  episodeShortcut: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: Spacing.two },
  memoryCard: { borderRadius: 18, gap: Spacing.two, padding: Spacing.three },
  memoryHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  categoryText: { fontSize: 12 },
  memoryContent: { fontSize: 16, lineHeight: 23 },
  memoryActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, justifyContent: 'flex-end' },
  primaryAction: { alignItems: 'center', borderRadius: 10, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
  primaryActionText: { color: '#FFFFFF' },
  secondaryAction: { alignItems: 'center', borderRadius: 10, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
  textAction: { alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
  iconAction: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  emptyCard: { borderRadius: 18, padding: Spacing.three },
  emptyText: { lineHeight: 20 },
  modalRoot: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.three },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,16,32,0.48)' },
  editor: { borderRadius: 22, gap: Spacing.two, maxWidth: 480, padding: Spacing.three, width: '100%' },
  editorInput: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 16, minHeight: 130, padding: Spacing.two, textAlignVertical: 'top' },
  episodeTitleInput: { borderRadius: 12, fontSize: 16, minHeight: 46, paddingHorizontal: Spacing.two },
  sourceBox: { borderRadius: 12, maxHeight: 180, padding: Spacing.two },
  modalActions: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
  cancelButton: { alignItems: 'center', borderRadius: 11, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three },
  confirmButton: { alignItems: 'center', borderRadius: 11, minHeight: 44, justifyContent: 'center', minWidth: 106, paddingHorizontal: Spacing.two },
  confirmText: { color: '#FFFFFF' },
  pressed: { opacity: 0.68 },
});
