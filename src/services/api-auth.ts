import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

// expo-secure-store keys only allow letters, numbers, `.`, `-`, and `_`.
const ACCESS_TOKEN_KEY = 'lumimate.api-access-token';

let accessToken: string | null = null;
let initialization: Promise<string> | null = null;

function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('未配置 EXPO_PUBLIC_API_URL');
  return value;
}

async function readToken() {
  return Platform.OS === 'web'
    ? AsyncStorage.getItem(ACCESS_TOKEN_KEY)
    : SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

async function writeToken(token: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function ensureApiAccessToken() {
  if (accessToken) return accessToken;
  if (initialization) return initialization;

  initialization = (async () => {
    const stored = await readToken();
    if (stored) {
      accessToken = stored;
      return stored;
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/auth/guest`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`无法创建游客会话（HTTP ${response.status}）`);
    const data = await response.json() as { accessToken?: unknown };
    if (typeof data.accessToken !== 'string' || !data.accessToken) {
      throw new Error('游客会话返回无效');
    }
    await writeToken(data.accessToken);
    accessToken = data.accessToken;
    return data.accessToken;
  })();

  try {
    return await initialization;
  } finally {
    initialization = null;
  }
}

export function getCachedApiAccessToken() {
  return accessToken;
}

export function getAuthenticatedMediaSource(uri: string) {
  const token = getCachedApiAccessToken();
  const baseUrl = getApiBaseUrl();
  if (!token || !uri.startsWith(`${baseUrl}/v1/media/`)) return { uri };
  return { uri, headers: { Authorization: `Bearer ${token}` } };
}
