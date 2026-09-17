import { apiFetch, apiJson, assertApiResponse } from '@/services/http';

type SseEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type ChatImageAttachment = {
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
};

export type StreamChatMessageOptions = {
  conversationId: string;
  content: string;
  attachments?: ChatImageAttachment[];
  onDelta: (delta: string) => void;
};

export type ChatAgentSettings = {
  agentName: string;
  agentProfile: string;
  responseStyle: string;
  contextMessageLimit: number;
  maxContextMessageLimit: number;
};

export type UpdateChatAgentSettings = Pick<
  ChatAgentSettings,
  'agentName' | 'agentProfile' | 'responseStyle' | 'contextMessageLimit'
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
        if (event.type === 'error') throw new Error(getErrorMessage(event.data));
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
