import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { legalDocumentDetails } from '@/constants/public-pages';
import { useTheme } from '@/hooks/use-theme';

export default function LegalDocumentWebScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const { title, url } = legalDocumentDetails(document);
  const theme = useTheme();

  useEffect(() => { void Linking.openURL(url); }, [url]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ title }} />
      <ThemedText themeColor="textSecondary">正在打开{title}…</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({ container: { alignItems: 'center', flex: 1, justifyContent: 'center' } });
