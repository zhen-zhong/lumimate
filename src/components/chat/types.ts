export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  audioUri?: string;
  audioDuration?: number;
};
