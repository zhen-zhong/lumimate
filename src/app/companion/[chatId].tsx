import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';

import { CompanionChatScreen } from '@/components/chat';
import { lockCompanionChatScroll } from '@/components/chat/chat-scroll-lock';
import { getCompanionChat } from '@/data/companion-chats';
import { useTheme } from '@/hooks/use-theme';

export default function CompanionChatRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const chat = getCompanionChat(chatId ?? 'lumimate');
  const theme = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          title: chat.name,
          headerBackButtonDisplayMode: 'minimal',
          freezeOnBlur: true,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="智能体设置"
              hitSlop={12}
              onPress={() => {
                lockCompanionChatScroll(chat.id);
                router.push({
                  pathname: '/companion/settings',
                  params: { conversationId: chat.id, title: chat.name },
                });
              }}
              style={{
                alignItems: 'center',
                backgroundColor: theme.backgroundElement,
                borderRadius: 22,
                height: 44,
                justifyContent: 'center',
                marginRight: -4,
                overflow: 'hidden',
                width: 44,
              }}>
              <SymbolView
                name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
                size={21}
                tintColor={theme.primary}
              />
            </Pressable>
          ),
        }}
      />
      <CompanionChatScreen conversationId={chat.id} title={chat.name} subtitle={chat.subtitle} />
    </>
  );
}
