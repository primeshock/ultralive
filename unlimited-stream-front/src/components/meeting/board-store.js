"use client";

import { useSyncExternalStore } from "react";

const EMPTY = Object.freeze([]);

// Tiny external store holding annotation strokes per board/PDF page, kept in sync through
// LiveKit data messages (wb-add / wb-del / wb-clear) and persisted by the host.
export function createBoardStore() {
  const data = new Map();
  const loaded = new Set();
  const subs = new Set();
  let version = 0;
  const bump = () => { version += 1; subs.forEach((fn) => fn()); };
  return {
    get: (key) => data.get(key) || EMPTY,
    isLoaded: (key) => loaded.has(key),
    markLoaded(key, strokes) { if (!loaded.has(key)) { loaded.add(key); if (!data.has(key)) data.set(key, strokes); bump(); } },
    add(key, stroke) { const list = data.get(key) || []; if (list.some((s) => s.id === stroke.id)) return; data.set(key, [...list, stroke]); loaded.add(key); bump(); },
    remove(key, ids) { const drop = new Set(ids); data.set(key, (data.get(key) || []).filter((s) => !drop.has(s.id))); bump(); },
    clear(key) { data.set(key, []); loaded.add(key); bump(); },
    apply(message) {
      if (message.type === "wb-add") this.add(message.key, message.stroke);
      else if (message.type === "wb-del") this.remove(message.key, message.ids || []);
      else if (message.type === "wb-clear") this.clear(message.key);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    getVersion: () => version,
  };
}

export function useBoardVersion(store) {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
