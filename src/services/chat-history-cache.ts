import * as SQLite from 'expo-sqlite';

import type { ChatMessage } from '@/components/chat/types';

const DATABASE_NAME = 'lumimate.db';
const TABLE_NAME = 'chat_history_cache';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

function getDatabase() {
  databasePromise ??= (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        conversation_id TEXT PRIMARY KEY NOT NULL,
        messages_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    return database;
  })();
  return databasePromise;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
}

export async function readCachedChatHistory(conversationId: string): Promise<ChatMessage[] | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ messages_json: string }>(
      `SELECT messages_json FROM ${TABLE_NAME} WHERE conversation_id = ?`,
      conversationId,
    );
    if (!row) return null;

    const parsed: unknown = JSON.parse(row.messages_json);
    return Array.isArray(parsed) && parsed.every(isChatMessage) ? parsed : null;
  } catch (error) {
    console.warn('Failed to read cached chat history', error);
    return null;
  }
}

export async function writeCachedChatHistory(conversationId: string, messages: ChatMessage[]) {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO ${TABLE_NAME} (conversation_id, messages_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET
         messages_json = excluded.messages_json,
         updated_at = excluded.updated_at`,
      conversationId,
      JSON.stringify(messages),
      Date.now(),
    );
  } catch (error) {
    console.warn('Failed to write cached chat history', error);
  }
}
