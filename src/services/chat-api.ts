import { apiFetch, apiJson, assertApiResponse } from '@/services/http';

type SseEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type ChatImageAttachment = {
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
};

export type ChatModelOption = {
  id: string;
  label: string;
  protocol: 'openai-chat-completions' | 'anthropic-messages';
};

export type ImageModelOption = {
  id: string;
  label: string;
  protocol: 'openai-images' | 'gemini-generate-content';
};

export type ChatMessageAiInfo = {
  modelId: string;
  modelLabel: string;
  provider: string;
  protocol: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type ChatHistoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: ChatImageAttachment[];
  modelId: string | null;
  modelLabel: string | null;
  provider: string | null;
  protocol: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type StreamChatMessageOptions = {
  conversationId: string;
  content: string;
  attachments?: ChatImageAttachment[];
  onDelta: (delta: string) => void;
  onImageGenerated?: (images: ChatImageAttachment[], action?: 'generate' | 'edit') => void;
  onCompleted?: (info: ChatMessageAiInfo) => void;
};

export type ChatAgentSettings = {
  agentName: string;
  agentProfile: string;
  responseStyle: string;
  modelId: string;
  imageModelId: string;
  contextMessageLimit: number;
  maxContextMessageLimit: number;
};

export type UpdateChatAgentSettings = Pick<
  ChatAgentSettings,
  'agentName' | 'agentProfile' | 'responseStyle' | 'modelId' | 'imageModelId' | 'contextMessageLimit'
>;

function parseSseEvent(frame: string): SseEvent | null {
  let type = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) type = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }

  if (!dataLines.length) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join('\n'));
    return data && typeof data === 'object' && !Array.isArray(data)
      ? { type, data: data as Record<string, unknown> }
      : null;
  } catch {
    return null;
  }
}

function getErrorMessage(data: Record<string, unknown>) {
  return typeof data.message === 'string' && data.message.trim()
    ? data.message
    : 'AI 服务暂时不可用';
}

export async function getChatAgentSettings(conversationId: string) {
  return apiJson<ChatAgentSettings>(
    `/v1/chats/${encodeURIComponent(conversationId)}/settings`,
  );
}

export function getAvailableChatModels() {
  return apiJson<ChatModelOption[]>('/v1/ai/models');
}

export function getAvailableImageModels() {
  return apiJson<ImageModelOption[]>('/v1/ai/models?capability=image-generation');
}

export function getChatHistory(conversationId: string) {
  return apiJson<ChatHistoryMessage[]>(`/v1/chats/${encodeURIComponent(conversationId)}/messages`);
}

export async function updateChatAgentSettings(
  conversationId: string,
  settings: UpdateChatAgentSettings,
) {
  return apiJson<ChatAgentSettings>(
    `/v1/chats/${encodeURIComponent(conversationId)}/settings`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    },
  );
}

export async function streamChatMessage({
  conversationId,
  content,
  attachments,
  onDelta,
  onImageGenerated,
  onCompleted,
}: StreamChatMessageOptions) {
  const response = await apiFetch(`/v1/chats/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    timeoutMs: 0,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, ...(attachments?.length ? { attachments } : {}) }),
  });

  await assertApiResponse(response);
  if (!response.body) {
    throw new Error('聊天服务未返回流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeFrames = () => {
    const events: SseEvent[] = [];
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const event = parseSseEvent(buffer.slice(0, separatorIndex));
      if (event) events.push(event);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf('\n\n');
    }
    return events;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');

      for (const event of consumeFrames()) {
        if (event.type === 'message.delta' && typeof event.data.delta === 'string') {
          onDelta(event.data.delta);
        }
        if (event.type === 'image.generated' && Array.isArray(event.data.images)) {
          const images = event.data.images.filter(
            (image): image is ChatImageAttachment =>
              image !== null && typeof image === 'object' &&
              typeof (image as ChatImageAttachment).url === 'string' &&
              ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
                (image as ChatImageAttachment).mimeType,
              ),
          );
          const action = event.data.action === 'generate' || event.data.action === 'edit'
            ? event.data.action
            : undefined;
          if (images.length) onImageGenerated?.(images, action);
        }
        if (event.type === 'message.completed') {
          const model = event.data.model;
          const usage = event.data.usage;
          if (model && typeof model === 'object' && usage && typeof usage === 'object') {
            const metadata = model as Record<string, unknown>;
            const tokens = usage as Record<string, unknown>;
            if (typeof metadata.modelId === 'string' && typeof metadata.modelLabel === 'string' &&
              typeof metadata.provider === 'string' && typeof metadata.protocol === 'string') {
              onCompleted?.({
                modelId: metadata.modelId,
                modelLabel: metadata.modelLabel,
                provider: metadata.provider,
                protocol: metadata.protocol,
                inputTokens: typeof tokens.inputTokens === 'number' ? tokens.inputTokens : undefined,
                outputTokens: typeof tokens.outputTokens === 'number' ? tokens.outputTokens : undefined,
              });
            }
          }
        }
        if (event.type === 'error') throw new Error(getErrorMessage(event.data));
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
