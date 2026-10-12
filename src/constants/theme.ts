/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#16213A',
    background: '#F7F9FD',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8EEF9',
    textSecondary: '#62708A',
    primary: '#2878E8',
    primarySurface: '#EAF2FF',
    danger: '#C94A4A',
  },
  dark: {
    text: '#F5F7FC',
    background: '#101522',
    backgroundElement: '#1A2130',
    backgroundSelected: '#29354A',
    textSecondary: '#B2BED1',
    primary: '#71A9FF',
    primarySurface: '#203A62',
    danger: '#FF8C8C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomNavigationHeight = Platform.select({ ios: 100, android: 100, web: 0 }) ?? 0;
export const BottomNavigationGap = Spacing.two;
export const MaxContentWidth = 800;
