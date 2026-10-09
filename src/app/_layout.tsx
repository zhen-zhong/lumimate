import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

function usePushNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const redirect = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('lumimate://')) {
        router.push(url as never);
      }
    };
    const previous = Notifications.getLastNotificationResponse();
    if (previous?.notification) redirect(previous.notification);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  usePushNotificationNavigation();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="companion/[chatId]" />
        <Stack.Screen name="companion/memory" />
        <Stack.Screen name="companion/tasks" />
        <Stack.Screen name="companion/skills" />
      </Stack>
    </ThemeProvider>
  );
}
