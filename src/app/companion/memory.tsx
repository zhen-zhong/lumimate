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
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmCompanionMemory,
  getCompanionMemories,
  getCompanionRelationship,
  removeCompanionMemory,
  type CompanionMemory,
  type CompanionRelationship,
  updateCompanionMemory,
  updateCompanionRelationship,
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
  const [loading, setLoading] = useState(true);
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [editing, setEditing] = useState<CompanionMemory | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  const candidates = useMemo(
    () => memories.filter((memory) => memory.status === 'CANDIDATE'),
    [memories],
  );
  const confirmed = useMemo(
    () => memories.filter((memory) => memory.status === 'CONFIRMED'),
    [memories],
  );

  const load = useCallback(async () => {
    const [nextMemories, nextRelationship] = await Promise.all([
      getCompanionMemories(conversationId),
      getCompanionRelationship(conversationId),
    ]);
    setMemories(nextMemories);
    setRelationship(nextRelationship);
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

  return (
    <>
      <Stack.Screen options={{ title: '陪伴记忆', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color="#2878E8" /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.noticeIcon}>
                <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={15} tintColor="#2878E8" />
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
              <Pressable onPress={() => void saveRelationship()} disabled={savingRelationship} style={({ pressed }) => [styles.saveProfile, pressed || savingRelationship ? styles.pressed : null]}>
                {savingRelationship ? <ActivityIndicator color="#2878E8" /> : <ThemedText type="smallBold" style={styles.saveProfileText}>保存资料</ThemedText>}
              </Pressable>
            </View>

            <SectionTitle title="待确认" subtitle={`${candidates.length} 条`} />
            {candidates.length ? candidates.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} theme={theme} onConfirm={() => void confirm(memory)} onEdit={() => openEdit(memory)} onRemove={() => remove(memory)} />
            )) : <EmptyCard text="暂时没有候选记忆。聊天里说“请记住…”后，会先出现在这里。" theme={theme} />}

            <SectionTitle title="已确认" subtitle={`${confirmed.length} 条`} />
            {confirmed.length ? confirmed.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} theme={theme} onEdit={() => openEdit(memory)} onRemove={() => remove(memory)} />
            )) : <EmptyCard text="还没有已确认的长期记忆。" theme={theme} />}
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
              <Pressable onPress={() => setEditing(null)} style={[styles.cancelButton, { backgroundColor: theme.backgroundElement }]}><ThemedText type="smallBold">取消</ThemedText></Pressable>
              <Pressable disabled={!draftContent.trim() || savingMemory} onPress={() => void saveMemory()} style={({ pressed }) => [styles.confirmButton, pressed || savingMemory ? styles.pressed : null]}>
                {savingMemory ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText type="smallBold" style={styles.confirmText}>保存并确认</ThemedText>}
              </Pressable>
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

function MemoryCard({ memory, theme, onConfirm, onEdit, onRemove }: { memory: CompanionMemory; theme: ReturnType<typeof useTheme>; onConfirm?: () => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <View style={[styles.memoryCard, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.memoryHeader}><View style={styles.categoryChip}><ThemedText type="smallBold" style={styles.categoryText}>{CATEGORY_LABEL[memory.category]}</ThemedText></View><ThemedText type="small" themeColor="textSecondary">{new Date(memory.updatedAt).toLocaleDateString('zh-CN')}</ThemedText></View>
      <ThemedText style={styles.memoryContent}>{memory.content}</ThemedText>
      <View style={styles.memoryActions}>
        {onConfirm ? <Pressable onPress={onConfirm} style={styles.primaryAction}><ThemedText type="smallBold" style={styles.primaryActionText}>确认</ThemedText></Pressable> : null}
        <Pressable onPress={onEdit} style={[styles.secondaryAction, { backgroundColor: theme.background }]}><ThemedText type="smallBold">编辑</ThemedText></Pressable>
        <Pressable accessibilityLabel="删除记忆" onPress={onRemove} style={styles.iconAction}><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={17} tintColor="#D95C5C" /></Pressable>
      </View>
    </View>
  );
}

function EmptyCard({ text, theme }: { text: string; theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>{text}</ThemedText></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.two, padding: Spacing.three, paddingBottom: 40 },
  notice: { alignItems: 'flex-start', borderRadius: 14, flexDirection: 'row', gap: Spacing.two, padding: Spacing.two },
  noticeIcon: { alignItems: 'center', backgroundColor: '#EAF2FF', borderRadius: 10, height: 30, justifyContent: 'center', width: 30 },
  noticeText: { flex: 1, lineHeight: 19, paddingTop: 4 },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  card: { borderRadius: 18, overflow: 'hidden', paddingHorizontal: Spacing.three },
  profileInput: { gap: 6, paddingVertical: Spacing.two },
  profileTextInput: { fontSize: 16, minHeight: 30, padding: 0 },
  divider: { height: StyleSheet.hairlineWidth },
  saveProfile: { alignSelf: 'flex-end', marginBottom: Spacing.two, marginTop: Spacing.one, paddingHorizontal: Spacing.one },
  saveProfileText: { color: '#2878E8' },
  memoryCard: { borderRadius: 18, gap: Spacing.two, padding: Spacing.three },
  memoryHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryChip: { backgroundColor: '#EAF2FF', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  categoryText: { color: '#1769D1', fontSize: 12 },
  memoryContent: { fontSize: 16, lineHeight: 23 },
  memoryActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, justifyContent: 'flex-end' },
  primaryAction: { backgroundColor: '#2878E8', borderRadius: 9, minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.two },
  primaryActionText: { color: '#FFFFFF' },
  secondaryAction: { borderRadius: 9, minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.two },
  iconAction: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  emptyCard: { borderRadius: 18, padding: Spacing.three },
  emptyText: { lineHeight: 20 },
  modalRoot: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.three },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,16,32,0.48)' },
  editor: { borderRadius: 22, gap: Spacing.two, maxWidth: 480, padding: Spacing.three, width: '100%' },
  editorInput: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 16, minHeight: 130, padding: Spacing.two, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
  cancelButton: { alignItems: 'center', borderRadius: 11, height: 42, justifyContent: 'center', paddingHorizontal: Spacing.three },
  confirmButton: { alignItems: 'center', backgroundColor: '#2878E8', borderRadius: 11, height: 42, justifyContent: 'center', minWidth: 106, paddingHorizontal: Spacing.two },
  confirmText: { color: '#FFFFFF' },
  pressed: { opacity: 0.68 },
});
