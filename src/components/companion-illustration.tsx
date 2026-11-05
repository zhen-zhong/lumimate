import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';

type CompanionIllustrationProps = {
  size?: number;
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export function CompanionIllustration({ size = 112 }: CompanionIllustrationProps) {
  return (
    <Animated.View
      accessibilityElementsHidden
      entering={FadeInDown.duration(280).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      <Image
        contentFit="contain"
        source={require('@/assets/images/lumimate-splash-v2.png')}
        style={[styles.image, { height: size, width: size }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
