const lockedConversationIds = new Set<string>();

export function lockCompanionChatScroll(conversationId: string) {
  lockedConversationIds.add(conversationId);
}

export function unlockCompanionChatScroll(conversationId: string) {
  lockedConversationIds.delete(conversationId);
}

export function isCompanionChatScrollLocked(conversationId: string) {
  return lockedConversationIds.has(conversationId);
}
