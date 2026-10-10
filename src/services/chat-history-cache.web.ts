import type { ChatMessage } from '@/components/chat/types';

export async function readCachedChatHistory(_conversationId: string): Promise<ChatMessage[] | null> {
  return null;
}

export async function writeCachedChatHistory(_conversationId: string, _messages: ChatMessage[]) {}
