import { StyleSheet, View } from 'react-native';

import { GaodeMemoryMap } from '@/components/map/gaode-memory-map';

export default function MemoryScreen() {
  return (
    <View style={styles.container}>
      <GaodeMemoryMap />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
