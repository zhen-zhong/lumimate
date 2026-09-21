import type { ChatMessageAiInfo } from '@/services/chat-api';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  audioUri?: string;
  audioDuration?: number;
  aiInfo?: ChatMessageAiInfo;
};
