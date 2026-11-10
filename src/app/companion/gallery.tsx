import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getChatHistory, type ChatHistoryMessage } from '@/services/chat-api';
import { getApiErrorMessage } from '@/services/http';

export default function CompanionGalleryScreen() {
  const { conversationId = 'lumimate', title = 'LumiMate' } = useLocalSearchParams<{ conversationId?: string; title?: string }>();
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const images = useMemo(() => messages.filter((message) => message.role === 'assistant' && message.attachments.length), [messages]);
  const load = useCallback(async () => setMessages(await getChatHistory(conversationId)), [conversationId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch((error: unknown) => { if (active) Alert.alert('无法读取角色相册', getApiErrorMessage(error, '读取失败')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  return <><Stack.Screen options={{ title: '角色相册', headerBackTitle: title, headerBackTitleStyle: { fontSize: 15 } }} />
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['bottom']}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View> : <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.notice, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>虚拟角色创作</ThemedText><ThemedText type="small" themeColor="textSecondary">仅展示角色生成的图片，不表示真人自拍、现实地点或线下活动。</ThemedText></View>
        {images.length ? <View style={styles.grid}>{images.flatMap((message) => message.attachments.map((attachment, index) => <View key={`${message.id}-${index}`} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}><Image source={{ uri: attachment.url }} style={styles.image} /><ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{message.content || '角色虚拟创作'}</ThemedText></View>))}</View> : <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}><ThemedText type="small" themeColor="textSecondary">还没有角色创作。可在聊天里发起图片创作。</ThemedText></View>}
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.refresh}><ThemedText type="smallBold" style={{ color: theme.primary }}>刷新相册</ThemedText></Pressable>
      </ScrollView>}
    </SafeAreaView></>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, loading: { alignItems: 'center', flex: 1, justifyContent: 'center' }, content: { alignSelf: 'center', gap: Spacing.two, maxWidth: MaxContentWidth, padding: Spacing.three, width: '100%' }, notice: { borderRadius: 16, gap: 5, padding: Spacing.three }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }, tile: { borderRadius: 14, gap: 6, overflow: 'hidden', paddingBottom: Spacing.two, width: '48%' }, image: { aspectRatio: 1, width: '100%' }, empty: { borderRadius: 16, padding: Spacing.three }, refresh: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
});
