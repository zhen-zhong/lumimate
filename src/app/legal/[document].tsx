import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { PUBLIC_SITE_URL, legalDocumentDetails } from '@/constants/public-pages';
import { useTheme } from '@/hooks/use-theme';

export default function LegalDocumentScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const { title, url } = legalDocumentDetails(document);
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const shouldStartLoad = useCallback((request: { url: string }) => {
    if (request.url === 'about:blank' || request.url.startsWith(PUBLIC_SITE_URL)) return true;
    void Linking.openURL(request.url);
    return false;
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ title, headerBackTitle: '设置', headerShadowVisible: false }} />
      <WebView
        source={{ uri: url }}
        originWhitelist={[`${PUBLIC_SITE_URL}/*`]}
        onShouldStartLoadWithRequest={shouldStartLoad}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
      {loading || failed ? (
        <View pointerEvents="none" style={[styles.overlay, { backgroundColor: theme.background }]}> 
          {failed ? <ThemedText themeColor="textSecondary">页面暂时无法打开，请检查网络后重试。</ThemedText> : <ActivityIndicator color={theme.primary} />}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webView: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
