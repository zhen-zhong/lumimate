import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { BottomNavigationGap, BottomNavigationHeight, Spacing } from '@/constants/theme';

type UseBottomNavigationInsetOptions = {
  collapseWhenKeyboardVisible?: boolean;
};

export function useBottomNavigationInset(options: UseBottomNavigationInsetOptions = {}) {
  const { collapseWhenKeyboardVisible = false } = options;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'web') return 0;
  if (collapseWhenKeyboardVisible && keyboardVisible) return Spacing.two;

  return BottomNavigationHeight + BottomNavigationGap;
}
