import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { CompanionChats } from '@/data/companion-chats';
import { useBottomNavigationInset } from '@/hooks/use-bottom-navigation-inset';
import { useTheme } from '@/hooks/use-theme';

export default function CompanionListScreen() {
  const router = useRouter();
  const theme = useTheme();
  const bottomInset = useBottomNavigationInset();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background, paddingBottom: bottomInset }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Companion
          </ThemedText>
          <ThemedText type="subtitle">陪伴</ThemedText>
        </View>

        <View style={styles.list}>
          {CompanionChats.map((chat) => (
            <Pressable
              key={chat.id}
              accessibilityRole="button"
              accessibilityLabel={`打开${chat.name}`}
              onPress={() =>
                router.push({
                  pathname: '/companion/[chatId]',
                  params: { chatId: chat.id },
                })
              }
              style={({ pressed }) => [pressed ? styles.pressed : null]}>
                <ThemedView type="backgroundElement" style={styles.item}>
                  <View style={styles.avatar}>
                    <ThemedText type="smallBold">{chat.name.slice(0, 1)}</ThemedText>
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemTitleRow}>
                      <ThemedText type="default">{chat.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {chat.time}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {chat.subtitle} · {chat.lastMessage}
                    </ThemedText>
                  </View>
                </ThemedView>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flex: 1,
  },
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDEBFF',
  },
  itemBody: {
    flex: 1,
    gap: Spacing.one,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.72,
  },
});
