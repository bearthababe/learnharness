"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * When the learner last looked at each session, on this device (round 14,
 * P15). The sessions list marks "New result" when a tutor helper delivered
 * after that; opening the session (or being in it when the result lands)
 * clears the mark. It never counts toward the Sessions badge, which counts
 * only "your turn".
 */
const KEY = "lh:session-seen";
const listeners = new Set<() => void>();
let cache: Record<string, string> | null = null;

function read(): Record<string, string> {
	if (cache) return cache;
	try {
		const value = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
		cache = value && typeof value === "object" ? value as Record<string, string> : {};
	} catch { cache = {}; }
	return cache;
}

export function markSessionSeen(chatId: string, at = new Date().toISOString()) {
	const seen = { ...read() };
	if (seen[chatId] && seen[chatId] >= at) return;
	seen[chatId] = at;
	cache = seen;
	try { window.localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* this view only */ }
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => { if (event.key === KEY) { cache = null; listener(); } };
	window.addEventListener("storage", onStorage);
	return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** The seen times, re-read when they change. */
export function useSessionSeen(): Record<string, string> {
	return useSyncExternalStore(subscribe, read, () => EMPTY);
}
const EMPTY: Record<string, string> = {};

/** A helper's result the learner has not seen yet. */
export function hasNewResult(chat: { id: string; resultAt?: string }, seen: Record<string, string>): boolean {
	return !!chat.resultAt && chat.resultAt > (seen[chat.id] ?? "");
}

/** While a session is open, everything that lands in it is seen. */
export function useMarkSessionSeen(chatId: string, revision: unknown) {
	useEffect(() => {
		markSessionSeen(chatId);
		return () => markSessionSeen(chatId);
	}, [chatId, revision]);
}
