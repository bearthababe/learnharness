"use client";

import type { LhMessage } from "@/src/core";

/**
 * The learner's message while it is being sent, kept on this device until
 * the server acknowledges it. A send that fails (offline, aborted, refused)
 * or a reload in between never loses the text: it goes back into the
 * composer, marked "not sent", for the learner to send again. Nothing is
 * ever re-sent automatically.
 */
export type UnsentMessage = { text: string; at: number };

const key = (chatId: string) => `lh:unsent:${chatId}`;

export function stashUnsent(chatId: string, text: string): void {
	try { localStorage.setItem(key(chatId), JSON.stringify({ text, at: Date.now() } satisfies UnsentMessage)); } catch { /* storage blocked: this view only */ }
}

export function readUnsent(chatId: string): UnsentMessage | null {
	try {
		const value = JSON.parse(localStorage.getItem(key(chatId)) ?? "null") as Partial<UnsentMessage> | null;
		return value && typeof value.text === "string" && value.text.trim() && typeof value.at === "number" ? { text: value.text, at: value.at } : null;
	} catch { return null; }
}

export function clearUnsent(chatId: string): void {
	try { localStorage.removeItem(key(chatId)); } catch { /* nothing to clear */ }
}

/** The record already holds this message (a lost acknowledgement that did
 *  land): a learner message with the same text, sent at or after the try. */
export function deliveredIn(messages: readonly LhMessage[], unsent: UnsentMessage): boolean {
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
