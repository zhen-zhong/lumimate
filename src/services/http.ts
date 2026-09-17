import { fetch } from 'expo/fetch';

const DEFAULT_TIMEOUT_MS = 15_000;

type ApiErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

export type ApiRequestOptions = RequestInit & {
  /** 传入 0 关闭超时，适用于 SSE 等长连接。 */
  timeoutMs?: number;
};

export function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new ApiError('未配置 EXPO_PUBLIC_API_URL');
  return value;
}

function getRequestUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function getHeaders(input?: HeadersInit) {
  const headers = new Headers(input);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return headers;
}

function getErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;

  const message = (data as Record<string, unknown>).message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim()),
    );
    if (messages.length) return messages.join('；');
  }
  return fallback;
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...init } = options;
  if (timeoutMs <= 0) {
    return fetch(getRequestUrl(path), { ...init, headers: getHeaders(headers), signal });
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(getRequestUrl(path), {
      ...init,
      headers: getHeaders(headers),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new ApiError('请求超时，请检查网络后重试。');
    }
    if (error instanceof Error) throw new ApiError(`网络请求失败：${error.message}`);
    throw new ApiError('网络请求失败，请检查网络后重试。');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function assertApiResponse(response: Response) {
  if (response.ok) return;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  throw new ApiError(getErrorMessage(data, `请求失败（HTTP ${response.status}）`), {
    status: response.status,
    code:
      data && typeof data === 'object' && typeof (data as Record<string, unknown>).error === 'string'
        ? (data as Record<string, unknown>).error as string
        : undefined,
    details: data,
  });
}

export async function apiJson<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const response = await apiFetch(path, options);
  await assertApiResponse(response);

  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('服务返回内容格式错误。', { status: response.status });
  }
}
