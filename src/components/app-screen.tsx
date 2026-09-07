import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AppScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  primary: string;
  secondary: string;
};

export function AppScreen({ eyebrow, title, description, primary, secondary }: AppScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {eyebrow}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>
              {description}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="smallBold">{primary}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {secondary}
            </ThemedText>
          </ThemedView>
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
    paddingBottom: BottomTabInset + Spacing.four,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
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
  panel: {
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
});
