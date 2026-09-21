import { createContext, useContext } from 'react';

type TabBarContextValue = {
  setTabBarHidden: (hidden: boolean) => void;
};

const defaultValue: TabBarContextValue = {
  setTabBarHidden: () => undefined,
};

export const TabBarContext = createContext<TabBarContextValue>(defaultValue);

export function useTabBarVisibility() {
  return useContext(TabBarContext);
}
