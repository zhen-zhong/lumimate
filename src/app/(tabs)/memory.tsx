import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GaodeMemoryMap } from '@/components/map/gaode-memory-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBottomNavigationInset } from '@/hooks/use-bottom-navigation-inset';
import { useTheme } from '@/hooks/use-theme';

export default function MemoryScreen() {
  const theme = useTheme();
  const bottomInset = useBottomNavigationInset();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={[styles.safeArea, { paddingBottom: bottomInset }]} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Memory
            </ThemedText>
            <ThemedText type="subtitle" style={styles.title}>
              记忆
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>
              地图能力先接到这里，后续再迁到发送位置和路线规划流程。
            </ThemedText>
          </ThemedView>

          <GaodeMemoryMap />
        </ThemedView>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  safeArea: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flex: 1,
    gap: Spacing.four,
    paddingTop: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    maxWidth: 520,
  },
  description: {
    maxWidth: 560,
  },
});
