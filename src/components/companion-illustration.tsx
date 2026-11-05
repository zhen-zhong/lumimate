import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type CompanionIllustrationProps = {
  variant: 'home' | 'memory' | 'presence';
  size?: number;
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export function CompanionIllustration({ variant, size = 112 }: CompanionIllustrationProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const entrance = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      entrance.set(1);
      return;
    }
    entrance.set(withDelay(80, withTiming(1, {
      duration: 280,
      easing: EASE_OUT,
      reduceMotion: ReduceMotion.System,
    })));
  }, [entrance, reducedMotion]);

  const entranceStyle = useAnimatedStyle(() => {
    const progress = entrance.get();
    return {
      opacity: progress,
      transform: [
        { translateY: (1 - progress) * 8 },
        { scale: 0.96 + progress * 0.04 },
      ],
    };
  });

  const isMemory = variant === 'memory';
  const isPresence = variant === 'presence';
  const windowColor = isPresence ? theme.primary : '#283E73';
  const frameColor = isMemory ? theme.primary : '#FFD783';

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.root, { height: size, width: size }, entranceStyle]}>
      <View style={[styles.window, { backgroundColor: windowColor, borderColor: frameColor }]}>
        <View style={[styles.sun, { backgroundColor: '#FFD783' }]} />
        <View style={[styles.moon, { borderColor: '#FFF3D4' }]} />
        <View style={[styles.star, { backgroundColor: '#FFF3D4' }]} />
        <View style={[styles.hill, { backgroundColor: isPresence ? '#7CA9F4' : '#6E71A9' }]} />
        <View style={[styles.companion, { backgroundColor: '#FFF3D4' }]}>
          <View style={[styles.companionEar, { backgroundColor: '#FFF3D4' }]} />
          <View style={[styles.companionScarf, { backgroundColor: '#F47A58' }]} />
        </View>
      </View>
      {isMemory ? (
        <>
          <View style={[styles.memoryCard, styles.memoryCardBack, { backgroundColor: theme.primarySurface, borderColor: theme.primary }]} />
          <View style={[styles.memoryCard, styles.memoryCardFront, { backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}>
            <View style={[styles.memoryLine, { backgroundColor: theme.primary }]} />
            <View style={[styles.memoryLine, styles.memoryLineShort, { backgroundColor: theme.primary }]} />
          </View>
        </>
      ) : null}
      {isPresence ? <View style={[styles.presenceDot, { backgroundColor: '#B6F4D0', borderColor: theme.backgroundElement }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  window: { borderRadius: 26, borderWidth: 5, height: '82%', overflow: 'hidden', width: '78%' },
  sun: { borderRadius: 20, height: '20%', left: '18%', position: 'absolute', top: '16%', width: '20%' },
  moon: { borderLeftWidth: 7, borderRadius: 20, borderTopWidth: 7, height: '24%', position: 'absolute', right: '16%', top: '15%', transform: [{ rotate: '38deg' }], width: '24%' },
  star: { height: 11, left: '47%', position: 'absolute', top: '30%', transform: [{ rotate: '45deg' }], width: 11 },
  hill: { borderRadius: 48, bottom: '-12%', height: '42%', position: 'absolute', right: '-12%', width: '78%' },
  companion: { alignItems: 'center', borderRadius: 44, bottom: '-2%', height: '47%', justifyContent: 'flex-start', left: '22%', position: 'absolute', width: '46%' },
  companionEar: { borderRadius: 16, height: '34%', left: '1%', position: 'absolute', top: '-12%', transform: [{ rotate: '-35deg' }], width: '40%' },
  companionScarf: { borderRadius: 10, bottom: '16%', height: '10%', left: '-18%', position: 'absolute', transform: [{ rotate: '-7deg' }], width: '116%' },
  memoryCard: { borderRadius: 9, borderWidth: 2, height: '29%', position: 'absolute', width: '32%' },
  memoryCardBack: { right: '-1%', top: '5%', transform: [{ rotate: '12deg' }] },
  memoryCardFront: { alignItems: 'center', gap: 4, justifyContent: 'center', right: '7%', top: '8%', transform: [{ rotate: '4deg' }] },
  memoryLine: { borderRadius: 2, height: 3, width: '54%' },
  memoryLineShort: { width: '34%' },
  presenceDot: { borderRadius: 12, borderWidth: 3, height: 22, position: 'absolute', right: '2%', top: '5%', width: 22 },
});
