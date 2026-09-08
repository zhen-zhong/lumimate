import { Stack, useLocalSearchParams } from 'expo-router';

import { CompanionChatScreen } from '@/components/chat';
import { getCompanionChat } from '@/data/companion-chats';

export default function CompanionChatRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = getCompanionChat(chatId ?? 'lumimate');

  return (
    <>
      <Stack.Screen options={{ title: chat.name }} />
      <CompanionChatScreen title={chat.name} subtitle={chat.subtitle} />
    </>
  );
}
