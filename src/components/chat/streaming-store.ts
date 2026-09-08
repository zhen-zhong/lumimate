import { useSyncExternalStore } from 'react';

export type StreamingStore = {
  get: () => string;
  set: (value: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStreamingStore(): StreamingStore {
  let text = '';
  const listeners = new Set<() => void>();

  return {
    get: () => text,
    set: (value: string) => {
      text = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStreamingText(store: StreamingStore) {
  return useSyncExternalStore(store.subscribe, store.get);
}
