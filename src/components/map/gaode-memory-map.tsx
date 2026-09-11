import { ExpoGaodeMapModule, MapType, MapView, Marker } from 'expo-gaode-map';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LUMIMATE_COORDINATE = {
  latitude: 39.9087,
  longitude: 116.3975,
};

let privacyConfigured = false;

function ensureGaodePrivacyReady() {
  if (Platform.OS === 'web' || privacyConfigured) return;

  const status = ExpoGaodeMapModule.getPrivacyStatus();
  if (!status.isReady) {
    ExpoGaodeMapModule.setPrivacyConfig({
      hasShow: true,
      hasContainsPrivacy: true,
      hasAgree: true,
      privacyVersion: '2026-09-10',
    });
  }

  privacyConfigured = true;
}

export function GaodeMemoryMap() {
  const theme = useTheme();

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">高德地图仅在 iOS / Android 原生构建中显示</ThemedText>
      </View>
    );
  }

  ensureGaodePrivacyReady();

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapType={MapType.Standard}
        initialCameraPosition={{
          target: LUMIMATE_COORDINATE,
          zoom: 13,
        }}
        myLocationEnabled
        followUserLocation={false}
        compassEnabled
        scaleControlsEnabled
        zoomControlsEnabled={false}>
        <Marker position={LUMIMATE_COORDINATE} title="LumiMate" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 360,
    borderRadius: 8,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  fallback: {
    height: 360,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
