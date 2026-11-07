"use client";

import { useSyncExternalStore } from "react";

/**
 * How many sessions are waiting for the learner (a pending question or
 * problem). The sessions list publishes it; the closed-sidebar button shows
 * it, so a collapsed list never hides that something needs an answer.
 */
let waiting = 0;
const listeners = new Set<() => void>();

export function publishWaitingCount(count: number) {
	if (count === waiting) return;
	waiting = count;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

export function useWaitingCount(): number {
	return useSyncExternalStore(subscribe, () => waiting, () => 0);
}
