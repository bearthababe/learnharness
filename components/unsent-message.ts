"use client";

import type { LhMessage } from "@/src/core";

/**
 * The learner's messages while they are being sent, kept on this device
 * until the server acknowledges each one. A send that fails (offline,
 * aborted, refused) or a reload in between never loses words: a failed
 * message is either back in the composer or shown as "not sent" with its
 * own Send again / Edit / Discard. Each message is its own entry, so a
 * newer draft typed while an older one was in flight is never mistaken for
 * it. Nothing is ever re-sent automatically.
 */
export type UnsentEntry = { id: string; text: string; at: number };

const key = (chatId: string) => `lh:unsent:${chatId}`;

function write(chatId: string, entries: UnsentEntry[]): void {
	try {
		if (entries.length) localStorage.setItem(key(chatId), JSON.stringify(entries));
		else localStorage.removeItem(key(chatId));
	} catch { /* storage blocked: this view only */ }
}

export function listUnsent(chatId: string): UnsentEntry[] {
	try {
		const value = JSON.parse(localStorage.getItem(key(chatId)) ?? "null") as unknown;
		// Round-9 single-entry copies read as a one-item list.
		const items = Array.isArray(value) ? value : value && typeof value === "object" ? [{ id: "u_legacy", ...(value as object) }] : [];
		return items.filter((item): item is UnsentEntry => !!item && typeof item.id === "string" && typeof item.text === "string" && !!item.text.trim() && typeof item.at === "number");
	} catch { return []; }
}

/** Add or update one message's copy. */
export function putUnsent(chatId: string, entry: UnsentEntry): void {
	const entries = listUnsent(chatId).filter((item) => item.id !== entry.id);
	write(chatId, [...entries, entry]);
}

export function removeUnsent(chatId: string, id: string): void {
	write(chatId, listUnsent(chatId).filter((item) => item.id !== id));
}

export function newUnsentId(): string {
	return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The record already holds this message (a lost acknowledgement that did
 *  land): a learner message with the same text, sent at or after the try. */
export function deliveredIn(messages: readonly LhMessage[], unsent: Pick<UnsentEntry, "text" | "at">): boolean {
	return messages.some((message) => {
		if (message.role !== "user") return false;
		// Only the server's record counts: the page's own optimistic bubble
		// (a local "c_" id) carries the same words but proves nothing.
		if (typeof message.id === "string" && message.id.startsWith("c_")) return false;
		const content = (message as { content?: unknown }).content;
		const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => (part as { text?: unknown })?.text ?? "").join("") : "";
		const at = (message as { timestamp?: unknown }).timestamp;
		return text.trim() === unsent.text.trim() && (typeof at !== "number" || at >= unsent.at - 60_000);
	});
}

/** Plain words for a failed request ("Failed to fetch" and friends). */
export function friendlyNetworkError(message: string): string | null {
	return /failed to fetch|networkerror|network error|load failed|err_|fetch failed|offline|aborted/i.test(message)
		? "LearnHarness couldn't be reached. Check your connection."
		: null;
}
