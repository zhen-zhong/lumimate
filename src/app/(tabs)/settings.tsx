import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { CompanionChats } from '@/data/companion-chats';
import { useBottomNavigationInset } from '@/hooks/use-bottom-navigation-inset';
import { useTheme } from '@/hooks/use-theme';

type SymbolName = { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };

type SettingsRowProps = {
  icon: SymbolName;
  title: string;
  detail: string;
  onPress: () => void;
  last?: boolean;
};

function SettingsRow({ icon, title, detail, onPress, last = false }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
        <View style={[styles.rowIcon, { backgroundColor: theme.primarySurface }]}><SymbolView name={icon} size={18} tintColor={theme.primary} /></View>
        <View style={styles.rowCopy}><ThemedText type="smallBold">{title}</ThemedText><ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{detail}</ThemedText></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={theme.textSecondary} />
      </Pressable>
      {!last ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}
    </>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const bottomInset = useBottomNavigationInset();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background, paddingBottom: bottomInset }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary">LumiMate</ThemedText>
            <ThemedText type="subtitle">设置</ThemedText>
            <ThemedText themeColor="textSecondary">陪伴方式、提醒和数据，都由你决定。</ThemedText>
          </View>

          <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <View style={[styles.profileAvatar, { backgroundColor: theme.primarySurface }]}><SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={24} tintColor={theme.primary} /></View>
            <View style={styles.profileCopy}><ThemedText type="default">当前设备</ThemedText><ThemedText type="small" themeColor="textSecondary">游客模式 · 数据仅关联此设备</ThemedText></View>
            <View style={[styles.connectedPill, { backgroundColor: theme.primarySurface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>已连接</ThemedText></View>
          </View>

          <View style={styles.sectionHeader}><ThemedText type="smallBold" themeColor="textSecondary">智能体</ThemedText></View>
          <View style={[styles.groupCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            {CompanionChats.map((chat, index) => (
              <SettingsRow
                key={chat.id}
                icon={index === 0 ? { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' } : { ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }}
                title={chat.name}
                detail={`${chat.subtitle} · 角色、模型、记忆和提醒`}
                onPress={() => router.push({ pathname: '/companion/settings', params: { conversationId: chat.id, title: chat.name } })}
                last={index === CompanionChats.length - 1}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}><ThemedText type="smallBold" themeColor="textSecondary">通知与数据</ThemedText></View>
          <View style={[styles.groupCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <SettingsRow icon={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} title="管理全部陪伴" detail="选择智能体，分别管理提醒、推送和记忆" onPress={() => router.push('/companion')} />
            <SettingsRow icon={{ ios: 'map.fill', android: 'map', web: 'map' }} title="记忆地图" detail="回看地点、行程与重要片段" onPress={() => router.push('/memory')} last />
          </View>

          <View style={styles.sectionHeader}><ThemedText type="smallBold" themeColor="textSecondary">关于</ThemedText></View>
          <View style={[styles.groupCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <View style={styles.infoRow}>
              <View style={[styles.rowIcon, { backgroundColor: theme.primarySurface }]}><SymbolView name={{ ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' }} size={18} tintColor={theme.primary} /></View>
              <View style={styles.rowCopy}><ThemedText type="smallBold">隐私与数据</ThemedText><ThemedText type="small" themeColor="textSecondary">聊天媒体受会话鉴权保护</ThemedText></View>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.infoRow}>
              <View style={[styles.rowIcon, { backgroundColor: theme.primarySurface }]}><SymbolView name={{ ios: 'info.circle.fill', android: 'info', web: 'info' }} size={18} tintColor={theme.primary} /></View>
              <View style={styles.rowCopy}><ThemedText type="smallBold">LumiMate</ThemedText><ThemedText type="small" themeColor="textSecondary">版本 {version}</ThemedText></View>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>你的节奏，始终优先。</ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, alignItems: 'center' },
  scrollView: { width: '100%' },
  scrollContent: { width: '100%', alignItems: 'center', paddingHorizontal: 12 },
  container: { width: '100%', maxWidth: MaxContentWidth, paddingTop: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.three },
  header: { gap: Spacing.one, paddingBottom: Spacing.one },
  profileCard: { minHeight: 82, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  profileAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, gap: 2 },
  connectedPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  sectionHeader: { marginTop: Spacing.two },
  groupCard: { overflow: 'hidden', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  infoRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  footer: { alignSelf: 'center', marginTop: Spacing.two },
  pressed: { opacity: 0.72 },
});
